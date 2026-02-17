// src/services/promptTemplates.js
// Specialized AI prompt templates for multi-pass construction drawing analysis
// Supports ALL global steel standards (AISC, IS, BS, EN, AS), PEB, and ALL construction trades

/**
 * Pass 1: Sheet Classification Prompt
 * Classifies each sheet/page of a PDF drawing set by type.
 */
export function getSheetClassificationPrompt() {
    return `You are analyzing a set of construction drawings from anywhere in the world. Classify EACH page/sheet you see.

For each sheet, determine its type from this list:
- STRUCTURAL_PLAN: Framing plans showing beams, columns, bracing layout (steel or RCC)
- FOUNDATION_PLAN: Foundation layout, footings, piles, grade beams, pile caps, raft/mat
- ROOF_PLAN: Roof framing, purlin layout, sheeting plan, roof drainage
- FLOOR_PLAN: Floor framing, slab layout, elevated floor plans
- ELEVATION: Building elevations (front, side, rear views), wall cladding details
- SECTION: Cross-sections through the building, wall sections
- DETAIL: Connection details, typical details, reinforcement details
- SCHEDULE: Beam/column/joist/footing/rebar schedules, door/window schedules, finish schedules
- GENERAL_NOTES: General structural/architectural notes, design criteria, specifications, material specs
- ARCHITECTURAL: Architectural plans, floor plans with room layouts, finish plans
- MEP_MECHANICAL: HVAC plans, ductwork layouts, equipment schedules
- MEP_ELECTRICAL: Electrical plans, SLD, lighting layouts, panel schedules
- MEP_PLUMBING: Plumbing plans, drainage, water supply
- MEP_FIRE: Fire protection plans, sprinkler layouts
- SITE_PLAN: Site layout, grading, paving, utilities, landscaping
- PEB_LAYOUT: Pre-engineered building frame layout, purlin/girt arrangement
- COVER_SHEET: Title sheet, drawing index
- BAR_BENDING: Bar bending schedule (BBS), rebar cut/bend details

Recognize drawing standards from ANY country:
- US: AISC, ACI, ASCE standards; Imperial units (ft, in, lbs)
- India: IS standards (IS 800, IS 456, IS 1893); Metric (mm, m, kg, MT)
- UK/Europe: BS EN standards; Metric (mm, m, kg, tonnes)
- Australia: AS standards; Metric
- Middle East: Mixed standards; may use BS, ACI, or local codes

Respond in this exact JSON format:
{
    "sheetInventory": [
        {
            "pageNumber": 1,
            "sheetType": "COVER_SHEET",
            "sheetName": "Title Sheet / Drawing Index",
            "scale": "N/A",
            "designStandard": "AISC/IS/BS EN/AS or mixed",
            "unitSystem": "Imperial/Metric",
            "keyInfo": "Brief description of what's on this sheet"
        }
    ],
    "drawingSetSummary": {
        "totalSheets": 0,
        "structuralSheets": 0,
        "foundationSheets": 0,
        "scheduleSheets": 0,
        "architecturalSheets": 0,
        "mepSheets": 0,
        "siteSheets": 0,
        "projectTitle": "string if visible on cover",
        "designStandard": "primary design code",
        "unitSystem": "Imperial or Metric",
        "structuralSystem": "Steel Frame / RCC / PEB / Composite / Other",
        "designFirm": "string if visible"
    }
}

Examine EVERY page. Be thorough and accurate in classification.`;
}

/**
 * Pass 2a: Structural Plan Extraction Prompt
 * Supports AISC, IS, BS/EN, AS, and PEB sections
 */
