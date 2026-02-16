// src/services/pdfMeasurementExtractor.js
// Intelligent PDF Measurement & Data Extraction for Construction Drawings
// Extracts dimensions, member sizes, scales, schedules, and structural data
// from PDF text layers before sending to AI for vision-based analysis.

/**
 * REGEX PATTERNS for construction drawing data extraction
 */
const PATTERNS = {
    // Imperial dimensions: 30'-0", 12'-6", 120'-0" x 80'-0", 6", 3'-0"
    imperialDimension: /\b(\d{1,4})\s*['′]\s*[-–]?\s*(\d{1,2})\s*(?:["″]|'')\b/g,
    // Metric dimensions: 9144mm, 3.5m, 1200 mm, 0.5 m
    metricDimension: /\b(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi,
    // Feet/inches combined: 30 ft, 120 feet, 6 in, 12 inches
    feetInches: /\b(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|in|inch|inches)\b/gi,
    // Grid dimensions: 30' x 40', 120'-0" x 80'-0"
    gridSpacing: /(\d{1,4})\s*['′]\s*[-–]?\s*(\d{0,2})\s*(?:["″]|'')?[\s]*[x×X][\s]*(\d{1,4})\s*['′]\s*[-–]?\s*(\d{0,2})\s*(?:["″]|'')?/g,
    // @ spacing: #5@12", #4@8" EW, bars @ 150mm
    barSpacing: /#(\d+)\s*@\s*(\d+)\s*(?:["″]|''|mm|cm)?(?:\s*(?:EW|EF|BW|OC))?/gi,

    // Steel member sizes
    wShape: /\bW\s*(\d{1,3})\s*[x×X]\s*(\d{1,4}(?:\.\d+)?)\b/gi,
    hss: /\bHSS\s*(\d{1,3}(?:\.\d+)?)\s*[x×X]\s*(\d{1,3}(?:\.\d+)?)\s*(?:[x×X]\s*(\d{1,3}(?:\/\d+|\.\d+)?))?/gi,
    cChannel: /\bC\s*(\d{1,3})\s*[x×X]\s*(\d{1,4}(?:\.\d+)?)\b/gi,
    lAngle: /\bL\s*(\d{1,3}(?:\.\d+)?)\s*[x×X]\s*(\d{1,3}(?:\.\d+)?)\s*(?:[x×X]\s*(\d{1,3}(?:\/\d+|\.\d+)?))?/gi,
    pipe: /\bPIPE\s*(\d{1,3}(?:\.\d+)?)\s*(?:STD|XS|XXS|SCH\s*\d+)?/gi,
    plate: /\bPL?\s*(\d{1,3}(?:\/\d+|\.\d+)?)\s*["″]?\s*[x×X]\s*(\d{1,4})\s*["″]?\s*(?:[x×X]\s*(\d{1,4})\s*["″]?)?/gi,
    // Indian steel sections: ISMB, ISMC, ISLB, ISWB
    indianSection: /\b(ISMB|ISMC|ISLB|ISWB|ISA|ISHT)\s*(\d{2,4})\b/gi,
    // European sections: HEA, HEB, IPE, UPN
    euroSection: /\b(HEA|HEB|HEM|IPE|UPN|UPE)\s*(\d{2,4})\b/gi,

    // Rebar: #5, #8, 16mm dia, 20mm bars, Grade 60
    rebarSize: /\b(?:#(\d{1,2})|\b(\d{1,2})\s*mm\s*(?:dia(?:meter)?|bar|rebar|rod))\b/gi,
    rebarGrade: /\b(?:Grade|Gr\.?|Fe)\s*(\d{2,4})\b/gi,

    // Concrete: 4000 PSI, M25, M30, C30/37, f'c = 4000
    concretePsi: /\b(?:f['']?c\s*=?\s*)?(\d{3,5})\s*PSI\b/gi,
    concreteGrade: /\b(?:M|C)\s*(\d{2,3})(?:\s*\/\s*(\d{2,3}))?\b/g,

    // Material specs: ASTM A992, A36, A500 Gr B, A615, IS 2062
    astmSpec: /\bASTM\s*(A\d{2,4})\s*(?:Gr(?:ade)?\.?\s*([A-C\d]+))?\b/gi,
    isSpec: /\bIS\s*(\d{3,5})\b/gi,
    enSpec: /\bEN\s*(\d{4,5})\b/gi,
    materialGrade: /\b(?:Gr(?:ade)?\.?\s*)([A-C]?\d{1,3}[A-C]?)\b/gi,

    // Scale: 1/4" = 1'-0", 1:100, Scale: 1/8" = 1'-0"
    scaleImperial: /(?:SCALE|Sc\.?)\s*:?\s*(\d\/\d+)\s*["″]\s*=\s*1\s*['′]\s*[-–]?\s*0\s*["″]/gi,
    scaleMetric: /(?:SCALE|Sc\.?)\s*:?\s*1\s*:\s*(\d{1,4})/gi,

    // Design loads: DL = 20 PSF, LL = 50 PSF, Wind = 110 MPH
    loadPsf: /\b(D\.?L\.?|L\.?L\.?|DEAD\s*LOAD|LIVE\s*LOAD|ROOF\s*(?:D\.?L\.?|L\.?L\.?)|SNOW\s*LOAD|WIND|SEISMIC)\s*[=:]\s*(\d+(?:\.\d+)?)\s*(PSF|KPA|KN\/M2|LB\/FT2)/gi,
    windSpeed: /\b(?:WIND\s*SPEED|BASIC\s*WIND|V\s*=)\s*[=:]\s*(\d+)\s*(MPH|M\/S|KPH)/gi,
    seismicZone: /\b(?:SEISMIC\s*(?:ZONE|CATEGORY)|SDC)\s*[=:]\s*([A-F]|\d|IV|III|II|I)\b/gi,

    // Areas: 50,000 SF, 4,645 SQ M, 120' x 80' = 9,600 SF
    area: /\b([\d,]+(?:\.\d+)?)\s*(SF|SQ\s*FT|SQ\s*M|M2|FT2|SQUARE\s*(?:FEET|METERS?))\b/gi,
    // Heights: Eave height 25', ridge height 30', floor to floor 12'-0"
    height: /\b(?:EAVE|RIDGE|FLOOR[\s-]*TO[\s-]*FLOOR|STORY|CLEAR|CEILING)\s*(?:HEIGHT|HT\.?|H)\s*[=:]\s*(\d+)\s*['′]\s*[-–]?\s*(\d{0,2})\s*(?:["″]|'')?/gi,

    // Drawing sheet references: S1.0, S2.1, A1.0, M1.0
    sheetRef: /\b([SAMEPC])\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})\b/g,
    // Drawing titles in caps
    drawingTitle: /(?:^|\n)\s*([A-Z][A-Z\s&\-]{5,60}(?:PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|NOTES|FRAMING|FOUNDATION|LAYOUT|VIEW))\s*(?:\n|$)/gm,

    // Beam/Column schedule markers
    scheduleHeader: /\b(BEAM\s*SCHEDULE|COLUMN\s*SCHEDULE|REBAR\s*SCHEDULE|MEMBER\s*SCHEDULE|JOIST\s*SCHEDULE|FOOTING\s*SCHEDULE|PILE\s*SCHEDULE|SLAB\s*SCHEDULE)\b/gi,
    // Schedule entries like: B1 = W24x68, C1 = W14x48
    scheduleEntry: /\b([BCJ]\d{1,3})\s*[=:\-–]\s*(W|HSS|C|L|ISMB|ISMC|IPE|HEA)\s*(\d{1,3})\s*[x×X]\s*(\d{1,4}(?:\.\d+)?)/gi,

    // Bolt/connection info
    boltSpec: /\b(\d\/\d+|\d{1,2})\s*["″]?\s*(?:DIA\.?\s*)?(?:A325|A490|ASTM\s*A\d+)\s*(?:[-–]\s*[NX])?\s*(?:BOLT|HTB)/gi,
    weldSpec: /\b(\d\/\d+|\d{1,2})\s*["″]?\s*(?:FILLET|CJP|PJP)\s*(?:WELD)?\b/gi,

    // Roof/wall specs
    deckSpec: /\b(\d+(?:\.\d+)?)\s*["″]?\s*(?:METAL\s*)?DECK\b/gi,
    insulationSpec: /\bR[-–]?\s*(\d{1,3})\s*(?:INSULATION|INSUL\.?)\b/gi,
    roofingSpec: /\b(?:STANDING\s*SEAM|BUILT[-–]?UP|TPO|EPDM|PVC|METAL\s*ROOF)\b/gi,
    claddingSpec: /\b(?:SANDWICH\s*PANEL|INSULATED\s*PANEL|METAL\s*CLADDING|PROFILE\s*SHEET|COLOR\s*COATED)\b/gi,

    // Quantity indicators: 24 EA, 12 NOS, QTY: 48
    quantity: /\b(?:QTY\.?|QUANTITY|NOS\.?|EA\.?|PCS\.?|PIECES?|NUMBERS?)\s*[=:]\s*(\d+)\b/gi,
    // Weight indicators: 45 TONS, 2500 KG
    weight: /\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(TONS?|TONNES?|KG|LBS?|KIPS?)\b/gi
};

/**
 * Extract all dimensions from text using regex patterns.
 * Returns structured measurement data.
 */
function extractDimensions(text) {
    const dimensions = {
        imperial: [],
        metric: [],
        gridSpacings: [],
        areas: [],
        heights: []
    };

    // Imperial dimensions
    let match;
    const imperialSet = new Set();
    const imperialRegex = new RegExp(PATTERNS.imperialDimension.source, 'g');
    while ((match = imperialRegex.exec(text)) !== null) {
        const dim = `${match[1]}'-${match[2]}"`;
        if (!imperialSet.has(dim)) {
            imperialSet.add(dim);
            dimensions.imperial.push(dim);
        }
    }

    // Metric dimensions
    const metricSet = new Set();
    const metricRegex = new RegExp(PATTERNS.metricDimension.source, 'gi');
    while ((match = metricRegex.exec(text)) !== null) {
        const dim = `${match[1]} ${match[2]}`;
        if (!metricSet.has(dim)) {
            metricSet.add(dim);
            dimensions.metric.push(dim);
        }
    }

    // Grid spacings (AxB patterns)
    const gridRegex = new RegExp(PATTERNS.gridSpacing.source, 'g');
    while ((match = gridRegex.exec(text)) !== null) {
        const spacing = `${match[1]}'-${match[2] || '0'}" x ${match[3]}'-${match[4] || '0'}"`;
        if (!dimensions.gridSpacings.includes(spacing)) {
            dimensions.gridSpacings.push(spacing);
        }
    }

    // Areas
    const areaRegex = new RegExp(PATTERNS.area.source, 'gi');
    while ((match = areaRegex.exec(text)) !== null) {
        dimensions.areas.push(`${match[1]} ${match[2].toUpperCase()}`);
    }

    // Heights
    const heightRegex = new RegExp(PATTERNS.height.source, 'gi');
    while ((match = heightRegex.exec(text)) !== null) {
        const context = text.substring(Math.max(0, match.index - 30), match.index).trim();
        const label = context.split(/\s+/).slice(-2).join(' ');
        dimensions.heights.push(`${label}: ${match[1]}'-${match[2] || '0'}"`);
    }

    return dimensions;
}

/**
 * Extract structural member sizes from text.
 */
function extractMemberSizes(text) {
    const members = {
        wShapes: [],
        hss: [],
        channels: [],
        angles: [],
        pipes: [],
        plates: [],
        indianSections: [],
        euroSections: []
    };

    let match;

    // W shapes
    const wSet = new Set();
    const wRegex = new RegExp(PATTERNS.wShape.source, 'gi');
    while ((match = wRegex.exec(text)) !== null) {
        const size = `W${match[1]}x${match[2]}`;
        if (!wSet.has(size)) { wSet.add(size); members.wShapes.push(size); }
    }

    // HSS
    const hssSet = new Set();
    const hssRegex = new RegExp(PATTERNS.hss.source, 'gi');
    while ((match = hssRegex.exec(text)) !== null) {
        const size = match[3] ? `HSS${match[1]}x${match[2]}x${match[3]}` : `HSS${match[1]}x${match[2]}`;
        if (!hssSet.has(size)) { hssSet.add(size); members.hss.push(size); }
    }

    // Channels
    const cRegex = new RegExp(PATTERNS.cChannel.source, 'gi');
    while ((match = cRegex.exec(text)) !== null) {
        const size = `C${match[1]}x${match[2]}`;
        if (!members.channels.includes(size)) members.channels.push(size);
    }

    // Angles
    const lRegex = new RegExp(PATTERNS.lAngle.source, 'gi');
    while ((match = lRegex.exec(text)) !== null) {
        const size = match[3] ? `L${match[1]}x${match[2]}x${match[3]}` : `L${match[1]}x${match[2]}`;
        if (!members.angles.includes(size)) members.angles.push(size);
    }

    // Pipes
    const pipeRegex = new RegExp(PATTERNS.pipe.source, 'gi');
    while ((match = pipeRegex.exec(text)) !== null) {
        if (!members.pipes.includes(match[0].trim())) members.pipes.push(match[0].trim());
    }

    // Indian sections
    const isRegex = new RegExp(PATTERNS.indianSection.source, 'gi');
    while ((match = isRegex.exec(text)) !== null) {
        const size = `${match[1].toUpperCase()}${match[2]}`;
        if (!members.indianSections.includes(size)) members.indianSections.push(size);
    }

    // European sections
    const euRegex = new RegExp(PATTERNS.euroSection.source, 'gi');
    while ((match = euRegex.exec(text)) !== null) {
        const size = `${match[1].toUpperCase()}${match[2]}`;
        if (!members.euroSections.includes(size)) members.euroSections.push(size);
    }

    return members;
}

/**
 * Extract material specifications from text.
 */
function extractMaterialSpecs(text) {
    const specs = {
        steelGrades: [],
        concreteGrades: [],
        rebarSpecs: [],
        materialStandards: [],
        boltSpecs: [],
        weldSpecs: []
    };

    let match;

    // ASTM specs
    const astmRegex = new RegExp(PATTERNS.astmSpec.source, 'gi');
    while ((match = astmRegex.exec(text)) !== null) {
        const spec = match[2] ? `ASTM ${match[1]} Gr ${match[2]}` : `ASTM ${match[1]}`;
        if (!specs.steelGrades.includes(spec)) specs.steelGrades.push(spec);
    }

    // IS specs
    const isSpecRegex = new RegExp(PATTERNS.isSpec.source, 'gi');
    while ((match = isSpecRegex.exec(text)) !== null) {
        const spec = `IS ${match[1]}`;
        if (!specs.materialStandards.includes(spec)) specs.materialStandards.push(spec);
    }

    // Concrete grades
    const concrPsiRegex = new RegExp(PATTERNS.concretePsi.source, 'gi');
    while ((match = concrPsiRegex.exec(text)) !== null) {
        const grade = `${match[1]} PSI`;
        if (!specs.concreteGrades.includes(grade)) specs.concreteGrades.push(grade);
    }
    const concrGradeRegex = new RegExp(PATTERNS.concreteGrade.source, 'g');
    while ((match = concrGradeRegex.exec(text)) !== null) {
        const grade = match[2] ? `C${match[1]}/${match[2]}` : `M${match[1]}`;
        if (!specs.concreteGrades.includes(grade)) specs.concreteGrades.push(grade);
    }

    // Rebar grades
    const rebarGrRegex = new RegExp(PATTERNS.rebarGrade.source, 'gi');
    while ((match = rebarGrRegex.exec(text)) !== null) {
        const grade = `Grade ${match[1]}`;
        if (!specs.rebarSpecs.includes(grade)) specs.rebarSpecs.push(grade);
    }

    // Rebar sizes
    const rebarSzRegex = new RegExp(PATTERNS.rebarSize.source, 'gi');
    while ((match = rebarSzRegex.exec(text)) !== null) {
        const size = match[1] ? `#${match[1]}` : `${match[2]}mm`;
        if (!specs.rebarSpecs.includes(size)) specs.rebarSpecs.push(size);
    }

    // Bar spacing
    const barSpRegex = new RegExp(PATTERNS.barSpacing.source, 'gi');
    while ((match = barSpRegex.exec(text)) !== null) {
        if (!specs.rebarSpecs.includes(match[0].trim())) specs.rebarSpecs.push(match[0].trim());
    }

    // Bolt specs
    const boltRegex = new RegExp(PATTERNS.boltSpec.source, 'gi');
    while ((match = boltRegex.exec(text)) !== null) {
        if (!specs.boltSpecs.includes(match[0].trim())) specs.boltSpecs.push(match[0].trim());
    }

    // Weld specs
    const weldRegex = new RegExp(PATTERNS.weldSpec.source, 'gi');
    while ((match = weldRegex.exec(text)) !== null) {
        if (!specs.weldSpecs.includes(match[0].trim())) specs.weldSpecs.push(match[0].trim());
    }

    return specs;
}

/**
 * Extract design loads and environmental data.
 */
function extractDesignLoads(text) {
    const loads = {
        gravity: [],
        wind: [],
        seismic: []
    };

    let match;

    // Gravity loads (DL, LL, etc.)
    const loadRegex = new RegExp(PATTERNS.loadPsf.source, 'gi');
    while ((match = loadRegex.exec(text)) !== null) {
        loads.gravity.push(`${match[1].toUpperCase()} = ${match[2]} ${match[3].toUpperCase()}`);
    }

    // Wind speed
    const windRegex = new RegExp(PATTERNS.windSpeed.source, 'gi');
    while ((match = windRegex.exec(text)) !== null) {
        loads.wind.push(`${match[1]} ${match[2].toUpperCase()}`);
    }

    // Seismic
    const seismicRegex = new RegExp(PATTERNS.seismicZone.source, 'gi');
    while ((match = seismicRegex.exec(text)) !== null) {
        loads.seismic.push(match[1]);
    }

    return loads;
}

/**
 * Extract scale information from drawing text.
 */
function extractScale(text) {
    const scales = [];
    let match;

    const impScaleRegex = new RegExp(PATTERNS.scaleImperial.source, 'gi');
    while ((match = impScaleRegex.exec(text)) !== null) {
        scales.push(`${match[1]}" = 1'-0"`);
    }

    const metScaleRegex = new RegExp(PATTERNS.scaleMetric.source, 'gi');
    while ((match = metScaleRegex.exec(text)) !== null) {
        scales.push(`1:${match[1]}`);
    }

    return [...new Set(scales)];
}

/**
 * Extract schedule data (beam schedules, column schedules, etc.)
 */
function extractSchedules(text) {
    const schedules = {
        types: [],
        entries: []
    };

    let match;

    // Schedule headers
    const headerRegex = new RegExp(PATTERNS.scheduleHeader.source, 'gi');
    while ((match = headerRegex.exec(text)) !== null) {
        const type = match[1].toUpperCase().trim();
        if (!schedules.types.includes(type)) schedules.types.push(type);
    }

    // Schedule entries (B1 = W24x68, C1 = W14x48, etc.)
    const entryRegex = new RegExp(PATTERNS.scheduleEntry.source, 'gi');
    while ((match = entryRegex.exec(text)) !== null) {
        schedules.entries.push(`${match[1]} = ${match[2]}${match[3]}x${match[4]}`);
    }

    return schedules;
}

/**
 * Extract drawing sheet references and titles.
 */
function extractDrawingInfo(text) {
    const info = {
        sheets: [],
        titles: [],
        roofingSpecs: [],
        claddingSpecs: [],
        quantities: [],
        weights: []
    };

    let match;

    // Drawing titles
    const titleRegex = new RegExp(PATTERNS.drawingTitle.source, 'gm');
    while ((match = titleRegex.exec(text)) !== null) {
        const title = match[1].trim();
        if (title.length > 8 && !info.titles.includes(title)) info.titles.push(title);
    }

    // Roofing specs
    const roofRegex = new RegExp(PATTERNS.roofingSpec.source, 'gi');
    while ((match = roofRegex.exec(text)) !== null) {
        if (!info.roofingSpecs.includes(match[0].trim())) info.roofingSpecs.push(match[0].trim());
    }

    // Cladding specs
    const cladRegex = new RegExp(PATTERNS.claddingSpec.source, 'gi');
    while ((match = cladRegex.exec(text)) !== null) {
        if (!info.claddingSpecs.includes(match[0].trim())) info.claddingSpecs.push(match[0].trim());
    }

    // Weights
    const weightRegex = new RegExp(PATTERNS.weight.source, 'gi');
    while ((match = weightRegex.exec(text)) !== null) {
        info.weights.push(`${match[1]} ${match[2].toUpperCase()}`);
    }

    return info;
}

/**
 * Compute a confidence score based on how much data was extracted.
 */
function computeExtractionConfidence(result) {
    let score = 0;
    let maxScore = 0;

    const checks = [
        { data: result.dimensions.imperial.length + result.dimensions.metric.length, weight: 20, label: 'dimensions' },
        { data: result.dimensions.gridSpacings.length, weight: 15, label: 'grid spacings' },
        { data: result.dimensions.areas.length, weight: 10, label: 'areas' },
        { data: result.dimensions.heights.length, weight: 10, label: 'heights' },
        { data: Object.values(result.memberSizes).flat().length, weight: 20, label: 'member sizes' },
        { data: result.materialSpecs.steelGrades.length, weight: 10, label: 'steel grades' },
        { data: result.materialSpecs.concreteGrades.length, weight: 5, label: 'concrete grades' },
        { data: result.designLoads.gravity.length, weight: 5, label: 'design loads' },
        { data: result.scales.length, weight: 5, label: 'scales' },
        { data: result.schedules.entries.length, weight: 15, label: 'schedule entries' },
    ];

    for (const check of checks) {
        maxScore += check.weight;
        if (check.data > 0) {
            score += Math.min(check.weight, check.data * (check.weight / 3));
        }
    }

    const pct = Math.round((score / maxScore) * 100);
    if (pct >= 70) return { score: pct, level: 'HIGH', note: 'Rich dimensional data extracted - AI can cross-verify with vision analysis' };
    if (pct >= 35) return { score: pct, level: 'MEDIUM', note: 'Partial data extracted - AI will supplement with vision analysis' };
    return { score: pct, level: 'LOW', note: 'Minimal text data (likely scanned drawing) - AI will rely primarily on vision analysis' };
}

/**
 * Main extraction function: Process PDF text and extract all measurement data.
 * @param {string} text - Raw text extracted from PDF
 * @param {string} fileName - Original file name
 * @returns {Object} Structured extraction result
 */
export function extractMeasurementsFromText(text, fileName) {
    if (!text || text.trim().length < 20) {
        return {
            fileName,
            hasData: false,
            confidence: { score: 0, level: 'NONE', note: 'No extractable text in PDF (scanned/image-only drawing)' },
            dimensions: { imperial: [], metric: [], gridSpacings: [], areas: [], heights: [] },
            memberSizes: { wShapes: [], hss: [], channels: [], angles: [], pipes: [], plates: [], indianSections: [], euroSections: [] },
            materialSpecs: { steelGrades: [], concreteGrades: [], rebarSpecs: [], materialStandards: [], boltSpecs: [], weldSpecs: [] },
            designLoads: { gravity: [], wind: [], seismic: [] },
            scales: [],
            schedules: { types: [], entries: [] },
            drawingInfo: { sheets: [], titles: [], roofingSpecs: [], claddingSpecs: [], quantities: [], weights: [] }
        };
    }

    const dimensions = extractDimensions(text);
    const memberSizes = extractMemberSizes(text);
    const materialSpecs = extractMaterialSpecs(text);
    const designLoads = extractDesignLoads(text);
    const scales = extractScale(text);
    const schedules = extractSchedules(text);
    const drawingInfo = extractDrawingInfo(text);

    const result = {
        fileName,
        hasData: true,
        dimensions,
        memberSizes,
        materialSpecs,
        designLoads,
        scales,
        schedules,
        drawingInfo
    };

    result.confidence = computeExtractionConfidence(result);

    return result;
}

/**
 * Process multiple PDF file buffers and extract measurements from each.
 * @param {Array} fileBuffers - Array of { originalname, buffer } from multer
 * @param {number} maxPages - Max pages to parse per PDF
 * @returns {Object} Combined extraction results
 */
export async function extractMeasurementsFromPDFs(fileBuffers, maxPages = 50) {
    if (!fileBuffers || fileBuffers.length === 0) {
        return { files: [], combined: null, summary: 'No files provided' };
    }

    const fileResults = [];

    for (const file of fileBuffers) {
        if (!/\.pdf$/i.test(file.originalname)) continue;

        try {
            const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
            const parsed = await pdfParse(file.buffer, { max: maxPages });

            if (parsed.text && parsed.text.trim().length > 20) {
                const extraction = extractMeasurementsFromText(parsed.text, file.originalname);
                extraction.pages = parsed.numpages;
                extraction.textLength = parsed.text.length;
                fileResults.push(extraction);
                console.log(`[PDF-MEASURE] ${file.originalname}: ${extraction.confidence.level} confidence (${extraction.confidence.score}%) - ${parsed.numpages} pages, ${parsed.text.length} chars`);
            } else {
                fileResults.push({
                    fileName: file.originalname,
                    hasData: false,
                    pages: parsed.numpages,
                    textLength: 0,
                    confidence: { score: 0, level: 'NONE', note: 'Scanned/image-only PDF - no text layer' }
                });
                console.log(`[PDF-MEASURE] ${file.originalname}: No text layer (scanned drawing) - ${parsed.numpages} pages`);
            }
        } catch (err) {
            console.log(`[PDF-MEASURE] Failed to process ${file.originalname}: ${err.message}`);
            fileResults.push({
                fileName: file.originalname,
                hasData: false,
                error: err.message,
                confidence: { score: 0, level: 'ERROR', note: `Processing failed: ${err.message}` }
            });
        }
    }

    // Combine data from all files
    const combined = combineExtractions(fileResults);

    return { files: fileResults, combined };
}

/**
 * Combine extraction results from multiple files into a unified dataset.
 */
function combineExtractions(fileResults) {
    const combined = {
        dimensions: { imperial: [], metric: [], gridSpacings: [], areas: [], heights: [] },
        memberSizes: { wShapes: [], hss: [], channels: [], angles: [], pipes: [], plates: [], indianSections: [], euroSections: [] },
        materialSpecs: { steelGrades: [], concreteGrades: [], rebarSpecs: [], materialStandards: [], boltSpecs: [], weldSpecs: [] },
        designLoads: { gravity: [], wind: [], seismic: [] },
        scales: [],
        schedules: { types: [], entries: [] },
        drawingInfo: { sheets: [], titles: [], roofingSpecs: [], claddingSpecs: [], quantities: [], weights: [] },
        overallConfidence: { score: 0, level: 'NONE' },
        filesWithData: 0,
        totalFiles: fileResults.length
    };

    const merge = (target, source) => {
        for (const [key, val] of Object.entries(source)) {
            if (Array.isArray(val) && Array.isArray(target[key])) {
                for (const item of val) {
                    if (!target[key].includes(item)) target[key].push(item);
                }
            } else if (typeof val === 'object' && val !== null && typeof target[key] === 'object') {
                merge(target[key], val);
            }
        }
    };

    let maxConfidence = 0;
    for (const fr of fileResults) {
        if (!fr.hasData) continue;
        combined.filesWithData++;
        merge(combined.dimensions, fr.dimensions || {});
        merge(combined.memberSizes, fr.memberSizes || {});
        merge(combined.materialSpecs, fr.materialSpecs || {});
        merge(combined.designLoads, fr.designLoads || {});
        if (fr.scales) for (const s of fr.scales) { if (!combined.scales.includes(s)) combined.scales.push(s); }
        merge(combined.schedules, fr.schedules || {});
        merge(combined.drawingInfo, fr.drawingInfo || {});
        if (fr.confidence?.score > maxConfidence) maxConfidence = fr.confidence.score;
    }

    combined.overallConfidence = computeExtractionConfidence({ dimensions: combined.dimensions, memberSizes: combined.memberSizes, materialSpecs: combined.materialSpecs, designLoads: combined.designLoads, scales: combined.scales, schedules: combined.schedules });

    return combined;
}

/**
 * Format the extraction results into a readable text block for the AI prompt.
 * This is the key function that converts structured data into AI-consumable context.
 */
export function formatExtractionForAI(extractionResult) {
    if (!extractionResult || !extractionResult.combined) return '';

    const c = extractionResult.combined;
    if (c.filesWithData === 0) return '';

    const sections = [];

    sections.push(`📐 PRE-EXTRACTED MEASUREMENT DATA FROM PDF TEXT LAYERS`);
    sections.push(`Extraction confidence: ${c.overallConfidence.level} (${c.overallConfidence.score}%) - ${c.overallConfidence.note}`);
    sections.push(`Data extracted from ${c.filesWithData} of ${c.totalFiles} PDF file(s)\n`);

    // Dimensions
    const allDims = [...c.dimensions.imperial, ...c.dimensions.metric];
    if (allDims.length > 0 || c.dimensions.gridSpacings.length > 0) {
        sections.push(`── DIMENSIONS FOUND ──`);
        if (c.dimensions.gridSpacings.length > 0) sections.push(`Grid/Bay Spacings: ${c.dimensions.gridSpacings.join(', ')}`);
        if (allDims.length > 0) sections.push(`All Dimensions: ${allDims.slice(0, 40).join(', ')}${allDims.length > 40 ? ` (+${allDims.length - 40} more)` : ''}`);
        if (c.dimensions.areas.length > 0) sections.push(`Areas: ${c.dimensions.areas.join(', ')}`);
        if (c.dimensions.heights.length > 0) sections.push(`Heights: ${c.dimensions.heights.join(', ')}`);
        sections.push('');
    }

    // Member sizes
    const allMembers = Object.entries(c.memberSizes)
        .filter(([_, arr]) => arr.length > 0)
        .map(([type, arr]) => {
            const labels = { wShapes: 'W-Shapes', hss: 'HSS', channels: 'Channels', angles: 'Angles', pipes: 'Pipes', plates: 'Plates', indianSections: 'Indian Sections', euroSections: 'European Sections' };
            return `${labels[type] || type}: ${arr.join(', ')}`;
        });
    if (allMembers.length > 0) {
        sections.push(`── STRUCTURAL MEMBER SIZES ──`);
        sections.push(allMembers.join('\n'));
        sections.push('');
    }

    // Schedules
    if (c.schedules.types.length > 0 || c.schedules.entries.length > 0) {
        sections.push(`── SCHEDULES FOUND ──`);
        if (c.schedules.types.length > 0) sections.push(`Schedule Types: ${c.schedules.types.join(', ')}`);
        if (c.schedules.entries.length > 0) sections.push(`Schedule Entries: ${c.schedules.entries.join(', ')}`);
        sections.push('');
    }

    // Material specs
    const specLines = [];
    if (c.materialSpecs.steelGrades.length > 0) specLines.push(`Steel: ${c.materialSpecs.steelGrades.join(', ')}`);
    if (c.materialSpecs.concreteGrades.length > 0) specLines.push(`Concrete: ${c.materialSpecs.concreteGrades.join(', ')}`);
    if (c.materialSpecs.rebarSpecs.length > 0) specLines.push(`Rebar: ${c.materialSpecs.rebarSpecs.join(', ')}`);
    if (c.materialSpecs.materialStandards.length > 0) specLines.push(`Standards: ${c.materialSpecs.materialStandards.join(', ')}`);
    if (c.materialSpecs.boltSpecs.length > 0) specLines.push(`Bolts: ${c.materialSpecs.boltSpecs.join(', ')}`);
    if (c.materialSpecs.weldSpecs.length > 0) specLines.push(`Welds: ${c.materialSpecs.weldSpecs.join(', ')}`);
    if (specLines.length > 0) {
        sections.push(`── MATERIAL SPECIFICATIONS ──`);
        sections.push(specLines.join('\n'));
        sections.push('');
    }

    // Design loads
    const loadLines = [];
    if (c.designLoads.gravity.length > 0) loadLines.push(`Gravity Loads: ${c.designLoads.gravity.join(', ')}`);
    if (c.designLoads.wind.length > 0) loadLines.push(`Wind: ${c.designLoads.wind.join(', ')}`);
    if (c.designLoads.seismic.length > 0) loadLines.push(`Seismic: ${c.designLoads.seismic.join(', ')}`);
    if (loadLines.length > 0) {
        sections.push(`── DESIGN LOADS ──`);
        sections.push(loadLines.join('\n'));
        sections.push('');
    }

    // Scale
    if (c.scales.length > 0) {
        sections.push(`── DRAWING SCALE ──`);
        sections.push(`Scale: ${c.scales.join(', ')}`);
        sections.push('');
    }

    // Drawing info
    if (c.drawingInfo.titles.length > 0) {
        sections.push(`── DRAWING SHEETS ──`);
        sections.push(c.drawingInfo.titles.join('\n'));
        sections.push('');
    }

    if (c.drawingInfo.roofingSpecs.length > 0 || c.drawingInfo.claddingSpecs.length > 0) {
        sections.push(`── ENVELOPE SPECS ──`);
        if (c.drawingInfo.roofingSpecs.length > 0) sections.push(`Roofing: ${c.drawingInfo.roofingSpecs.join(', ')}`);
        if (c.drawingInfo.claddingSpecs.length > 0) sections.push(`Cladding: ${c.drawingInfo.claddingSpecs.join(', ')}`);
        sections.push('');
    }

    if (c.drawingInfo.weights.length > 0) {
        sections.push(`── WEIGHTS/QUANTITIES ──`);
        sections.push(c.drawingInfo.weights.join(', '));
        sections.push('');
    }

    // Per-file breakdown
    sections.push(`── PER-FILE EXTRACTION SUMMARY ──`);
    for (const fr of extractionResult.files) {
        const memberCount = fr.hasData ? Object.values(fr.memberSizes || {}).flat().length : 0;
        const dimCount = fr.hasData ? (fr.dimensions?.imperial?.length || 0) + (fr.dimensions?.metric?.length || 0) : 0;
        sections.push(`${fr.fileName}: ${fr.confidence?.level || 'N/A'} (${fr.pages || '?'} pages, ${dimCount} dimensions, ${memberCount} members)`);
    }

    return sections.join('\n');
}

export default { extractMeasurementsFromText, extractMeasurementsFromPDFs, formatExtractionForAI };
