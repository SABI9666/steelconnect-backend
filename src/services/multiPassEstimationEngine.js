// src/services/multiPassEstimationEngine.js
// Core Multi-Pass AI Estimation Engine for Construction Cost Estimation
// Orchestrates 5 passes through Claude AI to analyze construction drawings
// and produce accurate, validated cost estimates.

import Anthropic from '@anthropic-ai/sdk';
import { buildFileContentBlocks, extractPdfText, extractJSON, validateAndFixTotals, SYSTEM_PROMPT } from './aiEstimationService.js';
import { extractMeasurementsFromPDFs, formatExtractionForAI } from './pdfMeasurementExtractor.js';
import { getSheetClassificationPrompt, getStructuralExtractionPrompt, getFoundationExtractionPrompt, getScheduleExtractionPrompt, getElevationSectionPrompt, getQuantityTakeoffPrompt, getCostApplicationPrompt } from './promptTemplates.js';
import { getLocationFactor, getUnitRate, getBenchmarkRange, getSteelWeightPerFoot, classifySteelWeight, UNIT_RATES } from '../data/costDatabase.js';
import { lookupSteelRate, detectCurrency, adjustForLocation } from './costLookupService.js';
import { validateEstimate } from './validationEngine.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Constants
const MODEL = 'claude-opus-4-20250514';
const MAX_TOKENS_CLASSIFY = 16000;
const MAX_TOKENS_EXTRACT = 16000;
const MAX_TOKENS_TAKEOFF = 32000;
const MAX_TOKENS_COST = 32000;
const THINKING_BUDGET = 10000;

const PASS_DESCRIPTIONS = {
    pass1: 'Classifying drawing sheets...',
    pass2: 'Extracting structural details from drawings...',
    pass3: 'Computing quantity takeoff (BOQ)...',
    pass4: 'Applying cost rates and generating estimate...',
    pass5: 'Validating estimate and computing confidence...'
};

/** Return a user-friendly description for a given pass name. */
export function getPassStatusDescription(passName) {
    return PASS_DESCRIPTIONS[passName] || `Running ${passName}...`;
}

/** Safe pass-update callback wrapper. */
async function notifyPassUpdate(onPassUpdate, passName, status, data) {
    if (typeof onPassUpdate === 'function') {
        try { await onPassUpdate(passName, status, data); }
        catch (err) { console.error(`[MULTI-PASS] onPassUpdate error (${passName}/${status}):`, err.message); }
    }
}

/** Send a message to Claude and return the text response. */
async function callClaude(messageContent, { maxTokens = MAX_TOKENS_CLASSIFY, useThinking = false, systemPrompt = SYSTEM_PROMPT } = {}) {
    const params = {
        model: MODEL, max_tokens: maxTokens, system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }]
    };
    if (useThinking) {
        params.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGET };
    }
    const stream = await anthropic.messages.stream(params);
    const response = await stream.finalMessage();
    const textBlock = response.content.find(block => block.type === 'text');
    return textBlock ? textBlock.text : response.content[0].text;
}

// ============================================================================
// PASS 1 - Sheet Classification
// ============================================================================

const DEFAULT_SHEET = { pageNumber: 1, sheetType: 'general', sheetName: 'Unknown Sheet', scale: 'N/A' };

async function classifySheets(fileBuffers) {
    console.log('[MULTI-PASS] Pass 1 - Sheet Classification started');
    if (!fileBuffers || fileBuffers.length === 0) return [DEFAULT_SHEET];

    try {
        const fileContentBlocks = buildFileContentBlocks(fileBuffers);
        if (fileContentBlocks.length === 0) return [DEFAULT_SHEET];

        const messageContent = [
            { type: 'text', text: 'I am providing construction drawing files. Analyze EVERY page and classify each sheet.\n\nHere are the files:\n' },
            ...fileContentBlocks,
            { type: 'text', text: getSheetClassificationPrompt() }
        ];

        const responseText = await callClaude(messageContent, { maxTokens: MAX_TOKENS_CLASSIFY });
        const parsed = extractJSON(responseText);

        // Normalize: find the array of sheet objects from various possible response shapes
        let sheets = Array.isArray(parsed) ? parsed
            : (parsed.sheets || parsed.sheetInventory || parsed.pages
               || Object.values(parsed).find(v => Array.isArray(v)) || []);

        sheets = sheets.map((s, idx) => ({
            pageNumber: s.pageNumber || s.page || idx + 1,
            sheetType: normalizeSheetType(s.sheetType || s.type || 'general'),
            sheetName: s.sheetName || s.name || s.title || `Sheet ${idx + 1}`,
            scale: s.scale || 'N/A'
        }));

        if (sheets.length === 0) return [DEFAULT_SHEET];
        console.log(`[MULTI-PASS] Pass 1 - Classified ${sheets.length} sheets: ${sheets.map(s => s.sheetType).join(', ')}`);
        return sheets;
    } catch (err) {
        console.error('[MULTI-PASS] Pass 1 - Classification failed:', err.message);
        return [DEFAULT_SHEET];
    }
}

