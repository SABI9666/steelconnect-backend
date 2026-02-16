// src/services/aiEstimationService.js - AI-Powered Construction Cost Estimation Engine
// with Vision-based Drawing Analysis + Intelligent PDF Measurement Extraction
import Anthropic from '@anthropic-ai/sdk';
import { extractMeasurementsFromPDFs, formatExtractionForAI } from './pdfMeasurementExtractor.js';

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

    // Step 8: Cost/sqft benchmark ENFORCEMENT - hard cap based on project type
    if (summary.totalArea && summary.grandTotal) {
        const areaMatch = String(summary.totalArea).match(/([\d,]+)/);
        if (areaMatch) {
            const area = Number(areaMatch[1].replace(/,/g, ''));
            if (area > 0) {
                summary.costPerUnit = Math.round((summary.grandTotal / area) * 100) / 100;

                // Determine max acceptable cost/sqft based on project type and currency
                const projectType = (summary.projectType || '').toLowerCase();
                const currency = (summary.currency || 'USD').toUpperCase();
                const isINR = currency === 'INR' || (summary.currencySymbol || '').includes('₹');

                let maxCostPerUnit;
                if (isINR) {
                    // INR benchmarks (per sqft)
                    if (projectType.includes('peb') || projectType.includes('pre-eng')) maxCostPerUnit = 3000;
                    else if (projectType.includes('industrial') || projectType.includes('warehouse')) maxCostPerUnit = 5000;
                    else if (projectType.includes('commercial') || projectType.includes('office')) maxCostPerUnit = 8000;
                    else if (projectType.includes('healthcare') || projectType.includes('hospital')) maxCostPerUnit = 12000;
                    else maxCostPerUnit = 6000; // default cap
                } else {
                    // USD benchmarks (per sqft)
                    if (projectType.includes('peb') || projectType.includes('pre-eng')) maxCostPerUnit = 120;
                    else if (projectType.includes('industrial') || projectType.includes('warehouse')) maxCostPerUnit = 220;
                    else if (projectType.includes('commercial') || projectType.includes('office')) maxCostPerUnit = 400;
                    else if (projectType.includes('healthcare') || projectType.includes('hospital')) maxCostPerUnit = 800;
                    else maxCostPerUnit = 350; // default cap
                }

                // If cost/sqft exceeds 1.5x the benchmark HIGH, proportionally scale down ALL line items
                const hardCap = maxCostPerUnit * 1.5;
                if (summary.costPerUnit > hardCap) {
                    const scaleFactor = hardCap / summary.costPerUnit;
                    console.warn(`[AI-VALIDATION] COST/SQFT ENFORCEMENT: ${summary.costPerUnit.toFixed(0)} exceeds hard cap ${hardCap.toFixed(0)} (${maxCostPerUnit} × 1.5). Scaling all costs by ${scaleFactor.toFixed(3)}`);

                    // Scale down every line item
                    for (const trade of trades) {
                        if (!trade.lineItems) continue;
                        for (const li of trade.lineItems) {
                            li.unitRate = Math.round((Number(li.unitRate) || 0) * scaleFactor * 100) / 100;
                            li.lineTotal = Math.round((Number(li.quantity) || 0) * li.unitRate * 100) / 100;
                        }
                        trade.subtotal = Math.round(trade.lineItems.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0) * 100) / 100;
                    }

                    // Recalculate everything from the scaled line items
                    cb.directCosts = Math.round(trades.reduce((s, t) => s + (Number(t.subtotal) || 0), 0) * 100) / 100;
                    let scaledMarkups = 0;
                    for (const field of markupFields) {
                        const pctField = field + 'Percent';
                        if (cb[pctField] > 0) {
                            cb[field] = Math.round(cb.directCosts * (cb[pctField] / 100) * 100) / 100;
                        }
                        scaledMarkups += Number(cb[field]) || 0;
                    }
                    cb.totalWithMarkups = Math.round((cb.directCosts + scaledMarkups) * 100) / 100;
                    summary.grandTotal = cb.totalWithMarkups;
                    summary.costPerUnit = Math.round((summary.grandTotal / area) * 100) / 100;

                    // Update tradesSummary
                    if (result.tradesSummary) {
                        for (const ts of result.tradesSummary) {
                            const mt = trades.find(t => t.tradeName === ts.tradeName);
                            if (mt) ts.amount = mt.subtotal;
                        }
                    }

                    console.warn(`[AI-VALIDATION] After enforcement: cost/sqft = ${summary.costPerUnit.toFixed(0)}, grandTotal = ${summary.grandTotal}`);
                } else if (summary.costPerUnit > maxCostPerUnit) {
                    console.log(`[AI-VALIDATION] Cost/sqft ${summary.costPerUnit.toFixed(0)} is above benchmark ${maxCostPerUnit} but within 1.5x tolerance`);
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

const SYSTEM_PROMPT = `You are an expert construction cost estimator. You produce precise, realistic estimates that contractors can actually use for bidding.

CORE PRINCIPLE: Accuracy over safety. A good estimate is one that matches the ACTUAL market cost, not an inflated "safe" number. Contractors need realistic numbers to win bids.

WHEN DRAWINGS ARE PROVIDED:
- Examine every sheet. Extract dimensions, member sizes, quantities from what you SEE.
- Count actual members (don't guess). Use drawing scale to derive missing dimensions.
- Use ACTUAL member sizes from drawings, not assumptions.

ESTIMATION ACCURACY (CRITICAL):
1. unitRate = the ALL-IN installed cost per unit (material + labor + equipment). This must be a REALISTIC mid-market rate for the region.
2. DO NOT use premium/high-end rates. Use STANDARD MARKET rates.
3. DO NOT inflate quantities. Show your quantity derivation for each line item.
4. DO NOT add trades that aren't shown in the drawings or description. A steel structure project does NOT need interior finishes, landscaping, or HVAC unless specifically mentioned.
5. KEEP IT LEAN. Only include work items that are clearly needed.

COMMON AI OVERESTIMATION ERRORS (AVOID THESE):
- Overestimating steel tonnage: A typical single-story industrial building uses 5-15 kg/sqft (50-150 kg/sqm) of steel. A 10,000 sqft building needs ~25-75 tons, NOT 200+ tons.
- Overestimating concrete: Foundation for a typical building is 10-25% of building area × depth, NOT the full building volume.
- Double-counting: "Steel fabrication" + "Steel erection" + "Steel supply" as separate items at full rates = 3x actual cost. Use ONE "all-in" line item per material type OR ensure sub-items are properly split.
- Adding unnecessary trades: Only estimate what is IN the drawings or explicitly requested.
- Using US rates for India or vice versa: Indian steel is ₹55,000-75,000/MT installed, NOT $3,000/ton converted to INR.

REFERENCE RATES (use as anchors, adjust for region/complexity):
India (INR):
- Structural steel (supply + fabrication + erection): ₹55,000-75,000/MT
- Concrete (RMC + placing + formwork): ₹5,000-8,000/m³
- Rebar (supply + cutting + bending + placing): ₹55,000-65,000/MT
- Roofing sheets (supply + fixing): ₹350-600/sqft
- PEB structure (all-in): ₹1,200-2,200/sqft built-up area
- Painting (2 coats): ₹40-80/sqft

US (USD):
- Structural steel installed: $2,500-4,000/ton
- Concrete (complete): $200-350/CY
- Rebar installed: $1,200-1,800/ton
- Metal roofing: $8-15/sqft
- PEB structure: $40-100/sqft

COST/SQFT BENCHMARKS (your final estimate MUST fall within these):
USD: Industrial $60-180/sqft, Commercial $130-300/sqft, PEB $35-100/sqft
INR: Industrial ₹1,500-4,000/sqft, Commercial ₹2,500-7,000/sqft, PEB ₹1,000-2,500/sqft
If your result is ABOVE these ranges, you have an error. Re-check quantities and rates.

MATH RULES (MANDATORY):
1. lineTotal = quantity × unitRate (VERIFY for every item)
2. trade.subtotal = SUM of lineItems[].lineTotal
3. directCosts = SUM of trades[].subtotal
4. Each markup = percentage × directCosts
5. grandTotal = directCosts + all markups
6. VERIFY ALL MATH. If it doesn't add up, FIX IT before outputting.

Respond ONLY in valid JSON. No markdown, no text outside JSON.`;

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
                    text: result.text.substring(0, 8000) // Limit text to avoid token overflow
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

export async function generateSmartQuestions(projectInfo) {
    try {
        const prompt = `Based on this project information, generate targeted follow-up questions needed to produce an accurate construction cost estimate.

PROJECT INFO:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Design Standard: ${projectInfo.designStandard || 'Not specified'}
- Project Type: ${projectInfo.projectType || 'Not specified'}
- Region/Location: ${projectInfo.region || 'Not specified'}
- Files uploaded: ${projectInfo.fileCount} files (${projectInfo.fileNames?.join(', ') || 'N/A'})

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
                    "helpText": "This determines applicable building codes and cost standards"
                },
                {
                    "id": "q2",
                    "question": "What is the total project area?",
                    "type": "input",
                    "inputType": "text",
                    "required": true,
                    "placeholder": "e.g., 50,000 sq ft or 4,645 sq m",
                    "helpText": "Total gross floor area including all levels"
                }
            ]
        }
    ]
}

Question types allowed: "select" (dropdown with options), "input" (text/number field), "multiselect" (multiple choice), "textarea" (long text).

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
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4000,
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

        // Call Claude with extended thinking + streaming for maximum accuracy
        // Extended thinking lets the AI verify math internally before outputting
        try {
            const stream = await anthropic.messages.stream({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 32000,
                thinking: {
                    type: 'enabled',
                    budget_tokens: 10000
                },
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: messageContent }]
            });

            const response = await stream.finalMessage();
            // With thinking enabled, response has thinking + text blocks. Find the text block.
            const textBlock = response.content.find(b => b.type === 'text');
            if (!textBlock) throw new Error('No text content in AI response');
            const text = textBlock.text;
            const result = extractJSON(text);

            // Validate and fix grand total calculation
            validateAndFixTotals(result);

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
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 32000,
        thinking: {
            type: 'enabled',
            budget_tokens: 10000
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: fallbackContent }]
    });

    const response = await stream.finalMessage();
    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No text content in AI fallback response');
    const text = textBlock.text;
    const result = extractJSON(text);

    // Validate and fix grand total calculation
    validateAndFixTotals(result);

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

    return `\n\nGenerate a PRECISE, REALISTIC construction cost estimate.
${drawingAnalysisInstruction}

PROJECT:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Design Standard: ${projectInfo.designStandard || 'Not specified'}
- Project Type: ${projectInfo.projectType || 'Not specified'}
- Region/Location: ${projectInfo.region || 'Not specified'}
- Total Area: ${projectInfo.totalArea || 'Not specified'}
- Files: ${fileNames?.join(', ') || 'N/A'}

QUESTIONNAIRE ANSWERS:
${JSON.stringify(answers, null, 2)}

WORKED EXAMPLE (for reference - shows correct quantity derivation and math):
A 10,000 sqft (930 sqm) single-story steel warehouse in India:
- Structural Steel: 45 MT × ₹65,000/MT = ₹29,25,000 (quantityBasis: "Building 100'x100', 25 columns at ~400kg + 20 beams at ~600kg + bracing ~8MT + misc 5MT")
- Foundation: 180 m³ concrete × ₹6,500/m³ = ₹11,70,000 (quantityBasis: "25 footings 1.5m×1.5m×0.6m + plinth beam 200m×0.3m×0.4m")
- Roofing: 10,000 sqft × ₹450/sqft = ₹45,00,000 (quantityBasis: "Building footprint area")
- Direct costs: ~₹86,00,000, Markups 25%: ~₹21,50,000, Grand total: ~₹1,07,50,000
- Cost/sqft: ₹1,075/sqft ✓ (within ₹1,000-2,500 PEB/Industrial range)

Respond in this exact JSON format:
{
    "summary": {
        "projectTitle": "string",
        "projectType": "string",
        "location": "string",
        "currency": "string (INR, USD, AED, etc.)",
        "currencySymbol": "string (₹, $, etc.)",
        "totalArea": "string",
        "numberOfFloors": "string",
        "structuralSystem": "string",
        "estimateDate": "string",
        "confidenceLevel": "string (Low/Medium/High)",
        "estimateClass": "string (Class 1-5 per AACE)",
        "grandTotal": number,
        "costPerUnit": number,
        "unitLabel": "string (per sq ft / per sq m)",
        "benchmarkCheck": "string (MANDATORY: state your cost/sqft and compare to benchmark range)"
    },
    "drawingExtraction": {
        "dimensionsFound": ["specific dimensions"],
        "memberSizesFound": ["specific member sizes"],
        "schedulesFound": ["schedules found"],
        "materialsNoted": ["material grades"],
        "designLoads": ["design loads"],
        "scaleUsed": "string",
        "sheetsAnalyzed": ["sheet list"],
        "totalMembersCount": { "beams": number, "columns": number, "bracing": number, "joists": number }
    },
    "trades": [
        {
            "division": "string",
            "tradeName": "string",
            "tradeIcon": "string (fa icon class)",
            "subtotal": number,
            "percentOfTotal": number,
            "lineItems": [
                {
                    "description": "string",
                    "quantity": number,
                    "unit": "string",
                    "unitRate": number,
                    "lineTotal": number,
                    "quantityBasis": "string (REQUIRED: show HOW you derived this quantity, e.g., '25 columns × 15m height × 48 kg/m = 18 MT')",
                    "materialDetails": "string (spec grade)"
                }
            ]
        }
    ],
    "structuralAnalysis": {
        "structuralSystem": "string",
        "foundationType": "string",
        "primaryMembers": "string",
        "secondaryMembers": "string",
        "connectionTypes": "string",
        "steelTonnage": "string",
        "concreteVolume": "string",
        "rebarTonnage": "string",
        "drawingNotes": "string",
        "analysisMethod": "string",
        "filesAnalyzed": ["file names"]
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

RULES:
1. lineTotal = quantity × unitRate. unitRate is the ALL-IN installed cost PER UNIT.
2. trade.subtotal = SUM(lineItems[].lineTotal). directCosts = SUM(trades[].subtotal).
3. Markups: GC 5-8%, overhead 3-5%, profit 5-10%, contingency 5-10%, escalation 0-3%. Total 20-30%.
4. grandTotal = directCosts + all markup amounts = costBreakdown.totalWithMarkups.
5. EVERY lineItem MUST have a "quantityBasis" showing the calculation/derivation.
6. Only include trades that are IN the drawings or explicitly described. Do NOT add extra trades.
7. Use MID-MARKET rates, not premium rates. Check against the reference rates in the system prompt.
8. After computing grandTotal, calculate cost/sqft. If it exceeds the benchmark HIGH for this project type, you have an error - reduce quantities or rates.
9. VERIFY ALL MATH before outputting.`;
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

export default { generateSmartQuestions, generateAIEstimate, getDefaultQuestions };