export function getStructuralExtractionPrompt() {
    return `You are analyzing STRUCTURAL PLAN sheets from construction drawings. Extract ALL structural information.
Recognize ALL global steel section formats:
- AISC: W24x68, W14x48, HSS8x8x1/2, C15x50, L4x4x1/2, WT shapes
- Indian IS: ISMB450, ISMC300, ISLB400, ISWB600, ISHB350, ISA100x100x10
- European EN: IPE300, HEA200, HEB300, UPN200, SHS150x150x10, RHS200x100x8, CHS168.3x6
- British BS: UB533x210x82, UC305x305x97, PFC230x90, RSA, SHS, RHS, CHS
- Australian AS: UB, UC, PFC, EA, UA, SHS, RHS, CHS (similar to BS)
- PEB: Tapered I-sections, built-up members, Z-purlins (Z200, Z250), C-purlins (C200, C250)
- Cold-formed: C-sections, Z-sections, hat sections

Focus on these specific items:
1. GRID SYSTEM: Column grid lines (A, B, C... and 1, 2, 3...), spacing between grids
2. BAY SIZES: Typical bay dimensions (e.g., 30'-0" x 40'-0" or 9m x 12m)
3. OVERALL DIMENSIONS: Building footprint length x width
4. BEAMS: Every beam mark (B1, B2, MB1, etc.) and its size
5. COLUMNS: Every column mark (C1, C2, etc.) and its size
6. BRACING: Bracing marks and sizes (vertical bracing, horizontal bracing, sag rods)
7. JOISTS/PURLINS: Joist marks, purlin/girt sizes and spacing
8. MEMBER COUNTS: Count members systematically grid-by-grid
9. CONNECTION TYPES: Moment connections, shear connections, base plates, splice joints
10. DECK: Metal deck type and gauge, or concrete slab on deck
11. MEZZANINE: If present, mezzanine framing members and area
12. CRANE BEAMS: If present, crane beam sizes and span

Respond in this exact JSON format:
{
    "gridSystem": {
        "horizontalGrids": ["A", "B", "C"],
        "verticalGrids": ["1", "2", "3"],
        "typicalBayWidth": "30'-0\" or 9000mm",
        "typicalBayDepth": "40'-0\" or 12000mm",
        "totalBays": { "horizontal": 4, "vertical": 3 }
    },
    "overallDimensions": {
        "length": "120'-0\" or 36000mm",
        "width": "80'-0\" or 24000mm",
        "footprintSF": 9600,
        "unitSystem": "Imperial or Metric"
    },
    "beams": [
        { "mark": "B1", "size": "W24x68 or ISMB450 or IPE300", "count": 12, "typicalLength": "30'-0\" or 9000mm", "location": "Roof level, gridlines A-D" }
    ],
    "columns": [
        { "mark": "C1", "size": "W14x48 or ISHB350 or HEB300", "count": 20, "typicalHeight": "25'-0\" or 7500mm", "location": "All gridline intersections" }
    ],
    "bracing": [
        { "mark": "BR1", "size": "HSS6x6x3/8 or ISA100x100x10", "count": 8, "type": "X-brace/V-brace/K-brace", "location": "End bays" }
    ],
    "joists": [
        { "mark": "J1", "size": "24K9 or Z250x2.5", "count": 48, "spacing": "5'-0\" OC or 1500mm", "span": "40'-0\" or 12000mm", "type": "joist/purlin/girt" }
    ],
    "deck": { "type": "1.5\" 20GA metal deck or 0.5mm color coated sheet", "area": "9,600 SF or 900 sqm" },
    "connections": ["Moment frames at braced bays", "Shear tabs at typical beams", "Base plates at columns"],
    "craneSystems": [{ "capacity": "10 ton", "span": "60'-0\"", "beamSize": "W36x135", "quantity": 1 }],
    "materialGrades": {
        "steel": "ASTM A992 Gr50 / IS 2062 E250 / S355 / AS/NZS 3678-350",
        "bolts": "A325 / 8.8 Grade / IS 4000",
        "welding": "E70xx / E7018"
    },
    "notes": "Any additional structural notes observed"
}

Be extremely precise. Count every member visible on the plans.`;
}

/**
 * Pass 2b: Foundation Extraction Prompt
 * Covers all global foundation types including piling, raft, pile caps
 */