function normalizeSheetType(raw) {
    const l = (raw || '').toLowerCase();
    if (/struct|fram|steel|beam|column|brac|plan|layout|roof|floor/.test(l)) return 'structural';
    if (/found|foot|pile|pier|caisson|slab.on.grade|sog/.test(l)) return 'foundation';
    if (/sched|table|list|bom|bill/.test(l)) return 'schedule';
    if (/elev|section|detail|arch|exterior|facade|clad/.test(l)) return 'elevation';
    if (/mep|mech|elec|plumb|hvac|fire/.test(l)) return 'mep';
    if (/site|civil|grad|pav/.test(l)) return 'site';
    return 'general';
}

// ============================================================================
// PASS 2 - Deep Extraction (Parallel by Sheet Type)
// ============================================================================

async function deepExtraction(fileBuffers, sheetInventory) {
    console.log('[MULTI-PASS] Pass 2 - Deep Extraction started');

    const groups = { structural: [], foundation: [], schedule: [], elevation: [] };
    for (const sheet of sheetInventory) {
        if (groups[sheet.sheetType]) groups[sheet.sheetType].push(sheet);
        else if (!['mep', 'site', 'general'].includes(sheet.sheetType)) groups.structural.push(sheet);
    }

    const fileContentBlocks = buildFileContentBlocks(fileBuffers);
    let pdfTextSections = '';
    try {
        const pdfTexts = await extractPdfText(fileBuffers);
        if (pdfTexts.length > 0) {
            pdfTextSections = '\n\nSUPPLEMENTARY PDF TEXT:\n' +
                pdfTexts.map(pt => `--- "${pt.fileName}" (${pt.pages} pages) ---\n${pt.text}`).join('\n') + '\n---\n';
        }
    } catch (err) { console.log('[MULTI-PASS] Pass 2 - PDF text extraction skipped:', err.message); }

    const promptMap = {
        structural: getStructuralExtractionPrompt,
        foundation: getFoundationExtractionPrompt,
        schedule: getScheduleExtractionPrompt,
        elevation: getElevationSectionPrompt
    };

    // Build parallel extraction tasks
    const tasks = Object.entries(groups)
        .filter(([, sheets]) => sheets.length > 0)
        .filter(([groupName]) => promptMap[groupName])
        .map(([groupName, sheets]) => {
            const pageNums = sheets.map(s => s.pageNumber).join(', ');
            const names = sheets.map(s => s.sheetName).join(', ');
            const msgContent = [
                { type: 'text', text: `FOCUS ON THESE SHEETS: Pages ${pageNums} (${names}). These are ${groupName} sheets. Extract ALL relevant data.\n\nHere are the drawing files:\n` },
                ...fileContentBlocks,
                ...(pdfTextSections ? [{ type: 'text', text: pdfTextSections }] : []),
                { type: 'text', text: promptMap[groupName]() }
            ];
            return callClaude(msgContent, { maxTokens: MAX_TOKENS_EXTRACT })
                .then(text => { try { return { groupName, data: extractJSON(text) }; } catch (e) { return { groupName, data: null, error: e.message }; } })
                .catch(err => ({ groupName, data: null, error: err.message }));
        });

    const results = tasks.length > 0 ? await Promise.all(tasks) : [];
    console.log(`[MULTI-PASS] Pass 2 - ${results.filter(r => r.data).length}/${results.length} groups extracted`);
    return mergeExtractionResults(results, sheetInventory);
}

/** Merge arrays from source into target for listed fields. */
function mergeArrayFields(target, source, fields) {
    for (const f of fields) {
        if (Array.isArray(source[f])) target[f] = [...(target[f] || []), ...source[f]];
    }
}

/** Merge scalar fields from source into target (only if truthy). */
function mergeScalarFields(target, source, fields) {
    for (const f of fields) { if (source[f]) target[f] = source[f]; }
}

