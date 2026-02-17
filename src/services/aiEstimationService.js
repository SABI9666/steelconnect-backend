// src/services/aiEstimationService.js - AI-Powered Construction Cost Estimation Engine
// with Vision-based Drawing Analysis + Intelligent PDF Measurement Extraction
import Anthropic from '@anthropic-ai/sdk';
import { extractMeasurementsFromPDFs, formatExtractionForAI } from './pdfMeasurementExtractor.js';
import { enrichEstimateWithLaborAndMarkups } from './estimatePostProcessor.js';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Maximum total size of file content to send to Claude (25MB base64 ≈ ~18MB raw files)
const MAX_VISION_PAYLOAD_BYTES = 18 * 1024 * 1024;
// Maximum pages per PDF to analyze (Claude supports up to 100 pages)
const MAX_PDF_PAGES = 50;

/**
 * Validate and fix the grand total in an AI estimation result.
 * Recalculates bottom-up: lineItems → trade subtotals → directCosts → markups → grandTotal.
 * Also detects and fixes common AI errors: inflated unit rates, double counting, excessive markups.
 */
function validateAndFixTotals(result) {
    if (!result || !result.trades || !result.costBreakdown || !result.summary) {
        return result;
    }

    const trades = result.trades;
    const cb = result.costBreakdown;
    const summary = result.summary;

    // Step 1: Validate and fix EVERY line item's math (lineTotal = quantity × unitRate)
    for (const trade of trades) {
        if (!trade.lineItems || trade.lineItems.length === 0) continue;
        for (const li of trade.lineItems) {
            const qty = Number(li.quantity) || 0;
            const unitRate = Number(li.unitRate) || 0;
            // If AI provided materialCost/laborCost/equipmentCost per unit but no unitRate, compute it
            if (unitRate === 0 && (li.materialCost || li.laborCost || li.equipmentCost)) {
                li.unitRate = (Number(li.materialCost) || 0) + (Number(li.laborCost) || 0) + (Number(li.equipmentCost) || 0);
            }
            // If unitTotal was provided instead of unitRate (old format), use it
            if (li.unitRate === 0 && li.unitTotal) {
                li.unitRate = Number(li.unitTotal) || 0;
            }
            const correctLineTotal = Math.round(qty * (Number(li.unitRate) || 0) * 100) / 100;
            if (correctLineTotal > 0 && Math.abs(correctLineTotal - (Number(li.lineTotal) || 0)) > 1) {
                console.log(`[AI-VALIDATION] Line item "${li.description}" lineTotal corrected: ${li.lineTotal} -> ${correctLineTotal} (${qty} × ${li.unitRate})`);
                li.lineTotal = correctLineTotal;
            }
        }
    }

    // Step 2: Recalculate each trade subtotal from its lineItems
    for (const trade of trades) {
        if (trade.lineItems && trade.lineItems.length > 0) {
            const lineItemsSum = trade.lineItems.reduce((sum, li) => sum + (Number(li.lineTotal) || 0), 0);
            if (lineItemsSum > 0 && Math.abs(lineItemsSum - (trade.subtotal || 0)) > 1) {
                console.log(`[AI-VALIDATION] Trade "${trade.tradeName}" subtotal corrected: ${trade.subtotal} -> ${lineItemsSum}`);
                trade.subtotal = Math.round(lineItemsSum * 100) / 100;
            }
        }
    }

    // Step 3: Recalculate directCosts from trade subtotals
    const calculatedDirectCosts = trades.reduce((sum, t) => sum + (Number(t.subtotal) || 0), 0);
    if (Math.abs(calculatedDirectCosts - (cb.directCosts || 0)) > 1) {
        console.log(`[AI-VALIDATION] directCosts corrected: ${cb.directCosts} -> ${calculatedDirectCosts}`);
        cb.directCosts = Math.round(calculatedDirectCosts * 100) / 100;
    }

    // Step 4: Cap individual markup percentages AND enforce combined markup cap
    const markupFields = ['generalConditions', 'overhead', 'profit', 'contingency', 'escalation'];
    const MAX_INDIVIDUAL_MARKUP = 15; // No single markup should exceed 15%
    const MAX_COMBINED_MARKUP = 40;   // Total combined markup cap at 40% of direct costs

    // First pass: cap individual percentages
    let totalMarkupPercent = 0;
    for (const field of markupFields) {
        const pctField = field + 'Percent';
        if (cb[pctField] != null && cb[pctField] > MAX_INDIVIDUAL_MARKUP) {
            console.log(`[AI-VALIDATION] ${field} percentage capped: ${cb[pctField]}% -> ${MAX_INDIVIDUAL_MARKUP}%`);
            cb[pctField] = MAX_INDIVIDUAL_MARKUP;
        }
        totalMarkupPercent += Number(cb[pctField]) || 0;
    }

    // Second pass: if combined markup exceeds cap, proportionally reduce all markups
    if (totalMarkupPercent > MAX_COMBINED_MARKUP) {
        const scaleFactor = MAX_COMBINED_MARKUP / totalMarkupPercent;
        console.log(`[AI-VALIDATION] Combined markup ${totalMarkupPercent.toFixed(1)}% exceeds ${MAX_COMBINED_MARKUP}% cap. Scaling by ${scaleFactor.toFixed(3)}`);
        for (const field of markupFields) {
            const pctField = field + 'Percent';
            if (cb[pctField] > 0) {
                cb[pctField] = Math.round(cb[pctField] * scaleFactor * 100) / 100;
            }
        }
    }

    // Recalculate markup amounts from (capped) percentages
    let totalMarkups = 0;
    for (const field of markupFields) {
        const pctField = field + 'Percent';
        if (cb[pctField] != null && cb[pctField] > 0) {
            const recalculated = Math.round(cb.directCosts * (cb[pctField] / 100) * 100) / 100;
            if (Math.abs(recalculated - (cb[field] || 0)) > 1) {
                console.log(`[AI-VALIDATION] ${field} corrected: ${cb[field]} -> ${recalculated} (${cb[pctField]}% of ${cb.directCosts})`);
                cb[field] = recalculated;
            }
        }
        totalMarkups += Number(cb[field]) || 0;
    }

    // Step 5: Recalculate totalWithMarkups
    const calculatedTotal = Math.round((cb.directCosts + totalMarkups) * 100) / 100;
    if (Math.abs(calculatedTotal - (cb.totalWithMarkups || 0)) > 1) {
        console.log(`[AI-VALIDATION] totalWithMarkups corrected: ${cb.totalWithMarkups} -> ${calculatedTotal}`);
        cb.totalWithMarkups = calculatedTotal;
    }

    // Step 6: Fix grandTotal to match totalWithMarkups
    if (Math.abs(calculatedTotal - (summary.grandTotal || 0)) > 1) {
        console.log(`[AI-VALIDATION] grandTotal corrected: ${summary.grandTotal} -> ${calculatedTotal}`);
        summary.grandTotal = calculatedTotal;
    }

    // Step 7: Fix tradesSummary amounts to match trades
    if (result.tradesSummary && Array.isArray(result.tradesSummary)) {
        for (const ts of result.tradesSummary) {
            const matchingTrade = trades.find(t => t.tradeName === ts.tradeName);
            if (matchingTrade && Math.abs((matchingTrade.subtotal || 0) - (ts.amount || 0)) > 1) {
                console.log(`[AI-VALIDATION] tradesSummary "${ts.tradeName}" amount corrected: ${ts.amount} -> ${matchingTrade.subtotal}`);
                ts.amount = matchingTrade.subtotal;
            }
        }
    }

    // Step 8: Recalculate costPerUnit and add benchmark warning
    if (summary.totalArea && summary.grandTotal) {
        const areaMatch = String(summary.totalArea).match(/([\d,]+)/);
        if (areaMatch) {
            const area = Number(areaMatch[1].replace(/,/g, ''));
            if (area > 0) {
                summary.costPerUnit = Math.round((summary.grandTotal / area) * 100) / 100;
                // Log benchmark warning for unreasonable cost/sqft
                const costPerSqft = summary.costPerUnit;
                if (costPerSqft > 1000) {
                    console.warn(`[AI-VALIDATION] WARNING: Cost/unit = ${costPerSqft} seems very high. Check for inflated unit rates.`);
                }
            }
        }
    }

    // Step 9: Recalculate trade percentOfTotal
    if (summary.grandTotal > 0) {
        for (const trade of trades) {
            trade.percentOfTotal = Math.round((trade.subtotal / cb.directCosts) * 10000) / 100;
        }
    }

    console.log(`[AI-VALIDATION] Final validated: directCosts=${cb.directCosts}, markups=${totalMarkups} (${(totalMarkups/cb.directCosts*100).toFixed(1)}%), grandTotal=${summary.grandTotal}`);
    return result;
}