export function getFoundationExtractionPrompt() {
    return `You are analyzing FOUNDATION PLAN sheets from construction drawings. Extract ALL foundation information.
Recognize global standards: ACI 318 (USA), IS 456 (India), BS EN 1992 (Europe), AS 3600 (Australia).

Focus on:
1. FOOTING TYPES: Spread/isolated footings, combined footings, strip/continuous footings, mat/raft foundation
2. FOOTING SIZES: Width x Length x Depth for each footing type (Imperial or Metric)
3. PILE/CAISSON INFO: Type (driven, bored, CFA, micro), diameter, depth, capacity, quantity
4. PILE CAPS: Sizes, number of piles per cap, reinforcement
5. GRADE BEAMS: Sizes (width x depth), lengths, reinforcement schedule
6. SLAB ON GRADE: Thickness, reinforcement (WWF/welded mesh or rebar), vapor barrier, joints
7. RETAINING WALLS: Height, thickness, reinforcement, drainage
8. SOIL BEARING: Allowable bearing pressure if noted
9. CONCRETE GRADES: Specified strength — f'c (PSI), M-grade (India), C-grade (UK/Euro)
10. REBAR DETAILS: Bar sizes (#3-#11 USA, 8mm-32mm metric, T8-T32 UK), spacing, laps
11. EXCAVATION: Depth, extent, soil type if noted
12. WATERPROOFING: Below-grade waterproofing specifications

Respond in this exact JSON format:
{
    "footings": [
        { "mark": "F1", "type": "Spread Footing", "width": "6'-0\" or 1800mm", "length": "6'-0\" or 1800mm", "depth": "2'-0\" or 600mm", "count": 20, "rebar": "#6 @ 12\" EW or T16 @ 300 EW", "concreteGrade": "4000 PSI or M30" }
    ],
    "pileCaps": [
        { "mark": "PC1", "dimensions": "4'x4'x3' or 1200x1200x900mm", "pileCount": 4, "count": 0, "rebar": "" }
    ],
    "piles": [
        { "type": "Bored Cast-in-situ", "diameter": "600mm or 24\"", "depth": "15m or 50'-0\"", "capacity": "50 ton", "count": 0 }
    ],
    "gradeBeams": [
        { "mark": "GB1", "width": "18\" or 450mm", "depth": "24\" or 600mm", "totalLength": "480 LF or 150m", "rebar": "4-#6 top & bottom or 4-T16 top & bottom", "stirrups": "#4 @ 12\" or T10 @ 300" }
    ],
    "slabOnGrade": {
        "thickness": "6\" or 150mm",
        "reinforcement": "6x6 W2.9xW2.9 WWF or T10 @ 200 BW",
        "vaporBarrier": "15 mil poly or 300mu polythene",
        "area": "9,600 SF or 900 sqm",
        "concreteStrength": "4000 PSI or M25",
        "joints": "Control joints @ 15'-0\" or 4.5m grid"
    },
    "retainingWalls": [
        { "height": "8'-0\" or 2.4m", "thickness": "12\" or 300mm", "length": "100 LF or 30m", "rebar": "#5 @ 12\" EF or T12 @ 300 EF" }
    ],
    "soilBearing": "3000 PSF or 150 kN/sqm",
    "concreteGrades": { "footings": "4000 PSI or M30", "slab": "4000 PSI or M25", "gradeBeams": "4000 PSI or M30", "piles": "5000 PSI or M35" },
    "excavation": { "estimatedDepth": "4'-0\" or 1.2m", "soilType": "if noted" },
    "waterproofing": { "type": "Membrane system", "area": "" },
    "notes": "Additional foundation notes"
}

Count every footing and calculate total concrete volumes where possible.`;
}

/**
 * Pass 2c: Schedule Extraction Prompt
 * Supports global schedule formats including BBS
 */
