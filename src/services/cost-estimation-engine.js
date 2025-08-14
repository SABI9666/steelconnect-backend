/** * Individual cost item class 
 */
class EstimationItem {
    constructor({
        code,
        description,
        quantity,
        unit,
        unitRate,
        totalCost,
        category,
        subcategory = "",
        notes = "",
        riskFactor = 1.0,
        confidence = 0.8
    }) {
        this.code = code;
        this.description = description;
        this.quantity = parseFloat(quantity) || 0;
        this.unit = unit;
        this.unitRate = parseFloat(unitRate) || 0;
        this.totalCost = parseFloat(totalCost) || 0;
        this.category = category;
        this.subcategory = subcategory;
        this.notes = notes;
        this.riskFactor = parseFloat(riskFactor) || 1.0;
        this.confidence = parseFloat(confidence) || 0.8;
    }

    toObject() {
        return {
            code: this.code,
            description: this.description,
            quantity: this.quantity,
            unit: this.unit,
            unitRate: this.unitRate,
            totalCost: this.totalCost,
            category: this.category,
            subcategory: this.subcategory,
            notes: this.notes,
            riskFactor: this.riskFactor,
            confidence: this.confidence
        };
    }
}

/** * Advanced cost estimation engine with AI-derived quantities 
 */
export class EstimationEngine {
    constructor() {
        this.locationFactors = {
            "Sydney": 1.15,
            "Melbourne": 1.12,
            "Brisbane": 1.08,
            "Perth": 1.0,
            "Adelaide": 0.95,
            "Canberra": 1.18,
            "Darwin": 1.25,
            "Hobart": 1.05
        };
        this.gstRate = 0.10;
        this.baseRates = this._initializeBaseRates();
    }

    _initializeBaseRates() {
        return {
            concrete: {
                n20: { rate: 280, unit: "m³" },
                n25: { rate: 300, unit: "m³" },
                n32: { rate: 320, unit: "m³" },
                n40: { rate: 380, unit: "m³" },
                pumping: { rate: 25, unit: "m³", minimum: 800 }
            },
            reinforcement: {
                n12_bars: { rate: 2800, unit: "tonne" },
                n16_bars: { rate: 2850, unit: "tonne" },
                n20_bars: { rate: 2900, unit: "tonne" },
                n24_bars: { rate: 2950, unit: "tonne" },
                sl72_mesh: { rate: 8.50, unit: "m²" },
                sl82_mesh: { rate: 9.20, unit: "m²" }
            },
            structural_steel: {
                // Universal Beams - Added missing keys from logs
                "200 UB 22.3": { rate: 3.15, unit: "kg", weight_per_m: 22.3 },
                "410 UB 53.7": { rate: 3.15, unit: "kg", weight_per_m: 53.7 }, // Standard name for "410 UB 54"
                "310 UB 32": { rate: 3.15, unit: "kg", weight_per_m: 32.0 },
                "250 UB 37.3": { rate: 3.15, unit: "kg", weight_per_m: 37.3 },
                "250 UB 25.7": { rate: 3.15, unit: "kg", weight_per_m: 25.7 },
                "250 UB 31.4": { rate: 3.15, unit: "kg", weight_per_m: 31.4 },
                "310 UB 40.4": { rate: 3.15, unit: "kg", weight_per_m: 40.4 },
                "200 UB 18.2": { rate: 3.15, unit: "kg", weight_per_m: 18.2 },
                "200 UB 25.4": { rate: 3.15, unit: "kg", weight_per_m: 25.4 },
                "180 UB 16.1": { rate: 3.15, unit: "kg", weight_per_m: 16.1 },
                "410 UB 59.7": { rate: 3.15, unit: "kg", weight_per_m: 59.7 },
                "360 UB 50.7": { rate: 3.15, unit: "kg", weight_per_m: 50.7 },
                "460 UB 67.1": { rate: 3.15, unit: "kg", weight_per_m: 67.1 },

                // Parallel Flange Channels
                "180 PFC": { rate: 3.25, unit: "kg", weight_per_m: 20.9 },
                "200 PFC": { rate: 3.25, unit: "kg", weight_per_m: 23.4 },
                "150 PFC": { rate: 3.25, unit: "kg", weight_per_m: 17.0 },
                "230 PFC": { rate: 3.25, unit: "kg", weight_per_m: 27.6 },
                "250 PFC": { rate: 3.25, unit: "kg", weight_per_m: 31.1 },
                "300 PFC": { rate: 3.25, unit: "kg", weight_per_m: 37.9 },
                "380 PFC": { rate: 3.25, unit: "kg", weight_per_m: 48.2 },

                // Square Hollow Sections
                "100 X 100 X 9.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 25.8 },
                "100 X 100 X 6.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 17.7 },
                "89 X 89 X 5.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 13.4 },
                "150 X 150 X 9.0 SHS": { rate: 3.25, unit: "kg", weight_per_m: 38.5 },

                // Rectangular Hollow Sections
                "200 X 100 X 5.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 28.0 },
                "200 X 100 X 3.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 17.1 },
                
                // Purlins/Girts
                "Z200 19": { rate: 3.10, unit: "kg", weight_per_m: 2.22 },
                "Z250 24": { rate: 3.10, unit: "kg", weight_per_m: 3.03 },
                "Z200 15": { rate: 3.10, unit: "kg", weight_per_m: 1.74 },
                "Z150 19": { rate: 3.10, unit: "kg", weight_per_m: 1.84 },
                "C20019": { rate: 3.10, unit: "kg", weight_per_m: 2.38 },
                "C200 19": { rate: 3.10, unit: "kg", weight_per_m: 2.38 },
                "C150 19": { rate: 3.10, unit: "kg", weight_per_m: 1.93 },
                "C100 15": { rate: 3.10, unit: "kg", weight_per_m: 1.22 },
                "C200 15": { rate: 3.10, unit: "kg", weight_per_m: 1.86 },
            },
            fabrication: {
                simple: { rate: 800, unit: "tonne" },
                medium: { rate: 1200, unit: "tonne" },
                complex: { rate: 1800, unit: "tonne" }
            },
            treatment: {
                galvanizing: { rate: 800, unit: "tonne", minimum: 150 }
            },
            erection: {
                steel_erection: { rate: 650, unit: "tonne" }
            },
            // ... other categories remain the same
        };
    }
    
