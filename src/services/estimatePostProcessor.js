// src/services/estimatePostProcessor.js
// Post-processes AI estimation output to add labor breakdown, manpower summary,
// crew breakdown, equipment costs, and BOQ markups — all computed in code
// rather than asking the AI to generate them (saves ~40-50% output tokens).

import { getSteelWeightPerFoot, getLocationFactor, getUnitRate, classifySteelWeight } from '../data/costDatabase.js';
import { lookupSteelRate, lookupConcreteRate, lookupRate, detectCurrency } from './costLookupService.js';

// ─── Industry-standard labor split ratios ───────────────────────────────────
// Since DB rates are "installed" (all-in), we split using standard industry ratios.
// Source: RSMeans, ENR, typical contractor cost breakdowns.
const LABOR_SPLIT = {
    structural_steel:   { material: 0.45, labor: 0.40, equipment: 0.15 },
    concrete:           { material: 0.35, labor: 0.50, equipment: 0.15 },
    rebar:              { material: 0.50, labor: 0.45, equipment: 0.05 },
    masonry:            { material: 0.40, labor: 0.50, equipment: 0.10 },
    roofing:            { material: 0.50, labor: 0.40, equipment: 0.10 },
    mep_plumbing:       { material: 0.55, labor: 0.40, equipment: 0.05 },
    mep_hvac:           { material: 0.50, labor: 0.40, equipment: 0.10 },
    mep_electrical:     { material: 0.55, labor: 0.40, equipment: 0.05 },
    mep_fire:           { material: 0.50, labor: 0.40, equipment: 0.10 },
    architectural:      { material: 0.50, labor: 0.45, equipment: 0.05 },
    sitework:           { material: 0.20, labor: 0.40, equipment: 0.40 },
    general:            { material: 0.45, labor: 0.45, equipment: 0.10 },
};

// ─── Labor productivity rates (hours per unit of work) ──────────────────────
const LABOR_PRODUCTIVITY = {
    USD: {
        structural_steel_per_ton: 24,      // 24 hrs/ton for erection
        concrete_per_cy: 3.0,              // 3 hrs/CY for place & finish
        rebar_per_ton: 20,                 // 20 hrs/ton for placement
        roofing_per_sf: 0.025,             // 0.025 hrs/SF
        mep_plumbing_per_sf: 0.015,
        mep_hvac_per_sf: 0.025,
        mep_electrical_per_sf: 0.02,
        mep_fire_per_sf: 0.008,
        architectural_per_sf: 0.03,
        sitework_per_cy: 0.08,
        general_per_unit: 2,
    },
    INR: {
        structural_steel_per_ton: 40,      // India: more labor-intensive
        concrete_per_cy: 5.0,
        rebar_per_ton: 32,
        roofing_per_sf: 0.04,
        mep_plumbing_per_sf: 0.02,
        mep_hvac_per_sf: 0.035,
        mep_electrical_per_sf: 0.025,
        mep_fire_per_sf: 0.012,
        architectural_per_sf: 0.05,
        sitework_per_cy: 0.12,
        general_per_unit: 3,
    },
    AED: {
        structural_steel_per_ton: 28,
        concrete_per_cy: 3.5,
        rebar_per_ton: 24,
        roofing_per_sf: 0.03,
        mep_plumbing_per_sf: 0.018,
        mep_hvac_per_sf: 0.03,
        mep_electrical_per_sf: 0.022,
        mep_fire_per_sf: 0.01,
        architectural_per_sf: 0.035,
        sitework_per_cy: 0.1,
        general_per_unit: 2.5,
    },
    GBP: {
        structural_steel_per_ton: 22,
        concrete_per_cy: 2.8,
        rebar_per_ton: 18,
        roofing_per_sf: 0.022,
        mep_plumbing_per_sf: 0.014,
        mep_hvac_per_sf: 0.024,
        mep_electrical_per_sf: 0.018,
        mep_fire_per_sf: 0.008,
        architectural_per_sf: 0.028,
        sitework_per_cy: 0.07,
        general_per_unit: 1.8,
    }
};