/**
 * Robustly extract a JSON object from AI response text.
 * Handles extra text before/after the JSON, markdown fences, etc.
 */
function extractJSON(text) {
    // First try: strip markdown fences and parse directly
    let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // Fall through to bracket matching
    }

    // Second try: find the outermost { ... } by matching braces
    const start = text.indexOf('{');
    if (start === -1) throw new SyntaxError('No JSON object found in AI response');

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
        }
    }

    if (end === -1) throw new SyntaxError('Unterminated JSON object in AI response');

    const jsonStr = text.substring(start, end + 1);
    console.log(`[AI-JSON] Extracted JSON from position ${start} to ${end} (${jsonStr.length} chars, original ${text.length} chars)`);
    return JSON.parse(jsonStr);
}

const SYSTEM_PROMPT = `You are the world's most precise construction cost estimator with 40+ years of global experience across EVERY building type, structural system, and region worldwide. You produce estimates that match actual construction costs within 5-10%, on par with top firms (Turner & Townsend, RLB, AECOM, Rider Levett Bucknall, Currie & Brown).

You can READ construction drawings/blueprints provided as PDFs or images. When drawings are provided, extract ALL dimensions, member sizes, specs, and quantities directly from them.

GLOBAL STEEL SECTION STANDARDS (recognize ALL of these):
- AISC (USA): W-shapes (W24x68), S-shapes, C-channels, HSS (HSS8x8x1/2), pipes, angles (L4x4x1/2), WT-shapes
- IS (India): ISMB (ISMB450), ISMC, ISLB, ISWB, ISHB, ISA — weights in kg/m
- BS/EN (UK/Europe): UB (UB533x210x82), UC, HEA, HEB, IPE, SHS, RHS, CHS, PFC — weights in kg/m
- AS (Australia): UB, UC, PFC, EA, UA, SHS, RHS, CHS — weights in kg/m
- PEB/Pre-Engineered: tapered I-sections, built-up sections, Z/C purlins, girts
- Cold-formed: C-sections, Z-sections, hat sections, deck profiles

DRAWING ANALYSIS METHODOLOGY (follow this exact sequence):
STEP 1 - INVENTORY: List every drawing sheet, its type (plan/elevation/section/detail/schedule), and its scale
STEP 2 - DIMENSIONS: Extract ALL building dimensions from plans: overall footprint, grid spacings, bay sizes, floor-to-floor heights, eave/ridge heights
STEP 3 - MEMBER SIZES: Read EVERY member callout/mark (B1, C2, etc.) and its corresponding size from schedules or callouts. Recognize all global section formats.
STEP 4 - COUNT: Go grid-by-grid and count members systematically. Cross-reference plan counts with schedule quantities.
STEP 5 - CALCULATE: Compute quantities using standard formulas:
   - Steel tonnage: weight-per-foot × length × count ÷ 2000 (for lb/ft) OR weight-per-meter × length × count ÷ 1000 (for kg/m)
   - W-shapes: number after 'x' = approximate lb/ft (W24x68 = 68 lb/ft)
   - Indian sections: ISMB400 ≈ 61.6 kg/m, ISMB450 ≈ 72.4 kg/m, ISMB500 ≈ 86.9 kg/m
   - European sections: IPE300 ≈ 42.2 kg/m, HEA200 ≈ 53.8 kg/m, HEB200 ≈ 78.1 kg/m
   - Concrete volume: Length × Width × Depth for each element (footings, slabs, grade beams, walls, pile caps)
   - Rebar: estimate by element type — footings 120 lbs/CY, slabs 80 lbs/CY, grade beams 150 lbs/CY, columns 200 lbs/CY, retaining walls 180 lbs/CY
   - Area takeoffs: measure from grid dimensions, not assumptions
STEP 6 - VERIFY: Check each quantity against rules of thumb:
   - Steel: 5-15 psf for steel buildings, 3-8 psf for light commercial, 2-5 kg/sqm for PEB
   - Concrete: footings ~0.5-1.5 CY per column, SOG 4-8" typical, elevated slabs 6-12"
   - Rebar: 80-200 lbs/CY depending on element type and seismic zone

ESTIMATION ACCURACY RULES (CRITICAL):
1. Use CURRENT ${new Date().getFullYear()} market rates for the specified region
2. Unit rates must reflect actual material + labor + equipment costs in the local market
3. DO NOT inflate, pad, or add safety margins to unit rates - use realistic mid-market pricing
4. DO NOT double-count: each cost item appears ONCE in lineItems only
5. Keep estimates lean and accurate - a client should take this to a contractor and get matching bids
6. STRUCTURAL STEEL RATES (installed, ${new Date().getFullYear()}):
   - USA: Light $3,000-4,500/ton, Medium $2,500-3,500/ton, Heavy $2,200-3,000/ton, HSS $3,500-5,500/ton
   - India: ₹55,000-85,000/MT conventional, ₹45,000-65,000/MT PEB
   - UAE: AED 8,000-14,000/MT
   - UK: £2,500-4,000/tonne
   - Europe: €2,800-4,500/tonne
   - Saudi Arabia: SAR 9,000-15,000/MT
   - Canada: CAD 3,200-5,000/tonne
   - Australia: AUD 4,000-6,500/tonne
7. CONCRETE RATES (in-place, all-in with formwork):
   - USA: 3000psi $150-250/CY, 4000psi $175-300/CY, 5000psi $200-350/CY
   - India: M25 ₹4,500-6,000/m³, M30 ₹5,000-7,000/m³, M40 ₹6,000-8,500/m³
   - UAE: C30 AED 600-900/m³, C40 AED 700-1,100/m³
   - UK: C30 £100-160/m³, C40 £120-190/m³
8. REBAR RATES (in-place with tying):
   - USA: $1,200-2,000/ton (varies #3-#11)
   - India: Fe500 ₹50,000-65,000/MT, Fe500D ₹55,000-70,000/MT
   - UAE: AED 3,500-6,000/MT
9. ALL CONSTRUCTION TRADES - include every relevant trade:
   a. STRUCTURAL: Steel framing, connections, bolts, welding, metal deck, shear studs
   b. CONCRETE & FOUNDATIONS: Footings, grade beams, pile caps, piles/caissons, SOG, elevated slabs, retaining walls, formwork
   c. REBAR/REINFORCING: By bar size, with BBS (Bar Bending Schedule) quantities where applicable
   d. MASONRY: CMU, brick veneer, stone, mortar, grout, reinforcing
   e. ROOFING: Metal roofing, built-up, single-ply, insulation, flashing, gutters, downspouts
   f. CLADDING/ENVELOPE: Metal wall panels, curtain wall, precast panels, EIFS, insulation
   g. WATERPROOFING: Below-grade, above-grade, sealants, expansion joints
   h. DOORS & WINDOWS: HM doors, wood doors, overhead/rolling doors, storefronts, glazing
   i. FLOORING: Concrete polish, epoxy, VCT, carpet, tile, hardwood
   j. CEILING: ACT/grid ceiling, gypsum, exposed structure
   k. PAINTING: Interior, exterior, fireproofing, intumescent
   l. PARTITIONS: Metal stud/drywall, demountable, glass partitions
   m. MECHANICAL/HVAC: AHUs, ductwork, piping, controls, VRF, split units, chillers
   n. PLUMBING: Piping, fixtures, water heaters, pumps, drainage
   o. ELECTRICAL: Panels, wiring, lighting, receptacles, generators, transformers, LV systems
   p. FIRE PROTECTION: Sprinkler systems, fire alarm, extinguishers, smoke detection
   q. ELEVATORS/LIFTS: Passenger, freight, escalators
   r. BMS/AUTOMATION: Building management systems, access control, CCTV
   s. SITEWORK: Earthwork, grading, paving, curbs, storm drainage, water/sewer, landscaping, fencing
   t. PEB-SPECIFIC: Primary frames, purlins/girts, bracing, sheeting, ridge/gutter, accessories, mezzanine
   u. SPECIALTIES: Crane systems, conveyor, cold storage, clean rooms, loading docks
   v. TEMPORARY WORKS: Scaffolding, shoring, temporary power, site offices, safety provisions
10. BENCHMARK CHECK - cross-check cost/sqft against these ranges:
   - Industrial/Warehouse: $80-200/sqft | ₹2,000-5,000/sqft | AED 300-800/sqft | £70-180/sqft | €80-200/sqft
   - Commercial Office: $150-350/sqft | ₹3,000-8,000/sqft | AED 600-1,400/sqft | £130-300/sqft | €140-320/sqft
   - Residential: $120-250/sqft | ₹1,500-4,500/sqft | AED 400-1,000/sqft | £100-220/sqft | €110-240/sqft
   - Healthcare: $300-700/sqft | ₹5,000-15,000/sqft | AED 1,000-2,500/sqft | £250-600/sqft
   - PEB/Pre-engineered: $40-120/sqft | ₹1,200-3,000/sqft | AED 150-450/sqft | £35-100/sqft
   - Educational: $200-400/sqft | ₹3,000-7,000/sqft | AED 500-1,200/sqft
   - Hospitality: $200-500/sqft | ₹4,000-10,000/sqft | AED 700-1,800/sqft
   - Data Center: $400-1,000/sqft | ₹8,000-20,000/sqft
   - Cold Storage: $150-350/sqft | ₹3,000-8,000/sqft
   If your estimate falls outside these ranges, RECALCULATE before outputting.

QUANTITY CALCULATION RULES:
1. For steel: ALWAYS show your calculation. Example: "12 beams × W24x68 × 30'-0" = 12 × 68 lb/ft × 30 ft = 24,480 lbs = 12.24 tons"
2. For concrete: ALWAYS show volume calculation. Example: "24 footings × 6'×6'×2' = 24 × 72 CF = 1,728 CF = 64 CY"
3. Cross-reference beam schedule quantities with plan counts - they MUST match
4. Include connection material: typically 8-12% of main steel tonnage
5. Include waste factors: steel 2-5%, concrete 5-8%, rebar 5-10%
6. For PEB: weight = 2-5 kg/sqm roof area for primary frames, add purlins (1-2 kg/sqm), sheeting (5-7 kg/sqm)
7. For rebar BBS: estimate by element type and provide procurement-ready tonnages per bar size where possible
8. Quantities must be PROCUREMENT-READY: anyone should be able to purchase materials directly from these quantities

MATH RULES (MANDATORY - VERIFY BEFORE OUTPUTTING):
1. lineTotal = quantity × unitRate (for EVERY line item)
2. trade.subtotal = SUM of all lineItems[].lineTotal in that trade
3. directCosts = SUM of all trades[].subtotal
4. Each markup = its percentage × directCosts
5. totalWithMarkups = directCosts + SUM of all markups
6. grandTotal = totalWithMarkups
7. After computing everything, VERIFY all math. If anything doesn't add up, FIX it.
8. Show your quantity calculation traces in the "drawingNotes" field

You must respond ONLY in valid JSON format. No markdown, no explanation outside JSON.`;

