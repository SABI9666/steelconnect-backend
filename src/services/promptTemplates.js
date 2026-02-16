// src/services/promptTemplates.js
// Specialized AI prompt templates for multi-pass construction drawing analysis

/**
 * Pass 1: Sheet Classification Prompt
 * Classifies each sheet/page of a PDF drawing set by type.
 */
export function getSheetClassificationPrompt() {
    return `You are analyzing a set of construction drawings. Classify EACH page/sheet you see.

For each sheet, determine its type from this list:
- STRUCTURAL_PLAN: Framing plans showing beams, columns, bracing layout
- FOUNDATION_PLAN: Foundation layout, footings, piles, grade beams
- ELEVATION: Building elevations (front, side, rear views)
- SECTION: Cross-sections through the building
- DETAIL: Connection details, typical details
- SCHEDULE: Beam schedules, column schedules, material schedules
- GENERAL_NOTES: General structural notes, design criteria, specifications
- ARCHITECTURAL: Architectural plans, floor plans with room layouts
- MEP: Mechanical, electrical, or plumbing drawings
- SITE_PLAN: Site layout, grading, utilities
- COVER_SHEET: Title sheet, drawing index

Respond in this exact JSON format:
{
    "sheetInventory": [
        {
            "pageNumber": 1,
            "sheetType": "COVER_SHEET",
            "sheetName": "Title Sheet / Drawing Index",
            "scale": "N/A",
            "keyInfo": "Brief description of what's on this sheet"
        }
    ],
    "drawingSetSummary": {
        "totalSheets": 0,
        "structuralSheets": 0,
        "foundationSheets": 0,
        "scheduleSheets": 0,
        "projectTitle": "string if visible on cover",
        "designFirm": "string if visible"
    }
}

Examine EVERY page. Be thorough and accurate in classification.`;
}

/**
 * Pass 2a: Structural Plan Extraction Prompt
 */
export function getStructuralExtractionPrompt() {
    return `You are analyzing STRUCTURAL PLAN sheets from construction drawings. Extract ALL structural information.

Focus on these specific items:
1. GRID SYSTEM: Column grid lines (A, B, C... and 1, 2, 3...), spacing between grids
2. BAY SIZES: Typical bay dimensions (e.g., 30'-0" x 40'-0")
3. OVERALL DIMENSIONS: Building footprint length x width
4. BEAMS: Every beam mark (B1, B2, etc.) and its size (W24x68, etc.)
5. COLUMNS: Every column mark (C1, C2, etc.) and its size (W14x48, HSS8x8x1/2, etc.)
6. BRACING: Bracing marks and sizes
7. JOISTS: Joist marks, sizes, spacing
8. MEMBER COUNTS: Count members systematically grid-by-grid
9. CONNECTION TYPES: Moment connections, shear connections, base plates
10. DECK: Metal deck type and gauge

Respond in this exact JSON format:
{
    "gridSystem": {
        "horizontalGrids": ["A", "B", "C"],
        "verticalGrids": ["1", "2", "3"],
        "typicalBayWidth": "30'-0\"",
        "typicalBayDepth": "40'-0\"",
        "totalBays": { "horizontal": 4, "vertical": 3 }
    },
    "overallDimensions": {
        "length": "120'-0\"",
        "width": "80'-0\"",
        "footprintSF": 9600
    },
    "beams": [
        { "mark": "B1", "size": "W24x68", "count": 12, "typicalLength": "30'-0\"", "location": "Roof level, gridlines A-D" }
    ],
    "columns": [
        { "mark": "C1", "size": "W14x48", "count": 20, "typicalHeight": "25'-0\"", "location": "All gridline intersections" }
    ],
    "bracing": [
        { "mark": "BR1", "size": "HSS6x6x3/8", "count": 8, "location": "End bays" }
    ],
    "joists": [
        { "mark": "J1", "size": "24K9", "count": 48, "spacing": "5'-0\" OC", "span": "40'-0\"" }
    ],
    "deck": { "type": "1.5\" 20GA metal deck", "area": "9,600 SF" },
    "connections": ["Moment frames at braced bays", "Shear tabs at typical beams"],
    "notes": "Any additional structural notes observed"
}

Be extremely precise. Count every member visible on the plans.`;
}

