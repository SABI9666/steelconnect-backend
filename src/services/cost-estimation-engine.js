/** * Individual cost item class */
class EstimationItem {
    constructor({ code, description, quantity, unit, unitRate, totalCost, category, subcategory = "" }) {
        this.code = code;
        this.description = description;
        this.quantity = parseFloat(quantity) || 0;
        this.unit = unit;
        this.unitRate = parseFloat(unitRate) || 0;
        this.totalCost = parseFloat(totalCost) || 0;
        this.category = category;
        this.subcategory = subcategory;
    }
    toObject() { return { ...this }; }
}

/** * Advanced cost estimation engine focused on Structural Steel */
export class EstimationEngine {
    constructor() {
        this.locationFactors = { "Sydney": 1.15, "Melbourne": 1.12, "Perth": 1.0 };
        this.gstRate = 0.10;
        this.baseRates = this._initializeBaseRates();
    }

    _initializeBaseRates() {
        // --- STREAMLINED: Steel-only rates based on Australian standards ---
        return {
            material_supply: {
                main_members: { rate: 3.20, unit: "kg" }, // UB, UC, PFC, SHS, RHS
                purlins: { rate: 3.10, unit: "kg" },      // C & Z sections
                plates_fittings: { rate: 2.90, unit: "kg" } // Plates, stiffeners, cleats
            },
            connections: {
                m12: { rate: 15, unit: "each" },
                m16: { rate: 20, unit: "each" },
                m20: { rate: 28, unit: "each" },
                m24: { rate: 38, unit: "each" },
            },
            fabrication: {
                main_members: { rate: 1200, unit: "tonne" }, // Medium complexity
                purlins: { rate: 600, unit: "tonne" },        // Simple cutting/punching
                plates_fittings: { rate: 1500, unit: "tonne" } // Cutting and welding
            },
            surface_treatment: {
                galvanizing: { rate: 950, unit: "tonne", minimum: 500 }
            },
            erection: {
                main_members: { rate: 850, unit: "tonne" },
                purlins: { rate: 1100, unit: "tonne" } // Lighter but more pieces
            }
        };
    }

    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            const estimationItems = [];
            const quantities = analysisResult.quantityTakeoff;
            if (!quantities) throw new Error("Invalid analysis result: missing quantityTakeoff");

            // --- RESTRUCTURED: Call specific estimation methods for each steel category ---
            estimationItems.push(...this._estimateMainMembers(quantities.main_members, location));
            estimationItems.push(...this._estimatePurlins(quantities.purlins, location));
            estimationItems.push(...this._estimatePlatesAndFittings(quantities.plates_fittings, location));
            estimationItems.push(...this._estimateConnections(quantities.connections, location));

            const costSummary = this._calculateCostSummary(estimationItems, location, analysisResult.riskAssessment);
            
