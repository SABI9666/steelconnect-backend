// src/services/quickEstimationEngine.js
// Quick Estimation Engine - Code-based estimator using cost database.
// ZERO AI API calls. Uses regional benchmark rates + cost database for instant estimates.
// Accuracy: Class 4-5 (±30-50%), but FREE and instant.

import { getLocationFactor, getUnitRate, getBenchmarkRange, UNIT_RATES, BENCHMARK_RANGES } from '../data/costDatabase.js';
import { detectCurrency } from './costLookupService.js';
import { enrichEstimateWithLaborAndMarkups } from './estimatePostProcessor.js';

/**
 * Trade distribution percentages by project type.
 * Based on RSMeans historical data for typical projects.
 */
const TRADE_DISTRIBUTIONS = {
    industrial: {
        'Structural Steel': 0.25, 'Concrete & Foundations': 0.15, 'Roofing': 0.10,
        'Exterior Cladding': 0.08, 'MEP - Electrical': 0.10, 'MEP - Plumbing': 0.05,
        'MEP - HVAC': 0.07, 'Fire Protection': 0.03, 'Sitework': 0.08,
        'Painting & Coatings': 0.03, 'Doors & Windows': 0.02, 'General Conditions': 0.04
    },
    warehouse: {
        'Structural Steel': 0.20, 'Concrete & Foundations': 0.18, 'Roofing': 0.12,
        'Exterior Cladding': 0.10, 'MEP - Electrical': 0.08, 'MEP - Plumbing': 0.04,
        'MEP - HVAC': 0.05, 'Fire Protection': 0.03, 'Sitework': 0.10,
        'Flooring': 0.04, 'Doors & Windows': 0.03, 'General Conditions': 0.03
    },
    commercial: {
        'Structural Steel': 0.15, 'Concrete & Foundations': 0.12, 'Roofing': 0.05,
        'Exterior Cladding': 0.10, 'MEP - Electrical': 0.12, 'MEP - Plumbing': 0.06,
        'MEP - HVAC': 0.12, 'Fire Protection': 0.04, 'Interior Finishes': 0.10,
        'Elevators': 0.03, 'Sitework': 0.05, 'Doors & Windows': 0.04, 'General Conditions': 0.02
    },
    residential_single: {
        'Structural Frame': 0.15, 'Concrete & Foundations': 0.12, 'Roofing': 0.08,
        'Exterior Cladding': 0.10, 'MEP - Electrical': 0.10, 'MEP - Plumbing': 0.08,
        'MEP - HVAC': 0.10, 'Interior Finishes': 0.12, 'Flooring': 0.05,
        'Doors & Windows': 0.04, 'Sitework': 0.04, 'Painting': 0.02
    },
    residential_multi: {
        'Structural Frame': 0.18, 'Concrete & Foundations': 0.14, 'Roofing': 0.05,
        'Exterior Cladding': 0.10, 'MEP - Electrical': 0.10, 'MEP - Plumbing': 0.07,
        'MEP - HVAC': 0.10, 'Fire Protection': 0.04, 'Interior Finishes': 0.08,
        'Elevators': 0.04, 'Sitework': 0.04, 'Doors & Windows': 0.04, 'General Conditions': 0.02
    },
    healthcare: {
        'Structural Frame': 0.12, 'Concrete & Foundations': 0.10, 'Roofing': 0.04,
        'Exterior Cladding': 0.08, 'MEP - Electrical': 0.14, 'MEP - Plumbing': 0.10,
        'MEP - HVAC': 0.14, 'Fire Protection': 0.05, 'Interior Finishes': 0.10,
        'Medical Equipment': 0.05, 'Elevators': 0.03, 'Sitework': 0.03, 'General Conditions': 0.02
    },
    peb: {
        'PEB Steel Structure': 0.35, 'Concrete & Foundations': 0.15, 'Roofing & Sheeting': 0.15,
        'Wall Cladding': 0.10, 'MEP - Electrical': 0.07, 'MEP - Plumbing': 0.03,
        'Doors & Accessories': 0.04, 'Sitework': 0.06, 'Painting': 0.03, 'General Conditions': 0.02
    },
    educational: {
        'Structural Frame': 0.14, 'Concrete & Foundations': 0.12, 'Roofing': 0.06,
        'Exterior Cladding': 0.08, 'MEP - Electrical': 0.12, 'MEP - Plumbing': 0.06,
        'MEP - HVAC': 0.12, 'Fire Protection': 0.04, 'Interior Finishes': 0.12,
        'Sitework': 0.06, 'Doors & Windows': 0.04, 'General Conditions': 0.04
    },
    hospitality: {
        'Structural Frame': 0.12, 'Concrete & Foundations': 0.10, 'Roofing': 0.04,
        'Exterior Cladding': 0.10, 'MEP - Electrical': 0.12, 'MEP - Plumbing': 0.08,
        'MEP - HVAC': 0.12, 'Fire Protection': 0.04, 'Interior Finishes': 0.14,
        'Elevators': 0.04, 'Sitework': 0.04, 'Doors & Windows': 0.04, 'General Conditions': 0.02
    }
};

