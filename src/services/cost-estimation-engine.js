/** * Individual cost item class 
 */
class EstimationItem {
    constructor({
        code, description, quantity, unit, unitRate, totalCost,
        category, subcategory = "", notes = "", riskFactor = 1.0, confidence = 0.8
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

    toObject() { return { ...this }; }
}

/** * Advanced cost estimation engine with AI-derived quantities 
 */
export class EstimationEngine {
    constructor() {
        this.locationFactors = { "Sydney": 1.15, "Melbourne": 1.12, "Perth": 1.0 };
        this.gstRate = 0.10;
        this.baseRates = this._initializeBaseRates();
    }

    _initializeBaseRates() {
        return {
            concrete: {
                n32: { rate: 320, unit: "m³" },
                pumping: { rate: 25, unit: "m³", minimum: 800 }
            },
            reinforcement: {
                n12_bars: { rate: 2800, unit: "tonne" },
                sl82_mesh: { rate: 9.20, unit: "m²" }
            },
            structural_steel: { /* Rates for UB, UC, etc. */
                "250 UB 31.4": { rate: 3.15, unit: "kg", weight_per_m: 31.4 },
                "310 UB 40.4": { rate: 3.15, unit: "kg", weight_per_m: 40.4 },
                 // Add many more sections here...
            },
            // --- NEW: Purlins, Plates, and Bolts Rates ---
            purlins: {
                "Z20019": { rate: 3.10, unit: "kg", weight_per_m: 2.38 },
                "C20019": { rate: 3.10, unit: "kg", weight_per_m: 2.38 },
                // Add more purlin types
            },
            plates_stiffeners: {
                supply: { rate: 2.80, unit: "kg" } // Rate for raw plate steel
            },
            bolts: {
                m12: { rate: 12, unit: "each" },
                m16: { rate: 18, unit: "each" },
                m20: { rate: 25, unit: "each" },
                m24: { rate: 35, unit: "each" },
            },
            fabrication: {
                simple: { rate: 800, unit: "tonne" },
                medium: { rate: 1200, unit: "tonne" },
                complex: { rate: 1800, unit: "tonne" },
                plate_work: { rate: 1500, unit: "tonne"} // Fabrication for plates/stiffeners
            },
            treatment: { galvanizing: { rate: 800, unit: "tonne", minimum: 150 } },
            erection: { 
                steel_erection: { rate: 650, unit: "tonne" },
                purlin_erection: { rate: 950, unit: "tonne"}
             },
            anchors: { m16_mechanical: { rate: 42, unit: "each" } },
        };
    }

    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            const estimationItems = [];
            const quantities = analysisResult.quantityTakeoff;
            
            if (!quantities) throw new Error("Invalid analysis result: missing quantityTakeoff");
            
            estimationItems.push(...await this._estimateSteelWorks(quantities, location));
            // --- NEW: Calling estimation methods for new items ---
            estimationItems.push(...await this._estimatePurlinWorks(quantities, location));
            estimationItems.push(...await this._estimatePlateWorks(quantities, location));
            estimationItems.push(...await this._estimateMiscellaneousWorks(quantities, location));

            const costSummary = await this._calculateCostSummary(estimationItems, location, analysisResult.riskAssessment || {});
            
            return {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                // ... other metadata
            };
        } catch (error) {
            console.error(`Estimation generation error: ${error.message}`);
            throw error;
        }
    }

    // --- STEEL WORKS (largely unchanged but focused on main members) ---
    async _estimateSteelWorks(quantities, location) {
        const items = [];
        const steelQty = quantities.steel_quantities || {};
        if (!steelQty.members?.length) return items;

        let totalWeight = (steelQty.summary?.total_steel_weight_tonnes || 0) * 1000;
        
        // Detailed supply items
        for (const member of steelQty.members) {
            const weightKg = parseFloat(member.total_weight_kg) || 0;
            const rate = this.baseRates.structural_steel[member.section]?.rate || 3.20;
            items.push(new EstimationItem({
                code: `STEEL_SUPPLY`, description: `Structural Steel Supply - ${member.section}`,
                quantity: weightKg, unit: "kg", unitRate: rate, totalCost: weightKg * rate,
                category: "Structural Steel", subcategory: "Supply"
            }));
        }
        
        if (totalWeight > 0) {
            const totalTonnes = totalWeight / 1000;
            const fabRate = this.baseRates.fabrication.medium.rate;
            items.push(new EstimationItem({
                code: "STEEL_FAB", description: "Structural Steel Fabrication",
                quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate,
                category: "Structural Steel", subcategory: "Fabrication"
            }));
            const erectionRate = this.baseRates.erection.steel_erection.rate;
            items.push(new EstimationItem({
                code: "STEEL_ERECT", description: "Structural Steel Erection",
                quantity: totalTonnes, unit: "tonne", unitRate: erectionRate, totalCost: totalTonnes * erectionRate,
                category: "Structural Steel", subcategory: "Erection"
            }));
        }
        return items;
    }