export function getScheduleExtractionPrompt() {
    return `You are analyzing SCHEDULE sheets from construction drawings. Extract ALL tabular schedule data.
Recognize schedules in any standard format (US, Indian IS, British BS, European EN).

Look for and extract these types of schedules:
1. BEAM SCHEDULE: Mark | Size | Length | Quantity | Weight
2. COLUMN SCHEDULE: Mark | Size | Height | Quantity | Base Plate
3. JOIST/PURLIN SCHEDULE: Mark | Size | Span | Spacing | Quantity
4. FOOTING SCHEDULE: Mark | Size | Depth | Reinforcement | Quantity
5. LINTEL SCHEDULE: Mark | Size | Span | Quantity
6. REBAR/BAR BENDING SCHEDULE (BBS): Mark | Bar Size | Shape | Length | Quantity | Weight
7. DOOR SCHEDULE: Mark | Size | Type | Hardware | Quantity
8. WINDOW SCHEDULE: Mark | Size | Type | Glazing | Quantity
9. FINISH SCHEDULE: Room | Floor | Wall | Ceiling finishes
10. EQUIPMENT SCHEDULE: HVAC units, electrical panels, plumbing fixtures
11. Any other structural, architectural, or MEP schedules visible

Steel section standards in schedules:
- US: W24x68, HSS8x8x1/2, C15x50, L4x4x1/2, WT12x34
- India: ISMB450, ISMC300, ISLB400, ISA100x100x10
- Europe: IPE300, HEA200, HEB300, UPN200
- UK: UB533x210x82, UC305x305x97
- PEB: Built-up sections (e.g., 400x200x6x10 TW)

Respond in this exact JSON format:
{
    "beamSchedule": [
        { "mark": "B1", "size": "W24x68 or ISMB450", "length": "30'-0\" or 9000mm", "quantity": 12, "weight": "24,480 lbs or 11.1 MT", "grade": "A992 or E250", "notes": "" }
    ],
    "columnSchedule": [
        { "mark": "C1", "size": "W14x48 or ISHB350", "height": "25'-0\" or 7500mm", "quantity": 20, "basePlate": "18\"x18\"x1\" or 450x450x25mm", "grade": "", "notes": "" }
    ],
    "joistSchedule": [
        { "mark": "J1", "size": "24K9 or Z250x2.5", "span": "40'-0\" or 12000mm", "spacing": "5'-0\" or 1500mm", "quantity": 48, "notes": "" }
    ],
    "footingSchedule": [
        { "mark": "F1", "size": "6'-0\"x6'-0\"x2'-0\" or 1800x1800x600mm", "reinforcement": "#6@12\" EW or T16@300 EW", "quantity": 20, "concreteGrade": "4000 PSI or M30", "notes": "" }
    ],
    "barBendingSchedule": [
        { "member": "Footing F1", "barMark": "a", "barSize": "#5 or T16", "shape": "Straight", "cutLength": "5'-6\" or 1700mm", "quantity": 240, "totalWeight": "1200 lbs or 544 kg", "notes": "" }
    ],
    "doorSchedule": [
        { "mark": "D1", "size": "3'-0\"x7'-0\" or 900x2100mm", "type": "HM/Wood/Aluminum", "quantity": 0, "notes": "" }
    ],
    "windowSchedule": [
        { "mark": "W1", "size": "5'-0\"x4'-0\" or 1500x1200mm", "type": "Aluminum/UPVC", "glazing": "6mm clear/DGU", "quantity": 0, "notes": "" }
    ],
    "finishSchedule": [
        { "room": "Office", "floor": "VCT/Epoxy/Tile", "wall": "Paint/Tile", "ceiling": "ACT/Gypsum", "area": "500 SF or 46 sqm" }
    ],
    "otherSchedules": [],
    "materialNotes": ["ASTM A992 Gr50 / IS 2062 E250 / S355 for steel", "4000 PSI / M30 concrete for all footings"],
    "totalSteelWeight": "Calculated from schedule if shown"
}

Transcribe every row from every schedule exactly as shown in the drawings. Do not skip any entries.`;
}

/**
 * Pass 2d: Elevation/Section Extraction Prompt
 * Covers all cladding, envelope, and architectural details globally
 */
