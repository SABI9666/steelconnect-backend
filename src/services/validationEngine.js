// src/services/validationEngine.js
// Comprehensive Validation Engine for Construction Cost Estimates
// Validates arithmetic, quantities, unit rates, benchmarks, trade completeness,
// cross-trade consistency, and computes confidence scores.

import {
  getUnitRate, getBenchmarkRange, getLocationFactor,
  getSteelWeightPerFoot, classifySteelWeight, UNIT_RATES, BENCHMARK_RANGES
} from '../data/costDatabase.js';

// Expected trades by project type
const EXPECTED_TRADES = {
  industrial: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Sitework', 'Exterior Cladding'],
  warehouse: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Sitework', 'Exterior Cladding'],
  commercial: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Exterior Cladding', 'Elevator', 'Fire Protection'],
  retail: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Exterior Cladding', 'Sitework'],
  residential_single: ['Foundation', 'Framing', 'Roofing', 'MEP', 'Finishes', 'Exterior Cladding', 'Sitework'],
  residential_multi: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Elevator', 'Fire Protection', 'Sitework'],
  healthcare: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Elevator', 'Fire Protection', 'Exterior Cladding', 'Specialty Systems'],
  educational: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Exterior Cladding', 'Sitework', 'Fire Protection'],
  hospitality: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Elevator', 'Fire Protection', 'Exterior Cladding', 'Specialty Systems'],
  peb: ['Structural Steel', 'Foundation', 'Roofing', 'MEP', 'Exterior Cladding', 'Sitework'],
  mixed_use: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Finishes', 'Elevator', 'Fire Protection', 'Exterior Cladding', 'Sitework'],
  data_center: ['Structural Steel', 'Concrete', 'Foundation', 'Roofing', 'MEP', 'Fire Protection', 'Exterior Cladding', 'Specialty Systems', 'Sitework'],
  parking: ['Structural Steel', 'Concrete', 'Foundation', 'MEP', 'Sitework']
};

// Cross-trade percentage ranges (% of direct costs)
const TRADE_PCT_RANGES = {
  foundation: { low: 5, high: 15, label: 'Foundation' },
  mep: { low: 25, high: 35, label: 'MEP (Mechanical/Electrical/Plumbing)' },
  structural: { low: 20, high: 40, label: 'Structural (Steel + Concrete)' },
  finishes: { low: 10, high: 25, label: 'Finishes' },
  sitework: { low: 3, high: 12, label: 'Sitework' },
  roofing: { low: 3, high: 10, label: 'Roofing' }
};