    async generateEstimation(analysisResult, location = "Sydney") {
        const estimationItems = [];
        if (!analysisResult || !analysisResult.quantityTakeoff) {
            throw new Error("Invalid analysis result: missing quantityTakeoff");
        }
        const quantities = analysisResult.quantityTakeoff;
        estimationItems.push(...await this._estimateSteelWorks(quantities, location));
        // ... rest of the function remains the same
        const costSummary = await this._calculateCostSummary(estimationItems, location, analysisResult.riskAssessment || {});
        return {
            project_id: analysisResult.projectId || 'unknown',
            items: estimationItems.map(item => item.toObject()),
            cost_summary: costSummary,
            // ... rest of the object remains the same
        };
    }

    async _estimateSteelWorks(quantities, location) {
        const items = [];
        const steelQty = quantities.steel_quantities || {};
        if (!steelQty.members || !Array.isArray(steelQty.members)) {
            return items;
        }

        let totalWeight = 0;
        for (let i = 0; i < steelQty.members.length; i++) {
            const member = steelQty.members[i];
            const sectionDetails = this._findSteelSectionDetails(member.section);

            if (!sectionDetails) {
                console.log(`Steel section "${member.section}" not found. Using fallback estimation.`);
                // Fallback logic remains the same
                continue;
            }

            // Main logic remains the same
            let finalWeightKg = member.total_weight_kg || 0;
            if (finalWeightKg <= 0) {
                 finalWeightKg = (member.total_length_m || (member.quantity * 6)) * sectionDetails.weight_per_m;
            }
            totalWeight += finalWeightKg;
            
            items.push(new EstimationItem({
                 // ... item details
            }));
        }

        // Aggregate costs (fabrication, etc.) remain the same
        return items;
    }

    /**
     * --- ENHANCED FUZZY MATCHING LOGIC ---
     * Finds a steel section, attempting a close match if an exact one fails.
     */
    _findSteelSectionDetails(sectionName) {
        if (!sectionName) return null;

        const normalizedSectionName = sectionName.toUpperCase().replace(/\s+/g, " ").trim();
        
        // 1. Try for an exact match
        if (this.baseRates.structural_steel[normalizedSectionName]) {
            return this.baseRates.structural_steel[normalizedSectionName];
        }

        // 2. Try for a normalized key match (e.g., "C20019" vs "C200 19")
        const getNormalizedKey = (key) => key.toUpperCase().replace(/\s+/g, "").replace(/[×]/g, 'X');
        const cleanSectionKey = normalizedSectionName.replace(/\s+/g, "").replace(/[×]/g, 'X');

        for (const [key, details] of Object.entries(this.baseRates.structural_steel)) {
            if (getNormalizedKey(key) === cleanSectionKey) {
                return details;
            }
        }

        // 3. --- NEW: Fuzzy match for UB, UC, PFC with weight tolerance ---
        const typeMatch = normalizedSectionName.match(/^(\d+\s*(?:UB|UC|PFC))/);
        const weightMatch = normalizedSectionName.match(/(\d+\.?\d*)$/);

        if (typeMatch && weightMatch) {
            const sectionType = typeMatch[1];
            const targetWeight = parseFloat(weightMatch[1]);
            let bestMatch = null;
            let smallestDiff = Infinity;

            for (const [key, details] of Object.entries(this.baseRates.structural_steel)) {
                if (key.startsWith(sectionType)) {
                    const keyWeight = details.weight_per_m;
                    const diff = Math.abs(targetWeight - keyWeight);

                    // Allow up to a 2.0 kg/m difference for a "close enough" match
                    if (diff < smallestDiff && diff < 2.0) {
                        smallestDiff = diff;
                        bestMatch = details;
                    }
                }
            }
            if (bestMatch) {
                console.log(`Found closest match for "${sectionName}": using details for a similar section.`);
                return bestMatch;
            }
        }
        
        return null; // Return null if no match is found
    }

    // --- All other helper functions (_estimateWeightPerMeter, _calculateCostSummary, etc.) remain the same ---
}