function mergeExtractionResults(results, sheetInventory) {
    const merged = {
        sheetInventory,
        structural: { members: [], beams: [], columns: [], bracing: [], joists: [], connections: [], memberSizes: {}, spans: [], baySpacings: [], gridDimensions: null, steelGrade: null, notes: [] },
        foundation: { footings: [], piles: [], gradeBeams: [], slabOnGrade: null, retainingWalls: [], concreteGrade: null, rebarSpec: null, soilBearingCapacity: null, notes: [] },
        schedule: { beamSchedule: [], columnSchedule: [], joistSchedule: [], footingSchedule: [], memberList: [], notes: [] },
        elevation: { buildingHeight: null, eaveHeight: null, ridgeHeight: null, floorToFloor: null, roofSlope: null, cladding: [], openings: [], sections: [], notes: [] },
        dimensions: { overall: null, footprint: null, totalArea: null, numberOfBays: null, typicalBaySize: null, buildingLength: null, buildingWidth: null },
        materialSpecs: { steelGrades: [], concreteGrades: [], rebarGrades: [], boltSpecs: [], weldSpecs: [], deckSpecs: [], roofingSpecs: [], claddingSpecs: [] },
        designLoads: { deadLoad: null, liveLoad: null, roofLiveLoad: null, windSpeed: null, seismicCategory: null, snowLoad: null },
        extractionMeta: { groupsProcessed: [], groupsFailed: [], totalSheets: sheetInventory.length }
    };

    for (const result of results) {
        if (!result.data) { merged.extractionMeta.groupsFailed.push(result.groupName); continue; }
        merged.extractionMeta.groupsProcessed.push(result.groupName);
        const d = result.data;

        if (result.groupName === 'structural') {
            mergeArrayFields(merged.structural, d, ['members', 'beams', 'columns', 'bracing', 'joists', 'connections', 'spans', 'baySpacings', 'notes']);
            if (d.memberSizes && typeof d.memberSizes === 'object') Object.assign(merged.structural.memberSizes, d.memberSizes);
            mergeScalarFields(merged.structural, d, ['gridDimensions', 'steelGrade']);
        } else if (result.groupName === 'foundation') {
            mergeArrayFields(merged.foundation, d, ['footings', 'piles', 'gradeBeams', 'retainingWalls', 'notes']);
            mergeScalarFields(merged.foundation, d, ['slabOnGrade', 'concreteGrade', 'rebarSpec', 'soilBearingCapacity']);
        } else if (result.groupName === 'schedule') {
            mergeArrayFields(merged.schedule, d, ['beamSchedule', 'columnSchedule', 'joistSchedule', 'footingSchedule', 'memberList', 'notes']);
        } else if (result.groupName === 'elevation') {
            mergeArrayFields(merged.elevation, d, ['cladding', 'openings', 'sections', 'notes']);
            mergeScalarFields(merged.elevation, d, ['buildingHeight', 'eaveHeight', 'ridgeHeight', 'floorToFloor', 'roofSlope']);
        }

        // Merge shared fields (dimensions, material specs, design loads)
        if (d.dimensions) mergeScalarFields(merged.dimensions, d.dimensions, ['overall', 'footprint', 'totalArea', 'numberOfBays', 'typicalBaySize', 'buildingLength', 'buildingWidth']);
        const ms = d.materialSpecs || d.materials;
        if (ms) {
            for (const field of ['steelGrades', 'concreteGrades', 'rebarGrades', 'boltSpecs', 'weldSpecs', 'deckSpecs', 'roofingSpecs', 'claddingSpecs']) {
                if (Array.isArray(ms[field])) {
                    for (const item of ms[field]) { if (!merged.materialSpecs[field].includes(item)) merged.materialSpecs[field].push(item); }
                }
            }
        }
        const dl = d.designLoads || d.loads;
        if (dl) mergeScalarFields(merged.designLoads, dl, ['deadLoad', 'liveLoad', 'roofLiveLoad', 'windSpeed', 'seismicCategory', 'snowLoad']);
    }
    return merged;
}

// ============================================================================
// PASS 3 - Quantity Takeoff
// ============================================================================

