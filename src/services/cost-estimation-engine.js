/** Individual cost item class for comprehensive steel estimation */
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

/** Comprehensive Australian Steel Estimation Engine */
export class ComprehensiveSteelEstimationEngine {
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
            // Material Supply Rates (per kg unless specified)
            material_supply: {
                // Hot Rolled Sections (AS/NZS 3679.1)
                main_members: { 
                    universal_beams: { rate: 3.20, unit: "kg" },
                    universal_columns: { rate: 3.25, unit: "kg" },
                    pfc_channels: { rate: 3.30, unit: "kg" },
                    welded_beams: { rate: 3.40, unit: "kg" }
                },
                // Cold Formed Hollow Sections (AS/NZS 1163)
                hollow_sections: {
                    shs: { rate: 3.80, unit: "kg" }, // Higher rate for cold formed
                    rhs: { rate: 3.80, unit: "kg" },
                    chs: { rate: 3.90, unit: "kg" }
                },
                // Hot Rolled Angles (AS/NZS 3679.1)
                angles: {
                    equal_angles: { rate: 3.15, unit: "kg" },
                    unequal_angles: { rate: 3.20, unit: "kg" }
                },
                // Cold Formed Purlins (AS/NZS 4600)
                purlins: {
                    c_purlins: { rate: 3.60, unit: "kg" }, // Higher rate for cold formed
                    z_purlins: { rate: 3.60, unit: "kg" },
                    top_hats: { rate: 3.70, unit: "kg" }
                },
                // Plates and Fabricated Items (AS/NZS 3678)
                plates_fittings: {
                    hot_rolled_plate: { rate: 2.90, unit: "kg" },
                    base_plates: { rate: 2.95, unit: "kg" },
                    stiffeners: { rate: 3.10, unit: "kg" }, // Higher due to cutting
                    cleats_brackets: { rate: 3.20, unit: "kg" }
                },
                // Bars and Rods
                bars: {
                    flat_bars: { rate: 3.25, unit: "kg" },
                    round_bars: { rate: 3.30, unit: "kg" },
                    square_bars: { rate: 3.35, unit: "kg" }
                }
            },
            
            // Fabrication Rates (per tonne)
            fabrication: {
                main_members: {
                    simple_beams: { rate: 1000, unit: "tonne" }, // Minimal cutting/drilling
                    complex_beams: { rate: 1400, unit: "tonne" }, // Multiple connections
                    columns: { rate: 1200, unit: "tonne" }, // Base plate welding
                    welded_sections: { rate: 1800, unit: "tonne" } // Full welding
                },
                hollow_sections: {
                    simple: { rate: 800, unit: "tonne" }, // Cut to length
                    complex: { rate: 1200, unit: "tonne" } // End plates, connections
                },
                angles: {
                    simple: { rate: 900, unit: "tonne" }, // Cut and drill
                    complex: { rate: 1300, unit: "tonne" } // Multiple connections
                },
                purlins: {
                    standard: { rate: 600, unit: "tonne" }, // Cut and punch
                    complex: { rate: 900, unit: "tonne" } // Sleeves, brackets
                },
                plates_fittings: {
                    cutting: { rate: 800, unit: "tonne" }, // Plasma/flame cutting
                    machining: { rate: 1500, unit: "tonne" }, // Base plate machining
                    complex_welding: { rate: 2000, unit: "tonne" } // Built-up sections
                },
                bars: {
                    standard: { rate: 700, unit: "tonne" }, // Cut and bend
                    threaded: { rate: 1100, unit: "tonne" } // Threading operations
                }
            },
            
            // Surface Treatment Rates
            surface_treatment: {
                galvanizing: { rate: 950, unit: "tonne", minimum: 500 },
                painting: { rate: 400, unit: "tonne", minimum: 200 },
                powder_coating: { rate: 800, unit: "tonne", minimum: 300 }
            },
            
            // Erection Rates (per tonne)
            erection: {
                main_members: {
                    ground_level: { rate: 600, unit: "tonne" },
                    elevated: { rate: 850, unit: "tonne" },
                    high_level: { rate: 1200, unit: "tonne" } // >15m height
                },
                hollow_sections: { rate: 900, unit: "tonne" },
                angles: { rate: 1000, unit: "tonne" }, // More pieces per tonne
                purlins: { rate: 1100, unit: "tonne" }, // Many small pieces
                plates_fittings: { rate: 1300, unit: "tonne" } // Complex positioning
            },
            