// ─── Hourly labor rates by currency ─────────────────────────────────────────
const HOURLY_LABOR_RATES = {
    USD: { structural: 65, concrete: 50, rebar: 55, mep: 60, architectural: 45, sitework: 45, general: 40 },
    INR: { structural: 350, concrete: 280, rebar: 300, mep: 400, architectural: 250, sitework: 220, general: 200 },
    AED: { structural: 45, concrete: 35, rebar: 40, mep: 50, architectural: 35, sitework: 30, general: 28 },
    GBP: { structural: 55, concrete: 42, rebar: 48, mep: 52, architectural: 38, sitework: 38, general: 35 },
};

// ─── Standard crew compositions ─────────────────────────────────────────────
const CREW_TEMPLATES = [
    { trade: 'Structural Steel', crew: 'Ironworkers + Crane Operator', baseHeadcount: 6 },
    { trade: 'Concrete', crew: 'Concrete crew + Finishers', baseHeadcount: 8 },
    { trade: 'Rebar', crew: 'Rod busters', baseHeadcount: 4 },
    { trade: 'MEP - Plumbing', crew: 'Plumbers + Helpers', baseHeadcount: 3 },
    { trade: 'MEP - HVAC', crew: 'HVAC Technicians', baseHeadcount: 3 },
    { trade: 'MEP - Electrical', crew: 'Electricians + Helpers', baseHeadcount: 4 },
    { trade: 'MEP - Fire Protection', crew: 'Sprinkler fitters', baseHeadcount: 2 },
    { trade: 'Architectural Finishes', crew: 'Carpenters + Painters + Tilers', baseHeadcount: 8 },
    { trade: 'Roofing', crew: 'Roofers', baseHeadcount: 4 },
    { trade: 'Sitework', crew: 'Operators + Laborers', baseHeadcount: 4 },
    { trade: 'General Labor', crew: 'Helpers + Cleanup', baseHeadcount: 4 },
];

// ─── Default markup percentages ─────────────────────────────────────────────
const DEFAULT_MARKUPS = {
    generalConditionsPercent: 7,
    overheadPercent: 6,
    profitPercent: 8,
    contingencyPercent: 7,
    escalationPercent: 2,
};

/**
 * Main post-processor: enriches AI output with labor, equipment, manpower, and markups.
 * Call this AFTER getting the AI result, BEFORE sending to frontend.
 *
 * @param {object} estimate - The raw AI estimation result
 * @param {object} projectInfo - { location, currency, totalArea, projectType, ... }
 * @returns {object} - The enriched estimate
 */