/**
 * Pass 2b: Foundation Extraction Prompt
 */
export function getFoundationExtractionPrompt() {
    return `You are analyzing FOUNDATION PLAN sheets from construction drawings. Extract ALL foundation information.

Focus on:
1. FOOTING TYPES: Spread footings, continuous footings, mat foundations
2. FOOTING SIZES: Width x Length x Depth for each footing type
3. PILE/CAISSON INFO: Type, size, depth, capacity if shown
4. GRADE BEAMS: Sizes, lengths, reinforcement
5. SLAB ON GRADE: Thickness, reinforcement (WWF or rebar), vapor barrier
6. SOIL BEARING: Allowable bearing pressure if noted
7. CONCRETE GRADE: Specified concrete strength (f'c)
8. REBAR DETAILS: Bar sizes, spacing in footings and slabs

Respond in this exact JSON format:
{
    "footings": [
        { "mark": "F1", "type": "Spread Footing", "width": "6'-0\"", "length": "6'-0\"", "depth": "2'-0\"", "count": 20, "rebar": "#6 @ 12\" EW" }
    ],
    "gradeBeams": [
        { "mark": "GB1", "width": "18\"", "depth": "24\"", "totalLength": "480 LF", "rebar": "4-#6 top & bottom, #4 stirrups @ 12\"" }
    ],
    "slabOnGrade": {
        "thickness": "6\"",
        "reinforcement": "6x6 W2.9xW2.9 WWF",
        "vaporBarrier": "15 mil poly",
        "area": "9,600 SF",
        "concreteStrength": "4000 PSI"
    },
    "piles": [],
    "soilBearing": "3000 PSF",
    "concreteGrades": { "footings": "4000 PSI", "slab": "4000 PSI", "gradeBeams": "4000 PSI" },
    "excavation": { "estimatedDepth": "4'-0\"", "estimatedVolume": "Calculated from footings" },
    "notes": "Additional foundation notes"
}

Count every footing and calculate total concrete volumes where possible.`;
}

/**
 * Pass 2c: Schedule Extraction Prompt
 */
export function getScheduleExtractionPrompt() {
    return `You are analyzing SCHEDULE sheets from construction drawings. Extract ALL tabular schedule data.

Look for and extract these types of schedules:
1. BEAM SCHEDULE: Mark | Size | Length | Quantity | Weight
2. COLUMN SCHEDULE: Mark | Size | Height | Quantity | Base Plate
3. JOIST SCHEDULE: Mark | Size | Span | Spacing | Quantity
4. FOOTING SCHEDULE: Mark | Size | Depth | Reinforcement | Quantity
5. LINTEL SCHEDULE: Mark | Size | Span | Quantity
6. Any other structural schedules visible

Respond in this exact JSON format:
{
    "beamSchedule": [
        { "mark": "B1", "size": "W24x68", "length": "30'-0\"", "quantity": 12, "weight": "24,480 lbs", "notes": "" }
    ],
    "columnSchedule": [
        { "mark": "C1", "size": "W14x48", "height": "25'-0\"", "quantity": 20, "basePlate": "18\"x18\"x1\"", "notes": "" }
    ],
    "joistSchedule": [
        { "mark": "J1", "size": "24K9", "span": "40'-0\"", "spacing": "5'-0\"", "quantity": 48, "notes": "" }
    ],
    "footingSchedule": [
        { "mark": "F1", "size": "6'-0\"x6'-0\"x2'-0\"", "reinforcement": "#6@12\" EW", "quantity": 20, "notes": "" }
    ],
    "otherSchedules": [],
    "materialNotes": ["ASTM A992 Gr50 for W-shapes", "4000 PSI concrete for all footings"],
    "totalSteelWeight": "Calculated from schedule if shown"
}

Transcribe every row from every schedule exactly as shown in the drawings. Do not skip any entries.`;
}

/**
 * Pass 2d: Elevation/Section Extraction Prompt
 */