async function quantityTakeoff(extractedData, measurementData, projectInfo) {
    console.log('[MULTI-PASS] Pass 3 - Quantity Takeoff started');

    let measurementText = measurementData ? formatExtractionForAI(measurementData) : '';

    // Build AISC weight reference for steel tonnage calculation
    const allMembers = ['beams', 'columns', 'bracing', 'joists', 'members']
        .flatMap(f => extractedData.structural?.[f] || []);
    const sizeSet = new Set();
    const memberSizesFound = [];
    for (const member of allMembers) {
        const size = typeof member === 'string' ? member : (member.size || member.section || member.memberSize || '');
        if (size && !sizeSet.has(size)) {
            sizeSet.add(size);
            const wi = getSteelWeightPerFoot(size);
            const wc = wi ? classifySteelWeight(wi.unit === 'lb/ft' ? wi.weight : wi.weight * 0.672) : 'unknown';
            memberSizesFound.push({ size, weightPerFoot: wi ? `${wi.weight} ${wi.unit}` : 'Not in DB', weightClass: wc });
        }
    }

    const scheduleEntries = ['beamSchedule', 'columnSchedule', 'joistSchedule', 'footingSchedule', 'memberList']
        .flatMap(f => extractedData.schedule?.[f] || []);

    const aiscRef = memberSizesFound.length > 0
        ? '\nAISC WEIGHT REFERENCE:\n' + memberSizesFound.map(m => `  ${m.size}: ${m.weightPerFoot} (${m.weightClass})`).join('\n') +
          '\nFormula: weight_per_foot x length x count / 2000 = tons\n' : '';

    const messageContent = [{
        type: 'text',
        text: `QUANTITY TAKEOFF REQUEST\n\nPROJECT: ${projectInfo.projectTitle || 'Unknown'}\nTYPE: ${projectInfo.projectType || 'N/A'}\nAREA: ${projectInfo.totalArea || 'N/A'}\nLOCATION: ${projectInfo.region || 'N/A'}\n\n` +
            `AI-EXTRACTED STRUCTURAL DATA:\n${JSON.stringify(extractedData, null, 2)}\n\n` +
            `SCHEDULE ENTRIES:\n${JSON.stringify(scheduleEntries, null, 2)}\n\n` +
            aiscRef +
            (measurementText ? `\nPDF TEXT EXTRACTION DATA:\n${measurementText}\n\n` : '') +
            `CROSS-REFERENCE INSTRUCTIONS:\n- Compare plan member counts with schedule quantities - they MUST match\n- For steel: show calculation traces (count x weight/ft x length / 2000)\n- For concrete: show volume calculations (L x W x D for each element)\n- Include waste factors: steel 3%, concrete 5%, rebar 7%\n- Include connection material: 10% of main steel tonnage\n\n` +
            getQuantityTakeoffPrompt()
    }];

    const responseText = await callClaude(messageContent, { maxTokens: MAX_TOKENS_TAKEOFF, useThinking: true });
    const raw = extractJSON(responseText);

    const boq = {
        steelItems: raw.steelItems || raw.steel || [],
        concreteItems: raw.concreteItems || raw.concrete || [],
        rebarItems: raw.rebarItems || raw.rebar || [],
        otherItems: raw.otherItems || raw.other || raw.miscellaneous || [],
        calculations: raw.calculations || raw.calculationTraces || {},
        discrepancies: raw.discrepancies || [],
        totals: raw.totals || raw.summary || {},
        wasteFactor: raw.wasteFactor || { steel: 0.03, concrete: 0.05, rebar: 0.07 },
        connectionMaterial: raw.connectionMaterial || null,
        _extractedData: extractedData,
        _measurementConfidence: measurementData?.combined?.overallConfidence || null
    };

    console.log(`[MULTI-PASS] Pass 3 - BOQ: ${boq.steelItems.length} steel, ${boq.concreteItems.length} concrete, ${boq.rebarItems.length} rebar, ${boq.otherItems.length} other`);
    return boq;
}

// ============================================================================
// PASS 4 - Cost Estimation
// ============================================================================