export function enrichEstimateWithLaborAndMarkups(estimate, projectInfo = {}) {
    if (!estimate) return estimate;

    const currency = projectInfo.currency || detectCurrencyFromEstimate(estimate) || 'USD';
    const location = projectInfo.location || '';
    const locFactor = getLocationFactor(location).factor || 1.0;
    const productivity = LABOR_PRODUCTIVITY[currency] || LABOR_PRODUCTIVITY.USD;
    const laborRates = HOURLY_LABOR_RATES[currency] || HOURLY_LABOR_RATES.USD;

    const ms = estimate.materialSchedule;
    if (!ms) return estimate;

    // Track totals for manpower summary
    let totalLaborHours = 0;
    let totalLaborCost = 0;
    let totalMaterialCost = 0;
    let totalEquipmentCost = 0;
    const crewHoursMap = {}; // trade -> laborHours

    // ── 1. Enrich steel members ──────────────────────────────────────────────
    const steelMembers = ms.steelMembers || [];
    for (const m of steelMembers) {
        const totalCostRaw = Number(m.totalCost) || Number(m.unitRate) || 0;
        if (totalCostRaw <= 0) continue;

        // Calculate weight if not present
        if (!m.weightPerFt && m.section) {
            const wt = getSteelWeightPerFoot(m.section);
            if (wt.weight > 0) m.weightPerFt = wt.weight;
        }
        if (!m.totalWeightLbs && m.weightPerFt && m.count && m.lengthFt) {
            m.totalWeightLbs = m.count * m.weightPerFt * m.lengthFt;
            m.totalWeightTons = m.totalWeightLbs / 2000;
        }
        if (!m.calculation && m.count && m.weightPerFt && m.lengthFt) {
            m.calculation = `${m.count} x ${m.weightPerFt} lb/ft x ${m.lengthFt} ft = ${Number(m.totalWeightLbs || 0).toLocaleString()} lbs = ${Number(m.totalWeightTons || 0).toFixed(2)} tons`;
        }

        // Split installed cost into material/labor/equipment
        const split = LABOR_SPLIT.structural_steel;
        m.materialCost = Math.round(totalCostRaw * split.material);
        m.laborCost = Math.round(totalCostRaw * split.labor);
        m.equipmentCost = Math.round(totalCostRaw * split.equipment);
        m.totalCost = m.materialCost + m.laborCost + m.equipmentCost;

        // Calculate labor hours from tonnage
        const tons = Number(m.totalWeightTons) || 0;
        m.laborHours = Math.round(tons * productivity.structural_steel_per_ton);
        m.laborRate = laborRates.structural;

        totalMaterialCost += m.materialCost;
        totalLaborCost += m.laborCost;
        totalEquipmentCost += m.equipmentCost;
        totalLaborHours += m.laborHours;
        crewHoursMap['Structural Steel'] = (crewHoursMap['Structural Steel'] || 0) + m.laborHours;
    }

    // Update steel summary
    if (steelMembers.length > 0) {
        const stlSum = ms.steelSummary || {};
        stlSum.totalMaterialCost = steelMembers.reduce((s, m) => s + (Number(m.materialCost) || 0), 0);
        stlSum.totalLaborCost = steelMembers.reduce((s, m) => s + (Number(m.laborCost) || 0), 0);
        stlSum.totalSteelCost = steelMembers.reduce((s, m) => s + (Number(m.totalCost) || 0), 0);
        if (!stlSum.totalSteelTons) {
            stlSum.totalSteelTons = steelMembers.reduce((s, m) => s + (Number(m.totalWeightTons) || 0), 0);
        }
        ms.steelSummary = stlSum;
    }

    // ── 2. Enrich concrete items ─────────────────────────────────────────────
    const concreteItems = ms.concreteItems || [];
    for (const c of concreteItems) {
        const totalCostRaw = Number(c.totalCost) || Number(c.unitRate) || 0;
        if (totalCostRaw <= 0) continue;

        const split = LABOR_SPLIT.concrete;
        c.materialCost = Math.round(totalCostRaw * split.material);
        c.laborCost = Math.round(totalCostRaw * split.labor);
        c.equipmentCost = Math.round(totalCostRaw * split.equipment);
        c.totalCost = c.materialCost + c.laborCost + c.equipmentCost;

        const cy = Number(c.totalCY) || 0;
        c.laborHours = Math.round(cy * productivity.concrete_per_cy);
        c.laborRate = laborRates.concrete;

        totalMaterialCost += c.materialCost;
        totalLaborCost += c.laborCost;
        totalEquipmentCost += c.equipmentCost;
        totalLaborHours += c.laborHours;
        crewHoursMap['Concrete'] = (crewHoursMap['Concrete'] || 0) + c.laborHours;
    }

    if (concreteItems.length > 0) {
        const cncSum = ms.concreteSummary || {};
        cncSum.totalMaterialCost = concreteItems.reduce((s, c) => s + (Number(c.materialCost) || 0), 0);
        cncSum.totalLaborCost = concreteItems.reduce((s, c) => s + (Number(c.laborCost) || 0), 0);
        cncSum.totalConcreteCost = concreteItems.reduce((s, c) => s + (Number(c.totalCost) || 0), 0);
        ms.concreteSummary = cncSum;
    }

    // ── 3. Enrich MEP items ──────────────────────────────────────────────────
    enrichGenericItems(ms.mepItems, 'mep', productivity, laborRates, crewHoursMap, {
        totalMaterialCost, totalLaborCost, totalEquipmentCost, totalLaborHours
    }, (item) => {
        const cat = (item.category || '').toLowerCase();
        if (cat.includes('plumb')) return { split: LABOR_SPLIT.mep_plumbing, prodKey: 'mep_plumbing_per_sf', rateKey: 'mep', crewKey: 'MEP - Plumbing' };
        if (cat.includes('hvac') || cat.includes('mech')) return { split: LABOR_SPLIT.mep_hvac, prodKey: 'mep_hvac_per_sf', rateKey: 'mep', crewKey: 'MEP - HVAC' };
        if (cat.includes('electr')) return { split: LABOR_SPLIT.mep_electrical, prodKey: 'mep_electrical_per_sf', rateKey: 'mep', crewKey: 'MEP - Electrical' };
        if (cat.includes('fire')) return { split: LABOR_SPLIT.mep_fire, prodKey: 'mep_fire_per_sf', rateKey: 'mep', crewKey: 'MEP - Fire Protection' };
        return { split: LABOR_SPLIT.mep_plumbing, prodKey: 'mep_plumbing_per_sf', rateKey: 'mep', crewKey: 'MEP' };
    });
    // Collect running totals from helper
    const mepTotals = sumItems(ms.mepItems);
    totalMaterialCost += mepTotals.mat; totalLaborCost += mepTotals.lab;
    totalEquipmentCost += mepTotals.equip; totalLaborHours += mepTotals.hrs;

    // ── 4. Enrich architectural items ────────────────────────────────────────
    enrichSimpleItems(ms.architecturalItems, LABOR_SPLIT.architectural, productivity.architectural_per_sf, laborRates.architectural, 'Architectural Finishes', crewHoursMap);
    const archTotals = sumItems(ms.architecturalItems);
    totalMaterialCost += archTotals.mat; totalLaborCost += archTotals.lab;
    totalEquipmentCost += archTotals.equip; totalLaborHours += archTotals.hrs;

    if (ms.architecturalItems && ms.architecturalItems.length > 0) {
        ms.architecturalSummary = {
            totalMaterialCost: archTotals.mat,
            totalLaborCost: archTotals.lab,
            totalArchitecturalCost: archTotals.total
        };
    }

    // ── 5. Enrich roofing items ──────────────────────────────────────────────
    enrichSimpleItems(ms.roofingItems, LABOR_SPLIT.roofing, productivity.roofing_per_sf, laborRates.general, 'Roofing', crewHoursMap);
    const roofTotals = sumItems(ms.roofingItems);
    totalMaterialCost += roofTotals.mat; totalLaborCost += roofTotals.lab;
    totalEquipmentCost += roofTotals.equip; totalLaborHours += roofTotals.hrs;

    // ── 6. Enrich sitework items ─────────────────────────────────────────────
    enrichSimpleItems(ms.siteworkItems, LABOR_SPLIT.sitework, productivity.sitework_per_cy, laborRates.sitework, 'Sitework', crewHoursMap);
    const siteTotals = sumItems(ms.siteworkItems);
    totalMaterialCost += siteTotals.mat; totalLaborCost += siteTotals.lab;
    totalEquipmentCost += siteTotals.equip; totalLaborHours += siteTotals.hrs;

    // ── 7. Enrich other materials ────────────────────────────────────────────
    enrichSimpleItems(ms.otherMaterials, LABOR_SPLIT.general, productivity.general_per_unit, laborRates.general, 'General Labor', crewHoursMap);
    const otherTotals = sumItems(ms.otherMaterials);
    totalMaterialCost += otherTotals.mat; totalLaborCost += otherTotals.lab;
    totalEquipmentCost += otherTotals.equip; totalLaborHours += otherTotals.hrs;

    // ── 8. Build manpower summary ────────────────────────────────────────────
    const crewBreakdown = [];
    const hoursPerWeekPerPerson = 40;
    for (const tmpl of CREW_TEMPLATES) {
        const hours = crewHoursMap[tmpl.trade] || 0;
        if (hours <= 0) continue;
        const headcount = tmpl.baseHeadcount;
        const durationWeeks = Math.max(1, Math.ceil(hours / (headcount * hoursPerWeekPerPerson)));
        const tradeKey = tmpl.trade.toLowerCase().includes('steel') ? 'structural' :
            tmpl.trade.toLowerCase().includes('concrete') ? 'concrete' :
            tmpl.trade.toLowerCase().includes('mep') ? 'mep' :
            tmpl.trade.toLowerCase().includes('sitework') ? 'sitework' :
            tmpl.trade.toLowerCase().includes('architectural') ? 'architectural' : 'general';
        const hourlyRate = laborRates[tradeKey] || laborRates.general;
        crewBreakdown.push({
            trade: tmpl.trade,
            crew: tmpl.crew,
            headcount,
            durationWeeks,
            laborHours: Math.round(hours),
            laborCost: Math.round(hours * hourlyRate)
        });
    }

    // Estimated project duration = max of all crew durations
    const maxWeeks = crewBreakdown.reduce((mx, c) => Math.max(mx, c.durationWeeks), 0);
    const durationStr = maxWeeks > 0 ? `${maxWeeks}-${Math.ceil(maxWeeks * 1.3)} weeks` : 'TBD';

    ms.manpowerSummary = {
        totalLaborHours: Math.round(totalLaborHours),
        totalLaborCost: Math.round(totalLaborCost),
        totalMaterialCost: Math.round(totalMaterialCost),
        totalEquipmentCost: Math.round(totalEquipmentCost),
        crewBreakdown,
        estimatedProjectDuration: durationStr
    };

    // ── 9. Build BOQ markups ─────────────────────────────────────────────────
    // Use AI-provided markup percentages if available, otherwise use defaults
    const aiMarkups = ms.boqMarkups || {};
    const subtotalDirectCost = Math.round(totalMaterialCost + totalLaborCost + totalEquipmentCost);

    const gcPct = Number(aiMarkups.generalConditionsPercent) || DEFAULT_MARKUPS.generalConditionsPercent;
    const ohPct = Number(aiMarkups.overheadPercent) || DEFAULT_MARKUPS.overheadPercent;
    const prPct = Number(aiMarkups.profitPercent) || DEFAULT_MARKUPS.profitPercent;
    const ctPct = Number(aiMarkups.contingencyPercent) || DEFAULT_MARKUPS.contingencyPercent;
    const esPct = Number(aiMarkups.escalationPercent) || DEFAULT_MARKUPS.escalationPercent;

    const gc = Math.round(subtotalDirectCost * gcPct / 100);
    const oh = Math.round(subtotalDirectCost * ohPct / 100);
    const pr = Math.round(subtotalDirectCost * prPct / 100);
    const ct = Math.round(subtotalDirectCost * ctPct / 100);
    const es = Math.round(subtotalDirectCost * esPct / 100);
    const totalMarkupsAmt = gc + oh + pr + ct + es;

    ms.boqMarkups = {
        subtotalDirectCost,
        generalConditionsPercent: gcPct, generalConditions: gc,
        overheadPercent: ohPct, overhead: oh,
        profitPercent: prPct, profit: pr,
        contingencyPercent: ctPct, contingency: ct,
        escalationPercent: esPct, escalation: es,
        totalMarkups: totalMarkupsAmt,
        grandTotalWithMarkups: subtotalDirectCost + totalMarkupsAmt
    };

    // ── 10. Compute grand total material cost ────────────────────────────────
    ms.grandTotalMaterialCost = Math.round(totalMaterialCost + totalLaborCost + totalEquipmentCost);

    // Build weight summary string if not present
    if (!ms.totalMaterialWeight) {
        const steelTons = (ms.steelSummary || {}).totalSteelTons || 0;
        const concCY = (ms.concreteSummary || {}).totalConcreteCY || 0;
        const rebarTons = (ms.concreteSummary || {}).totalRebarTons || 0;
        const parts = [];
        if (steelTons > 0) parts.push(`Steel: ${steelTons.toFixed(1)} tons`);
        if (concCY > 0) parts.push(`Concrete: ${concCY.toFixed(0)} CY`);
        if (rebarTons > 0) parts.push(`Rebar: ${rebarTons.toFixed(1)} tons`);
        if (parts.length > 0) ms.totalMaterialWeight = parts.join(', ');
    }

    console.log(`[POST-PROCESSOR] Enriched: Material=${totalMaterialCost}, Labor=${totalLaborCost} (${totalLaborHours}hrs), Equipment=${totalEquipmentCost}, Markups=${totalMarkupsAmt}, Grand=${ms.boqMarkups.grandTotalWithMarkups}`);
    return estimate;
}