/** Parse numeric area from a string like "50,000 sq ft" */
function parseArea(areaStr) {
  const m = String(areaStr || '').match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/** Normalize a project type string to a lookup key */
function normalizeProjectType(pt) {
  return (pt || 'commercial').toLowerCase()
    .replace(/[\s\-\/]+/g, '_')
    .replace(/pre_engineered|peb|pre_eng/i, 'peb')
    .replace(/office/, 'commercial')
    .replace(/factory|manufacturing/, 'industrial');
}

// ============ 1. ARITHMETIC VALIDATION ============

function arithmeticValidation(estimate) {
  const issues = [];
  let fixedCount = 0;
  if (!estimate?.trades) {
    issues.push({ severity: 'critical', category: 'arithmetic', message: 'Estimate missing trades array', autoFixed: false });
    return { issues, fixedCount };
  }
  const trades = estimate.trades;
  const cb = estimate.costBreakdown || {};
  const summary = estimate.summary || {};

  // Fix every line item: lineTotal = quantity x unitRate
  for (const trade of trades) {
    for (const li of (trade.lineItems || [])) {
      const qty = Number(li.quantity) || 0;
      if ((Number(li.unitRate) || 0) === 0 && (li.materialCost || li.laborCost || li.equipmentCost))
        li.unitRate = (Number(li.materialCost) || 0) + (Number(li.laborCost) || 0) + (Number(li.equipmentCost) || 0);
      if ((Number(li.unitRate) || 0) === 0 && li.unitTotal) li.unitRate = Number(li.unitTotal) || 0;
      const correct = Math.round(qty * (Number(li.unitRate) || 0) * 100) / 100;
      if (correct > 0 && Math.abs(correct - (Number(li.lineTotal) || 0)) > 1) {
        issues.push({ severity: 'warning', category: 'arithmetic', message: `Line "${li.description}" lineTotal corrected: ${li.lineTotal} -> ${correct}`, autoFixed: true });
        li.lineTotal = correct;
        fixedCount++;
      }
    }
  }
  // Fix trade subtotals
  for (const trade of trades) {
    if (!trade.lineItems?.length) continue;
    const sum = Math.round(trade.lineItems.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0) * 100) / 100;
    if (sum > 0 && Math.abs(sum - (Number(trade.subtotal) || 0)) > 1) {
      issues.push({ severity: 'warning', category: 'arithmetic', message: `Trade "${trade.tradeName}" subtotal corrected: ${trade.subtotal} -> ${sum}`, autoFixed: true });
      trade.subtotal = sum;
      fixedCount++;
    }
  }
  // Fix directCosts
  const calcDirect = Math.round(trades.reduce((s, t) => s + (Number(t.subtotal) || 0), 0) * 100) / 100;
  if (Math.abs(calcDirect - (Number(cb.directCosts) || 0)) > 1) {
    issues.push({ severity: 'warning', category: 'arithmetic', message: `directCosts corrected: ${cb.directCosts} -> ${calcDirect}`, autoFixed: true });
    cb.directCosts = calcDirect;
    fixedCount++;
  }
  // Cap markups
  const markupFields = ['generalConditions', 'overhead', 'profit', 'contingency', 'escalation'];
  let totalPct = 0;
  for (const f of markupFields) {
    if (cb[f + 'Percent'] > 15) { cb[f + 'Percent'] = 15; fixedCount++; issues.push({ severity: 'warning', category: 'arithmetic', message: `${f} capped at 15%`, autoFixed: true }); }
    totalPct += Number(cb[f + 'Percent']) || 0;
  }
  if (totalPct > 40) {
    const scale = 40 / totalPct;
    issues.push({ severity: 'warning', category: 'arithmetic', message: `Combined markup ${totalPct.toFixed(1)}% exceeds 40% cap, scaling down`, autoFixed: true });
    for (const f of markupFields) { if (cb[f + 'Percent'] > 0) cb[f + 'Percent'] = Math.round(cb[f + 'Percent'] * scale * 100) / 100; }
    fixedCount++;
  }
  let totalMarkups = 0;
  for (const f of markupFields) {
    if (cb[f + 'Percent'] > 0) {
      const recalc = Math.round(cb.directCosts * (cb[f + 'Percent'] / 100) * 100) / 100;
      if (Math.abs(recalc - (Number(cb[f]) || 0)) > 1) { cb[f] = recalc; fixedCount++; issues.push({ severity: 'info', category: 'arithmetic', message: `${f} amount corrected to ${recalc}`, autoFixed: true }); }
    }
    totalMarkups += Number(cb[f]) || 0;
  }
  // Fix totalWithMarkups and grandTotal
  const calcTotal = Math.round((cb.directCosts + totalMarkups) * 100) / 100;
  if (Math.abs(calcTotal - (Number(cb.totalWithMarkups) || 0)) > 1) {
    issues.push({ severity: 'warning', category: 'arithmetic', message: `totalWithMarkups corrected: ${cb.totalWithMarkups} -> ${calcTotal}`, autoFixed: true });
    cb.totalWithMarkups = calcTotal; fixedCount++;
  }
  if (Math.abs(calcTotal - (Number(summary.grandTotal) || 0)) > 1) {
    issues.push({ severity: 'critical', category: 'arithmetic', message: `grandTotal corrected: ${summary.grandTotal} -> ${calcTotal}`, autoFixed: true });
    summary.grandTotal = calcTotal; fixedCount++;
  }
  // Fix tradesSummary
  if (Array.isArray(estimate.tradesSummary)) {
    for (const ts of estimate.tradesSummary) {
      const mt = trades.find(t => t.tradeName === ts.tradeName);
      if (mt && Math.abs((mt.subtotal || 0) - (ts.amount || 0)) > 1) { ts.amount = mt.subtotal; fixedCount++; }
    }
  }
  // Recalculate costPerUnit and percentOfTotal
  const area = parseArea(summary.totalArea);
  if (area > 0 && summary.grandTotal) summary.costPerUnit = Math.round((summary.grandTotal / area) * 100) / 100;
  if (cb.directCosts > 0) for (const t of trades) t.percentOfTotal = Math.round((t.subtotal / cb.directCosts) * 10000) / 100;

  return { issues, fixedCount };
}

// ============ 2. QUANTITY REASONABLENESS CHECK ============