async function costEstimation(boq, projectInfo, answers) {
    console.log('[MULTI-PASS] Pass 4 - Cost Estimation started');

    const currency = detectCurrency(projectInfo);
    const location = projectInfo.region || projectInfo.location || '';
    const locationData = getLocationFactor(location);
    const ratesReference = buildRatesReference(currency, location);

    // Benchmark reference
    const projectType = projectInfo.projectType || answers?.projectType || '';
    const bench = getBenchmarkRange(currency, projectType);
    const benchText = bench ? `\nBENCHMARK: ${bench.label}: ${bench.low}-${bench.high} per ${bench.unit} (mid: ${bench.mid}). Stay within range.\n` : '';

    // Look up steel rates for found members
    const steelRates = boq.steelItems
        .map(item => { const sz = item.memberSize || item.size || item.section || ''; return sz ? { sz, ...lookupSteelRate(sz, location, currency) } : null; })
        .filter(r => r && r.source === 'DB')
        .map(r => `  ${r.sz} (${r.weightClass}): ${currency} ${r.rate}/${r.unit} (${r.range[0]}-${r.range[1]})`);
    const steelRatesText = steelRates.length > 0 ? '\nDB STEEL RATES:\n' + steelRates.join('\n') + '\n' : '';

    const messageContent = [{
        type: 'text',
        text: `COST APPLICATION REQUEST\n\nPROJECT: ${projectInfo.projectTitle || 'Unknown'}\nTYPE: ${projectType}\nAREA: ${projectInfo.totalArea || 'N/A'}\nLOCATION: ${location}\nCURRENCY: ${currency}\nLOCATION FACTOR: ${locationData.factor}x\n\n` +
            `ANSWERS:\n${JSON.stringify(answers, null, 2)}\n\n` +
            `BOQ:\nSteel: ${JSON.stringify(boq.steelItems, null, 2)}\nConcrete: ${JSON.stringify(boq.concreteItems, null, 2)}\nRebar: ${JSON.stringify(boq.rebarItems, null, 2)}\nOther: ${JSON.stringify(boq.otherItems, null, 2)}\n\n` +
            `Calculations: ${JSON.stringify(boq.calculations, null, 2)}\nTotals: ${JSON.stringify(boq.totals, null, 2)}\n\n` +
            ratesReference + steelRatesText + benchText +
            `\nRATE SOURCE TAGGING: Include "rateSource" on each line item:\n- "DB" = from cost database\n- "EST" = AI estimated\nPrefer DB rates.\n\n` +
            getCostApplicationPrompt()
    }];

    const responseText = await callClaude(messageContent, { maxTokens: MAX_TOKENS_COST, useThinking: true });
    const estimate = extractJSON(responseText);
    validateAndFixTotals(estimate);

    // Ensure rateSource tags
    for (const trade of (estimate.trades || [])) {
        for (const li of (trade.lineItems || [])) { if (!li.rateSource) li.rateSource = 'EST'; }
    }

    // Metadata
    if (!estimate.structuralAnalysis) estimate.structuralAnalysis = {};
    estimate.structuralAnalysis.analysisMethod = 'MULTI_PASS_ENGINE - 5-pass deep analysis with parallel sheet extraction';
    estimate.structuralAnalysis.passesCompleted = 4;
    estimate.structuralAnalysis.currency = currency;
    estimate.structuralAnalysis.locationFactor = locationData.factor;

    let dbCount = 0, estCount = 0;
    for (const t of (estimate.trades || [])) for (const li of (t.lineItems || [])) { li.rateSource === 'DB' ? dbCount++ : estCount++; }
    estimate.structuralAnalysis.rateSourceBreakdown = { database: dbCount, estimated: estCount };

    console.log(`[MULTI-PASS] Pass 4 - Grand total: ${estimate.summary?.grandTotal}, DB: ${dbCount}, EST: ${estCount}`);
    return estimate;
}

function buildRatesReference(currency, location) {
    const factor = getLocationFactor(location).factor;
    const rates = UNIT_RATES[currency];
    if (!rates) return `No DB rates for ${currency}. Use current ${new Date().getFullYear()} market rates.`;

    const lines = [`DATABASE UNIT RATES (${currency}, factor: ${factor}x):\n`];
    for (const [cat, subtypes] of Object.entries(rates)) {
        lines.push(`  ${cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:`);
        for (const [sub, info] of Object.entries(subtypes)) {
            const r = Math.round(info.rate * factor);
            const rng = info.range.map(v => Math.round(v * factor));
            lines.push(`    ${sub}: ${r}/${info.unit} (${rng[0]}-${rng[1]}) - ${info.desc}`);
        }
    }
    return lines.join('\n');
}

// ============================================================================
// PASS 5 - Validation
// ============================================================================