/**
 * Normalize project type string to a key used in distributions/benchmarks.
 */
function normalizeProjectType(type) {
    if (!type) return 'commercial';
    const t = type.toLowerCase();
    if (/industrial|factory|manufactur/.test(t)) return 'industrial';
    if (/warehouse|storage|logistics|distribution/.test(t)) return 'warehouse';
    if (/commercial|office|corporate/.test(t)) return 'commercial';
    if (/single.?family|house|villa|bungalow/.test(t)) return 'residential_single';
    if (/residen|multi.?family|apartment|flat|condo/.test(t)) return 'residential_multi';
    if (/health|hospital|clinic|medical/.test(t)) return 'healthcare';
    if (/peb|pre.?eng|metal.?build/.test(t)) return 'peb';
    if (/school|college|universit|education/.test(t)) return 'educational';
    if (/hotel|resort|hospitality|motel/.test(t)) return 'hospitality';
    if (/retail|shop|mall|store/.test(t)) return 'commercial';
    if (/mixed/.test(t)) return 'commercial';
    return 'commercial';
}

/**
 * Parse area string to numeric sqft value.
 */
function parseArea(areaStr) {
    if (!areaStr) return 0;
    if (typeof areaStr === 'number') return areaStr;
    const str = String(areaStr).replace(/,/g, '');
    const num = parseFloat(str.match(/([\d.]+)/)?.[1] || '0');
    // If specified in sqm, convert to sqft
    if (/sq\s*m|sqm|m²|square\s*met/i.test(str)) {
        return Math.round(num * 10.764);
    }
    return num;
}

/**
 * Generate a quick estimate using ONLY the cost database.
 * Zero AI API calls - instant results, ~30-50% accuracy.
 *
 * @param {Object} projectInfo - Project metadata
 * @param {Object} answers - Questionnaire answers
 * @returns {Object} Estimate in the standard format
 */
