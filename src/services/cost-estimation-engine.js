// Comprehensive Australian Steel Estimation Engine

class ComprehensiveEstimationItem {
    constructor({ code, description, quantity, unit, unitRate, totalCost, category, subcategory = "", specification = "" }) {
        this.code = code;
        this.description = description;
        this.quantity = parseFloat(quantity) || 0;
        this.unit = unit;
        this.unitRate = parseFloat(unitRate) || 0;
        this.totalCost = parseFloat(totalCost) || 0;
        this.category = category;
        this.subcategory = subcategory;
        this.specification = specification;
    }
    toObject() { return { ...this }; }
}

// RENAMED CLASS to be compatible with estimation.js
export class EstimationEngine {
    constructor() {
        this.locationFactors = { 
            "Sydney": 1.15, "Melbourne": 1.12, "Brisbane": 1.08, "Perth": 1.0, 
            "Adelaide": 1.05, "Darwin": 1.25, "Hobart": 1.20, "Canberra": 1.10 
        };
        this.gstRate = 0.10;
        this.baseRates = this._initializeComprehensiveRates();
    }

    _initializeComprehensiveRates() {
        return {
            material_supply: {
                main_members: { universal_beams: { rate: 3.20, unit: "kg" }, universal_columns: { rate: 3.25, unit: "kg" }, pfc_channels: { rate: 3.30, unit: "kg" }, welded_beams: { rate: 3.40, unit: "kg" }},
                hollow_sections: { shs: { rate: 3.80, unit: "kg" }, rhs: { rate: 3.80, unit: "kg" }, chs: { rate: 3.90, unit: "kg" }},
                angles: { equal_angles: { rate: 3.15, unit: "kg" }, unequal_angles: { rate: 3.20, unit: "kg" }},
                purlins: { c_purlins: { rate: 3.60, unit: "kg" }, z_purlins: { rate: 3.60, unit: "kg" }, top_hats: { rate: 3.70, unit: "kg" }},
                plates_fittings: { hot_rolled_plate: { rate: 2.90, unit: "kg" }, base_plates: { rate: 2.95, unit: "kg" }, stiffeners: { rate: 3.10, unit: "kg" }, cleats_brackets: { rate: 3.20, unit: "kg" }},
                bars: { flat_bars: { rate: 3.25, unit: "kg" }, round_bars: { rate: 3.30, unit: "kg" }, square_bars: { rate: 3.35, unit: "kg" }}
            },
            fabrication: {
                main_members: { simple_beams: { rate: 1000, unit: "tonne" }, complex_beams: { rate: 1400, unit: "tonne" }, columns: { rate: 1200, unit: "tonne" }, welded_sections: { rate: 1800, unit: "tonne" }},
                hollow_sections: { simple: { rate: 800, unit: "tonne" }, complex: { rate: 1200, unit: "tonne" }},
                angles: { simple: { rate: 900, unit: "tonne" }, complex: { rate: 1300, unit: "tonne" }},
                purlins: { standard: { rate: 600, unit: "tonne" }, complex: { rate: 900, unit: "tonne" }},
                plates_fittings: { cutting: { rate: 800, unit: "tonne" }, machining: { rate: 1500, unit: "tonne" }, complex_welding: { rate: 2000, unit: "tonne" }},
                bars: { standard: { rate: 700, unit: "tonne" }, threaded: { rate: 1100, unit: "tonne" }}
            },
            surface_treatment: {
                galvanizing: { rate: 950, unit: "tonne", minimum: 500 },
                painting: { rate: 400, unit: "tonne", minimum: 200 },
                powder_coating: { rate: 800, unit: "tonne", minimum: 300 }
            },
            erection: {
                main_members: { ground_level: { rate: 600, unit: "tonne" }, elevated: { rate: 850, unit: "tonne" }, high_level: { rate: 1200, unit: "tonne" }},
                hollow_sections: { rate: 900, unit: "tonne" },
                angles: { rate: 1000, unit: "tonne" },
                purlins: { rate: 1100, unit: "tonne" },
                plates_fittings: { rate: 1300, unit: "tonne" }
            },
            connections: {
                bolts: { m12: { rate: 15, unit: "each" }, m16: { rate: 20, unit: "each" }, m20: { rate: 28, unit: "each" }, m24: { rate: 38, unit: "each" }, m30: { rate: 55, unit: "each" }, m36: { rate: 75, unit: "each" }},
                hardware: { washers: { rate: 2, unit: "each" }, nuts: { rate: 3, unit: "each" }, anchor_bolts: { rate: 45, unit: "each" }}
            },
            welding: {
                fillet_6mm: { rate: 25, unit: "metre" }, fillet_8mm: { rate: 35, unit: "metre" },
                fillet_10mm: { rate: 45, unit: "metre" }, butt_weld: { rate: 65, unit: "metre" }
            }
        };
    }