/**
 * Build multimodal content blocks from uploaded files for Claude Vision analysis.
 * Supports PDFs (sent as document blocks) and images (sent as image blocks).
 * Returns array of content blocks to include in the Claude API message.
 */
function buildFileContentBlocks(fileBuffers) {
    if (!fileBuffers || fileBuffers.length === 0) return [];

    const contentBlocks = [];
    let totalSize = 0;

    // Sort files: PDFs first (most likely to contain drawings), then images
    const sorted = [...fileBuffers].sort((a, b) => {
        const aIsPdf = /\.pdf$/i.test(a.originalname);
        const bIsPdf = /\.pdf$/i.test(b.originalname);
        if (aIsPdf && !bIsPdf) return -1;
        if (!aIsPdf && bIsPdf) return 1;
        return 0;
    });

    for (const file of sorted) {
        // Skip files that would exceed our payload budget
        if (totalSize + file.buffer.length > MAX_VISION_PAYLOAD_BYTES) {
            console.log(`[AI-VISION] Skipping ${file.originalname} (${(file.buffer.length / 1024 / 1024).toFixed(1)}MB) - would exceed payload limit`);
            continue;
        }

        const ext = file.originalname.toLowerCase().split('.').pop();
        const base64Data = file.buffer.toString('base64');

        if (ext === 'pdf') {
            // Send PDF directly as document block - Claude can read all pages
            contentBlocks.push({
                type: 'text',
                text: `\n📐 STRUCTURAL DRAWING FILE: "${file.originalname}" (${(file.buffer.length / 1024 / 1024).toFixed(2)} MB)\nAnalyze EVERY page of this PDF. Extract ALL dimensions, member sizes, schedules, and specifications visible in the drawings.\n`
            });
            contentBlocks.push({
                type: 'document',
                source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Data
                }
            });
            totalSize += file.buffer.length;
            console.log(`[AI-VISION] Added PDF: ${file.originalname} (${(file.buffer.length / 1024 / 1024).toFixed(2)}MB)`);

        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            // Send image directly
            const mimeMap = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp'
            };
            contentBlocks.push({
                type: 'text',
                text: `\n📐 DRAWING IMAGE: "${file.originalname}"\nExamine this image carefully. Extract all dimensions, member sizes, and specifications.\n`
            });
            contentBlocks.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: mimeMap[ext] || 'image/jpeg',
                    data: base64Data
                }
            });
            totalSize += file.buffer.length;
            console.log(`[AI-VISION] Added image: ${file.originalname} (${(file.buffer.length / 1024 / 1024).toFixed(2)}MB)`);

        } else if (['tif', 'tiff', 'bmp'].includes(ext)) {
            // TIF/BMP not directly supported by Claude Vision - skip with note
            contentBlocks.push({
                type: 'text',
                text: `\n⚠️ File "${file.originalname}" is in ${ext.toUpperCase()} format which cannot be visually analyzed. Infer details from file name and other provided drawings.\n`
            });
            console.log(`[AI-VISION] Skipped unsupported format: ${file.originalname} (${ext})`);
        }
    }

    if (contentBlocks.length > 0) {
        console.log(`[AI-VISION] Total vision payload: ${(totalSize / 1024 / 1024).toFixed(2)}MB across ${contentBlocks.filter(b => b.type === 'document' || b.type === 'image').length} files`);
    }

    return contentBlocks;
}