            // Connections and Hardware
            connections: {
                bolts: {
                    m12: { rate: 15, unit: "each" },
                    m16: { rate: 20, unit: "each" },
                    m20: { rate: 28, unit: "each" },
                    m24: { rate: 38, unit: "each" },
                    m30: { rate: 55, unit: "each" },
                    m36: { rate: 75, unit: "each" }
                },
                hardware: {
                    washers: { rate: 2, unit: "each" },
                    nuts: { rate: 3, unit: "each" },
                    anchor_bolts: { rate: 45, unit: "each" }
                }
            },
            
            // Welding (per metre of weld)
            welding: {
                fillet_6mm: { rate: 25, unit: "metre" },
                fillet_8mm: { rate: 35, unit: "metre" },
                fillet_10mm: { rate: 45, unit: "metre" },
                butt_weld: { rate: 65, unit: "metre" }
            }
        };
    }

    async generateComprehensiveEstimation(analysisResult, location = "Sydney") {
        try {
            console.log('🚀 Starting COMPREHENSIVE Steel Estimation...');
            console.log('📋 Analysis Result Categories:', Object.keys(analysisResult.quantityTakeoff || {}));
            
            const estimationItems = [];
            const quantities = analysisResult.quantityTakeoff;
            
            if (!quantities) {
                throw new Error("Invalid analysis result: missing quantityTakeoff");
            }

            // Process all steel categories
            estimationItems.push(...this._estimateMainMembers(quantities.main_members, location));
            estimationItems.push(...this._estimateHollowSections(quantities.hollow_sections, location));
            estimationItems.push(...this._estimateAngles(quantities.angles, location));
            estimationItems.push(...this._estimatePurlins(quantities.purlins, location));
            estimationItems.push(...this._estimatePlatesAndFittings(quantities.plates_fittings, location));
            estimationItems.push(...this._estimateBars(quantities.bars, location));
            estimationItems.push(...this._estimateConnections(quantities.connections, location));
            estimationItems.push(...this._estimateHardware(quantities.hardware, location));

            const costSummary = this._calculateComprehensiveCostSummary(estimationItems, location, analysisResult.riskAssessment);
            
            console.log(`✅ Estimation Complete: ${estimationItems.length} line items, Total: $${costSummary.total_inc_gst.toLocaleString()}`);
            
            return {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                categories: this._groupByComprehensiveCategory(estimationItems),
                standards_compliance: analysisResult.standards || {
                    compliance: 'AS/NZS 3679, AS/NZS 1163, AS/NZS 4600, AS/NZS 4291',
                    weightSource: 'Australian Standards'
                },
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
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Main Members...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const memberCount = data.summary.member_count || 0;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Determine complexity based on member types
        const hasComplexMembers = data.items?.some(item => 
            item.section.includes('UC') || item.section.includes('WB')
        ) || false;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.main_members.universal_beams.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "MM-SUP", 
            description: `Main Members Supply (${memberCount} members)`, 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Main Members", 
            subcategory: "Material Supply",
            specification: "AS/NZS 3679.1 Grade 300"
        }));
        
        // Fabrication
        const fabRate = hasComplexMembers ? 
            this.baseRates.fabrication.main_members.complex_beams.rate :
            this.baseRates.fabrication.main_members.simple_beams.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "MM-FAB", 
            description: `Main Members Fabrication (${hasComplexMembers ? 'Complex' : 'Standard'})`, 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Main Members", 
            subcategory: "Fabrication"
        }));
        
        // Surface Treatment
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvMin = this.baseRates.surface_treatment.galvanizing.minimum;
        const galvCost = Math.max(totalTonnes * galvRate, galvMin);
        items.push(new ComprehensiveEstimationItem({
            code: "MM-GALV", 
            description: "Main Members Hot-Dip Galvanizing", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: totalTonnes > 0 ? galvCost / totalTonnes : 0, 
            totalCost: galvCost, 
            category: "Main Members", 
            subcategory: "Surface Treatment",
            specification: "AS/NZS 4680 Galvanizing"
        }));
        
        // Erection - FIXED: Should reference main_members, not hollow_sections
        const erectRate = this.baseRates.erection.main_members.elevated.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "MM-ERECT", 
            description: "Main Members Erection", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: erectRate, 
            totalCost: totalTonnes * erectRate, 
            category: "Main Members", 
            subcategory: "Installation"
        }));
        
        console.log(`   ✅ Main Members: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimateHollowSections(data, location) {
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Hollow Sections...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const memberCount = data.summary.member_count || 0;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.hollow_sections.shs.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "HS-SUP", 
            description: `Hollow Sections Supply (${memberCount} sections)`, 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Hollow Sections", 
            subcategory: "Material Supply",
            specification: "AS/NZS 1163 Grade C450"
        }));
        
        // Fabrication
        const fabRate = this.baseRates.fabrication.hollow_sections.simple.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "HS-FAB", 
            description: "Hollow Sections Fabrication", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Hollow Sections", 
            subcategory: "Fabrication"
        }));
        
        // Galvanizing
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvCost = totalTonnes * galvRate;
        items.push(new ComprehensiveEstimationItem({
            code: "HS-GALV", 
            description: "Hollow Sections Galvanizing", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: galvRate, 
            totalCost: galvCost, 
            category: "Hollow Sections", 
            subcategory: "Surface Treatment"
        }));
        
        // Erection
        const erectRate = this.baseRates.erection.hollow_sections.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "HS-ERECT", 
            description: "Hollow Sections Erection", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: erectRate, 
            totalCost: totalTonnes * erectRate, 
            category: "Hollow Sections", 
            subcategory: "Installation"
        }));
        
        console.log(`   ✅ Hollow Sections: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimateAngles(data, location) {
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Angles...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const memberCount = data.summary.member_count || 0;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.angles.equal_angles.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "ANG-SUP", 
            description: `Angle Supply (${memberCount} angles)`, 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Angles", 
            subcategory: "Material Supply",
            specification: "AS/NZS 3679.1 Grade 300"
        }));
        
        // Fabrication
        const fabRate = this.baseRates.fabrication.angles.simple.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "ANG-FAB", 
            description: "Angle Fabrication", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Angles", 
            subcategory: "Fabrication"
        }));
        
        // Galvanizing
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvCost = totalTonnes * galvRate;
        items.push(new ComprehensiveEstimationItem({
            code: "ANG-GALV", 
            description: "Angle Galvanizing", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: galvRate, 
            totalCost: galvCost, 
            category: "Angles", 
            subcategory: "Surface Treatment"
        }));
        
        // Erection
        const erectRate = this.baseRates.erection.angles.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "ANG-ERECT", 
            description: "Angle Erection", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: erectRate, 
            totalCost: totalTonnes * erectRate, 
            category: "Angles", 
            subcategory: "Installation"
        }));
        
        console.log(`   ✅ Angles: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimatePurlins(data, location) {
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Purlins...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const memberCount = data.summary.member_count || 0;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.purlins.c_purlins.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PUR-SUP", 
            description: `Purlin Supply (${memberCount} purlins)`, 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Purlins", 
            subcategory: "Material Supply",
            specification: "AS/NZS 4600 Grade G450"
        }));
        
        // Fabrication
        const fabRate = this.baseRates.fabrication.purlins.standard.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PUR-FAB", 
            description: "Purlin Fabrication (Cutting/Punching)", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Purlins", 
            subcategory: "Fabrication"
        }));
        
        // Galvanizing (usually pre-galvanized for purlins)
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate * 0.7; // Reduced rate for pre-galv
        const galvCost = totalTonnes * galvRate;
        items.push(new ComprehensiveEstimationItem({
            code: "PUR-GALV", 
            description: "Purlin Galvanizing (Pre-galvanized)", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: galvRate, 
            totalCost: galvCost, 
            category: "Purlins", 
            subcategory: "Surface Treatment",
            specification: "AS/NZS 4680 Z275 coating"
        }));
        
        // Erection
        const erectRate = this.baseRates.erection.purlins.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PUR-ERECT", 
            description: "Purlin Installation", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: erectRate, 
            totalCost: totalTonnes * erectRate, 
            category: "Purlins", 
            subcategory: "Installation"
        }));
        
        console.log(`   ✅ Purlins: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimatePlatesAndFittings(data, location) {
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Plates & Fittings...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.plates_fittings.hot_rolled_plate.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PL-SUP", 
            description: "Plates, Stiffeners & Fittings Supply", 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Plates & Fittings", 
            subcategory: "Material Supply",
            specification: "AS/NZS 3678 Grade 250"
        }));
        
        // Fabrication (cutting and welding)
        const fabRate = this.baseRates.fabrication.plates_fittings.cutting.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PL-FAB", 
            description: "Plates & Fittings Fabrication", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Plates & Fittings", 
            subcategory: "Fabrication"
        }));
        
        // Welding (estimated)
        const weldLength = totalTonnes * 20; // Estimate 20m of weld per tonne
        const weldRate = this.baseRates.welding.fillet_8mm.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "PL-WELD", 
            description: "Plate Welding (8mm fillet)", 
            quantity: weldLength, 
            unit: "metre", 
            unitRate: weldRate, 
            totalCost: weldLength * weldRate, 
            category: "Plates & Fittings", 
            subcategory: "Welding"
        }));
        
        // Galvanizing
        const galvRate = this.baseRates.surface_treatment.galvanizing.rate;
        const galvCost = totalTonnes * galvRate;
        items.push(new ComprehensiveEstimationItem({
            code: "PL-GALV", 
            description: "Plates & Fittings Galvanizing", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: galvRate, 
            totalCost: galvCost, 
            category: "Plates & Fittings", 
            subcategory: "Surface Treatment"
        }));
        
        console.log(`   ✅ Plates & Fittings: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimateBars(data, location) {
        if (!data || !data.summary?.total_weight_tonnes || data.summary.total_weight_tonnes <= 0) return [];
        
        console.log('🔧 Estimating Bars...');
        const items = [];
        const totalTonnes = data.summary.total_weight_tonnes;
        const totalKilos = totalTonnes * 1000;
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Supply
        const supplyRate = this.baseRates.material_supply.bars.flat_bars.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "BAR-SUP", 
            description: "Bars & Rods Supply", 
            quantity: totalKilos, 
            unit: "kg", 
            unitRate: supplyRate * locationFactor, 
            totalCost: totalKilos * supplyRate * locationFactor, 
            category: "Bars", 
            subcategory: "Material Supply"
        }));
        
        // Fabrication
        const fabRate = this.baseRates.fabrication.bars.standard.rate;
        items.push(new ComprehensiveEstimationItem({
            code: "BAR-FAB", 
            description: "Bar Fabrication", 
            quantity: totalTonnes, 
            unit: "tonne", 
            unitRate: fabRate, 
            totalCost: totalTonnes * fabRate, 
            category: "Bars", 
            subcategory: "Fabrication"
        }));
        
        console.log(`   ✅ Bars: ${totalTonnes.toFixed(2)}T, ${items.length} line items`);
        return items;
    }

    _estimateConnections(data, location) {
        if (!data || !data.bolts?.length) return [];
        
        console.log('🔧 Estimating Connections...');
        const items = [];
        
        data.bolts.forEach(boltSet => {
            const size = boltSet.size.toLowerCase();
            const quantity = boltSet.quantity;
            
            // Bolt supply
            const boltRate = this.baseRates.connections.bolts[size]?.rate || 
                            this.baseRates.connections.bolts.m20.rate;
            
            items.push(new ComprehensiveEstimationItem({
                code: `BOLT-${size.toUpperCase()}`, 
                description: `${size.toUpperCase()} Structural Bolts`, 
                quantity: quantity, 
                unit: "each", 
                unitRate: boltRate, 
                totalCost: quantity * boltRate, 
                category: "Connections", 
                subcategory: "Structural Bolts",
                specification: "AS/NZS 4291 Grade 8.8"
            }));
            
            // Nuts and washers (2 washers per bolt)
            const nutRate = this.baseRates.connections.hardware.nuts.rate;
            const washerRate = this.baseRates.connections.hardware.washers.rate;
            
            items.push(new ComprehensiveEstimationItem({
                code: `NUT-${size.toUpperCase()}`, 
                description: `${size.toUpperCase()} Hex Nuts`, 
                quantity: quantity, 
                unit: "each", 
                unitRate: nutRate, 
                totalCost: quantity * nutRate, 
                category: "Connections", 
                subcategory: "Hardware"
            }));
            
            items.push(new ComprehensiveEstimationItem({
                code: `WASH-${size.toUpperCase()}`, 
                description: `${size.toUpperCase()} Washers`, 
                quantity: quantity * 2, 
                unit: "each", 
                unitRate: washerRate, 
                totalCost: quantity * 2 * washerRate, 
                category: "Connections", 
                subcategory: "Hardware"
            }));
        });
        
        console.log(`   ✅ Connections: ${data.bolts.length} bolt types, ${items.length} line items`);
        return items;
    }

    _estimateHardware(data, location) {
        if (!data || !data.items?.length) return [];
        
        console.log('🔧 Estimating Hardware...');
        const items = [];
        
        data.items.forEach(item => {
            const quantity = item.quantity || 1;
            const designation = item.designation.toLowerCase();
            
            let rate = 5; // Default hardware rate
            if (designation.includes('washer')) rate = this.baseRates.connections.hardware.washers.rate;
            if (designation.includes('nut')) rate = this.baseRates.connections.hardware.nuts.rate;
            if (designation.includes('anchor')) rate = this.baseRates.connections.hardware.anchor_bolts.rate;
            
            items.push(new ComprehensiveEstimationItem({
                code: `HW-${item.designation.replace(/\s+/g, '').toUpperCase()}`, 
                description: `${item.designation} Hardware`, 
                quantity: quantity, 
                unit: "each", 
                unitRate: rate, 
                totalCost: quantity * rate, 
                category: "Hardware", 
                subcategory: "Miscellaneous Hardware"
            }));
        });
        
        console.log(`   ✅ Hardware: ${data.items.length} types, ${items.length} line items`);
        return items;
    }

    _calculateComprehensiveCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const complexityMultiplier = riskAssessment?.cost_factors?.complexity_multiplier || 1.05;
        
        // Enhanced cost breakdown
        const subtotal = baseCost * complexityMultiplier;
        const contingency = subtotal * 0.10; // 10% contingency
        const preliminaries = subtotal * 0.08; // 8% preliminaries (site costs, temporary works)
        const overheads = subtotal * 0.12; // 12% overheads and profit
        
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
            const category = item.category;
            if (!acc[category]) {
                acc[category] = { items: [], total: 0, subcategories: {} };
            }
            
            acc[category].items.push(item);
            acc[category].total += item.totalCost;
            
            // Group by subcategory
            const sub = item.subcategory;
            if (!acc[category].subcategories[sub]) {
                acc[category].subcategories[sub] = { items: [], total: 0 };
            }
            acc[category].subcategories[sub].items.push(item);
            acc[category].subcategories[sub].total += item.totalCost;
            
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
            "GST included where applicable",
            "Delivery to metropolitan areas - regional delivery may incur additional costs"
        ];
    }

    _generateComprehensiveExclusions() {
        return [
            "Engineering design, calculations, and certification",
            "Building permits, approvals, and council fees",
            "Site survey, set-out, and temporary benchmarks",
            "Concrete foundations, anchor bolt installation, and grouting",
            "Architectural finishes, cladding, or roofing materials",
            "Fire rating treatments or architectural coatings",
            "Crane hire, site access roads, or temporary works",
            "Site amenities, safety barriers, or scaffolding",
            "Electrical earthing, lightning protection",
            "Building services coordination or penetrations",
            "Variations to standard specifications",
            "Site storage, security, or weather protection"
        ];
    }

    // Additional enhancement: Smart rate selection based on member complexity
    _getSmartFabricationRate(memberData, category) {
        // Example of more intelligent rate selection
        if (!memberData || !memberData.items) return this.baseRates.fabrication[category].simple.rate;
        
        const complexItems = memberData.items.filter(item => {
            // Define complexity criteria
            return item.section?.includes('UC') || 
                   item.section?.includes('WB') || 
                   (item.connections && item.connections > 4) ||
                   (item.length && item.length > 12000); // >12m lengths
        });
        
        const complexityRatio = complexItems.length / memberData.items.length;
        
        if (complexityRatio > 0.3) {
            return this.baseRates.fabrication[category].complex?.rate || 
                   this.baseRates.fabrication[category].simple.rate * 1.4;
        }
        
        return this.baseRates.fabrication[category].simple.rate;
    }

    // Add input validation method
    validateEstimationInput(analysisResult) {
        const errors = [];
        
        if (!analysisResult) {
            errors.push("Analysis result is required");
            return errors;
        }
        
        if (!analysisResult.quantityTakeoff) {
            errors.push("Quantity takeoff data is missing");
        }
        
        const requiredCategories = [
            'main_members', 'hollow_sections', 'angles', 
            'purlins', 'plates_fittings', 'connections'
        ];
        
        requiredCategories.forEach(category => {
            const data = analysisResult.quantityTakeoff?.[category];
            if (data && data.summary?.total_weight_tonnes > 0) {
                // At least one category has data - validation passes
            }
        });
        
        return errors;
    }
}
