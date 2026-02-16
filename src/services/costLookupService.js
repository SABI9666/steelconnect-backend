// src/services/costLookupService.js
// Cost Lookup Service for Construction Estimation System
//
// Wraps the cost database with intelligent lookup, classification, and
// location-adjustment logic. All rates returned are INSTALLED costs
// (material + labor + equipment) adjusted for the project location.

import {
    UNIT_RATES, LOCATION_FACTORS,
    STEEL_WEIGHT_TABLE, INDIAN_STEEL_WEIGHTS,
    getSteelWeightPerFoot, getLocationFactor, getUnitRate,
    classifySteelWeight
} from '../data/costDatabase.js';

// ---------------------------------------------------------------------------
// Concrete grade mapping: normalizes user-supplied grade strings into the
// keys used by UNIT_RATES (e.g. '3000psi', 'M30', 'C40').
// ---------------------------------------------------------------------------
const CONCRETE_GRADE_MAP = {
    // US / Imperial grades (PSI-based)
    '3000PSI': '3000psi', '3000': '3000psi', '3500PSI': '3000psi',
    '4000PSI': '4000psi', '4000': '4000psi', '4500PSI': '4000psi',
    '5000PSI': '5000psi', '5000': '5000psi', '6000PSI': '5000psi',
    // Indian grades
    'M20': 'M25', 'M25': 'M25',
    'M30': 'M30', 'M35': 'M30',
    'M40': 'M40', 'M45': 'M40',
    'M50': 'M50', 'M55': 'M50', 'M60': 'M50',
    // British / Euro grades
    'C25': 'C30', 'C28': 'C30', 'C30': 'C30', 'C32': 'C30', 'C35': 'C30',
    'C40': 'C40', 'C45': 'C40',
    'C50': 'C50', 'C55': 'C50', 'C60': 'C50'
};

// ---------------------------------------------------------------------------
// 1. lookupSteelRate
// ---------------------------------------------------------------------------
/**
 * Look up the installed rate for a steel member by its section name.
 * Determines whether the section is light / medium / heavy (or HSS),
 * fetches the base rate from the cost database, and adjusts by the
 * location factor.
 *
 * @param {string} memberSize - e.g. "W24x68", "ISMB450", "HSS8x8x1/2"
 * @param {string} location   - e.g. "Houston, TX", "Mumbai"
 * @param {string} [currency] - override currency (auto-detected from location if omitted)
 * @returns {{ rate: number, unit: string, weightClass: string, currency: string,
 *             locationFactor: number, baseRate: number, range: number[], source: string }}
 */
export function lookupSteelRate(memberSize, location, currency = null) {
    const locData = getLocationFactor(location);
    const curr = currency || locData.currency || 'USD';

    // --- classify the member ---
    const weightInfo = getSteelWeightPerFoot(memberSize);
    let weightClass = 'medium'; // sensible default

    if (weightInfo) {
        // Convert kg/m to approximate lb/ft for classification (1 kg/m ~ 0.672 lb/ft)
        const lbPerFt = weightInfo.unit === 'kg/m'
            ? weightInfo.weight * 0.672
            : weightInfo.weight;
        weightClass = classifySteelWeight(lbPerFt);
    } else if (memberSize) {
        // Fallback: extract the weight token from the name (e.g. W24x68 -> 68)
        const match = memberSize.match(/x(\d+(?:\.\d+)?)/i);
        if (match) weightClass = classifySteelWeight(parseFloat(match[1]));
    }

    // HSS / tube sections get their own rate category
    const isHSS = /^HSS/i.test(memberSize);
    // PEB sections (Indian market) have a dedicated rate in INR
    const isPEB = /peb|pre.?eng/i.test(memberSize);
    const subtype = isHSS ? 'hss' : (isPEB && curr === 'INR') ? 'peb' : weightClass;

    const rateData = getUnitRate(curr, 'structural_steel', subtype);
    if (!rateData) {
        return { rate: 0, unit: 'ton', weightClass, currency: curr, source: 'NOT_FOUND' };
    }

    const adjustedRate = Math.round(rateData.rate * locData.factor);
    return {
        rate: adjustedRate,
        unit: rateData.unit,
        weightClass,
        currency: curr,
        locationFactor: locData.factor,
        baseRate: rateData.rate,
        range: rateData.range.map(r => Math.round(r * locData.factor)),
        source: 'costDatabase'
    };
}

// ---------------------------------------------------------------------------
// 2. lookupConcreteRate
// ---------------------------------------------------------------------------
/**
 * Map a human-readable concrete grade to a database key, then return the
 * location-adjusted rate.  Accepts formats like "3000PSI", "4000 PSI",
 * "M25", "M30", "C30", "C40", etc.
 *
 * @param {string} grade       - concrete grade string
 * @param {string} location    - project location
 * @param {string} [currency]  - override currency
 * @returns {{ rate: number, unit: string, grade: string, currency: string,
 *             locationFactor: number, range: number[], source: string }}
 */