/**
 * Extract text content from PDFs using pdf-parse as supplementary data.
 * This catches text annotations, notes, and schedules that might be in text-layer PDFs.
 */
async function extractPdfText(fileBuffers) {
    const textResults = [];

    for (const file of fileBuffers) {
        if (!/\.pdf$/i.test(file.originalname)) continue;

        try {
            // Import pdf-parse/lib directly to avoid the ESM bug where
            // pdf-parse/index.js tries to read a test file (module.parent is undefined in ESM)
            const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
            const result = await pdfParse(file.buffer, { max: MAX_PDF_PAGES });

            if (result.text && result.text.trim().length > 50) {
                textResults.push({
                    fileName: file.originalname,
                    pages: result.numpages,
                    text: result.text.substring(0, 100000) // Allow up to 100K chars for full schedule data extraction
                });
                console.log(`[AI-VISION] Extracted ${result.text.length} chars of text from ${file.originalname} (${result.numpages} pages)`);
            } else {
                console.log(`[AI-VISION] ${file.originalname} has minimal text (likely scanned drawing) - relying on vision analysis`);
            }
        } catch (err) {
            console.log(`[AI-VISION] Could not extract text from ${file.originalname}: ${err.message}`);
        }
    }

    return textResults;
}

export async function generateSmartQuestions(projectInfo, measurementData = null) {
    try {
        // Build measurement context if pre-extracted data is available
        let measurementContext = '';
        if (measurementData && measurementData.combined && measurementData.combined.filesWithData > 0) {
            const c = measurementData.combined;
            const dims = [...(c.dimensions?.imperial || []), ...(c.dimensions?.metric || [])];
            const members = Object.values(c.memberSizes || {}).flat();
            const areas = c.dimensions?.areas || [];
            measurementContext = `\n\nPRE-EXTRACTED DATA FROM UPLOADED DRAWINGS (auto-detected):
${dims.length > 0 ? `- Dimensions found: ${dims.slice(0, 10).join(', ')}` : ''}
${c.dimensions?.gridSpacings?.length > 0 ? `- Grid spacings: ${c.dimensions.gridSpacings.join(', ')}` : ''}
${areas.length > 0 ? `- Areas detected: ${areas.join(', ')}` : ''}
${members.length > 0 ? `- Member sizes: ${members.slice(0, 10).join(', ')}` : ''}
${c.materialSpecs?.steelGrades?.length > 0 ? `- Steel grades: ${c.materialSpecs.steelGrades.join(', ')}` : ''}
${c.materialSpecs?.concreteGrades?.length > 0 ? `- Concrete grades: ${c.materialSpecs.concreteGrades.join(', ')}` : ''}

IMPORTANT: Since drawing data was auto-detected, generate CONFIRMATION questions with "defaultValue" pre-filled from the detected data. For example, if area "9,600 SF" was detected, set defaultValue: "9,600 sq ft" on the area question. Ask the user to CONFIRM or CORRECT the auto-detected values rather than asking open-ended questions.`;
        }

        const prompt = `Based on this project information, generate targeted follow-up questions needed to produce an accurate construction cost estimate.

PROJECT INFO:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Design Standard: ${projectInfo.designStandard || 'Not specified'}
- Project Type: ${projectInfo.projectType || 'Not specified'}
- Region/Location: ${projectInfo.region || 'Not specified'}
- Files uploaded: ${projectInfo.fileCount} files (${projectInfo.fileNames?.join(', ') || 'N/A'})
${measurementContext}

NOTE: Analyze the uploaded file names carefully. If DWG/CAD files are present, the user has construction drawings - ask questions about structural details, member sizes, connection types, and specifications that would be found in those drawings. Always ask about total project area/dimensions since this is critical for estimation.

Generate 8-12 critical questions grouped into categories. Each question should have options where applicable to make it easy for the user.

Respond in this exact JSON format:
{
    "questionGroups": [
        {
            "groupTitle": "Project Basics",
            "groupIcon": "fa-building",
            "questions": [
                {
                    "id": "q1",
                    "question": "What is the project type?",
                    "type": "select",
                    "required": true,
                    "options": ["Commercial Office", "Residential", "Industrial", "Retail", "Healthcare", "Educational", "Mixed-Use", "Other"],
                    "helpText": "This determines applicable building codes and cost standards",
                    "defaultValue": ""
                },
                {
                    "id": "q2",
                    "question": "What is the total project area?",
                    "type": "input",
                    "inputType": "text",
                    "required": true,
                    "placeholder": "e.g., 50,000 sq ft or 4,645 sq m",
                    "helpText": "Total gross floor area including all levels",
                    "defaultValue": ""
                }
            ]
        }
    ]
}

Question types allowed: "select" (dropdown with options), "input" (text/number field), "multiselect" (multiple choice), "textarea" (long text).
Each question can include an optional "defaultValue" field to pre-fill answers from auto-detected drawing data.

Focus questions on:
1. Project type, size, and location/region
2. Structure type (steel frame, concrete, wood, etc.)
3. Number of floors/levels
4. Quality/finish level (economy, standard, premium, luxury)
5. Specific trades needed (structural steel, rebar, MEP, finishes, etc.)
6. Timeline and phasing
7. Site conditions (new construction, renovation, demolition needed?)
8. Special requirements (seismic zone, environmental, LEED certification, etc.)
9. Currency and region for pricing

Make questions specific to what was described in the project info.`;

        const stream = await anthropic.messages.stream({
            model: 'claude-opus-4-20250514',
            max_tokens: 6000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        });

        const response = await stream.finalMessage();
        const text = response.content[0].text;
        return extractJSON(text);
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating questions:', error);
        return getDefaultQuestions();
    }
}

/**
 * Generate AI estimate WITH vision analysis of actual drawing files.
 * This is the enhanced version that sends PDF/image files directly to Claude
 * so it can read actual dimensions from structural drawings.
 *
 * @param {Object} projectInfo - Project metadata
 * @param {Object} answers - Questionnaire answers
 * @param {string[]} fileNames - File name list
 * @param {Array} fileBuffers - Array of { originalname, buffer, mimetype, size } from multer
 */