export function getElevationSectionPrompt() {
    return `You are analyzing ELEVATION and SECTION sheets from construction drawings. Extract all vertical dimension and construction information.

Focus on:
1. BUILDING HEIGHT: Overall height, eave height, ridge height, parapet height
2. FLOOR-TO-FLOOR: Height between floors for each level
3. FOUNDATION DEPTH: Depth below grade, basement depth
4. WALL CONSTRUCTION: CMU, metal panel, curtain wall, brick veneer, precast, EIFS, stone
5. ROOF TYPE: Metal standing seam, built-up, single-ply, clay/concrete tile, slate
6. ROOF PITCH/SLOPE: Slope or pitch ratio
7. INSULATION: Roof insulation (R-value/thickness), wall insulation
8. CLADDING/ENVELOPE: Wall panel types (PUF, PIR, rockwool), thickness, manufacturer
9. WINDOW/DOOR OPENINGS: Sizes, types, quantities visible in each elevation
10. OVERHEAD/ROLLING DOORS: Sizes, types (insulated, fire-rated)
11. LOUVERS/VENTS: Sizes, types, locations
12. WATERPROOFING: Below-grade membrane, above-grade sealants
13. EXPANSION JOINTS: Locations and details
14. FIRE RATING: Wall/floor assembly fire ratings if noted

Respond in this exact JSON format:
{
    "heights": {
        "overallHeight": "35'-0\" or 10.5m",
        "eaveHeight": "25'-0\" or 7.5m",
        "ridgeHeight": "32'-0\" or 9.6m",
        "floorToFloor": ["15'-0\" ground or 4.5m", "12'-0\" upper or 3.6m"],
        "foundationDepth": "4'-0\" below grade or 1.2m",
        "parapetHeight": "3'-0\" or 900mm",
        "basementDepth": "0 or N/A"
    },
    "roofInfo": {
        "type": "Standing seam metal / Built-up / Single-ply TPO / Metal sheeting",
        "slope": "1:12 or 5 degrees",
        "insulation": "R-30 or 100mm PUF/PIR/Rockwool",
        "area": "estimated SF or sqm",
        "material": "26GA Galvalume / 0.5mm color coated / etc."
    },
    "wallConstruction": [
        { "type": "Insulated metal panel / CMU / Curtain wall / Brick", "thickness": "4\" or 100mm", "rValue": "R-25", "area": "estimated SF or sqm", "specification": "50mm PUF sandwich panel / 8\" CMU / etc." }
    ],
    "openings": {
        "doors": [{ "size": "3'-0\" x 7'-0\" or 900x2100mm", "type": "HM frame / Wood / Aluminum", "quantity": 4 }],
        "windows": [{ "size": "5'-0\" x 4'-0\" or 1500x1200mm", "type": "Aluminum / UPVC", "glazing": "6mm / DGU", "quantity": 12 }],
        "overheadDoors": [{ "size": "12'-0\" x 14'-0\" or 3.6x4.2m", "type": "Insulated / Non-insulated / Fire-rated", "quantity": 2 }],
        "louvers": [{ "size": "4'-0\" x 3'-0\" or 1200x900mm", "type": "Aluminum fixed blade", "quantity": 0 }]
    },
    "fireRating": { "walls": "", "floors": "", "roof": "" },
    "waterproofing": { "belowGrade": "", "aboveGrade": "", "roofMembrane": "" },
    "notes": "Additional observations from elevations/sections"
}

Extract every dimension and specification visible in the elevations and sections.`;
}

/**
 * Pass 3: Quantity Takeoff Prompt
 * Cross-references extracted data and calculates quantities.
 * Supports metric and imperial, all global section standards.
 */