            return {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                categories: this._groupByCategory(estimationItems),
                assumptions: this._generateSteelAssumptions(),
                exclusions: this._generateSteelExclusions(),
                location: location,
                confidence_score: analysisResult.confidence || 0.85
            };
        } catch (error) {
            console.error(`Steel estimation generation error: ${error.message}`);
            throw error;
        }
    }

    _estimateMainMembers(data, location) {
        if (!data || !data.summary?.total_weight_tonnes > 0) return [];
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.main_members.rate;
        items.push(new EstimationItem({ code: "MM-SUP", description: "Main Members Supply (Beams, Columns, etc.)", quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Main Members", subcategory: "Supply" }));
        // Fabrication
        const fabRate = this.baseRates.fabrication.main_members.rate;
        items.push(new EstimationItem({ code: "MM-FAB", description: "Main Members Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Main Members", subcategory: "Fabrication" }));
        // Treatment
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvMin = this.baseRates.surface_treatment.galvanizing.minimum;
        const galvCost = Math.max(totalTonnes * galvRate, galvMin);
        items.push(new EstimationItem({ code: "MM-TRT", description: "Main Members Hot-Dip Galvanizing", quantity: totalTonnes, unit: "tonne", unitRate: totalTonnes > 0 ? galvCost / totalTonnes : 0, totalCost: galvCost, category: "Main Members", subcategory: "Treatment" }));
        // Erection
        const erectRate = this.baseRates.erection.main_members.rate;
        items.push(new EstimationItem({ code: "MM-ERECT", description: "Main Members Erection", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Main Members", subcategory: "Erection" }));
        
        return items;
    }

    _estimatePurlins(data, location) {
         if (!data || !data.summary?.total_weight_tonnes > 0) return [];
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;

        // Supply
        const supplyRate = this.baseRates.material_supply.purlins.rate;
        items.push(new EstimationItem({ code: "PUR-SUP", description: "Purlins Supply", quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Purlins", subcategory: "Supply" }));
        // Fabrication
        const fabRate = this.baseRates.fabrication.purlins.rate;
        items.push(new EstimationItem({ code: "PUR-FAB", description: "Purlin Fabrication (Cutting/Punching)", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Purlins", subcategory: "Fabrication" }));
        // Erection
        const erectRate = this.baseRates.erection.purlins.rate;
        items.push(new EstimationItem({ code: "PUR-ERECT", description: "Purlin Installation", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Purlins", subcategory: "Erection" }));
        
        return items;
    }

    _estimatePlatesAndFittings(data, location) {
        if (!data || !data.summary?.total_weight_tonnes > 0) return [];
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;

        // Supply
        const supplyRate = this.baseRates.material_supply.plates_fittings.rate;
        items.push(new EstimationItem({ code: "PL-SUP", description: "Plates, Stiffeners & Fittings Supply", quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Plates & Fittings", subcategory: "Supply" }));
        // Fabrication
        const fabRate = this.baseRates.fabrication.plates_fittings.rate;
        items.push(new EstimationItem({ code: "PL-FAB", description: "Plates & Fittings Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Plates & Fittings", subcategory: "Fabrication" }));

        return items;
    }

    _estimateConnections(data, location) {
        if (!data || !data.bolts?.length > 0) return [];
        const items = [];
        data.bolts.forEach(boltSet => {
            const size = boltSet.size.toLowerCase();
            const rate = this.baseRates.connections[size]?.rate || 25; // Default to M20 rate
            const quantity = boltSet.quantity;
            items.push(new EstimationItem({ code: `CON-BOLT-${size.toUpperCase()}`, description: `${size.toUpperCase()} Bolts, Nuts & Washers`, quantity: quantity, unit: "each", unitRate: rate, totalCost: quantity * rate, category: "Connections", subcategory: "Bolts" }));
        });
        return items;
    }

    _calculateCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const complexityMultiplier = riskAssessment?.cost_factors?.complexity_multiplier || 1.05;
        
        const subtotal = baseCost * complexityMultiplier;
        const unforeseenContingency = subtotal * 0.10; // 10% contingency
        const subtotalExGst = subtotal + unforeseenContingency;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;
        
        return {
            base_cost: Math.round(baseCost),
            subtotal_ex_gst: Math.round(subtotalExGst),
            gst: Math.round(gst),
            total_inc_gst: Math.round(totalIncGst),
            currency: 'AUD'
        };
    }

    _groupByCategory(items) {
        return items.reduce((acc, item) => {
            (acc[item.category] = acc[item.category] || { items: [], total: 0 }).items.push(item);
            acc[item.category].total += item.totalCost;
            return acc;
        }, {});
    }

    _generateSteelAssumptions() {
        return [ "Rates based on standard Australian steel sections and market prices.", "Fabrication costs assume medium complexity unless otherwise specified.", "Erection costs assume standard site access and conditions.", "Surface treatment is hot-dip galvanizing for all primary and secondary steel.", "Pricing valid for 30 days." ];
    }

    _generateSteelExclusions() {
        return [ "Building permits, engineering design, or certifications.", "Site work, foundations, or concrete.", "Grouting of base plates.", "Architectural finishes or fire rating.", "Temporary works or site amenities." ];
    }
}