export async function generateAIEstimate(projectInfo, answers, fileNames, fileBuffers) {
    try {
        const hasFiles = fileBuffers && fileBuffers.length > 0;
        const hasAnalyzableFiles = hasFiles && fileBuffers.some(f =>
            /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(f.originalname)
        );

        console.log(`[AI-ESTIMATION] Generating estimate for "${projectInfo.projectTitle}" with ${fileBuffers?.length || 0} files (analyzable: ${hasAnalyzableFiles})`);

        // STEP 0: Run intelligent PDF measurement extraction (parallel with prompt building)
        let measurementData = null;
        let measurementText = '';
        if (hasFiles) {
            try {
                measurementData = await extractMeasurementsFromPDFs(fileBuffers);
                measurementText = formatExtractionForAI(measurementData);
                if (measurementText) {
                    console.log(`[AI-ESTIMATION] Intelligent measurement extraction: ${measurementData.combined?.overallConfidence?.level} confidence (${measurementData.combined?.overallConfidence?.score}%)`);
                } else {
                    console.log(`[AI-ESTIMATION] No measurable text data extracted from PDFs (likely scanned drawings)`);
                }
            } catch (measureErr) {
                console.log(`[AI-ESTIMATION] Measurement extraction skipped: ${measureErr.message}`);
            }
        }

        // Build the text prompt
        const textPrompt = buildEstimationTextPrompt(projectInfo, answers, fileNames, hasAnalyzableFiles);

        // Build the multimodal message content
        const messageContent = [];

        if (hasAnalyzableFiles) {
            // STEP 1: Add drawing analysis instruction
            messageContent.push({
                type: 'text',
                text: `🔍 DRAWING ANALYSIS MODE ACTIVATED\n\nI am providing you with ${fileBuffers.length} construction drawing file(s) for direct visual analysis. You MUST:\n1. Examine EVERY page of EVERY drawing\n2. Extract ALL dimensions, member sizes, and specifications you can read\n3. Build your quantity takeoff from what you ACTUALLY SEE in these drawings\n4. List specific dimensions you extracted in the "drawingNotes" field\n\nHere are the drawing files:\n`
            });

            // STEP 2: Add actual file content blocks (PDFs and images)
            const fileContentBlocks = buildFileContentBlocks(fileBuffers);
            messageContent.push(...fileContentBlocks);

            // STEP 3: Add extracted text from PDFs as supplementary data
            try {
                const pdfTexts = await extractPdfText(fileBuffers);
                if (pdfTexts.length > 0) {
                    let extractedTextSection = '\n\n📝 EXTRACTED TEXT FROM PDF DOCUMENTS (supplementary to visual analysis):\n';
                    for (const pt of pdfTexts) {
                        extractedTextSection += `\n--- Text from "${pt.fileName}" (${pt.pages} pages) ---\n${pt.text}\n`;
                    }
                    extractedTextSection += '\n---\nUse this text data to VERIFY and SUPPLEMENT what you see in the visual drawings above.\n';
                    messageContent.push({ type: 'text', text: extractedTextSection });
                }
            } catch (pdfErr) {
                console.log(`[AI-ESTIMATION] PDF text extraction skipped: ${pdfErr.message}`);
            }
        }

        // STEP 3.5: Add intelligently extracted measurement data
        if (measurementText) {
            messageContent.push({
                type: 'text',
                text: `\n\n🔬 INTELLIGENT PRE-EXTRACTED DATA FROM PDF TEXT LAYERS:\nThe following dimensions, member sizes, material specifications, and schedules were automatically extracted from the PDF text layers using pattern recognition. Use this data to VERIFY and CROSS-CHECK what you see in the visual drawings. Where this extracted data and your visual analysis agree, you can have HIGH CONFIDENCE in those values. Where they disagree, note the discrepancy and use the most accurate value.\n\n${measurementText}\n\n⚠️ IMPORTANT: The above data is extracted from TEXT LAYERS only. Some PDFs are scanned images with no text — for those, rely entirely on your visual analysis. Always trust what you can SEE in the drawings over text extraction when there's a conflict.\n`
            });
        }

        // STEP 4: Add the main estimation prompt
        messageContent.push({ type: 'text', text: textPrompt });

        // Call Claude with streaming (required for large vision payloads that take >10 min)
        try {
            const stream = await anthropic.messages.stream({
                model: 'claude-opus-4-20250514',
                max_tokens: 32000,
                thinking: {
                    type: 'enabled',
                    budget_tokens: 10000
                },
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: messageContent }]
            });

            const response = await stream.finalMessage();
            // With extended thinking enabled, the response may contain thinking blocks before the text block
            const textBlock = response.content.find(block => block.type === 'text');
            const text = textBlock ? textBlock.text : response.content[0].text;
            const result = extractJSON(text);

            // Validate and fix grand total calculation
            validateAndFixTotals(result);

            // Post-process: enrich with labor breakdown, manpower summary, crew, markups (computed in code)
            enrichEstimateWithLaborAndMarkups(result, {
                currency: result.summary?.currency || answers?.currency || 'USD',
                location: answers?.region || projectInfo?.region || '',
                totalArea: projectInfo?.totalArea, projectType: projectInfo?.projectType
            });

            // Tag the result with analysis metadata
            if (result.structuralAnalysis) {
                result.structuralAnalysis.analysisMethod = hasAnalyzableFiles
                    ? 'VISION_ANALYSIS - Dimensions extracted directly from uploaded drawings'
                    : 'INFERENCE_BASED - Estimated from project description (no drawings analyzed)';
                result.structuralAnalysis.filesAnalyzed = hasAnalyzableFiles
                    ? fileBuffers.filter(f => /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(f.originalname)).map(f => f.originalname)
                    : [];
            }

            console.log(`[AI-ESTIMATION] Estimate generated successfully (vision: ${hasAnalyzableFiles}, grand total: ${result.summary?.grandTotal})`);
            return result;
        } catch (apiError) {
            // FALLBACK: If Claude can't process the PDF, retry with text-only extraction
            const isPdfError = apiError.message?.includes('Could not process PDF') ||
                apiError.error?.error?.message?.includes('Could not process PDF');

            if (isPdfError && hasAnalyzableFiles) {
                console.warn(`[AI-ESTIMATION] PDF document block rejected by API. Falling back to text-only analysis...`);
                return await generateAIEstimateTextFallback(projectInfo, answers, fileNames, fileBuffers);
            }
            throw apiError;
        }
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating estimate:', error);
        throw new Error('Failed to generate AI estimate. Please try again.');
    }
}

/**
 * Fallback: Generate AI estimate using ONLY extracted PDF text when Claude rejects the raw PDF.
 * This handles complex/scanned PDFs that the API document block can't process.
 */