export function getElevationSectionPrompt() {
    return `You are analyzing ELEVATION and SECTION sheets from construction drawings. Extract all vertical dimension and construction information.

Focus on:
1. BUILDING HEIGHT: Overall height, eave height, ridge height
2. FLOOR-TO-FLOOR: Height between floors
3. FOUNDATION DEPTH: Depth below grade
4. WALL CONSTRUCTION: CMU, metal panel, curtain wall, brick veneer
5. ROOF PITCH/SLOPE: Roof slope if visible
6. PARAPET HEIGHT: If applicable
7. WINDOW/DOOR OPENINGS: Sizes and quantities visible
8. CLADDING/ENVELOPE: Wall panel types, insulation

Respond in this exact JSON format:
{
    "heights": {
        "overallHeight": "35'-0\"",
        "eaveHeight": "25'-0\"",
        "ridgeHeight": "32'-0\"",
        "floorToFloor": ["15'-0\" (ground)", "12'-0\" (upper)"],
        "foundationDepth": "4'-0\" below grade",
        "parapetHeight": "3'-0\""
    },
    "roofInfo": {
        "type": "Standing seam metal",
        "slope": "1:12",
        "insulation": "R-30",
        "area": "estimated SF"
    },
    "wallConstruction": [
        { "type": "Insulated metal panel", "thickness": "4\"", "rValue": "R-25", "area": "estimated SF" }
    ],
    "openings": {
        "doors": [{ "size": "3'-0\" x 7'-0\"", "type": "HM frame", "quantity": 4 }],
        "windows": [{ "size": "5'-0\" x 4'-0\"", "type": "Aluminum", "quantity": 12 }],
        "overheadDoors": [{ "size": "12'-0\" x 14'-0\"", "type": "Insulated", "quantity": 2 }]
    },
    "notes": "Additional observations from elevations/sections"
}

Extract every dimension and specification visible in the elevations and sections.`;
}

/**
 * Pass 3: Quantity Takeoff Prompt
 * Cross-references extracted data and calculates quantities.
 */
export function getQuantityTakeoffPrompt(extractedData, costDatabaseRates) {
    return `You are a senior quantity surveyor performing a detailed quantity takeoff. You have been given extracted data from construction drawings.

EXTRACTED DATA FROM DRAWINGS:
${JSON.stringify(extractedData, null, 2)}

STEEL WEIGHT REFERENCE (number after 'x' in W-shapes = approximate lb/ft):
W24x68 = 68 lb/ft, W14x48 = 48 lb/ft, W21x44 = 44 lb/ft, W18x35 = 35 lb/ft, W16x26 = 26 lb/ft, W12x19 = 19 lb/ft, W10x12 = 12 lb/ft
HSS: use manufacturer weight tables. Typical HSS6x6x3/8 = 27.5 lb/ft, HSS8x8x1/2 = 48.9 lb/ft

COST DATABASE RATES FOR REFERENCE:
${JSON.stringify(costDatabaseRates, null, 2)}

INSTRUCTIONS:
1. CROSS-REFERENCE plan counts with schedule quantities. If plan shows 12 beams but schedule says 14, use the higher number and note the discrepancy.
2. CALCULATE STEEL TONNAGE for each member type:
   - Formula: Count × Weight/ft × Length ÷ 2000 = tons
   - Show every calculation step
   - Add 10% for connections, plates, misc steel
   - Add 3% for waste
3. CALCULATE CONCRETE VOLUMES:
   - Footings: Count × L × W × D ÷ 27 = CY
   - Slab on grade: Area × Thickness ÷ 12 ÷ 27 = CY
   - Grade beams: W × D × Total Length ÷ 27 = CY
   - Show every calculation
4. ESTIMATE REBAR:
   - Footings: 120 lbs/CY typical
   - Slab: 80 lbs/CY (if WWF, convert to equivalent)
   - Grade beams: 150 lbs/CY typical
5. CALCULATE AREAS:
   - Roof area (may differ from floor area if sloped)
   - Wall area (perimeter × height, minus openings)
   - Floor area

Respond in this exact JSON format:
{
    "steelItems": [
        { "description": "W24x68 Roof Beams", "mark": "B1", "count": 12, "weightPerFt": 68, "length": 30, "totalLbs": 24480, "totalTons": 12.24, "calculation": "12 × 68 lb/ft × 30' = 24,480 lbs = 12.24 tons" }
    ],
    "steelSummary": {
        "mainSteelTons": 0,
        "connectionsTons": 0,
        "miscSteelTons": 0,
        "totalSteelTons": 0
    },
    "concreteItems": [
        { "description": "Spread Footings F1", "count": 20, "dimensions": "6'×6'×2'", "volumePerUnit": 2.67, "totalCY": 53.3, "calculation": "20 × 6×6×2/27 = 53.3 CY" }
    ],
    "concreteSummary": { "totalCY": 0, "concreteGrade": "4000 PSI" },
    "rebarItems": [
        { "description": "Footing rebar", "concreteCY": 53.3, "lbsPerCY": 120, "totalLbs": 6396, "totalTons": 3.2 }
    ],
    "rebarSummary": { "totalTons": 0 },
    "areaItems": [
        { "description": "Roof area", "area": 9600, "unit": "SF" },
        { "description": "Wall area", "area": 5000, "unit": "SF" }
    ],
    "discrepancies": ["Plan shows 12 beams but schedule lists 14 - used 14"],
    "calculationNotes": "Detailed notes on all calculations and assumptions"
}

SHOW ALL CALCULATIONS. Every number must be traceable.`;
}