export function lookupConcreteRate(grade, location, currency = null) {
    const locData = getLocationFactor(location);
    const curr = currency || locData.currency || 'USD';

    // Normalize and look up in the mapping table
    const normalized = (grade || '').replace(/\s+/g, '').toUpperCase();
    let subtype = CONCRETE_GRADE_MAP[normalized] || null;

    // If not found by exact key, try regex extraction
    if (!subtype) {
        if (/(\d{3,5})\s*PSI/i.test(grade)) {
            const psi = parseInt(RegExp.$1, 10);
            subtype = psi <= 3500 ? '3000psi' : psi <= 4500 ? '4000psi' : '5000psi';
        } else if (/M(\d+)/i.test(grade)) {
            const m = parseInt(RegExp.$1, 10);
            subtype = m <= 25 ? 'M25' : m <= 35 ? 'M30' : m <= 45 ? 'M40' : 'M50';
        } else if (/C(\d+)/i.test(grade)) {
            const c = parseInt(RegExp.$1, 10);
            subtype = c <= 35 ? 'C30' : c <= 45 ? 'C40' : 'C50';
        }
    }

    // Ultimate fallback: pick a sensible mid-grade for the currency
    if (!subtype) {
        subtype = curr === 'INR' ? 'M30' : curr === 'AED' ? 'C40' : curr === 'GBP' ? 'C30' : '4000psi';
    }

    const rateData = getUnitRate(curr, 'concrete', subtype);
    if (!rateData) {
        return { rate: 0, unit: 'cy', grade: subtype, currency: curr, source: 'NOT_FOUND' };
    }

    const adjustedRate = Math.round(rateData.rate * locData.factor);
    return {
        rate: adjustedRate,
        unit: rateData.unit,
        grade: subtype,
        currency: curr,
        locationFactor: locData.factor,
        range: rateData.range.map(r => Math.round(r * locData.factor)),
        source: 'costDatabase'
    };
}

// ---------------------------------------------------------------------------
// 3. adjustForLocation
// ---------------------------------------------------------------------------
/**
 * Apply the RSMeans-style location factor to a base rate.
 *
 * @param {number} baseRate  - the un-adjusted rate
 * @param {string} location  - city / region string
 * @returns {number} location-adjusted rate (rounded to 2 decimal places)
 */
export function adjustForLocation(baseRate, location) {
    const locData = getLocationFactor(location);
    return Math.round(baseRate * locData.factor * 100) / 100;
}

// ---------------------------------------------------------------------------
// 4. getEscalationFactor
// ---------------------------------------------------------------------------
/**
 * Compute a cost-escalation multiplier based on the project start date and
 * duration.  Uses simple linear mid-point escalation (costs are assumed to
 * be spread evenly over the project duration).
 *
 * Typical construction escalation: 3-5% per year.
 *
 * @param {string|Date} startDate       - project start (used for reference only)
 * @param {number}      durationMonths  - total project duration in months
 * @param {number}      [annualRate]    - annual escalation rate, default 0.04 (4%)
 * @returns {number} multiplier (e.g. 1.02 for 2% effective escalation)
 */
export function getEscalationFactor(startDate, durationMonths, annualRate = 0.04) {
    if (!durationMonths || durationMonths <= 0) return 1.0;

    // Clamp annual rate to the typical 3-5% range for safety
    const clampedRate = Math.max(0, Math.min(annualRate, 0.10));

    // Mid-point escalation: assume average expenditure at the project midpoint
    const midpointYears = (durationMonths / 12) / 2;
    const factor = 1 + (clampedRate * midpointYears);

    return Math.round(factor * 10000) / 10000; // 4 decimal precision
}

// ---------------------------------------------------------------------------
// 5. lookupRate (generic)
// ---------------------------------------------------------------------------
/**
 * Generic rate lookup with automatic location adjustment.  Works for any
 * category/subtype combination present in the cost database (structural_steel,
 * concrete, rebar, masonry, roofing, sitework, mep, finishes, etc.).
 *
 * @param {string} currency  - e.g. "USD", "INR", "AED", "GBP"
 * @param {string} category  - top-level category key in UNIT_RATES
 * @param {string} subtype   - sub-key within the category
 * @param {string} [location]- project location for factor adjustment
 * @returns {{ rate: number, unit: string, desc: string, range: number[],
 *             currency: string, locationFactor: number, source: string } | null}
 */
export function lookupRate(currency, category, subtype, location = null) {
    const rateData = getUnitRate(currency, category, subtype);
    if (!rateData) {
        // Attempt a fuzzy match on the subtype (e.g. "slab" -> "slab_on_grade")
        const currencyRates = UNIT_RATES[currency];
        if (currencyRates && currencyRates[category]) {
            const candidates = Object.keys(currencyRates[category]);
            const fuzzy = candidates.find(k => k.includes(subtype) || subtype.includes(k));
            if (fuzzy) {
                return lookupRate(currency, category, fuzzy, location);
            }
        }
        return null;
    }

    const locData = location ? getLocationFactor(location) : { factor: 1.0 };
    const adjustedRate = Math.round(rateData.rate * locData.factor * 100) / 100;

    return {
        rate: adjustedRate,
        unit: rateData.unit,
        desc: rateData.desc,
        range: rateData.range.map(r => Math.round(r * locData.factor)),
        currency,
        locationFactor: locData.factor,
        source: 'costDatabase'
    };
}