async function generateAIEstimateTextFallback(projectInfo, answers, fileNames, fileBuffers) {
    console.log(`[AI-FALLBACK] Starting text-only estimation for "${projectInfo.projectTitle}"`);

    // Run intelligent measurement extraction (critical for text fallback since no vision)
    let measurementText = '';
    try {
        const measurementData = await extractMeasurementsFromPDFs(fileBuffers);
        measurementText = formatExtractionForAI(measurementData);
        if (measurementText) {
            console.log(`[AI-FALLBACK] Intelligent measurements extracted: ${measurementData.combined?.overallConfidence?.level}`);
        }
    } catch (err) {
        console.log(`[AI-FALLBACK] Measurement extraction skipped: ${err.message}`);
    }

    // Extract all available text from PDFs
    let pdfTexts = [];
    try {
        pdfTexts = await extractPdfText(fileBuffers);
    } catch (err) {
        console.log(`[AI-FALLBACK] PDF text extraction failed: ${err.message}`);
    }

    // Also include any images that ARE processable (non-PDF files)
    const imageBuffers = fileBuffers.filter(f =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname)
    );
    const imageBlocks = buildFileContentBlocks(imageBuffers);

    const hasTextContent = pdfTexts.length > 0 && pdfTexts.some(pt => pt.text.trim().length > 100);
    const hasImages = imageBlocks.length > 0;

    // Build the fallback message content
    const fallbackContent = [];

    if (hasImages) {
        fallbackContent.push({
            type: 'text',
            text: `🔍 DRAWING ANALYSIS MODE (Images only - PDF could not be visually processed)\n\nThe PDF drawings could not be processed visually. However, image files are available for analysis.\n`
        });
        fallbackContent.push(...imageBlocks);
    }

    if (hasTextContent) {
        fallbackContent.push({
            type: 'text',
            text: `\n📝 EXTRACTED TEXT CONTENT FROM CONSTRUCTION DRAWINGS:\nThe PDF documents could not be processed as visual documents, but text content was extracted successfully. Use this text to identify dimensions, member sizes, schedules, and specifications.\n`
        });
        for (const pt of pdfTexts) {
            fallbackContent.push({
                type: 'text',
                text: `\n--- Extracted from "${pt.fileName}" (${pt.pages} pages) ---\n${pt.text}\n---\n`
            });
        }
        console.log(`[AI-FALLBACK] Using extracted text from ${pdfTexts.length} PDF(s) (${pdfTexts.reduce((sum, pt) => sum + pt.text.length, 0)} chars total)`);
    }

    // Add intelligent measurement data (especially valuable in fallback mode)
    if (measurementText) {
        fallbackContent.push({
            type: 'text',
            text: `\n\n🔬 INTELLIGENT PRE-EXTRACTED MEASUREMENT DATA:\nSince the PDF could not be visually analyzed, the following data was extracted from the PDF text layer using intelligent pattern recognition. This is your PRIMARY source for dimensions, member sizes, and specifications.\n\n${measurementText}\n`
        });
    }

    // Use text-aware prompt (mark as having "files" if we got any text out)
    const hasUsableContent = hasTextContent || hasImages || !!measurementText;
    const textPrompt = buildEstimationTextPrompt(projectInfo, answers, fileNames, hasUsableContent);
    fallbackContent.push({ type: 'text', text: textPrompt });

    const stream = await anthropic.messages.stream({
        model: 'claude-opus-4-20250514',
        max_tokens: 32000,
        thinking: {
            type: 'enabled',
            budget_tokens: 10000
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: fallbackContent }]
    });

    const response = await stream.finalMessage();
    // With extended thinking enabled, the response may contain thinking blocks before the text block
    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock ? textBlock.text : response.content[0].text;
    const result = extractJSON(text);

    // Validate and fix grand total calculation
    validateAndFixTotals(result);

    // Post-process: enrich with labor breakdown, manpower summary, crew, markups (computed in code)
    enrichEstimateWithLaborAndMarkups(result, {
        currency: result.summary?.currency || 'USD',
        location: projectInfo?.region || '',
        totalArea: projectInfo?.totalArea, projectType: projectInfo?.projectType
    });

    // Tag as text-fallback analysis
    if (result.structuralAnalysis) {
        result.structuralAnalysis.analysisMethod = hasTextContent
            ? 'TEXT_EXTRACTION_FALLBACK - PDF could not be visually processed; estimate based on extracted text content'
            : 'INFERENCE_BASED - PDF could not be processed; estimated from project description only';
        result.structuralAnalysis.filesAnalyzed = fileBuffers.map(f => f.originalname);
    }

    console.log(`[AI-FALLBACK] Text-fallback estimate generated successfully (grand total: ${result.summary?.grandTotal})`);
    return result;
}

/**
 * Build the text portion of the estimation prompt.
 */
