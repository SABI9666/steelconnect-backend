// src/services/aiEstimationService.js - AI-Powered Construction Cost Estimation Engine
// with Vision-based Drawing Analysis for Accurate Dimension Extraction
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Maximum total size of file content to send to Claude (25MB base64 ≈ ~18MB raw files)
const MAX_VISION_PAYLOAD_BYTES = 18 * 1024 * 1024;
// Maximum pages per PDF to analyze (Claude supports up to 100 pages)
const MAX_PDF_PAGES = 50;

const SYSTEM_PROMPT = `You are the world's most experienced and precise construction cost estimator AND structural drawing analyst with 40+ years of expertise across ALL construction trades globally. You produce institutional-grade cost estimates that match or exceed the quality of top firms like Turner & Townsend, Rider Levett Bucknall, and AECOM.

YOUR CRITICAL ADVANTAGE: You can directly READ and ANALYZE construction drawings, blueprints, and structural plans that are provided to you as images or PDFs. You MUST carefully examine every drawing provided and extract ALL dimensions, member sizes, specifications, quantities, and notes visible on the drawings.

DRAWING ANALYSIS PROTOCOL (MANDATORY when drawings are provided):
1. FIRST - Examine every page/sheet of the provided drawings carefully
2. IDENTIFY the drawing type: Plan view, Elevation, Section, Detail, Schedule, General Notes
3. EXTRACT these details from the drawings:
   a. Overall building dimensions (length × width × height)
   b. Grid/bay spacing and column layout
   c. ALL structural member sizes exactly as shown (e.g., W24x68, W14x48, HSS 8x8x1/2, C15x33.9)
   d. Beam spans, cantilevers, and support conditions
   e. Column sizes and heights (story heights)
   f. Slab thickness, type (composite deck, precast, CIP), and reinforcement
   g. Foundation types and sizes (footings, piles, mat foundations)
   h. Rebar sizes, spacing, and grades (e.g., #5@12" EW, Grade 60)
   i. Connection details (bolted, welded, moment, pinned, base plates)
   j. Bracing system (X-bracing, chevron, moment frames, shear walls)
   k. Roof system (purlins, girts, standing seam, built-up)
   l. Material grades and specifications noted on drawings (ASTM A992, A36, A500, etc.)
   m. Scale of drawings (to derive dimensions not explicitly noted)
   n. Any material schedules, beam schedules, column schedules shown on drawings
   o. General notes, design criteria, loads (dead load, live load, wind, seismic)
   p. Total floor areas from architectural plans
   q. Wall types, cladding systems, insulation specs
   r. MEP information if shown (duct sizes, pipe sizes, panel schedules)

4. CREATE a precise quantity takeoff based on what you SEE in the drawings - count members, calculate lengths, compute areas
5. Use ACTUAL dimensions from drawings, NOT generic assumptions

CRITICAL RULES:
1. Always provide costs in the user's specified currency and region
2. Use current market rates for the specified region
3. Break down EVERY trade with detailed line items including EXACT material quantities, specifications, and unit costs
4. For EACH line item, provide: material name, specification/grade, quantity, unit of measure, material cost, labor cost, equipment cost
5. Include labor, material, equipment, and overhead for each trade
6. Apply regional cost indices and market adjustments
7. Include contingency, escalation, overhead & profit
8. Provide both detailed and summary views
9. Flag assumptions and exclusions clearly
10. Use industry-standard CSI MasterFormat divisions where applicable
11. All numbers must be realistic and defensible
12. Provide a comprehensive MATERIAL SCHEDULE for each trade showing every material, its specification, quantity, and unit
13. When drawings are provided, the "drawingNotes" field MUST list every specific dimension and member size you extracted from the drawings
14. If you cannot read a dimension clearly, state "scaled approximately" and provide your best measurement
15. NEVER use generic/assumed member sizes when actual sizes are visible in the drawings

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
        // Parse JSON from response, handling potential markdown wrapping
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);
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

        // STEP 4: Add the main estimation prompt
        messageContent.push({ type: 'text', text: textPrompt });

        // Call Claude with streaming (required for large vision payloads that take >10 min)
        try {
            const stream = await anthropic.messages.stream({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 32000,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: messageContent }]
            });

            const response = await stream.finalMessage();
            const text = response.content[0].text;
            const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const result = JSON.parse(jsonStr);

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

    // Use text-aware prompt (mark as having "files" if we got any text out)
    const hasUsableContent = hasTextContent || hasImages;
    const textPrompt = buildEstimationTextPrompt(projectInfo, answers, fileNames, hasUsableContent);
    fallbackContent.push({ type: 'text', text: textPrompt });

    const stream = await anthropic.messages.stream({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: fallbackContent }]
    });

    const response = await stream.finalMessage();
    const text = response.content[0].text;
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr);

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

    return `\n\nGenerate a COMPREHENSIVE, WORLD-CLASS construction cost estimate with FULL MATERIAL QUANTITIES AND SPECIFICATIONS for each trade.
${drawingAnalysisInstruction}

PROJECT INFORMATION:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Design Standard: ${projectInfo.designStandard || 'Not specified'}
- Project Type: ${projectInfo.projectType || 'Not specified'}
- Region/Location: ${projectInfo.region || 'Not specified'}
- Files: ${fileNames?.join(', ') || 'N/A'}

QUESTIONNAIRE ANSWERS:
${JSON.stringify(answers, null, 2)}

Produce a COMPLETE detailed cost estimate with FULL MATERIAL SCHEDULES. Respond in this exact JSON format:

{
    "summary": {
        "projectTitle": "string",
        "projectType": "string",
        "location": "string",
        "currency": "string (e.g., USD, INR, AED, GBP)",
        "currencySymbol": "string (e.g., $, ₹, د.إ, £)",
        "totalArea": "string (from drawings or project info)",
        "numberOfFloors": "string",
        "structuralSystem": "string (e.g., Steel Frame, RCC, Pre-Engineered, etc.)",
        "estimateDate": "string (today's date)",
        "confidenceLevel": "string (Low/Medium/High)",
        "estimateClass": "string (Class 1-5 per AACE)",
        "grandTotal": number,
        "costPerUnit": number,
        "unitLabel": "string (per sq ft / per sq m)"
    },
    "drawingExtraction": {
        "dimensionsFound": ["list every specific dimension read from drawings, e.g., 'Building: 120'-0\" x 80'-0\"', 'Bay spacing: 30'-0\" x 40'-0\"'"],
        "memberSizesFound": ["list every member size, e.g., 'W24x68 roof beams', 'W14x48 columns', 'HSS 8x8x1/2 bracing'"],
        "schedulesFound": ["list any schedules read, e.g., 'Beam Schedule: B1=W24x68, B2=W18x50, B3=W16x40'"],
        "materialsNoted": ["list material grades/specs noted, e.g., 'Steel: ASTM A992 Gr50', 'Concrete: 4000 PSI', 'Rebar: Grade 60'"],
        "designLoads": ["list design loads if shown, e.g., 'Roof DL: 20 PSF', 'Floor LL: 50 PSF', 'Wind: 110 MPH'"],
        "scaleUsed": "string (e.g., '1/4\" = 1'-0\"')",
        "sheetsAnalyzed": ["list of drawing sheets analyzed, e.g., 'S1.0 - Foundation Plan', 'S2.0 - Framing Plan'"],
        "totalMembersCount": {
            "beams": number,
            "columns": number,
            "bracing": number,
            "joists": number
        }
    },
    "trades": [
        {
            "division": "string (CSI Division number)",
            "tradeName": "string (e.g., Structural Steel, Concrete, etc.)",
            "tradeIcon": "string (fa icon class)",
            "subtotal": number,
            "percentOfTotal": number,
            "materialSchedule": [
                {
                    "material": "string (e.g., W24x68 Steel Beam - ACTUAL SIZE FROM DRAWING)",
                    "specification": "string (ASTM A992, Grade 60, etc.)",
                    "quantity": number,
                    "unit": "string (tons, cy, lf, sf, ea, etc.)",
                    "unitRate": number,
                    "totalCost": number
                }
            ],
            "lineItems": [
                {
                    "description": "string (detailed work item description)",
                    "quantity": number,
                    "unit": "string (tons, cy, sf, lf, ea, etc.)",
                    "materialCost": number,
                    "laborCost": number,
                    "equipmentCost": number,
                    "unitTotal": number,
                    "lineTotal": number,
                    "materialDetails": "string (specific material specs used for this line item)"
                }
            ]
        }
    ],
    "materialSummary": {
        "totalMaterialCost": number,
        "totalLaborCost": number,
        "totalEquipmentCost": number,
        "keyMaterials": [
            {
                "material": "string",
                "specification": "string",
                "totalQuantity": number,
                "unit": "string",
                "estimatedCost": number,
                "supplier": "string (recommended supplier type)"
            }
        ]
    },
    "structuralAnalysis": {
        "structuralSystem": "string (detailed structural system description)",
        "foundationType": "string",
        "primaryMembers": "string (beam/column sizes - USE ACTUAL FROM DRAWINGS)",
        "secondaryMembers": "string (purlins, girts, bracing - USE ACTUAL FROM DRAWINGS)",
        "connectionTypes": "string (bolted, welded, moment, pinned)",
        "steelTonnage": "string (total estimated steel weight)",
        "concreteVolume": "string (total estimated concrete volume)",
        "rebarTonnage": "string (total estimated rebar weight)",
        "drawingNotes": "string (DETAILED list of all dimensions/specs extracted from drawings)",
        "analysisMethod": "string (VISION_ANALYSIS or INFERENCE_BASED)",
        "filesAnalyzed": ["array of file names that were visually analyzed"]
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
        {
            "tradeName": "string",
            "amount": number,
            "percentage": number,
            "materialCost": number,
            "laborCost": number
        }
    ],
    "assumptions": ["string array of key assumptions made"],
    "exclusions": ["string array of items NOT included"],
    "notes": ["string array of important notes"],
    "marketInsights": {
        "regionalFactor": "string (description of regional pricing adjustments)",
        "materialTrends": "string (current material market trends)",
        "laborMarket": "string (current labor availability/rates)",
        "recommendedProcurement": "string (procurement strategy recommendations)"
    }
}

CRITICAL REQUIREMENTS:
- Include ALL relevant trades for this project type (minimum 8-15 trades)
- Every trade MUST have a "materialSchedule" listing EVERY material with exact specifications, quantities, and unit rates
- Every trade MUST have detailed "lineItems" with material, labor, and equipment costs broken out
- The "drawingExtraction" section MUST be populated with specific data read from the drawings (if drawings were provided)
- The "structuralAnalysis" section MUST reference actual member sizes from drawings, NOT generic assumptions
- Use current ${new Date().getFullYear()} market rates for the specified region
- All numbers must be realistic and consistent
- Grand total must equal sum of all trades + markups
- Include: Site Work, Concrete/Foundations, Structural (Steel/Rebar), Exterior Envelope, Roofing, Interior Finishes, MEP (Mechanical/Electrical/Plumbing), Fire Protection, Elevators (if applicable), Specialties, General Conditions, etc.
- For each material, provide the EXACT specification grade (ASTM, IS, EN standard as applicable)`;
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