export function getQuantityTakeoffPrompt(extractedData, costDatabaseRates) {
    const dataSection = extractedData != null ? `
EXTRACTED DATA FROM DRAWINGS:
${JSON.stringify(extractedData, null, 2)}
` : '';

    const ratesSection = costDatabaseRates != null ? `
COST DATABASE RATES FOR REFERENCE:
${JSON.stringify(costDatabaseRates, null, 2)}
` : '';

    return `You are a senior quantity surveyor performing a detailed quantity takeoff for a GLOBAL construction project. You have been given extracted data from construction drawings.
${dataSection}
STEEL WEIGHT REFERENCE (use the correct formula based on the unit system):
IMPERIAL (lb/ft): W24x68=68, W21x44=44, W18x35=35, W16x26=26, W14x48=48, W12x19=19, W10x12=12
  HSS: HSS6x6x3/8=27.5, HSS8x8x1/2=48.9, HSS4x4x1/4=12.2
  Formula: count × weight_lb_per_ft × length_ft ÷ 2000 = US tons

METRIC (kg/m) - Indian IS: ISMB200=25.4, ISMB250=37.3, ISMB300=44.2, ISMB350=52.4, ISMB400=61.6, ISMB450=72.4, ISMB500=86.9, ISMB600=122.6
  ISMC: ISMC75=6.8, ISMC100=9.2, ISMC150=16.4, ISMC200=22.1, ISMC250=30.4, ISMC300=36.3
  Formula: count × weight_kg_per_m × length_m ÷ 1000 = metric tons (MT)

METRIC (kg/m) - European EN: IPE200=22.4, IPE300=42.2, IPE400=66.3, IPE500=90.7
  HEA200=53.8, HEA300=106, HEB200=78.1, HEB300=149
  Formula: count × weight_kg_per_m × length_m ÷ 1000 = metric tonnes

PEB SECTIONS: Primary frames typically 2-5 kg/sqm, purlins/girts Z250=5.5kg/m, C250=6.2kg/m
  Formula: count × weight_kg_per_m × span_m ÷ 1000 = MT
${ratesSection}
INSTRUCTIONS:
1. CROSS-REFERENCE plan counts with schedule quantities. If plan shows 12 beams but schedule says 14, use the higher number and note the discrepancy.
2. CALCULATE STEEL TONNAGE for each member type:
   - Use the correct formula for Imperial or Metric sections
   - Show every calculation step clearly
   - Add 10% for connections, plates, misc steel
   - Add 3% for waste/cutting
3. CALCULATE CONCRETE VOLUMES:
   - Footings: Count × L × W × D ÷ 27 = CY (Imperial) or Count × L × W × D = m³ (Metric)
   - Slab on grade: Area × Thickness ÷ 12 ÷ 27 = CY or Area × Thickness = m³
   - Grade beams: W × D × Total Length ÷ 27 = CY or W × D × TotalLength = m³
   - Pile caps, retaining walls, elevated slabs — calculate each
   - Show every calculation
4. ESTIMATE REBAR by element type (lbs/CY or kg/m³):
   - Footings: 120 lbs/CY (72 kg/m³)
   - Slab on grade: 80 lbs/CY (48 kg/m³)
   - Grade beams: 150 lbs/CY (90 kg/m³)
   - Columns: 200 lbs/CY (120 kg/m³)
   - Retaining walls: 180 lbs/CY (108 kg/m³)
   - Elevated slabs: 100 lbs/CY (60 kg/m³)
   - Pile caps: 160 lbs/CY (96 kg/m³)
5. CALCULATE AREAS:
   - Roof area (may differ from floor area if sloped)
   - Wall cladding area (perimeter × height, minus openings)
   - Floor area per level
   - Ceiling area, painting area
6. COUNT ITEMS from schedules:
   - Doors, windows by type and size
   - MEP fixtures and equipment
   - Miscellaneous items

Respond in this exact JSON format:
{
    "unitSystem": "Imperial or Metric",
    "steelItems": [
        { "description": "W24x68 Roof Beams", "mark": "B1", "count": 12, "weightPerUnit": 68, "weightUnit": "lb/ft or kg/m", "length": 30, "lengthUnit": "ft or m", "totalWeight": 24480, "totalWeightUnit": "lbs or kg", "totalTons": 12.24, "tonUnit": "US tons or MT", "calculation": "12 × 68 lb/ft × 30' = 24,480 lbs = 12.24 tons" }
    ],
    "steelSummary": {
        "mainSteelTons": 0,
        "connectionsTons": 0,
        "miscSteelTons": 0,
        "totalSteelTons": 0,
        "tonUnit": "US tons or MT"
    },
    "concreteItems": [
        { "description": "Spread Footings F1", "count": 20, "dimensions": "6'×6'×2' or 1.8m×1.8m×0.6m", "volumePerUnit": 2.67, "volumeUnit": "CY or m³", "totalVolume": 53.3, "concreteGrade": "4000 PSI or M30", "calculation": "20 × 6×6×2/27 = 53.3 CY" }
    ],
    "concreteSummary": { "totalVolume": 0, "volumeUnit": "CY or m³", "concreteGrade": "4000 PSI or M30" },
    "rebarItems": [
        { "description": "Footing rebar", "element": "Footing", "concreteVolume": 53.3, "volumeUnit": "CY or m³", "intensityRate": 120, "intensityUnit": "lbs/CY or kg/m³", "totalWeight": 6396, "weightUnit": "lbs or kg", "totalTons": 3.2, "tonUnit": "US tons or MT" }
    ],
    "rebarSummary": { "totalTons": 0, "tonUnit": "US tons or MT", "rebarGrade": "ASTM A615 Gr60 or Fe500D or B500B" },
    "areaItems": [
        { "description": "Roof area", "area": 9600, "unit": "SF or sqm" },
        { "description": "Wall cladding area", "area": 5000, "unit": "SF or sqm" },
        { "description": "Floor area", "area": 9600, "unit": "SF or sqm" }
    ],
    "countItems": [
        { "description": "HM Doors 3'x7'", "quantity": 12, "unit": "EA", "source": "Door schedule" },
        { "description": "Aluminum Windows 5'x4'", "quantity": 8, "unit": "EA", "source": "Window schedule" }
    ],
    "pebItems": [
        { "description": "Primary Frames", "totalWeight": 0, "weightUnit": "MT", "calculation": "" }
    ],
    "discrepancies": ["Plan shows 12 beams but schedule lists 14 - used 14"],
    "calculationNotes": "Detailed notes on all calculations and assumptions"
}

SHOW ALL CALCULATIONS. Every number must be traceable.`;
}