function buildEstimationTextPrompt(projectInfo, answers, fileNames, hasVisionFiles) {
    const drawingAnalysisInstruction = hasVisionFiles
        ? `\n\n🎯 CRITICAL - VISION-BASED ANALYSIS:
You have been provided with actual construction drawings/blueprints above. You MUST:
1. Use ONLY the dimensions, member sizes, and specifications you can READ from the drawings
2. Do NOT use generic assumptions when the actual value is visible in the drawings
3. Count actual members shown in plans to calculate quantities
4. Read schedules (beam schedule, column schedule, rebar schedule) shown in the drawings
5. Note the drawing scale and use it to derive any unspecified dimensions
6. Cross-reference plan views with sections and elevations for accuracy
7. Read general notes for material grades, design loads, and specifications
8. In your "drawingNotes" field, LIST EVERY specific dimension/size you extracted from the drawings (e.g., "Column grid: 30'-0" x 40'-0" typical bay, W14x48 columns at gridlines A-F, W24x68 beams at roof level")
9. If a dimension is unclear, mark it as "scaled approximately X'-Y""

YOUR ACCURACY ON READING THESE DRAWINGS DIRECTLY DETERMINES THE QUALITY OF THE ESTIMATE.`
        : `\nNote: No analyzable drawing files were provided. The estimate will be based on project description and questionnaire answers. For maximum accuracy, upload PDF drawings or images of structural plans.`;

    return `\n\nGenerate a PRECISE, REALISTIC construction cost estimate. Extract scope, dimensions, and specs directly from the provided drawings/designs.
${drawingAnalysisInstruction}

PROJECT INFORMATION:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Design Standard: ${projectInfo.designStandard || 'Not specified'}
- Project Type: ${projectInfo.projectType || 'Not specified'}
- Region/Location: ${projectInfo.region || 'Not specified'}
- Total Area: ${projectInfo.totalArea || 'Not specified'}
- Files: ${fileNames?.join(', ') || 'N/A'}

QUESTIONNAIRE ANSWERS:
${JSON.stringify(answers, null, 2)}

Respond in this exact JSON format:

{
    "summary": {
        "projectTitle": "string",
        "projectType": "string",
        "location": "string",
        "currency": "string (e.g., USD, INR, AED, GBP)",
        "currencySymbol": "string (e.g., $, ₹, د.إ, £)",
        "totalArea": "string (from drawings or project info)",
        "numberOfFloors": "string",
        "structuralSystem": "string (e.g., Steel Frame, RCC, Pre-Engineered)",
        "estimateDate": "string (today's date)",
        "confidenceLevel": "string (Low/Medium/High)",
        "estimateClass": "string (Class 1-5 per AACE)",
        "grandTotal": number,
        "costPerUnit": number,
        "unitLabel": "string (per sq ft / per sq m)",
        "benchmarkCheck": "string (e.g., 'At $145/sqft, this is within the typical $80-200/sqft range for industrial buildings in this region')"
    },
    "drawingExtraction": {
        "dimensionsFound": ["list every dimension from drawings, e.g., 'Building: 120'-0\" x 80'-0\"'"],
        "memberSizesFound": ["list every member size, e.g., 'W24x68 roof beams', 'W14x48 columns'"],
        "schedulesFound": ["list schedules read from drawings"],
        "materialsNoted": ["list material grades noted, e.g., 'ASTM A992 Gr50'"],
        "designLoads": ["list design loads, e.g., 'Roof DL: 20 PSF'"],
        "scaleUsed": "string",
        "sheetsAnalyzed": ["list of drawing sheets"],
        "totalMembersCount": { "beams": number, "columns": number, "bracing": number, "joists": number }
    },
    "trades": [
        {
            "division": "string (CSI Division number)",
            "tradeName": "string (e.g., Structural Steel)",
            "tradeIcon": "string (fa icon class)",
            "subtotal": number,
            "percentOfTotal": number,
            "lineItems": [
                {
                    "description": "string (e.g., 'W24x68 Steel Beams - Supply & Install')",
                    "quantity": number,
                    "unit": "string (tons, cy, sf, lf, ea)",
                    "unitRate": number,
                    "lineTotal": number,
                    "materialDetails": "string (spec grade, e.g., 'ASTM A992 Gr50')"
                }
            ]
        }
    ],
    "structuralAnalysis": {
        "structuralSystem": "string",
        "foundationType": "string",
        "primaryMembers": "string (beam/column sizes from drawings)",
        "secondaryMembers": "string (purlins, girts, bracing from drawings)",
        "connectionTypes": "string",
        "steelTonnage": "string",
        "concreteVolume": "string",
        "rebarTonnage": "string",
        "drawingNotes": "string (all dimensions/specs extracted from drawings)",
        "analysisMethod": "string",
        "filesAnalyzed": ["file names analyzed"]
    },
    "materialSchedule": {
        "steelMembers": [
            { "mark": "B1", "type": "Beam", "section": "W24x68", "grade": "ASTM A992 Gr50", "count": 12, "lengthEach": "30'-0\"", "lengthFt": 30, "weightPerUnit": 68, "weightUnit": "lb/ft", "totalWeight": 24480, "totalWeightUnit": "lbs", "totalCost": 33120, "location": "Roof level", "calculation": "12 × 68 lb/ft × 30 ft = 24,480 lbs" }
        ],
        "steelSummary": { "mainSteelTons": 0, "connectionMiscTons": 0, "totalSteelTons": 0, "steelPSF": 0, "weightUnit": "tons or MT" },
        "concreteItems": [
            { "element": "Spread Footings F1", "type": "Footing", "dimensions": "6'x6'x2'", "count": 20, "volumeEachCY": 2.67, "totalCY": 53.3, "concreteGrade": "4000 PSI", "rebarLbsPerCY": 120, "rebarTotalLbs": 6396, "totalCost": 16800, "calculation": "20 x (6x6x2)/27 = 53.3 CY" }
        ],
        "concreteSummary": { "totalConcreteCY": 0, "totalRebarTons": 0, "volumeUnit": "CY or m³" },
        "rebarItems": [
            { "element": "Footing Rebar", "barSize": "#5", "quantity": 6396, "unit": "lbs", "rebarGrade": "ASTM A615 Gr60", "totalCost": 5117, "notes": "120 lbs/CY × 53.3 CY" }
        ],
        "rebarSummary": { "totalRebarTons": 0, "rebarBySize": {}, "rebarGrade": "" },
        "pebItems": [
            { "item": "Primary Frames", "specification": "Tapered I-section", "quantity": 0, "unit": "MT", "totalCost": 0, "notes": "Main portal frames" }
        ],
        "pebSummary": { "totalPEBWeight": 0, "weightUnit": "MT", "totalPEBCost": 0 },
        "mepItems": [
            { "category": "Plumbing", "item": "4\" PVC Drain Pipe", "specification": "Schedule 40 PVC", "quantity": 500, "unit": "LF", "totalCost": 5200, "notes": "Main drain lines" },
            { "category": "HVAC", "item": "Split AC Units", "specification": "2 TR", "quantity": 4, "unit": "EA", "totalCost": 12000, "notes": "Office areas" },
            { "category": "Electrical", "item": "Main Distribution Panel", "specification": "200A 3-phase", "quantity": 1, "unit": "EA", "totalCost": 4540, "notes": "Per SLD" },
            { "category": "Fire Protection", "item": "Wet Sprinkler System", "specification": "NFPA 13", "quantity": 9600, "unit": "SF", "totalCost": 28800, "notes": "Full coverage" }
        ],
        "mepSummary": { "totalPlumbingCost": 0, "totalHVACCost": 0, "totalElectricalCost": 0, "totalFireProtectionCost": 0, "totalElevatorCost": 0, "totalBMSCost": 0, "totalMEPCost": 0 },
        "architecturalItems": [
            { "category": "Doors", "item": "Hollow Metal Door 3'x7'", "specification": "18GA HM frame", "quantity": 12, "unit": "EA", "totalCost": 8160, "notes": "Per door schedule" },
            { "category": "Flooring", "item": "Epoxy Floor Coating", "specification": "2-coat system", "quantity": 9600, "unit": "SF", "totalCost": 28800, "notes": "Warehouse area" },
            { "category": "Painting", "item": "Interior Paint", "specification": "2 coats latex", "quantity": 5000, "unit": "SF", "totalCost": 7500, "notes": "Walls" }
        ],
        "architecturalSummary": { "totalDoorsCost": 0, "totalWindowsCost": 0, "totalFlooringCost": 0, "totalCeilingCost": 0, "totalPaintingCost": 0, "totalPartitionsCost": 0, "totalArchitecturalCost": 0 },
        "roofingItems": [
            { "item": "Standing Seam Metal Roof", "specification": "0.5mm color coated", "quantity": 9600, "unit": "SF", "totalCost": 69600, "notes": "Complete roof area" }
        ],
        "claddingItems": [
            { "item": "Insulated Metal Wall Panel", "specification": "50mm PUF", "quantity": 5000, "unit": "SF", "totalCost": 50000, "notes": "Exterior walls" }
        ],
        "waterproofingItems": [
            { "item": "Below Grade Waterproofing", "specification": "Membrane system", "quantity": 0, "unit": "SF", "totalCost": 0, "notes": "" }
        ],
        "siteworkItems": [
            { "item": "Earthwork/Grading", "specification": "Cut and fill", "quantity": 500, "unit": "CY", "totalCost": 5800, "notes": "Site preparation" },
            { "item": "Storm Drainage", "specification": "RCC pipes", "quantity": 200, "unit": "LF", "totalCost": 4000, "notes": "" },
            { "item": "Paving/Parking", "specification": "Asphalt", "quantity": 5000, "unit": "SF", "totalCost": 15000, "notes": "" }
        ],
        "connectionItems": [
            { "item": "High-Strength Bolts", "specification": "A325 3/4\"", "quantity": 500, "unit": "EA", "totalCost": 2500, "notes": "Beam-column connections" },
            { "item": "Base Plates", "specification": "A36", "quantity": 20, "unit": "EA", "totalCost": 6000, "notes": "Column bases" }
        ],
        "otherMaterials": [
            { "material": "Metal Deck", "specification": "1.5\" 20GA composite", "quantity": 9600, "unit": "SF", "totalCost": 34800, "notes": "Roof deck" },
            { "material": "Fireproofing", "specification": "Spray-applied", "quantity": 0, "unit": "SF", "totalCost": 0, "notes": "If required" }
        ],
        "safetyTemporary": [
            { "item": "Scaffolding", "specification": "Tubular", "quantity": 0, "unit": "SF", "totalCost": 0, "notes": "" },
            { "item": "Safety Provisions", "specification": "PPE, barriers, signage", "quantity": 1, "unit": "LS", "totalCost": 0, "notes": "" }
        ],
        "grandTotalMaterialCost": 0
    },
    "costBreakdown": {
        "directCosts": number,
        "generalConditions": number,
        "generalConditionsPercent": number,
        "overhead": number,
        "overheadPercent": number,
        "profit": number,
        "profitPercent": number,
        "contingency": number,
        "contingencyPercent": number,
        "escalation": number,
        "escalationPercent": number,
        "totalWithMarkups": number
    },
    "tradesSummary": [
        { "tradeName": "string", "amount": number, "percentage": number }
    ],
    "assumptions": ["string array"],
    "exclusions": ["string array"],
    "notes": ["string array"],
    "marketInsights": {
        "regionalFactor": "string",
        "materialTrends": "string",
        "laborMarket": "string",
        "recommendedProcurement": "string"
    }
}

CRITICAL RULES:
1. lineItems is the SINGLE source of cost data. Each lineItem has: quantity, unitRate (all-in cost per unit), lineTotal (= quantity × unitRate)
2. unitRate = total installed cost per unit (material + labor + equipment combined). This is a PER-UNIT rate, NOT a total.
3. lineTotal = quantity × unitRate. VERIFY this math for every single line item before outputting.
4. trade.subtotal = SUM of all its lineItems[].lineTotal
5. directCosts = SUM of all trades[].subtotal
6. Markups: generalConditions 5-8%, overhead 5-8%, profit 5-10%, contingency 5-10%, escalation 0-3%. TOTAL markups should be 20-35% of direct costs.
7. grandTotal = totalWithMarkups = directCosts + all markup amounts
8. Use REALISTIC ${new Date().getFullYear()} market unit rates for the region. DO NOT inflate rates.
9. BENCHMARK CHECK: After computing grandTotal, calculate cost/sqft (or cost/sqm). Compare against industry benchmarks for the project type and region. If outside range, re-examine.
10. Include ALL trades relevant to the project. For a complete building, this means structural + concrete + rebar + MEP + architectural + sitework at minimum.
11. VERIFY ALL MATH before outputting. Sum up every lineTotal, check every trade subtotal, verify directCosts, verify grandTotal.
12. MATERIAL SCHEDULE (CRITICAL): The "materialSchedule" must be a COMPLETE, PROCUREMENT-READY Bill of Materials:
    - EVERY item needs: quantity, unit, totalCost (installed all-in cost). Do NOT output labor/equipment breakdown - that is computed separately.
    - steelMembers: Every beam, column, brace, joist, purlin, girt with mark, section, grade, count, lengthFt (or lengthM), weightPerUnit, totalWeight, totalCost, location, calculation
    - steelSummary: mainSteelTons, connectionMiscTons, totalSteelTons, steelPSF, weightUnit
    - concreteItems: Every footing, slab, grade beam, wall, pile cap with dimensions, count, volumeEachCY, totalCY, concreteGrade, rebarLbsPerCY, rebarTotalLbs, totalCost, calculation
    - concreteSummary: totalConcreteCY, totalRebarTons, volumeUnit
    - rebarItems: Rebar by element type with barSize, quantity, unit, rebarGrade, totalCost — quantities should be procurement-ready
    - rebarSummary: totalRebarTons, rebarBySize (grouped by bar size for procurement), rebarGrade
    - pebItems: (if PEB project) Primary frames, purlins, girts, bracing, sheeting, accessories with weights
    - mepItems: ALL plumbing, HVAC, electrical, fire protection, elevators, BMS. Each with category, item, specification, quantity, unit, totalCost
    - mepSummary: totals per sub-trade
    - architecturalItems: ALL doors, windows, flooring, ceiling, painting, partitions, waterproofing. Each with category, item, spec, quantity, unit, totalCost
    - architecturalSummary: totals per sub-trade
    - roofingItems: Roof sheets, insulation, flashing, gutters, downspouts
    - claddingItems: Wall panels, curtain wall, insulation
    - waterproofingItems: Below-grade, above-grade, sealants
    - siteworkItems: Earthwork, paving, drainage, utilities, landscaping, fencing
    - connectionItems: Bolts, base plates, anchor bolts, weld material
    - otherMaterials: Metal deck, fireproofing, sealants, expansion joints, misc
    - safetyTemporary: Scaffolding, shoring, temporary power, safety provisions
    - grandTotalMaterialCost = sum of ALL material costs
    - Do NOT include: materialCost, laborHours, laborRate, laborCost, equipmentCost, manpowerSummary, boqMarkups, crewBreakdown (these are computed by post-processor)
    - This is a WORLD-CLASS complete construction BOQ — quantities must be PROCUREMENT-READY so anyone can purchase materials from this estimate`;
}