    // RENAMED METHOD to be compatible with estimation.js
    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            console.log('🚀 Starting COMPREHENSIVE Steel Estimation...');
            
            const estimationItems = [];
            const quantities = analysisResult.quantityTakeoff;
            
            if (!quantities) {
                throw new Error("Invalid analysis result: missing quantityTakeoff");
            }

            estimationItems.push(...this._estimateMainMembers(quantities.main_members, location));
            estimationItems.push(...this._estimateHollowSections(quantities.hollow_sections, location));
            estimationItems.push(...this._estimateAngles(quantities.angles, location));
            estimationItems.push(...this._estimatePurlins(quantities.purlins, location));
            estimationItems.push(...this._estimatePlatesAndFittings(quantities.plates_fittings, location));
            estimationItems.push(...this._estimateBars(quantities.bars, location));
            estimationItems.push(...this._estimateConnections(quantities.connections, location));
            estimationItems.push(...this._estimateHardware(quantities.hardware, location));

            const costSummary = this._calculateComprehensiveCostSummary(estimationItems, location, analysisResult.riskAssessment);
            
            console.log(`✅ Estimation Complete: Total: $${costSummary.total_inc_gst.toLocaleString()}`);
            
            return {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                categories: this._groupByComprehensiveCategory(estimationItems),
                standards_compliance: analysisResult.standards || {},
                assumptions: this._generateComprehensiveAssumptions(),
                exclusions: this._generateComprehensiveExclusions(),
                location: location,
                confidence_score: analysisResult.confidence || 0.85,
                estimation_date: new Date().toISOString(),
                validity_period: '30 days'
            };
            
        } catch (error) {
            console.error(`❌ Comprehensive estimation error: ${error.message}`);
            throw error;
        }
    }

    _estimateMainMembers(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const hasComplexMembers = data.items?.some(item => item.section.includes('UC') || item.section.includes('WB')) || false;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.main_members.universal_beams.rate;
        items.push(new ComprehensiveEstimationItem({ code: "MM-SUP", description: `Main Members Supply`, quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Main Members", subcategory: "Material Supply" }));
        
        // Fabrication
        const fabRate = hasComplexMembers ? this.baseRates.fabrication.main_members.complex_beams.rate : this.baseRates.fabrication.main_members.simple_beams.rate;
        items.push(new ComprehensiveEstimationItem({ code: "MM-FAB", description: `Main Members Fabrication (${hasComplexMembers ? 'Complex' : 'Standard'})`, quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Main Members", subcategory: "Fabrication" }));
        
        // Surface Treatment
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvMin = this.baseRates.surface_treatment.galvanizing.minimum;
        const galvCost = Math.max(totalTonnes * galvRate, galvMin);
        items.push(new ComprehensiveEstimationItem({ code: "MM-GALV", description: "Main Members Hot-Dip Galvanizing", quantity: totalTonnes, unit: "tonne", unitRate: totalTonnes > 0 ? galvCost / totalTonnes : 0, totalCost: galvCost, category: "Main Members", subcategory: "Surface Treatment" }));
        
        // Erection
        const erectRate = this.baseRates.erection.main_members.elevated.rate;
        items.push(new ComprehensiveEstimationItem({ code: "MM-ERECT", description: "Main Members Erection", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Main Members", subcategory: "Installation" }));
        
        return items;
    }

    _estimateHollowSections(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const supplyRate = this.baseRates.material_supply.hollow_sections.shs.rate;
        items.push(new ComprehensiveEstimationItem({ code: "HS-SUP", description: `Hollow Sections Supply`, quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Hollow Sections", subcategory: "Material Supply" }));
        
        const fabRate = this.baseRates.fabrication.hollow_sections.simple.rate;
        items.push(new ComprehensiveEstimationItem({ code: "HS-FAB", description: "Hollow Sections Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Hollow Sections", subcategory: "Fabrication" }));
        
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        items.push(new ComprehensiveEstimationItem({ code: "HS-GALV", description: "Hollow Sections Galvanizing", quantity: totalTonnes, unit: "tonne", unitRate: galvRate, totalCost: totalTonnes * galvRate, category: "Hollow Sections", subcategory: "Surface Treatment" }));
        
        const erectRate = this.baseRates.erection.hollow_sections.rate;
        items.push(new ComprehensiveEstimationItem({ code: "HS-ERECT", description: "Hollow Sections Erection", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Hollow Sections", subcategory: "Installation" }));
        
        return items;
    }

    _estimateAngles(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const supplyRate = this.baseRates.material_supply.angles.equal_angles.rate;
        items.push(new ComprehensiveEstimationItem({ code: "ANG-SUP", description: `Angle Supply`, quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Angles", subcategory: "Material Supply" }));
        
        const fabRate = this.baseRates.fabrication.angles.simple.rate;
        items.push(new ComprehensiveEstimationItem({ code: "ANG-FAB", description: "Angle Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Angles", subcategory: "Fabrication" }));
        
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        items.push(new ComprehensiveEstimationItem({ code: "ANG-GALV", description: "Angle Galvanizing", quantity: totalTonnes, unit: "tonne", unitRate: galvRate, totalCost: totalTonnes * galvRate, category: "Angles", subcategory: "Surface Treatment" }));
        
        const erectRate = this.baseRates.erection.angles.rate;
        items.push(new ComprehensiveEstimationItem({ code: "ANG-ERECT", description: "Angle Erection", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Angles", subcategory: "Installation" }));
        
        return items;
    }

    _estimatePurlins(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const supplyRate = this.baseRates.material_supply.purlins.c_purlins.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PUR-SUP", description: `Purlin Supply`, quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Purlins", subcategory: "Material Supply" }));
        
        const fabRate = this.baseRates.fabrication.purlins.standard.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PUR-FAB", description: "Purlin Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Purlins", subcategory: "Fabrication" }));
        
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate * 0.7;
        items.push(new ComprehensiveEstimationItem({ code: "PUR-GALV", description: "Purlin Galvanizing (Pre-galvanized)", quantity: totalTonnes, unit: "tonne", unitRate: galvRate, totalCost: totalTonnes * galvRate, category: "Purlins", subcategory: "Surface Treatment" }));
        
        const erectRate = this.baseRates.erection.purlins.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PUR-ERECT", description: "Purlin Installation", quantity: totalTonnes, unit: "tonne", unitRate: erectRate, totalCost: totalTonnes * erectRate, category: "Purlins", subcategory: "Installation" }));
        
        return items;
    }

    _estimatePlatesAndFittings(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const supplyRate = this.baseRates.material_supply.plates_fittings.hot_rolled_plate.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PL-SUP", description: "Plates & Fittings Supply", quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Plates & Fittings", subcategory: "Material Supply" }));
        
        const fabRate = this.baseRates.fabrication.plates_fittings.cutting.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PL-FAB", description: "Plates & Fittings Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Plates & Fittings", subcategory: "Fabrication" }));
        
        const weldLength = totalTonnes * 20;
        const weldRate = this.baseRates.welding.fillet_8mm.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PL-WELD", description: "Plate Welding (8mm fillet)", quantity: weldLength, unit: "metre", unitRate: weldRate, totalCost: weldLength * weldRate, category: "Plates & Fittings", subcategory: "Welding" }));
        
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        items.push(new ComprehensiveEstimationItem({ code: "PL-GALV", description: "Plates & Fittings Galvanizing", quantity: totalTonnes, unit: "tonne", unitRate: galvRate, totalCost: totalTonnes * galvRate, category: "Plates & Fittings", subcategory: "Surface Treatment" }));
        
        return items;
    }

    _estimateBars(data, location) {
        if (!data || !data.summary?.total_weight_tonnes) return [];
        
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        const supplyRate = this.baseRates.material_supply.bars.flat_bars.rate;
        items.push(new ComprehensiveEstimationItem({ code: "BAR-SUP", description: "Bars & Rods Supply", quantity: totalKilos, unit: "kg", unitRate: supplyRate * locationFactor, totalCost: totalKilos * supplyRate * locationFactor, category: "Bars", subcategory: "Material Supply" }));
        
        const fabRate = this.baseRates.fabrication.bars.standard.rate;
        items.push(new ComprehensiveEstimationItem({ code: "BAR-FAB", description: "Bar Fabrication", quantity: totalTonnes, unit: "tonne", unitRate: fabRate, totalCost: totalTonnes * fabRate, category: "Bars", subcategory: "Fabrication" }));
        
        return items;
    }

    _estimateConnections(data, location) {
        if (!data || !data.bolts?.length) return [];
        
        const items = [];
        
        data.bolts.forEach(boltSet => {
            const size = boltSet.size.toLowerCase();
            const quantity = boltSet.quantity;
            const boltRate = this.baseRates.connections.bolts[size]?.rate || this.baseRates.connections.bolts.m20.rate;
            
            items.push(new ComprehensiveEstimationItem({ code: `BOLT-${size.toUpperCase()}`, description: `${size.toUpperCase()} Structural Bolts`, quantity, unit: "each", unitRate: boltRate, totalCost: quantity * boltRate, category: "Connections", subcategory: "Structural Bolts" }));
            
            const nutRate = this.baseRates.connections.hardware.nuts.rate;
            items.push(new ComprehensiveEstimationItem({ code: `NUT-${size.toUpperCase()}`, description: `${size.toUpperCase()} Hex Nuts`, quantity, unit: "each", unitRate: nutRate, totalCost: quantity * nutRate, category: "Connections", subcategory: "Hardware" }));
            
            const washerRate = this.baseRates.connections.hardware.washers.rate;
            items.push(new ComprehensiveEstimationItem({ code: `WASH-${size.toUpperCase()}`, description: `${size.toUpperCase()} Washers`, quantity: quantity * 2, unit: "each", unitRate: washerRate, totalCost: quantity * 2 * washerRate, category: "Connections", subcategory: "Hardware" }));
        });
        
        return items;
    }

    _estimateHardware(data, location) {
        if (!data || !data.items?.length) return [];
        
        const items = [];
        
        data.items.forEach(item => {
            const quantity = item.quantity || 1;
            const designation = item.designation.toLowerCase();
            
            let rate = 5;
            if (designation.includes('washer')) rate = this.baseRates.connections.hardware.washers.rate;
            if (designation.includes('nut')) rate = this.baseRates.connections.hardware.nuts.rate;
            if (designation.includes('anchor')) rate = this.baseRates.connections.hardware.anchor_bolts.rate;
            
            items.push(new ComprehensiveEstimationItem({ code: `HW-${item.designation.replace(/\s+/g, '').toUpperCase()}`, description: `${item.designation} Hardware`, quantity, unit: "each", unitRate: rate, totalCost: quantity * rate, category: "Hardware", subcategory: "Miscellaneous Hardware" }));
        });
        
        return items;
    }

    _calculateComprehensiveCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const complexityMultiplier = riskAssessment?.cost_factors?.complexity_multiplier || 1.05;
        
        const subtotal = baseCost * complexityMultiplier;
        const contingency = subtotal * 0.10;
        const preliminaries = subtotal * 0.08;
        const overheads = subtotal * 0.12;
        
        const subtotalExGst = subtotal + contingency + preliminaries + overheads;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;
        
        return {
            base_cost: Math.round(baseCost),
            complexity_adjustment: Math.round(baseCost * (complexityMultiplier - 1)),
            contingency: Math.round(contingency),
            preliminaries: Math.round(preliminaries),
            overheads_profit: Math.round(overheads),
            subtotal_ex_gst: Math.round(subtotalExGst),
            gst: Math.round(gst),
            total_inc_gst: Math.round(totalIncGst),
            currency: 'AUD',
            rate_per_tonne: Math.round(totalIncGst / Math.max(this._getTotalWeight(items), 0.1))
        };
    }

    _getTotalWeight(items) {
        return items.reduce((total, item) => {
            if (item.unit === 'tonne') return total + item.quantity;
            if (item.unit === 'kg') return total + (item.quantity / 1000);
            return total;
        }, 0);
    }

    _groupByComprehensiveCategory(items) {
        return items.reduce((acc, item) => {
            const { category, subcategory } = item;
            if (!acc[category]) acc[category] = { items: [], total: 0, subcategories: {} };
            
            acc[category].items.push(item);
            acc[category].total += item.totalCost;
            
            if (!acc[category].subcategories[subcategory]) acc[category].subcategories[subcategory] = { items: [], total: 0 };
            acc[category].subcategories[subcategory].items.push(item);
            acc[category].subcategories[subcategory].total += item.totalCost;
            
            return acc;
        }, {});
    }

    _generateComprehensiveAssumptions() {
        return [
            "Rates based on current Australian steel market prices and AS/NZS standards",
            "Fabrication costs assume standard complexity and workshop conditions",
            "Erection costs assume standard site access and working conditions up to 15m height",
            "All primary structural steel to be hot-dip galvanized to AS/NZS 4680",
            "Cold formed sections (purlins) assumed to be pre-galvanized Z275 coating",
            "Bolts, nuts and washers to structural grade AS/NZS 4291 Grade 8.8",
            "10% contingency included for unforeseen variations",
            "Pricing valid for 30 days from quotation date",
        ];
    }

    _generateComprehensiveExclusions() {
        return [
            "Engineering design, calculations, and certification",
            "Building permits, approvals, and council fees",
            "Site survey and set-out",
            "Concrete foundations, anchor bolt installation, and grouting",
            "Architectural finishes, cladding, or roofing",
            "Fire rating treatments",
            "Crane hire and site access works",
            "Site amenities, safety barriers, or scaffolding",
        ];
    }
}