/**
 * Pass 4: Cost Application Prompt
 * Applies unit rates to the Bill of Quantities.
 * Supports ALL global currencies, all construction trades, PEB.
 */
export function getCostApplicationPrompt(billOfQuantities, unitRates, locationFactor) {
    const boqSection = billOfQuantities != null ? `
BILL OF QUANTITIES:
${JSON.stringify(billOfQuantities, null, 2)}
` : '';

    const ratesSection = unitRates != null ? `
DATABASE UNIT RATES (location-adjusted):
${JSON.stringify(unitRates, null, 2)}
` : '';

    const locationSection = locationFactor != null ? `
LOCATION FACTOR: ${locationFactor}
` : '';

    return `You are applying cost rates to a Bill of Quantities for a construction project anywhere in the world.
${boqSection}${ratesSection}${locationSection}
INSTRUCTIONS:
1. For EACH item in the BOQ, apply the appropriate unit rate.
2. If a rate exists in the DATABASE RATES above, use it and tag rateSource: "DB"
3. If no database rate exists, estimate a reasonable ${new Date().getFullYear()} market rate and tag rateSource: "EST"
4. Group items into CSI Division trades. Include ALL relevant trades:
   - Division 02: Sitework (earthwork, grading, paving, utilities, landscaping, fencing)
   - Division 03: Concrete (footings, slabs, grade beams, walls, pile caps, elevated slabs)
   - Division 04: Masonry (CMU, brick, stone)
   - Division 05: Structural Steel (beams, columns, bracing, connections, deck, bolts, misc steel)
   - Division 06: Wood/Plastics (if applicable)
   - Division 07: Thermal & Moisture (roofing, insulation, cladding, waterproofing, sealants, fireproofing)
   - Division 08: Doors & Windows (HM doors, wood doors, overhead doors, aluminum windows, storefronts, glazing)
   - Division 09: Finishes (flooring, painting, ceiling, drywall/partitions, tile)
   - Division 10: Specialties (toilet accessories, signage, fire extinguishers, lockers)
   - Division 13: Special Construction (PEB, clean rooms, cold storage, crane systems)
   - Division 14: Conveying (elevators, escalators, material handling)
   - Division 15: Mechanical (HVAC, plumbing, fire protection)
   - Division 16: Electrical (power, lighting, low voltage, fire alarm, generator, BMS)
   - Division 31: Earthwork (if separate from sitework)
   - Rebar/Reinforcing (may be separate trade or under Concrete)
   - Temporary Works (scaffolding, shoring, safety, temporary power)
5. Calculate: lineTotal = quantity × unitRate
6. Calculate trade subtotals, directCosts, markups, grandTotal
7. VERIFY ALL MATH before outputting

Apply these markup percentages to directCosts:
- General Conditions: 6-8%
- Overhead: 5-7%
- Profit: 6-8%
- Contingency: 5-10%
- Escalation: 2-3%

MATERIAL SCHEDULE: Include a complete "materialSchedule" with ALL project materials grouped by type.
Each item must have: quantity, unit, totalCost (installed all-in cost).
Do NOT include materialCost, laborHours, laborRate, laborCost, equipmentCost, manpowerSummary, boqMarkups, crewBreakdown — these are computed by the post-processor.

Required materialSchedule sections:
- steelMembers: [{mark, type, section, grade, count, lengthFt/lengthM, weightPerUnit, totalWeight, totalCost, location, calculation}]
- steelSummary: {mainSteelTons, connectionMiscTons, totalSteelTons, steelPSF, weightUnit}
- concreteItems: [{element, type, dimensions, count, volumeEach, totalVolume, concreteGrade, rebarIntensity, rebarTotal, totalCost, calculation}]
- concreteSummary: {totalVolume, totalRebarTons, volumeUnit}
- rebarItems: [{element, barSize, quantity, unit, rebarGrade, totalCost}]
- rebarSummary: {totalRebarTons, rebarBySize, rebarGrade}
- pebItems: (if applicable) [{item, specification, quantity, unit, totalCost}]
- mepItems: [{category, item, specification, quantity, unit, totalCost, notes}]
- mepSummary: {totalPlumbingCost, totalHVACCost, totalElectricalCost, totalFireProtectionCost, totalElevatorCost, totalBMSCost, totalMEPCost}
- architecturalItems: [{category, item, specification, quantity, unit, totalCost, notes}]
- architecturalSummary: {totals per sub-trade, totalArchitecturalCost}
- roofingItems: [{item, specification, quantity, unit, totalCost}]
- claddingItems: [{item, specification, quantity, unit, totalCost}]
- siteworkItems: [{item, specification, quantity, unit, totalCost}]
- connectionItems: [{item, specification, quantity, unit, totalCost}]
- otherMaterials: [{material, specification, quantity, unit, totalCost}]
- safetyTemporary: [{item, specification, quantity, unit, totalCost}]
- grandTotalMaterialCost: number

Quantities must be PROCUREMENT-READY. Anyone should be able to purchase materials from this BOQ.

Respond in the standard estimate JSON format with trades[], costBreakdown{}, summary{}, materialSchedule{}, etc.
Include rateSource ("DB" or "EST") on every lineItem.
Include quantitySource (e.g., "From beam schedule" or "Calculated from plan dimensions") on every lineItem.

CRITICAL: lineTotal = quantity × unitRate for EVERY line item. Verify this.`;
}