// ─── Helper: enrich simple item arrays ──────────────────────────────────────
function enrichSimpleItems(items, splitRatio, prodRate, hourlyRate, crewKey, crewHoursMap) {
    if (!items || items.length === 0) return;
    for (const item of items) {
        const totalCostRaw = Number(item.totalCost) || Number(item.unitRate) || 0;
        if (totalCostRaw <= 0) continue;

        // Only enrich if not already enriched
        if (item.materialCost > 0 && item.laborCost > 0) continue;

        item.materialCost = Math.round(totalCostRaw * splitRatio.material);
        item.laborCost = Math.round(totalCostRaw * splitRatio.labor);
        item.equipmentCost = Math.round(totalCostRaw * splitRatio.equipment);
        item.totalCost = item.materialCost + item.laborCost + item.equipmentCost;

        const qty = Number(item.quantity) || 0;
        item.laborHours = Math.round(qty * prodRate);
        item.laborRate = hourlyRate;

        crewHoursMap[crewKey] = (crewHoursMap[crewKey] || 0) + item.laborHours;
    }
}

// ─── Helper: enrich MEP items with category-aware splits ────────────────────
function enrichGenericItems(items, _type, productivity, laborRates, crewHoursMap, _totals, classifierFn) {
    if (!items || items.length === 0) return;
    for (const item of items) {
        const totalCostRaw = Number(item.totalCost) || Number(item.unitRate) || 0;
        if (totalCostRaw <= 0) continue;
        if (item.materialCost > 0 && item.laborCost > 0) continue;

        const { split, prodKey, rateKey, crewKey } = classifierFn(item);
        item.materialCost = Math.round(totalCostRaw * split.material);
        item.laborCost = Math.round(totalCostRaw * split.labor);
        item.equipmentCost = Math.round(totalCostRaw * split.equipment);
        item.totalCost = item.materialCost + item.laborCost + item.equipmentCost;

        const qty = Number(item.quantity) || 0;
        item.laborHours = Math.round(qty * (productivity[prodKey] || 0.02));
        item.laborRate = laborRates[rateKey] || laborRates.general;

        crewHoursMap[crewKey] = (crewHoursMap[crewKey] || 0) + item.laborHours;
    }
}