// ---------------------------------------------------------------------------
// 6. detectCurrency
// ---------------------------------------------------------------------------
/**
 * Detect the appropriate currency from project metadata.  Checks, in order:
 *   1. Explicit currency field or symbol
 *   2. Region / location string (via LOCATION_FACTORS)
 *   3. Questionnaire answers referencing a country or currency
 *   4. Falls back to USD
 *
 * @param {Object} projectInfo - may contain { currency, region, location, answers }
 * @returns {string} ISO 4217 currency code
 */
export function detectCurrency(projectInfo) {
    if (!projectInfo) return 'USD';

    // 1. Explicit currency field
    if (projectInfo.currency) {
        const raw = projectInfo.currency.toUpperCase();
        if (/INR|RUPEE/.test(raw)) return 'INR';
        if (/AED|DIRHAM/.test(raw)) return 'AED';
        if (/GBP|POUND/.test(raw)) return 'GBP';
        if (/EUR/.test(raw))        return 'EUR';
        if (/CAD|C\$/.test(raw))    return 'CAD';
        if (/AUD|A\$/.test(raw))    return 'AUD';
        if (/SAR/.test(raw))        return 'SAR';
        if (/USD|\$/.test(raw))     return 'USD';
        // If it's already a clean code, return it directly
        if (/^[A-Z]{3}$/.test(raw)) return raw;
    }

    // 2. Detect from region / location
    const location = (projectInfo.region || projectInfo.location || '').toLowerCase();
    if (location) {
        const locData = getLocationFactor(location);
        if (locData.currency) return locData.currency;
    }

    // 3. Scan questionnaire answers for country / currency hints
    if (projectInfo.answers) {
        const blob = JSON.stringify(projectInfo.answers).toLowerCase();
        if (/india|mumbai|delhi|bangalore|chennai|kolkata|rupee|inr/.test(blob)) return 'INR';
        if (/dubai|abu dhabi|uae|sharjah|dirham|aed/.test(blob))               return 'AED';
        if (/london|manchester|uk|united kingdom|gbp|pound/.test(blob))        return 'GBP';
    }

    return 'USD';
}

// ---------------------------------------------------------------------------
// 7. getSteelTonnageRate
// ---------------------------------------------------------------------------
/**
 * Full pipeline for obtaining the location-adjusted per-ton rate for a
 * structural steel member:
 *   parse section name -> look up weight -> classify -> get base rate -> adjust
 *
 * Also returns parsed weight-per-foot so callers can compute tonnage directly.
 *
 * @param {string} memberSize - e.g. "W24x68", "ISMB300", "HSS6x6x3/8"
 * @param {string} currency   - "USD", "INR", etc.
 * @param {string} [location] - project city for location adjustment
 * @returns {{ ratePerTon: number, unit: string, weightPerFoot: number|null,
 *             weightUnit: string|null, weightClass: string, currency: string,
 *             locationFactor: number, source: string }}
 */
export function getSteelTonnageRate(memberSize, currency, location = null) {
    // Step 1: Parse the member to get weight per linear unit
    const weightInfo = getSteelWeightPerFoot(memberSize);

    // Step 2: Classify as light / medium / heavy
    let weightClass = 'medium';
    if (weightInfo) {
        const lbPerFt = weightInfo.unit === 'kg/m'
            ? weightInfo.weight * 0.672
            : weightInfo.weight;
        weightClass = classifySteelWeight(lbPerFt);
    } else if (memberSize) {
        const m = memberSize.match(/x(\d+(?:\.\d+)?)/i);
        if (m) weightClass = classifySteelWeight(parseFloat(m[1]));
    }

    // Step 3: Get the base rate from the database
    const isHSS = /^HSS/i.test(memberSize);
    const subtype = isHSS ? 'hss' : weightClass;
    const rateData = getUnitRate(currency, 'structural_steel', subtype);

    // Step 4: Apply location factor
    const locData = location ? getLocationFactor(location) : { factor: 1.0 };
    const baseRate = rateData ? rateData.rate : 0;
    const ratePerTon = Math.round(baseRate * locData.factor);

    return {
        ratePerTon,
        unit: rateData ? rateData.unit : 'ton',
        weightPerFoot: weightInfo ? weightInfo.weight : null,
        weightUnit: weightInfo ? weightInfo.unit : null,
        weightClass,
        currency,
        locationFactor: locData.factor,
        source: rateData ? 'costDatabase' : 'NOT_FOUND'
    };
}

// ---------------------------------------------------------------------------
// Default export (all public functions)
// ---------------------------------------------------------------------------
export default {
    lookupSteelRate,
    lookupConcreteRate,
    adjustForLocation,
    getEscalationFactor,
    lookupRate,
    detectCurrency,
    getSteelTonnageRate
};