/**
 * Pass 5: Validation Prompt (used if AI-based validation is needed)
 * Enhanced with global benchmark awareness.
 */
export function getValidationPrompt(estimate, benchmarkRange) {
    const summarySection = estimate ? `
ESTIMATE SUMMARY:
- Grand Total: ${estimate?.summary?.grandTotal}
- Cost per Unit: ${estimate?.summary?.costPerUnit} ${estimate?.summary?.unitLabel}
- Project Type: ${estimate?.summary?.projectType}
- Location: ${estimate?.summary?.location}
- Currency: ${estimate?.summary?.currency}
- Number of Trades: ${estimate?.trades?.length || 0}
- Steel Tonnage: ${estimate?.materialSchedule?.steelSummary?.totalSteelTons || 'N/A'}
- Concrete Volume: ${estimate?.materialSchedule?.concreteSummary?.totalConcreteCY || estimate?.materialSchedule?.concreteSummary?.totalVolume || 'N/A'}
` : '';

    const benchmarkSection = benchmarkRange
        ? `BENCHMARK RANGE for this project type:\nLow: ${benchmarkRange.low}, Mid: ${benchmarkRange.mid}, High: ${benchmarkRange.high} per ${benchmarkRange.unit}`
        : 'No benchmark available';

    return `Review this construction cost estimate for accuracy and reasonableness.
${summarySection}
${benchmarkSection}

Check for:
1. Any line items with unreasonable unit rates (compare against regional norms)
2. Math errors (lineTotal != quantity × unitRate)
3. Missing critical trades for the project type
4. Cost/sqft or cost/sqm outside benchmark range
5. Steel intensity outside normal range (5-15 psf for steel buildings, 2-5 kg/sqm for PEB)
6. Concrete volume reasonableness (check against building footprint)
7. Rebar intensity per element type (80-200 lbs/CY depending on element)
8. Markup percentages outside reasonable range (total 20-35% of direct costs)
9. MEP cost as percentage of total (typically 25-40% for commercial, 15-25% for industrial)
10. Trade completeness (all required trades present for the building type)

Respond with JSON: { "issues": [{ "severity": "critical|warning|info", "trade": "trade name if applicable", "message": "..." }], "missingTrades": ["list of trades that should be included but are missing"], "overallAssessment": "string" }`;
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