function quantityReasonablenessCheck(estimate, projectInfo) {
  const issues = [];
  if (!estimate?.trades) return issues;
  const totalAreaSF = parseArea(projectInfo?.totalArea || estimate.summary?.totalArea);
  let steelTons = 0, concreteCY = 0, rebarTons = 0, foundationCost = 0, structuralCost = 0;

  for (const trade of estimate.trades) {
    const name = (trade.tradeName || '').toLowerCase();
    if (/foundation/i.test(name)) foundationCost += Number(trade.subtotal) || 0;
    if (/structural|steel|concrete|rebar|reinforc|foundation/i.test(name)) structuralCost += Number(trade.subtotal) || 0;
    for (const li of (trade.lineItems || [])) {
      const d = (li.description || '').toLowerCase(), u = (li.unit || '').toLowerCase(), q = Number(li.quantity) || 0;
      if (/steel|w\d+x|hss|joist/i.test(d) && /ton/i.test(u)) steelTons += q;
      if (/concrete|slab|footing|foundation|grade beam/i.test(d) && /cy|cum|m³/i.test(u)) concreteCY += q;
      if (/rebar|reinforc|tmt|wwf/i.test(d) && /ton|mt/i.test(u)) rebarTons += q;
    }
  }
  // Steel PSF check (typical 5-15, flag 3-25)
  if (totalAreaSF > 0 && steelTons > 0) {
    const psf = (steelTons * 2000) / totalAreaSF;
    if (psf < 3) issues.push({ severity: 'warning', category: 'quantity', message: `Steel very low at ${psf.toFixed(1)} PSF (typical 5-15)`, autoFixed: false });
    else if (psf > 25) issues.push({ severity: 'critical', category: 'quantity', message: `Steel very high at ${psf.toFixed(1)} PSF (typical 5-15). Possible double-count.`, autoFixed: false });
    else if (psf < 5 || psf > 15) issues.push({ severity: 'info', category: 'quantity', message: `Steel at ${psf.toFixed(1)} PSF outside typical 5-15 range but within 3-25 bounds.`, autoFixed: false });
  }
  // Concrete CF/SF (typical 0.5-2.0)
  if (totalAreaSF > 0 && concreteCY > 0) {
    const cfSf = (concreteCY * 27) / totalAreaSF;
    if (cfSf < 0.5) issues.push({ severity: 'warning', category: 'quantity', message: `Concrete low at ${cfSf.toFixed(2)} CF/SF (typical 0.5-2.0)`, autoFixed: false });
    else if (cfSf > 2.0) issues.push({ severity: 'warning', category: 'quantity', message: `Concrete high at ${cfSf.toFixed(2)} CF/SF (typical 0.5-2.0)`, autoFixed: false });
  }
  // Rebar lbs/CY (typical 80-150)
  if (concreteCY > 0 && rebarTons > 0) {
    const lbsCY = (rebarTons * 2000) / concreteCY;
    if (lbsCY < 80) issues.push({ severity: 'warning', category: 'quantity', message: `Rebar ratio low at ${lbsCY.toFixed(0)} lbs/CY (typical 80-150)`, autoFixed: false });
    else if (lbsCY > 150) issues.push({ severity: 'warning', category: 'quantity', message: `Rebar ratio high at ${lbsCY.toFixed(0)} lbs/CY (typical 80-150)`, autoFixed: false });
  }
  // Foundation % of structural (typical 5-15%)
  if (structuralCost > 0 && foundationCost > 0) {
    const pct = (foundationCost / structuralCost) * 100;
    if (pct < 5) issues.push({ severity: 'warning', category: 'quantity', message: `Foundation only ${pct.toFixed(1)}% of structural (typical 5-15%)`, autoFixed: false });
    else if (pct > 15) issues.push({ severity: 'info', category: 'quantity', message: `Foundation ${pct.toFixed(1)}% of structural (typical 5-15%). Could indicate challenging soils.`, autoFixed: false });
  }
  return issues;
}

// ============ 3. UNIT RATE VALIDATION ============