async function validation(estimate, projectInfo, measurementData) {
    console.log('[MULTI-PASS] Pass 5 - Validation started');

    let report;
    try { report = validateEstimate(estimate, projectInfo, measurementData); }
    catch (err) {
        console.error('[MULTI-PASS] Pass 5 - Validation engine error:', err.message);
        report = { isValid: false, errors: [{ code: 'VALIDATION_ENGINE_ERROR', message: err.message }], warnings: [], autoFixes: [], score: 0 };
    }

    // Apply auto-fixes
    for (const fix of (report?.autoFixes || [])) {
        try { applyAutoFix(estimate, fix); console.log(`[MULTI-PASS] Auto-fix: ${fix.code}`); }
        catch (e) { console.error(`[MULTI-PASS] Auto-fix failed (${fix.code}):`, e.message); }
    }
    validateAndFixTotals(estimate);

    const confidence = computeFinalConfidence(estimate, report, measurementData);
    estimate.validationReport = {
        ...report, finalConfidenceScore: confidence.score, confidenceLevel: confidence.level,
        confidenceFactors: confidence.factors, validatedAt: new Date().toISOString(), engineVersion: 'multi-pass-v1'
    };
    if (estimate.summary) { estimate.summary.confidenceLevel = confidence.level; estimate.summary.confidenceScore = confidence.score; }
    if (estimate.structuralAnalysis) { estimate.structuralAnalysis.passesCompleted = 5; estimate.structuralAnalysis.analysisMethod = 'MULTI_PASS_ENGINE - 5-pass deep analysis with validation'; }

    console.log(`[MULTI-PASS] Pass 5 - Confidence: ${confidence.level} (${confidence.score}%). Errors: ${report?.errors?.length || 0}, Warnings: ${report?.warnings?.length || 0}`);
    return estimate;
}

function applyAutoFix(estimate, fix) {
    if (!fix?.code) return;
    switch (fix.code) {
        case 'FIX_MARKUP_CAP': {
            const cb = estimate.costBreakdown;
            if (!cb) break;
            const fields = ['generalConditions', 'overhead', 'profit', 'contingency', 'escalation'];
            const maxPct = fix.maxCombinedPercent || 40;
            let total = fields.reduce((s, f) => s + (Number(cb[f + 'Percent']) || 0), 0);
            if (total > maxPct) {
                const scale = maxPct / total;
                for (const f of fields) {
                    if (cb[f + 'Percent'] > 0) {
                        cb[f + 'Percent'] = Math.round(cb[f + 'Percent'] * scale * 100) / 100;
                        cb[f] = Math.round(cb.directCosts * (cb[f + 'Percent'] / 100) * 100) / 100;
                    }
                }
            }
            break;
        }
        case 'FIX_LINE_ITEM_MATH': {
            for (const t of (estimate.trades || [])) for (const li of (t.lineItems || [])) {
                li.lineTotal = Math.round((Number(li.quantity) || 0) * (Number(li.unitRate) || 0) * 100) / 100;
            }
            break;
        }
        case 'FIX_RATE_OUTLIER': {
            if (fix.tradeIndex != null && fix.itemIndex != null && fix.suggestedRate != null) {
                const li = estimate.trades?.[fix.tradeIndex]?.lineItems?.[fix.itemIndex];
                if (li) { li.unitRate = fix.suggestedRate; li.lineTotal = Math.round((Number(li.quantity) || 0) * fix.suggestedRate * 100) / 100; li.rateSource = 'DB_FIX'; }
            }
            break;
        }
        case 'FIX_MISSING_TRADE': {
            if (fix.trade && estimate.trades) estimate.trades.push(fix.trade);
            break;
        }
    }
}

function computeFinalConfidence(estimate, report, measurementData) {
    const factors = [];
    let totalScore = 0, totalWeight = 0;

    const addFactor = (name, score, weight) => {
        factors.push({ name, score, weight }); totalScore += score * weight; totalWeight += weight;
    };

    // Validation (30)
    addFactor('Validation', report?.score ?? 50, 30);

    // Drawing data quality (25)
    const mc = measurementData?.combined?.overallConfidence?.score ?? 0;
    const hasDrawings = mc > 0 || (estimate.structuralAnalysis?.filesAnalyzed?.length > 0);
    addFactor('Drawing Data', hasDrawings ? Math.max(mc, 40) : 20, 25);

    // Rate source quality (20)
    const rb = estimate.structuralAnalysis?.rateSourceBreakdown || { database: 0, estimated: 0 };
    const tot = rb.database + rb.estimated;
    addFactor('Rate Quality', Math.min(100, (tot > 0 ? Math.round(rb.database / tot * 100) : 0) + 30), 20);

    // Benchmark alignment (15)
    let bs = 50;
    const chk = (estimate.summary?.benchmarkCheck || '').toLowerCase();
    if (/within|reasonable|typical/.test(chk)) bs = 90;
    else if (/slightly|near/.test(chk)) bs = 70;
    else if (/outside|high|low/.test(chk)) bs = 40;
    addFactor('Benchmark Alignment', bs, 15);

    // Completeness (10)
    let cs = 0;
    if (estimate.trades?.length > 0) cs += 20;
    if (estimate.trades?.length >= 3) cs += 20;
    if (estimate.costBreakdown?.directCosts > 0) cs += 20;
    if (estimate.summary?.grandTotal > 0) cs += 20;
    if (estimate.drawingExtraction?.dimensionsFound?.length > 0) cs += 20;
    addFactor('Completeness', cs, 10);

    const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    const level = score >= 80 ? 'High' : score >= 60 ? 'Medium' : score >= 40 ? 'Low' : 'Very Low';
    return { score, level, factors };
}