/**
 * Pass 4: Cost Application Prompt
 * Applies unit rates to the Bill of Quantities.
 */
export function getCostApplicationPrompt(billOfQuantities, unitRates, locationFactor) {
    return `You are applying cost rates to a Bill of Quantities for a construction project.

BILL OF QUANTITIES:
${JSON.stringify(billOfQuantities, null, 2)}

DATABASE UNIT RATES (location-adjusted):
${JSON.stringify(unitRates, null, 2)}

LOCATION FACTOR: ${locationFactor}

INSTRUCTIONS:
1. For EACH item in the BOQ, apply the appropriate unit rate.
2. If a rate exists in the DATABASE RATES above, use it and tag rateSource: "DB"
3. If no database rate exists, estimate a reasonable rate and tag rateSource: "EST"
4. Group items into CSI Division trades (Structural Steel, Concrete, Rebar, etc.)
5. Calculate: lineTotal = quantity × unitRate
6. Calculate trade subtotals, directCosts, markups, grandTotal
7. VERIFY ALL MATH before outputting

Apply these markup percentages to directCosts:
- General Conditions: 6-8%
- Overhead: 5-7%
- Profit: 6-8%
- Contingency: 5-10%
- Escalation: 2-3%

Respond in the standard estimate JSON format with trades[], costBreakdown{}, summary{}, etc.
Include rateSource ("DB" or "EST") on every lineItem.
Include quantitySource (e.g., "From beam schedule" or "Calculated from plan dimensions") on every lineItem.

CRITICAL: lineTotal = quantity × unitRate for EVERY line item. Verify this.`;
}

/**
 * Pass 5: Validation Prompt (used if AI-based validation is needed)
 */
export function getValidationPrompt(estimate, benchmarkRange) {
    return `Review this construction cost estimate for accuracy and reasonableness.

ESTIMATE SUMMARY:
- Grand Total: ${estimate?.summary?.grandTotal}
- Cost per Unit: ${estimate?.summary?.costPerUnit} ${estimate?.summary?.unitLabel}
- Project Type: ${estimate?.summary?.projectType}
- Location: ${estimate?.summary?.location}

BENCHMARK RANGE for this project type:
${benchmarkRange ? `Low: ${benchmarkRange.low}, Mid: ${benchmarkRange.mid}, High: ${benchmarkRange.high} per ${benchmarkRange.unit}` : 'No benchmark available'}

Check for:
1. Any line items with unreasonable unit rates
2. Math errors (lineTotal != quantity × unitRate)
3. Missing critical trades
4. Cost/sqft outside benchmark range
5. Steel PSF outside 3-25 range
6. Markup percentages outside reasonable range

Respond with JSON: { "issues": [{ "severity": "critical|warning|info", "message": "..." }], "overallAssessment": "string" }`;
}

export default {
    getSheetClassificationPrompt,
    getStructuralExtractionPrompt,
    getFoundationExtractionPrompt,
    getScheduleExtractionPrompt,
    getElevationSectionPrompt,
    getQuantityTakeoffPrompt,
    getCostApplicationPrompt,
    getValidationPrompt
};