// ─── Helper: sum cost fields across an item array ───────────────────────────
function sumItems(items) {
    if (!items || items.length === 0) return { mat: 0, lab: 0, equip: 0, hrs: 0, total: 0 };
    return items.reduce((acc, i) => ({
        mat: acc.mat + (Number(i.materialCost) || 0),
        lab: acc.lab + (Number(i.laborCost) || 0),
        equip: acc.equip + (Number(i.equipmentCost) || 0),
        hrs: acc.hrs + (Number(i.laborHours) || 0),
        total: acc.total + (Number(i.totalCost) || 0),
    }), { mat: 0, lab: 0, equip: 0, hrs: 0, total: 0 });
}

// ─── Helper: detect currency from estimate ──────────────────────────────────
function detectCurrencyFromEstimate(estimate) {
    const sym = (estimate.summary || {}).currencySymbol || '';
    if (sym === '$' || sym === 'USD') return 'USD';
    if (sym === '₹' || sym === 'INR') return 'INR';
    if (sym.includes('د') || sym === 'AED') return 'AED';
    if (sym === '£' || sym === 'GBP') return 'GBP';
    const curr = (estimate.summary || {}).currency || '';
    if (curr.includes('INR') || curr.includes('Rupee')) return 'INR';
    if (curr.includes('AED') || curr.includes('Dirham')) return 'AED';
    if (curr.includes('GBP') || curr.includes('Pound')) return 'GBP';
    return 'USD';
}