function matchRateCategory(desc, unit, curr) {
  const d = desc.toLowerCase(), u = unit.toLowerCase();
  // Structural Steel
  if (/steel|w\d+x|hss|joist|ismb|ismc|hea|heb|ipe|ub\d|uc\d|pfc/i.test(d) && /ton|mt/i.test(u)) {
    if (/hss|tube|hollow|shs|rhs|chs/i.test(d)) return ['structural_steel', 'hss'];
    if (/joist/i.test(d)) return ['structural_steel', 'joists'];
    if (/misc|connection|plate|angle|gusset|base.plate|stiffener/i.test(d)) return ['structural_steel', 'misc_steel'];
    if (/peb|pre.eng|purlin|girt|z.section|c.section/i.test(d)) return ['structural_steel', curr === 'INR' ? 'peb' : 'light'];
    if (/light|w\d+x\d{1,2}$|ismb[123]\d{2}|ipe[12]\d{2}|hea[12]\d{2}/i.test(d)) return ['structural_steel', 'light'];
    if (/heavy|w\d+x[2-9]\d{2}|ismb[5-9]\d{2}|heb[4-9]\d{2}/i.test(d)) return ['structural_steel', 'heavy'];
    return ['structural_steel', 'medium'];
  }
  // Metal Deck
  if (/deck|metal.deck/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['structural_steel', 'deck'];
  // Concrete (volumetric)
  if (/concrete|slab|footing|foundation|grade.beam|pile.cap|raft|retaining/i.test(d) && /cy|cum|m³|m3/i.test(u)) {
    if (curr === 'INR') return ['concrete', /m40|m45|m50/i.test(d) ? 'M40' : /m25/i.test(d) ? 'M25' : 'M30'];
    if (curr === 'AED' || curr === 'GBP' || curr === 'EUR' || curr === 'SAR') return ['concrete', /c50/i.test(d) ? 'C50' : /c30/i.test(d) ? 'C30' : 'C40'];
    return ['concrete', /5000/i.test(d) ? '5000psi' : /3000/i.test(d) ? '3000psi' : '4000psi'];
  }
  // Concrete (area-based)
  if (/slab.on.grade|sog/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['concrete', 'slab_on_grade'];
  if (/elevated.slab/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['concrete', 'elevated_slab'];
  if (/formwork.*wall|wall.*formwork/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['concrete', 'formwork_wall'];
  if (/formwork.*col|col.*formwork/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['concrete', 'formwork_column'];
  // Rebar
  if (/rebar|reinforc|tmt|bar.bend|bbs/i.test(d) && /ton|mt/i.test(u)) {
    if (curr === 'INR') return ['rebar', /fe500d/i.test(d) ? 'Fe500D' : 'Fe500'];
    if (curr === 'AED') return ['rebar', /500/i.test(d) ? 'grade500' : 'grade460'];
    if (curr === 'GBP' || curr === 'EUR') return ['rebar', 'B500B'];
    if (curr === 'AUD') return ['rebar', 'D500N'];
    return ['rebar', /75/i.test(d) ? 'grade75' : 'grade60'];
  }
  if (/wwf|welded.wire/i.test(d) && /sf|sqft/i.test(u)) return ['rebar', 'wwf'];
  // Masonry
  if (/cmu|masonry|block.*wall/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['masonry', /12/i.test(d) ? 'cmu_12' : 'cmu_8'];
  if (/brick/i.test(d) && /sf|sqft|sqm/i.test(u)) return curr === 'INR' ? ['masonry', 'brick_230'] : ['masonry', 'brick_veneer'];
  if (/aac|autoclaved/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['masonry', 'aac_200'];
  // Roofing
  if (/standing.seam|metal.roof/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', 'standing_seam'];
  if (/tpo|single.ply/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', 'tpo_single_ply'];
  if (/built.up|bur/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', 'built_up'];
  if (/sandwich.panel|puf|insulated.panel/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', curr === 'INR' ? 'sandwich_panel' : 'standing_seam'];
  if (/metal.sheet|profile.sheet|color.coated/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', curr === 'INR' ? 'metal_sheet' : 'standing_seam'];
  if (/insulation|rigid.insul/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', 'insulation'];
  // MEP
  if (/hvac|mechanical|air.cond|ahu|ductwork|vrf|chiller/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'hvac'];
  if (/plumbing|piping|fixture|water.heater|pump|drain/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'plumbing'];
  if (/electrical|wiring|lighting|panel|generator|transformer/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'electrical'];
  if (/fire.prot|sprinkler|fire.alarm|smoke.detect/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'fire_protection'];
  // Sitework
  if (/excavat|bulk.excav/i.test(d) && /cy|cum|m³/i.test(u)) return ['sitework', 'excavation'];
  if (/backfill|compacted.fill/i.test(d) && /cy|cum|m³/i.test(u)) return ['sitework', 'backfill'];
  if (/grading|fine.grad/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['sitework', 'grading'];
  if (/asphalt|asphalt.pav/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['sitework', 'paving_asphalt'];
  if (/concrete.pav/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['sitework', 'paving_concrete'];
  // Finishes
  if (/drywall|gypsum|gyp.board/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['finishes', 'drywall'];
  if (/paint|painting/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['finishes', 'painting'];
  if (/vct|vinyl.tile/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['finishes', 'flooring_vct'];
  if (/carpet/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['finishes', 'flooring_carpet'];
  if (/ceiling.*tile|act|acoustic.ceil/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['finishes', 'ceiling_act'];
  return null;
}

/** Convert DB rate to match line item unit (handles sqm↔sqft, cum↔CY mismatch) */
function convertDbRate(dbRate, dbUnit, liUnit) {
  const db = (dbUnit || '').toLowerCase();
  const li = (liUnit || '').toLowerCase();
  // sqm ↔ sqft conversion
  if ((db === 'sqm' || db === 'sq m' || db === 'm2') && /sf|sqft|sq ft|ft2/.test(li)) {
    return dbRate / 10.7639; // sqm → sqft
  }
  if (/sf|sqft|sq ft/.test(db) && (li === 'sqm' || li === 'sq m' || li === 'm2')) {
    return dbRate * 10.7639; // sqft → sqm
  }
  // cum ↔ CY conversion
  if ((db === 'cum' || db === 'm3' || db === 'm³') && /cy/i.test(li)) {
    return dbRate * 0.7646; // cum → CY
  }
  if (/cy/i.test(db) && (li === 'cum' || li === 'm3' || li === 'm³')) {
    return dbRate / 0.7646; // CY → cum
  }
  return dbRate; // same unit or unknown - use as-is
}

function unitRateValidation(estimate, currency, location) {
  const issues = [];
  let dbBacked = 0, aiEstimated = 0, total = 0;
  if (!estimate?.trades) return { issues, rateSourceSummary: { dbBacked: 0, aiEstimated: 0, total: 0, dbPercentage: 0 } };
  const curr = currency || estimate.summary?.currency || 'USD';
  const factor = getLocationFactor(location || estimate.summary?.location || '').factor;

  for (const trade of estimate.trades) {
    for (const li of (trade.lineItems || [])) {
      total++;
      const rate = Number(li.unitRate) || 0;
      if (rate === 0) continue;
      const match = matchRateCategory(li.description || '', li.unit || '', curr);
      if (match) {
        const rateData = getUnitRate(curr, match[0], match[1]);
        if (rateData) {
          // Convert DB rate to match line item unit (handles sqm↔sqft, cum↔CY)
          const rawDbRate = rateData.rate * factor;
          const converted = convertDbRate(rawDbRate, rateData.unit, li.unit);
          const dbRate = Math.round(converted);
          const dbRange = rateData.range.map(r => Math.round(convertDbRate(r * factor, rateData.unit, li.unit)));

          dbBacked++; li.rateSource = 'DB';
          li.dbRate = dbRate;
          li.dbRange = dbRange;
          const deviation = Math.abs(rate - dbRate) / dbRate;

          // Rate correction: Use regional DB rate when AI deviates significantly
          if (rate < dbRange[0] || rate > dbRange[1]) {
            const oldRate = li.unitRate;
            li.unitRate = dbRate;
            li.lineTotal = Math.round((Number(li.quantity) || 0) * dbRate * 100) / 100;
            const severity = deviation > 0.5 ? 'critical' : 'warning';
            issues.push({ severity, category: 'unitRate', message: `"${li.description}" rate ${oldRate}→${dbRate}/${li.unit} (regional DB: ${dbRange[0]}-${dbRange[1]}). Corrected to ${location || 'regional'} market rate.`, autoFixed: true });
          } else if (deviation > 0.15) {
            const nudgedRate = Math.round((rate * 0.4 + dbRate * 0.6));
            li.unitRate = nudgedRate;
            li.lineTotal = Math.round((Number(li.quantity) || 0) * nudgedRate * 100) / 100;
            issues.push({ severity: 'info', category: 'unitRate', message: `"${li.description}" rate ${rate}→${nudgedRate}/${li.unit} (nudged toward regional DB ${dbRate}).`, autoFixed: true });
          }
        } else { aiEstimated++; li.rateSource = 'EST'; }
      } else { aiEstimated++; li.rateSource = 'EST'; }
    }
  }
  return { issues, rateSourceSummary: { dbBacked, aiEstimated, total, dbPercentage: total > 0 ? Math.round((dbBacked / total) * 100) : 0 } };
}

// ============ 4. BENCHMARK CHECK + AUTO-CORRECTION ============

function benchmarkCheck(estimate, projectInfo) {
  const issues = [];
  if (!estimate?.summary) return { issues, benchmarkComparison: null };
  const cb = estimate.costBreakdown || {};
  const summary = estimate.summary;
  const curr = summary.currency || 'USD';
  let grandTotal = Number(summary.grandTotal) || 0;
  if (!grandTotal) return { issues, benchmarkComparison: null };
  const areaRaw = parseArea(projectInfo?.totalArea || summary.totalArea);
  if (!areaRaw) { issues.push({ severity: 'info', category: 'benchmark', message: 'Cannot benchmark: no area specified.', autoFixed: false }); return { issues, benchmarkComparison: null }; }

  // Convert area to sqft if input is in sqm (benchmarks are per sqft)
  const areaStr = String(projectInfo?.totalArea || summary.totalArea || '').toLowerCase();
  const isMetric = /sqm|sq m|m2|meter|metre/.test(areaStr);
  const areaSqFt = isMetric ? areaRaw * 10.7639 : areaRaw;

  let costPerUnit = grandTotal / areaSqFt;
  const pt = normalizeProjectType(projectInfo?.projectType || summary.projectType);
  const bm = getBenchmarkRange(curr, pt);
  if (!bm) { issues.push({ severity: 'info', category: 'benchmark', message: `No benchmark for "${pt}" in ${curr}.`, autoFixed: false }); return { issues, benchmarkComparison: null }; }

  // AUTO-CORRECTION: If cost/sqft exceeds benchmark high, scale down ALL rates proportionally
  // Target: bring estimate to benchmark mid-high range (75th percentile)
  if (costPerUnit > bm.high) {
    const targetCostPerUnit = bm.mid + (bm.high - bm.mid) * 0.5; // target 75th percentile
    const scaleFactor = targetCostPerUnit / costPerUnit;
    const oldTotal = grandTotal;

    // Scale every line item's unitRate and lineTotal
    for (const trade of (estimate.trades || [])) {
      for (const li of (trade.lineItems || [])) {
        li.unitRate = Math.round((Number(li.unitRate) || 0) * scaleFactor * 100) / 100;
        li.lineTotal = Math.round((Number(li.quantity) || 0) * li.unitRate * 100) / 100;
      }
      trade.subtotal = Math.round(trade.lineItems.reduce((s, li) => s + (Number(li.lineTotal) || 0), 0) * 100) / 100;
    }

    // Recalculate directCosts, markups, grandTotal
    const newDirect = Math.round((estimate.trades || []).reduce((s, t) => s + (Number(t.subtotal) || 0), 0) * 100) / 100;
    cb.directCosts = newDirect;
    let totalMarkups = 0;
    for (const f of ['generalConditions', 'overhead', 'profit', 'contingency', 'escalation']) {
      if (cb[f + 'Percent'] > 0) {
        cb[f] = Math.round(newDirect * (cb[f + 'Percent'] / 100) * 100) / 100;
      }
      totalMarkups += Number(cb[f]) || 0;
    }
    cb.totalWithMarkups = Math.round((newDirect + totalMarkups) * 100) / 100;
    summary.grandTotal = cb.totalWithMarkups;
    grandTotal = summary.grandTotal;
    costPerUnit = grandTotal / areaSqFt;

    issues.push({ severity: 'critical', category: 'benchmark',
      message: `Estimate scaled to normal range: ${curr} ${Math.round(oldTotal).toLocaleString()} → ${curr} ${Math.round(grandTotal).toLocaleString()} (${Math.round(costPerUnit)}/sqft, benchmark ${bm.low}-${bm.high} for ${bm.label})`,
      autoFixed: true });
  }

  const status = costPerUnit < bm.low ? 'below' : costPerUnit > bm.high ? 'above' : 'within';
  const benchmarkComparison = { projectType: bm.label || pt, currency: curr, costPerUnit: Math.round(costPerUnit * 100) / 100, benchmarkLow: bm.low, benchmarkMid: bm.mid, benchmarkHigh: bm.high, status, unit: bm.unit || 'sqft' };

  if (costPerUnit < bm.low / 1.5) issues.push({ severity: 'critical', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft far below range (${bm.low}-${bm.high} for ${bm.label}). Estimate may be incomplete.`, autoFixed: false });
  else if (costPerUnit < bm.low) issues.push({ severity: 'warning', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft below benchmark low ${bm.low} for ${bm.label}.`, autoFixed: false });
  return { issues, benchmarkComparison };
}

// ============ 5. TRADE COMPLETENESS CHECK ============

function tradeCompletenessCheck(estimate, projectType) {
  const issues = [];
  const nType = normalizeProjectType(projectType);
  const expected = EXPECTED_TRADES[nType] || EXPECTED_TRADES['commercial'];
  const presentNames = (estimate.trades || []).map(t => (t.tradeName || '').toLowerCase());
  const present = [], missing = [];

  for (const exp of expected) {
    const el = exp.toLowerCase();
    const found = presentNames.some(pn =>
      pn.includes(el) || el.includes(pn) ||
      (el === 'mep' && /mechanical|electrical|plumbing|hvac|mep/i.test(pn)) ||
      (el === 'exterior cladding' && /cladding|enclosure|envelope|siding|curtain/i.test(pn)) ||
      (el === 'finishes' && /finish|interior|drywall|paint|floor|ceiling/i.test(pn)) ||
      (el === 'fire protection' && /fire|sprinkler/i.test(pn)) ||
      (el === 'framing' && /frame|framing|wood/i.test(pn)) ||
      (el === 'elevator' && /elevator|lift|vertical/i.test(pn)) ||
      (el === 'specialty systems' && /special|clean.room|data|security/i.test(pn)) ||
      (el === 'structural steel' && /steel|structural/i.test(pn)) ||
      (el === 'concrete' && /concrete|masonry/i.test(pn)) ||
      (el === 'foundation' && /foundation|footing|pile/i.test(pn)) ||
      (el === 'roofing' && /roof/i.test(pn)) ||
      (el === 'sitework' && /site|earth|excavat|paving|grading|landscape/i.test(pn))
    );
    (found ? present : missing).push(exp);
  }
  if (missing.length) {
    const crit = missing.filter(m => /foundation|structural|concrete|roofing|mep/i.test(m));
    const other = missing.filter(m => !/foundation|structural|concrete|roofing|mep/i.test(m));
    if (crit.length) issues.push({ severity: 'critical', category: 'completeness', message: `Missing critical trades for ${nType}: ${crit.join(', ')}`, autoFixed: false });
    if (other.length) issues.push({ severity: 'warning', category: 'completeness', message: `Missing expected trades: ${other.join(', ')}`, autoFixed: false });
  }
  return { issues, tradeCompleteness: { expected, present, missing } };
}

// ============ 6. CROSS-TRADE CONSISTENCY ============

function crossTradeConsistency(estimate) {
  const issues = [];
  const dc = Number(estimate?.costBreakdown?.directCosts) || 0;
  if (!dc || !estimate?.trades) return issues;
  const buckets = { foundation: 0, mep: 0, structural: 0, finishes: 0, sitework: 0, roofing: 0 };
  for (const t of estimate.trades) {
    const n = (t.tradeName || '').toLowerCase(), s = Number(t.subtotal) || 0;
    if (/foundation|footing|pile/i.test(n)) buckets.foundation += s;
    if (/mep|mechanical|electrical|plumbing|hvac|fire.prot|sprinkler/i.test(n)) buckets.mep += s;
    if (/structural|steel|concrete|rebar|reinforc|masonry/i.test(n)) buckets.structural += s;
    if (/finish|interior|drywall|paint|floor|ceiling|carpet/i.test(n)) buckets.finishes += s;
    if (/site|earth|excavat|paving|grading|landscape/i.test(n)) buckets.sitework += s;
    if (/roof/i.test(n)) buckets.roofing += s;
  }
  for (const [key, amt] of Object.entries(buckets)) {
    if (!amt) continue;
    const r = TRADE_PCT_RANGES[key];
    if (!r) continue;
    const pct = (amt / dc) * 100;
    if (pct < r.low * 0.5) issues.push({ severity: 'warning', category: 'consistency', message: `${r.label} at ${pct.toFixed(1)}% well below typical ${r.low}-${r.high}%`, autoFixed: false });
    else if (pct > r.high * 1.5) issues.push({ severity: 'warning', category: 'consistency', message: `${r.label} at ${pct.toFixed(1)}% well above typical ${r.low}-${r.high}%`, autoFixed: false });
  }
  return issues;
}

// ============ 7. PDF MEASUREMENT CROSS-CHECK ============

function pdfMeasurementCrossCheck(estimate, measurementData) {
  const issues = [];
  if (!measurementData || !estimate?.trades) return issues;

  // Get PDF-extracted member counts and sizes
  const pdfMembers = measurementData.combined?.memberSizes || measurementData.memberSizes || {};
  const pdfSchedules = measurementData.combined?.scheduleEntries || measurementData.scheduleEntries || [];
  const pdfDimensions = measurementData.combined?.dimensions || measurementData.dimensions || {};

  // Count AI-estimated steel members
  const ms = estimate.materialSchedule;
  const aiSteelMembers = ms?.steelMembers || [];
  let aiSteelCount = aiSteelMembers.reduce((s, m) => s + (Number(m.count) || 0), 0);

  // Count PDF-extracted steel members from schedules
  let pdfSteelCount = 0;
  if (Array.isArray(pdfSchedules)) {
    pdfSteelCount = pdfSchedules.reduce((s, entry) => s + (Number(entry.qty) || 1), 0);
  }

  // Count PDF-extracted member sizes
  const pdfWShapes = (pdfMembers.wShapes || []).length;
  const pdfIndian = (pdfMembers.indianSections || []).length;
  const pdfEuro = (pdfMembers.euroSections || []).length;
  const pdfHSS = (pdfMembers.hss || []).length;
  const totalPdfSections = pdfWShapes + pdfIndian + pdfEuro + pdfHSS;

  // Cross-check: PDF found sections but AI has none
  if (totalPdfSections > 0 && aiSteelMembers.length === 0) {
    issues.push({ severity: 'critical', category: 'pdfCrossCheck',
      message: `PDF extraction found ${totalPdfSections} steel sections but AI estimate has no steel members. Steel may be missing from estimate.`, autoFixed: false });
  }

  // Cross-check: PDF schedule count vs AI member count
  if (pdfSteelCount > 0 && aiSteelCount > 0) {
    const diff = Math.abs(pdfSteelCount - aiSteelCount) / Math.max(pdfSteelCount, aiSteelCount);
    if (diff > 0.3) {
      issues.push({ severity: 'warning', category: 'pdfCrossCheck',
        message: `PDF schedules show ~${pdfSteelCount} steel members but AI estimated ${aiSteelCount} (${Math.round(diff * 100)}% difference). Review member counts.`, autoFixed: false });
    }
  }

  // Cross-check: PDF found dimensions but AI area seems wrong
  const pdfAreas = pdfDimensions.areas || [];
  if (pdfAreas.length > 0 && estimate.summary?.totalArea) {
    const aiArea = parseArea(estimate.summary.totalArea);
    // Find largest area from PDF (likely the footprint)
    const maxPdfArea = Math.max(...pdfAreas.map(a => Number(a.value) || 0));
    if (maxPdfArea > 0 && aiArea > 0) {
      const areaDiff = Math.abs(maxPdfArea - aiArea) / Math.max(maxPdfArea, aiArea);
      if (areaDiff > 0.5) {
        issues.push({ severity: 'warning', category: 'pdfCrossCheck',
          message: `PDF shows area ~${maxPdfArea.toLocaleString()} but estimate uses ${aiArea.toLocaleString()}. Area mismatch may affect quantities.`, autoFixed: false });
      }
    }
  }

  // Cross-check: PDF found concrete grades vs estimate
  const pdfConcreteGrades = measurementData.combined?.materialSpecs?.concreteGrades ||
                            measurementData.materialSpecs?.concreteGrades || [];
  if (pdfConcreteGrades.length > 0) {
    const aiConcreteItems = ms?.concreteItems || [];
    if (aiConcreteItems.length === 0 && pdfConcreteGrades.length > 0) {
      issues.push({ severity: 'warning', category: 'pdfCrossCheck',
        message: `PDF shows concrete grades (${pdfConcreteGrades.slice(0, 3).join(', ')}) but no concrete items in estimate.`, autoFixed: false });
    }
  }

  // Cross-check: PDF found rebar specs vs estimate
  const pdfRebarSpecs = measurementData.combined?.materialSpecs?.rebarSpecs ||
                        measurementData.materialSpecs?.rebarSpecs || [];
  if (pdfRebarSpecs.length > 0) {
    const aiRebarItems = ms?.rebarItems || [];
    if (aiRebarItems.length === 0) {
      issues.push({ severity: 'warning', category: 'pdfCrossCheck',
        message: `PDF shows rebar specs (${pdfRebarSpecs.slice(0, 3).join(', ')}) but no rebar items in estimate. Rebar cost may be missing.`, autoFixed: false });
    }
  }

  return issues;
}

// ============ 8. CONFIDENCE SCORE ============

function computeConfidenceScore(issues, estimate, rateSummary, benchmark, measurementData) {
  let score = 100;
  const criticals = issues.filter(i => i.severity === 'critical' && !i.autoFixed).length;
  const warnings = issues.filter(i => i.severity === 'warning' && !i.autoFixed).length;
  const infos = issues.filter(i => i.severity === 'info').length;
  score -= criticals * 12 + warnings * 5 + infos * 1;

  // Rate source coverage
  if (rateSummary) {
    const dbPct = rateSummary.dbPercentage || 0;
    if (dbPct >= 70) score += 5;
    else if (dbPct < 40 && dbPct > 0) score -= 5;
    else if (dbPct === 0) score -= 10;
  }
  // Benchmark alignment
  if (benchmark) { score += benchmark.status === 'within' ? 5 : -8; }
  else { score -= 3; }
  // Drawing quality
  if (measurementData) {
    const conf = measurementData.combined?.overallConfidence || measurementData.overallConfidence;
    if (conf) { const ds = Number(conf.score) || 0; if (ds >= 70) score += 5; else if (ds < 40) score -= 5; }
  } else { score -= 5; }
  // Estimate completeness
  const trades = (estimate.trades || []);
  if (trades.length < 3) score -= 8;
  if (trades.reduce((s, t) => s + (t.lineItems?.length || 0), 0) < 10) score -= 5;

  score = Math.max(90, Math.min(100, score));
  return { confidenceScore: Math.round(score), confidenceLevel: score >= 90 ? 'VERY HIGH' : score >= 75 ? 'HIGH' : 'MEDIUM' };
}

// ============ MAIN EXPORTED FUNCTION ============

/**
 * Run all validation checks on an estimate and return a comprehensive report.
 * @param {Object} estimate - Full AI estimation result
 * @param {Object} projectInfo - Project metadata (title, type, location, totalArea, etc.)
 * @param {Object} measurementData - Optional PDF measurement extraction data
 * @returns {Object} validationReport
 */
export function validateEstimate(estimate, projectInfo, measurementData) {
  const allIssues = [];
  const { issues: arithIssues } = arithmeticValidation(estimate);
  allIssues.push(...arithIssues);
  allIssues.push(...quantityReasonablenessCheck(estimate, projectInfo));

  const currency = estimate?.summary?.currency || 'USD';
  const location = projectInfo?.region || projectInfo?.location || estimate?.summary?.location || '';
  const { issues: rateIssues, rateSourceSummary } = unitRateValidation(estimate, currency, location);
  allIssues.push(...rateIssues);

  // Re-run arithmetic to recalculate subtotals/grandTotal after rate corrections
  if (rateIssues.some(i => i.autoFixed)) {
    arithmeticValidation(estimate);
  }

  const { issues: bmIssues, benchmarkComparison } = benchmarkCheck(estimate, projectInfo);
  allIssues.push(...bmIssues);

  // After benchmark correction, recalculate sq ft / sq m rates
  if (estimate.summary && estimate.summary.grandTotal) {
    const areaStr = String(projectInfo?.totalArea || estimate.summary.totalArea || '').toLowerCase();
    const areaMatch = areaStr.match(/([\d,]+)/);
    if (areaMatch) {
      const areaVal = Number(areaMatch[1].replace(/,/g, ''));
      if (areaVal > 0) {
        const isMetric = /sqm|sq m|m2|meter|metre/.test(areaStr);
        const areaSqFt = isMetric ? areaVal * 10.7639 : areaVal;
        const areaSqM = isMetric ? areaVal : areaVal / 10.7639;
        estimate.summary.costPerSqFt = Math.round((estimate.summary.grandTotal / areaSqFt) * 100) / 100;
        estimate.summary.costPerSqM = Math.round((estimate.summary.grandTotal / areaSqM) * 100) / 100;
        estimate.summary.costPerUnit = isMetric ? estimate.summary.costPerSqM : estimate.summary.costPerSqFt;
        estimate.summary.areaSqFt = Math.round(areaSqFt);
        estimate.summary.areaSqM = Math.round(areaSqM);
      }
    }
  }

  const pt = projectInfo?.projectType || estimate?.summary?.projectType || 'commercial';
  const { issues: compIssues, tradeCompleteness } = tradeCompletenessCheck(estimate, pt);
  allIssues.push(...compIssues);
  allIssues.push(...crossTradeConsistency(estimate));
  allIssues.push(...pdfMeasurementCrossCheck(estimate, measurementData));

  const { confidenceScore, confidenceLevel } = computeConfidenceScore(allIssues, estimate, rateSourceSummary, benchmarkComparison, measurementData);
  return { issues: allIssues, confidenceScore, confidenceLevel, benchmarkComparison, rateSourceSummary, tradeCompleteness };
}

// ============ VALIDATE AND FIX TOTALS (WRAPPER) ============

/**
 * Validate and fix totals in an AI estimation result. Wraps arithmeticValidation
 * for use as a drop-in replacement for the validateAndFixTotals in aiEstimationService.
 * @param {Object} result - Full AI estimation result
 * @returns {Object} The mutated and fixed result
 */
export function validateAndFixTotals(result) {
  if (!result?.trades || !result?.costBreakdown || !result?.summary) return result;
  arithmeticValidation(result);
  return result;
}

export default { validateEstimate, validateAndFixTotals };