function getDefaultQuestions() {
    return {
        questionGroups: [
            {
                groupTitle: 'Project Basics',
                groupIcon: 'fa-building',
                questions: [
                    { id: 'projectType', question: 'What is the project type?', type: 'select', required: true, options: ['Commercial Office', 'Residential - Single Family', 'Residential - Multi Family', 'Industrial / Warehouse', 'Retail', 'Healthcare', 'Educational', 'Hospitality', 'Mixed-Use', 'Infrastructure', 'Other'], helpText: 'Primary building/project classification' },
                    { id: 'totalArea', question: 'What is the total project area?', type: 'input', inputType: 'text', required: true, placeholder: 'e.g., 50,000 sq ft', helpText: 'Total gross floor area' },
                    { id: 'floors', question: 'Number of floors/levels?', type: 'select', required: true, options: ['1', '2-3', '4-6', '7-10', '11-20', '20+', 'N/A'], helpText: 'Including basement levels' },
                    { id: 'constructionType', question: 'Type of construction?', type: 'select', required: true, options: ['New Construction', 'Renovation / Remodel', 'Addition', 'Tenant Improvement', 'Demolition & Rebuild'], helpText: 'Nature of the construction work' }
                ]
            },
            {
                groupTitle: 'Structure & Materials',
                groupIcon: 'fa-hard-hat',
                questions: [
                    { id: 'structuralSystem', question: 'Primary structural system?', type: 'select', required: true, options: ['Structural Steel Frame', 'Reinforced Concrete', 'Pre-engineered Metal Building', 'Wood Frame', 'Masonry / CMU', 'Hybrid (Steel + Concrete)', 'Other'], helpText: 'Main structural framing system' },
                    { id: 'qualityLevel', question: 'Quality / finish level?', type: 'select', required: true, options: ['Economy / Basic', 'Standard / Average', 'Above Average', 'Premium / High-End', 'Luxury / Custom'], helpText: 'Overall quality tier affects material and finish selections' },
                    { id: 'tradesNeeded', question: 'Which trades are needed?', type: 'multiselect', required: false, options: ['Structural Steel', 'Rebar / Reinforcing', 'Concrete', 'Masonry', 'Roofing', 'Exterior Cladding', 'Windows & Glazing', 'Interior Framing & Drywall', 'Flooring', 'Painting', 'Mechanical (HVAC)', 'Electrical', 'Plumbing', 'Fire Protection', 'Elevators', 'Site Work', 'Landscaping'], helpText: 'Select all applicable trades' }
                ]
            },
            {
                groupTitle: 'Location & Budget',
                groupIcon: 'fa-map-marker-alt',
                questions: [
                    { id: 'region', question: 'Project location / region?', type: 'input', inputType: 'text', required: true, placeholder: 'e.g., Dallas, TX, USA or Mumbai, India', helpText: 'City, State/Province, Country for regional pricing' },
                    { id: 'currency', question: 'Preferred currency?', type: 'select', required: true, options: ['USD ($)', 'INR (₹)', 'AED (د.إ)', 'GBP (£)', 'EUR (€)', 'CAD (C$)', 'AUD (A$)', 'SAR (﷼)', 'Other'], helpText: 'Currency for the estimate' },
                    { id: 'timeline', question: 'Expected project timeline?', type: 'select', required: false, options: ['Less than 6 months', '6-12 months', '1-2 years', '2-3 years', '3+ years'], helpText: 'Affects escalation and phasing costs' },
                    { id: 'specialRequirements', question: 'Any special requirements?', type: 'textarea', required: false, placeholder: 'e.g., Seismic Zone 4, LEED Gold certification, clean room specs, blast resistant...', helpText: 'Special codes, certifications, or requirements' }
                ]
            }
        ]
    };
}

export { buildFileContentBlocks, extractPdfText, extractJSON, validateAndFixTotals, buildEstimationTextPrompt, SYSTEM_PROMPT };
export default { generateSmartQuestions, generateAIEstimate, getDefaultQuestions };
