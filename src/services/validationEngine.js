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
  if (/steel|w\d+x|hss|joist/i.test(d) && /ton/i.test(u)) {
    if (/hss|tube|hollow/i.test(d)) return ['structural_steel', 'hss'];
    if (/joist/i.test(d)) return ['structural_steel', 'joists'];
    if (/misc|connection|plate|angle/i.test(d)) return ['structural_steel', 'misc_steel'];
    if (/light/i.test(d)) return ['structural_steel', 'light'];
    if (/heavy/i.test(d)) return ['structural_steel', 'heavy'];
    return ['structural_steel', 'medium'];
  }
  if (/concrete|slab|footing|foundation/i.test(d) && /cy|cum|m³/i.test(u))
    return ['concrete', curr === 'INR' ? 'M30' : curr === 'AED' ? 'C40' : '4000psi'];
  if (/slab.on.grade|sog/i.test(d) && /sf|sqft/i.test(u)) return ['concrete', 'slab_on_grade'];
  if (/rebar|reinforc|tmt/i.test(d) && /ton|mt/i.test(u))
    return ['rebar', curr === 'INR' ? 'Fe500' : curr === 'AED' ? 'grade460' : 'grade60'];
  if (/standing.seam|metal.roof/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['roofing', 'standing_seam'];
  if (/tpo|single.ply/i.test(d) && /sf|sqft/i.test(u)) return ['roofing', 'tpo_single_ply'];
  if (/hvac|mechanical/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'hvac'];
  if (/plumbing/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'plumbing'];
  if (/electrical/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'electrical'];
  if (/fire.prot|sprinkler/i.test(d) && /sf|sqft|sqm/i.test(u)) return ['mep', 'fire_protection'];
  if (/deck|metal.deck/i.test(d) && /sf|sqft/i.test(u)) return ['structural_steel', 'deck'];
  if (/cmu|masonry|block.*wall/i.test(d) && /sf|sqft/i.test(u)) return ['masonry', /12/.test(d) ? 'cmu_12' : 'cmu_8'];
  return null;
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
          const dbRate = Math.round(rateData.rate * factor);
          const dbRange = rateData.range.map(r => Math.round(r * factor));
          dbBacked++; li.rateSource = 'DB';
          const deviation = Math.abs(rate - dbRate) / dbRate;
          if (deviation > 1.0) {
            li.unitRate = dbRate;
            li.lineTotal = Math.round((Number(li.quantity) || 0) * dbRate * 100) / 100;
            issues.push({ severity: 'critical', category: 'unitRate', message: `"${li.description}" rate ${rate}/${li.unit} deviates >100% from DB ${dbRate}. Auto-corrected.`, autoFixed: true });
          } else if (deviation > 0.5) {
            issues.push({ severity: 'warning', category: 'unitRate', message: `"${li.description}" rate ${rate}/${li.unit} deviates ${(deviation * 100).toFixed(0)}% from DB ${dbRate} (range: ${dbRange[0]}-${dbRange[1]}).`, autoFixed: false });
          }
        } else { aiEstimated++; li.rateSource = 'EST'; }
      } else { aiEstimated++; li.rateSource = 'EST'; }
    }
  }
  return { issues, rateSourceSummary: { dbBacked, aiEstimated, total, dbPercentage: total > 0 ? Math.round((dbBacked / total) * 100) : 0 } };
}

// ============ 4. BENCHMARK CHECK ============

function benchmarkCheck(estimate, projectInfo) {
  const issues = [];
  if (!estimate?.summary) return { issues, benchmarkComparison: null };
  const { grandTotal, currency: curr = 'USD' } = estimate.summary;
  if (!grandTotal) return { issues, benchmarkComparison: null };
  const area = parseArea(projectInfo?.totalArea || estimate.summary.totalArea);
  if (!area) { issues.push({ severity: 'info', category: 'benchmark', message: 'Cannot benchmark: no area specified.', autoFixed: false }); return { issues, benchmarkComparison: null }; }
  const costPerUnit = grandTotal / area;
  const pt = normalizeProjectType(projectInfo?.projectType || estimate.summary.projectType);
  const bm = getBenchmarkRange(curr, pt);
  if (!bm) { issues.push({ severity: 'info', category: 'benchmark', message: `No benchmark for "${pt}" in ${curr}.`, autoFixed: false }); return { issues, benchmarkComparison: null }; }
  const status = costPerUnit < bm.low ? 'below' : costPerUnit > bm.high ? 'above' : 'within';
  const benchmarkComparison = { projectType: bm.label || pt, currency: curr, costPerUnit: Math.round(costPerUnit * 100) / 100, benchmarkLow: bm.low, benchmarkMid: bm.mid, benchmarkHigh: bm.high, status };

  if (costPerUnit < bm.low / 1.5) issues.push({ severity: 'critical', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft far below range (${bm.low}-${bm.high} for ${bm.label}). Estimate may be incomplete.`, autoFixed: false });
  else if (costPerUnit < bm.low) issues.push({ severity: 'warning', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft below benchmark low ${bm.low} for ${bm.label}.`, autoFixed: false });
  else if (costPerUnit > bm.high * 1.5) issues.push({ severity: 'critical', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft far above range (${bm.low}-${bm.high} for ${bm.label}). Check for inflated rates.`, autoFixed: false });
  else if (costPerUnit > bm.high) issues.push({ severity: 'warning', category: 'benchmark', message: `Cost ${curr} ${costPerUnit.toFixed(2)}/sqft above benchmark high ${bm.high} for ${bm.label}.`, autoFixed: false });
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

// ============ 7. CONFIDENCE SCORE ============

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

  score = Math.max(0, Math.min(100, score));
  return { confidenceScore: Math.round(score), confidenceLevel: score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW' };
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

  const { issues: bmIssues, benchmarkComparison } = benchmarkCheck(estimate, projectInfo);
  allIssues.push(...bmIssues);

  const pt = projectInfo?.projectType || estimate?.summary?.projectType || 'commercial';
  const { issues: compIssues, tradeCompleteness } = tradeCompletenessCheck(estimate, pt);
  allIssues.push(...compIssues);
  allIssues.push(...crossTradeConsistency(estimate));

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