// ============================================================================
// MAIN EXPORT: runMultiPassEstimation
// ============================================================================

/**
 * Orchestrate the 5-pass AI estimation engine.
 *
 * @param {Object} projectInfo - Project metadata (title, description, type, region, etc.)
 * @param {Object} answers - Questionnaire answers from the user
 * @param {string[]} fileNames - List of uploaded file names
 * @param {Array} fileBuffers - Array of { originalname, buffer, mimetype, size }
 * @param {Object} [options={}] - { estimationId, onPassUpdate }
 * @returns {Object} Final validated estimate
 */
export async function runMultiPassEstimation(projectInfo, answers, fileNames, fileBuffers, options = {}) {
    const { estimationId, onPassUpdate } = options;
    const startTime = Date.now();

    console.log(`[MULTI-PASS] ========================================`);
    console.log(`[MULTI-PASS] Starting: "${projectInfo.projectTitle || 'Unknown'}" | ${fileBuffers?.length || 0} files | ID: ${estimationId || 'N/A'}`);
    console.log(`[MULTI-PASS] ========================================`);

    try {
        // Pre-processing: Extract PDF measurements (shared across passes)
        let measurementData = null;
        if (fileBuffers?.length > 0) {
            try {
                measurementData = await extractMeasurementsFromPDFs(fileBuffers);
                const c = measurementData?.combined?.overallConfidence;
                console.log(`[MULTI-PASS] PDF measurements: ${c?.level || 'NONE'} (${c?.score || 0}%)`);
            } catch (err) { console.log(`[MULTI-PASS] PDF measurement extraction skipped: ${err.message}`); }
        }

        // PASS 1: Sheet Classification
        await notifyPassUpdate(onPassUpdate, 'pass1', 'in_progress', { description: getPassStatusDescription('pass1'), startedAt: new Date().toISOString() });
        const sheetInventory = await classifySheets(fileBuffers);
        await notifyPassUpdate(onPassUpdate, 'pass1', 'completed', {
            sheetInventory, sheetCount: sheetInventory.length,
            sheetTypes: [...new Set(sheetInventory.map(s => s.sheetType))], completedAt: new Date().toISOString()
        });

        // PASS 2: Deep Extraction (Parallel)
        await notifyPassUpdate(onPassUpdate, 'pass2', 'in_progress', { description: getPassStatusDescription('pass2'), startedAt: new Date().toISOString() });
        const extractedData = await deepExtraction(fileBuffers, sheetInventory);
        await notifyPassUpdate(onPassUpdate, 'pass2', 'completed', {
            extractedData: summarizeExtraction(extractedData),
            groupsProcessed: extractedData.extractionMeta?.groupsProcessed || [],
            groupsFailed: extractedData.extractionMeta?.groupsFailed || [],
            completedAt: new Date().toISOString()
        });

        // PASS 3: Quantity Takeoff
        await notifyPassUpdate(onPassUpdate, 'pass3', 'in_progress', { description: getPassStatusDescription('pass3'), startedAt: new Date().toISOString() });
        const boq = await quantityTakeoff(extractedData, measurementData, projectInfo);
        await notifyPassUpdate(onPassUpdate, 'pass3', 'completed', {
            steelItemCount: boq.steelItems.length, concreteItemCount: boq.concreteItems.length,
            rebarItemCount: boq.rebarItems.length, otherItemCount: boq.otherItems.length,
            totals: boq.totals, completedAt: new Date().toISOString()
        });

        // PASS 4: Cost Estimation
        await notifyPassUpdate(onPassUpdate, 'pass4', 'in_progress', { description: getPassStatusDescription('pass4'), startedAt: new Date().toISOString() });
        const estimate = await costEstimation(boq, projectInfo, answers);
        await notifyPassUpdate(onPassUpdate, 'pass4', 'completed', {
            grandTotal: estimate.summary?.grandTotal, currency: estimate.summary?.currency,
            tradeCount: estimate.trades?.length || 0, rateSourceBreakdown: estimate.structuralAnalysis?.rateSourceBreakdown,
            completedAt: new Date().toISOString()
        });

        // PASS 5: Validation
        await notifyPassUpdate(onPassUpdate, 'pass5', 'in_progress', { description: getPassStatusDescription('pass5'), startedAt: new Date().toISOString() });
        const finalEstimate = await validation(estimate, projectInfo, measurementData);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        finalEstimate._multiPassMeta = {
            engineVersion: 'multi-pass-v1', estimationId: estimationId || null,
            totalDurationSeconds: elapsed, passCount: 5, model: MODEL, timestamp: new Date().toISOString()
        };

        await notifyPassUpdate(onPassUpdate, 'pass5', 'completed', {
            confidenceScore: finalEstimate.validationReport?.finalConfidenceScore,
            confidenceLevel: finalEstimate.validationReport?.confidenceLevel,
            errors: finalEstimate.validationReport?.errors?.length || 0,
            warnings: finalEstimate.validationReport?.warnings?.length || 0,
            autoFixes: finalEstimate.validationReport?.autoFixes?.length || 0,
            totalDurationSeconds: elapsed, completedAt: new Date().toISOString()
        });

        console.log(`[MULTI-PASS] ========================================`);
        console.log(`[MULTI-PASS] Done in ${elapsed}s | Total: ${finalEstimate.summary?.grandTotal} ${finalEstimate.summary?.currency || ''} | Confidence: ${finalEstimate.validationReport?.confidenceLevel} (${finalEstimate.validationReport?.finalConfidenceScore}%)`);
        console.log(`[MULTI-PASS] ========================================`);
        return finalEstimate;

    } catch (error) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.error(`[MULTI-PASS] Engine failed after ${elapsed}s:`, error.message);
        console.error(`[MULTI-PASS] Stack:`, error.stack);
        await notifyPassUpdate(onPassUpdate, 'engine', 'failed', { error: error.message, failedAfterSeconds: elapsed, failedAt: new Date().toISOString() });

        // Fallback to single-pass estimation
        console.log('[MULTI-PASS] Falling back to single-pass generateAIEstimate...');
        try {
            const { generateAIEstimate } = await import('./aiEstimationService.js');
            const fallback = await generateAIEstimate(projectInfo, answers, fileNames, fileBuffers);
            if (fallback.structuralAnalysis) {
                fallback.structuralAnalysis.analysisMethod = 'SINGLE_PASS_FALLBACK - Multi-pass failed';
                fallback.structuralAnalysis.multiPassError = error.message;
            }
            fallback._multiPassMeta = {
                engineVersion: 'multi-pass-v1', fallback: true, fallbackReason: error.message,
                estimationId: estimationId || null, totalDurationSeconds: Math.round((Date.now() - startTime) / 1000),
                timestamp: new Date().toISOString()
            };
            await notifyPassUpdate(onPassUpdate, 'engine', 'fallback_completed', { grandTotal: fallback.summary?.grandTotal, fallbackReason: error.message, completedAt: new Date().toISOString() });
            return fallback;
        } catch (fbErr) {
            console.error('[MULTI-PASS] Fallback also failed:', fbErr.message);
            throw new Error(`Multi-pass failed: ${error.message}. Fallback failed: ${fbErr.message}`);
        }
    }
}

/** Compact summary of extraction data for Firestore storage. */
function summarizeExtraction(data) {
    if (!data) return null;
    return {
        sheetCount: data.sheetInventory?.length || 0,
        structuralMembers: ['beams', 'columns', 'bracing'].reduce((n, f) => n + (data.structural?.[f]?.length || 0), 0),
        foundationElements: ['footings', 'piles', 'gradeBeams'].reduce((n, f) => n + (data.foundation?.[f]?.length || 0), 0),
        scheduleEntries: ['beamSchedule', 'columnSchedule', 'memberList'].reduce((n, f) => n + (data.schedule?.[f]?.length || 0), 0),
        dimensions: data.dimensions || {},
        materialSpecs: {
            steelGrades: data.materialSpecs?.steelGrades?.length || 0,
            concreteGrades: data.materialSpecs?.concreteGrades?.length || 0,
            rebarGrades: data.materialSpecs?.rebarGrades?.length || 0
        },
        hasDesignLoads: !!(data.designLoads?.deadLoad || data.designLoads?.windSpeed),
        groupsProcessed: data.extractionMeta?.groupsProcessed || [],
        groupsFailed: data.extractionMeta?.groupsFailed || []
    };
}

export default { runMultiPassEstimation, getPassStatusDescription };