    // --- NEW: Purlin Works Estimation ---
    async _estimatePurlinWorks(quantities, location) {
        const items = [];
        const purlinQty = quantities.purlin_quantities || {};
        if (!purlinQty.members?.length) return items;

        const totalWeight = (purlinQty.summary?.total_purlin_weight_tonnes || 0) * 1000;
        const totalTonnes = totalWeight / 1000;
        
        // Aggregate supply cost
        const supplyCost = purlinQty.members.reduce((acc, member) => {
            const weightKg = parseFloat(member.total_weight_kg) || 0;
            const rate = this.baseRates.purlins[member.section]?.rate || 3.10;
            return acc + (weightKg * rate);
        }, 0);

        if(supplyCost > 0) {
            items.push(new EstimationItem({
                code: "PURLIN_SUPPLY", description: "Purlin Supply",
                quantity: totalWeight, unit: "kg", unitRate: supplyCost / totalWeight, totalCost: supplyCost,
                category: "Purlins", subcategory: "Supply"
            }));
        }

        if (totalTonnes > 0) {
            const erectionRate = this.baseRates.erection.purlin_erection.rate;
            items.push(new EstimationItem({
                code: "PURLIN_ERECT", description: "Purlin Erection",
                quantity: totalTonnes, unit: "tonne", unitRate: erectionRate, totalCost: totalTonnes * erectionRate,
                category: "Purlins", subcategory: "Erection"
            }));
        }
        return items;
    }
    
    // --- NEW: Plate & Stiffener Works Estimation ---
    async _estimatePlateWorks(quantities, location) {
        const items = [];
        const plateQty = quantities.plate_quantities || {};
        if (!plateQty.items?.length) return items;
        
        const totalWeight = (plateQty.summary?.total_plate_weight_tonnes || 0) * 1000;
        if (totalWeight <= 0) return items;

        const totalTonnes = totalWeight / 1000;
        const supplyRate = this.baseRates.plates_stiffeners.supply.rate;
        const fabRate = this.baseRates.fabrication.plate_work.rate;

        items.push(new EstimationItem({
            code: "PLATE_SUPPLY", description: "Plate & Stiffener Supply",
            quantity: totalWeight, unit: "kg", unitRate: supplyRate, totalCost: totalWeight * supplyRate,
            category: "Plates & Stiffeners", subcategory: "Supply"
        }));
        
        items.push(new EstimationItem({
            code: "PLATE_FAB", description: "Plate & Stiffener Fabrication",
            quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate,
            category: "Plates & Stiffeners", subcategory: "Fabrication"
        }));

        return items;
    }

    // --- UPDATED: Miscellaneous Works to include Bolts ---
    async _estimateMiscellaneousWorks(quantities, location) {
        const items = [];
        const misc = quantities.miscellaneous || {};
        const locationFactor = this.locationFactors[location] || 1.0;

        if (misc.bolts) {
            Object.entries(misc.bolts).forEach(([boltType, quantity]) => {
                const qty = parseInt(quantity) || 0;
                const size = boltType.replace('_bolts', '');
                if (qty > 0 && this.baseRates.bolts[size]) {
                    const rate = this.baseRates.bolts[size].rate;
                    items.push(new EstimationItem({
                        code: `BOLT_${size.toUpperCase()}`, description: `${size.toUpperCase()} Bolts`,
                        quantity: qty, unit: "each", unitRate: rate * locationFactor, totalCost: qty * rate * locationFactor,
                        category: "Miscellaneous", subcategory: "Bolts"
                    }));
                }
            });
        }
        // ... anchor logic remains the same
        return items;
    }

    async _calculateCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const complexityMultiplier = riskAssessment.cost_factors?.complexity_multiplier || 1.0;
        const subtotalExGst = baseCost * complexityMultiplier;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;
        
        return {
            base_cost: Math.round(baseCost),
            complexity_multiplier: complexityMultiplier,
            subtotal_ex_gst: Math.round(subtotalExGst),
            gst: Math.round(gst),
            total_inc_gst: Math.round(totalIncGst),
            currency: 'AUD'
        };
    }
}