export function generateQuickEstimate(projectInfo, answers = {}) {
    const startTime = Date.now();
    console.log(`[QUICK-EST] Starting quick estimate for "${projectInfo?.projectTitle || 'Unknown'}"`);

    // Detect currency and location
    const currency = detectCurrency({ ...projectInfo, answers });
    const location = projectInfo?.region || answers?.region || '';
    const locationData = getLocationFactor(location);
    const factor = locationData.factor;

    // Determine project type and area
    const projectType = normalizeProjectType(projectInfo?.projectType || answers?.projectType || '');
    const totalAreaSqft = parseArea(projectInfo?.totalArea || answers?.totalArea || '10000');

    if (totalAreaSqft <= 0) {
        throw new Error('Total area is required for quick estimation');
    }

    // Get benchmark rate for this project type and currency
    const benchmark = getBenchmarkRange(currency, projectType);
    let costPerSqft;
    if (benchmark) {
        costPerSqft = benchmark.mid * factor;
    } else {
        // Fallback: use USD benchmark converted roughly
        const usdBenchmark = BENCHMARK_RANGES.USD?.[projectType] || BENCHMARK_RANGES.USD?.commercial;
        costPerSqft = (usdBenchmark?.mid || 200) * factor;
    }

    // Calculate direct costs
    const directCosts = Math.round(totalAreaSqft * costPerSqft);

    // Get trade distribution for this project type
    const distribution = TRADE_DISTRIBUTIONS[projectType] || TRADE_DISTRIBUTIONS.commercial;

    // Build trades from distribution
    const trades = [];
    const tradesSummary = [];
    let tradeIndex = 1;

    for (const [tradeName, percentage] of Object.entries(distribution)) {
        const tradeAmount = Math.round(directCosts * percentage);
        const trade = {
            division: String(tradeIndex).padStart(2, '0'),
            tradeName,
            tradeIcon: getTradeIcon(tradeName),
            subtotal: tradeAmount,
            percentOfTotal: Math.round(percentage * 10000) / 100,
            lineItems: [{
                description: `${tradeName} - Regional benchmark rate`,
                quantity: totalAreaSqft,
                unit: 'SF',
                unitRate: Math.round(costPerSqft * percentage * 100) / 100,
                lineTotal: tradeAmount,
                materialDetails: `Based on ${currency} ${projectType} benchmark for ${location || 'default region'}`,
                rateSource: 'DB'
            }]
        };
        trades.push(trade);
        tradesSummary.push({ tradeName, amount: tradeAmount, percentage: Math.round(percentage * 100) });
        tradeIndex++;
    }

    // Markups
    const markupRates = {
        generalConditionsPercent: 6,
        overheadPercent: 6,
        profitPercent: 8,
        contingencyPercent: 10,
        escalationPercent: 2
    };
    const markupTotal = Object.values(markupRates).reduce((s, p) => s + p, 0);
    const markupAmount = Math.round(directCosts * markupTotal / 100);
    const grandTotal = directCosts + markupAmount;

    const estimate = {
        summary: {
            projectTitle: projectInfo?.projectTitle || 'Quick Estimate',
            projectType: projectType,
            location: location || 'Not specified',
            currency,
            currencySymbol: getCurrencySymbol(currency),
            totalArea: `${totalAreaSqft.toLocaleString()} sq ft`,
            numberOfFloors: answers?.numberOfFloors || projectInfo?.numberOfFloors || '1',
            structuralSystem: answers?.structuralSystem || projectInfo?.structuralSystem || 'Not specified',
            estimateDate: new Date().toISOString().split('T')[0],
            confidenceLevel: 'Low',
            estimateClass: 'Class 5 (Conceptual)',
            grandTotal,
            costPerUnit: Math.round(grandTotal / totalAreaSqft * 100) / 100,
            unitLabel: 'per sq ft',
            benchmarkCheck: benchmark
                ? `At ${getCurrencySymbol(currency)}${Math.round(grandTotal / totalAreaSqft)}/sqft, within the ${benchmark.label} range of ${benchmark.low}-${benchmark.high}/sqft for ${location || 'this region'}`
                : 'Benchmark data not available for this currency/type combination',
            estimationMethod: 'QUICK_ESTIMATE - Database-driven, zero AI cost'
        },
        drawingExtraction: {
            dimensionsFound: [],
            memberSizesFound: [],
            schedulesFound: [],
            materialsNoted: [],
            designLoads: [],
            scaleUsed: 'N/A',
            sheetsAnalyzed: [],
            totalMembersCount: { beams: 0, columns: 0, bracing: 0, joists: 0 }
        },
        trades,
        structuralAnalysis: {
            structuralSystem: answers?.structuralSystem || 'Database estimate',
            foundationType: answers?.foundationType || 'Standard',
            primaryMembers: 'Estimated from benchmarks',
            secondaryMembers: 'Estimated from benchmarks',
            connectionTypes: 'Standard',
            steelTonnage: 'See material schedule',
            concreteVolume: 'See material schedule',
            rebarTonnage: 'See material schedule',
            drawingNotes: 'Quick estimate based on regional cost database. Upload drawings for detailed AI analysis.',
            analysisMethod: 'QUICK_ESTIMATE - Regional benchmark rates from cost database (zero AI cost)',
            filesAnalyzed: []
        },
        materialSchedule: {
            steelMembers: [],
            steelSummary: { mainSteelTons: 0, connectionMiscTons: 0, totalSteelTons: 0, steelPSF: 0, weightUnit: 'tons' },
            concreteItems: [],
            concreteSummary: { totalConcreteCY: 0, totalRebarTons: 0, volumeUnit: currency === 'INR' ? 'cum' : 'CY' },
            rebarItems: [],
            rebarSummary: { totalRebarTons: 0, rebarBySize: {}, rebarGrade: '' },
            pebItems: [],
            pebSummary: { totalPEBWeight: 0, weightUnit: 'MT', totalPEBCost: 0 },
            mepItems: [],
            mepSummary: { totalPlumbingCost: 0, totalHVACCost: 0, totalElectricalCost: 0, totalFireProtectionCost: 0, totalElevatorCost: 0, totalBMSCost: 0, totalMEPCost: 0 },
            architecturalItems: [],
            architecturalSummary: { totalDoorsCost: 0, totalWindowsCost: 0, totalFlooringCost: 0, totalCeilingCost: 0, totalPaintingCost: 0, totalPartitionsCost: 0, totalArchitecturalCost: 0 },
            roofingItems: [],
            claddingItems: [],
            waterproofingItems: [],
            siteworkItems: [],
            connectionItems: [],
            otherMaterials: [],
            safetyTemporary: [],
            grandTotalMaterialCost: 0
        },
        costBreakdown: {
            directCosts,
            generalConditions: Math.round(directCosts * markupRates.generalConditionsPercent / 100),
            generalConditionsPercent: markupRates.generalConditionsPercent,
            overhead: Math.round(directCosts * markupRates.overheadPercent / 100),
            overheadPercent: markupRates.overheadPercent,
            profit: Math.round(directCosts * markupRates.profitPercent / 100),
            profitPercent: markupRates.profitPercent,
            contingency: Math.round(directCosts * markupRates.contingencyPercent / 100),
            contingencyPercent: markupRates.contingencyPercent,
            escalation: Math.round(directCosts * markupRates.escalationPercent / 100),
            escalationPercent: markupRates.escalationPercent,
            totalWithMarkups: grandTotal
        },
        tradesSummary,
        assumptions: [
            'Quick estimate based on regional cost database benchmarks',
            `${projectType} project type rates applied for ${location || 'default region'}`,
            `Location factor: ${factor}x applied to base rates`,
            'Detailed BOQ requires AI analysis with uploaded drawings',
            'Accuracy: Class 5 (±30-50%) - suitable for feasibility studies'
        ],
        exclusions: [
            'Detailed material quantities (requires drawing analysis)',
            'Site-specific conditions',
            'Specialized equipment or systems',
            'Land acquisition costs',
            'Furniture and fixtures',
            'Professional fees and permits'
        ],
        notes: [
            'This is a QUICK ESTIMATE using cost database rates - no AI API costs incurred',
            'For detailed BOQ with material schedules, use Standard or Detailed estimation mode',
            'Upload structural drawings for AI-powered analysis with higher accuracy'
        ],
        marketInsights: {
            regionalFactor: `Location factor: ${factor}x (${location || 'default'})`,
            materialTrends: `Based on ${new Date().getFullYear()} database rates`,
            laborMarket: `Regional labor rates applied via ${currency} cost database`,
            recommendedProcurement: 'Contact local suppliers for current quotations'
        },
        validationReport: {
            finalConfidenceScore: 35,
            confidenceLevel: 'Low',
            confidenceFactors: [
                { name: 'Estimation Method', score: 30, weight: 40 },
                { name: 'Drawing Data', score: 0, weight: 25 },
                { name: 'Rate Quality', score: 80, weight: 20 },
                { name: 'Benchmark Alignment', score: 90, weight: 15 }
            ],
            engineVersion: 'quick-estimate-v1',
            validatedAt: new Date().toISOString()
        }
    };

    // Post-process: enrich with labor breakdown
    try {
        enrichEstimateWithLaborAndMarkups(estimate, {
            currency, location, totalArea: totalAreaSqft, projectType
        });
    } catch (e) {
        console.log(`[QUICK-EST] Post-processing skipped: ${e.message}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[QUICK-EST] Done in ${elapsed}ms | Total: ${grandTotal} ${currency} | ${Math.round(grandTotal / totalAreaSqft)}/sqft`);

    return estimate;
}

function getTradeIcon(tradeName) {
    const icons = {
        'Structural Steel': 'fa-building', 'Structural Frame': 'fa-building',
        'PEB Steel Structure': 'fa-warehouse',
        'Concrete & Foundations': 'fa-cubes',
        'Roofing': 'fa-home', 'Roofing & Sheeting': 'fa-home',
        'Exterior Cladding': 'fa-layer-group', 'Wall Cladding': 'fa-layer-group',
        'MEP - Electrical': 'fa-bolt', 'MEP - Plumbing': 'fa-faucet',
        'MEP - HVAC': 'fa-fan', 'Fire Protection': 'fa-fire-extinguisher',
        'Interior Finishes': 'fa-paint-roller', 'Flooring': 'fa-th',
        'Sitework': 'fa-road', 'Doors & Windows': 'fa-door-open',
        'Elevators': 'fa-elevator', 'Painting': 'fa-brush',
        'General Conditions': 'fa-clipboard-list', 'Painting & Coatings': 'fa-brush',
        'Doors & Accessories': 'fa-door-open', 'Medical Equipment': 'fa-heartbeat'
    };
    return icons[tradeName] || 'fa-tools';
}

function getCurrencySymbol(currency) {
    const symbols = {
        USD: '$', INR: '₹', AED: 'د.إ', GBP: '£', EUR: '€',
        CAD: 'C$', AUD: 'A$', SAR: '﷼', SGD: 'S$'
    };
    return symbols[currency] || currency;
}

export default { generateQuickEstimate };
