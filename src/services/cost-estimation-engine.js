/**
 * Enhanced Cost Estimation Engine with 2025 Australian market rates
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

export class EnhancedCostEstimationEngine {
    constructor() {
        this.locationFactors = {
            "Sydney": 1.15,
            "Melbourne": 1.12,
            "Brisbane": 1.08,
            "Perth": 1.05,
            "Adelaide": 0.98,
            "Canberra": 1.18,
            "Darwin": 1.28,
            "Hobart": 1.08,
            "Newcastle": 1.10,
            "Wollongong": 1.12,
            "Gold Coast": 1.06,
            "Cairns": 1.15
        };
        
        this.gstRate = 0.10;
        this.currentMarketRates = this._initialize2025MarketRates();
        this.steelComplexityFactors = this._initializeComplexityFactors();
    }

    _initialize2025MarketRates() {
        return {
            // Steel supply rates ($/kg) - March 2025 rates
            steel_supply: {
                // Universal Beams - premium for larger sections
                ub_light: 3.20,    // 150-250 UB
                ub_medium: 3.35,   // 310-360 UB  
                ub_heavy: 3.50,    // 410+ UB
                // Universal Columns
                uc_light: 3.40,    // 100-200 UC
                uc_heavy: 3.60,    // 250+ UC
                // Channels and Hollow Sections
                pfc: 3.45,
                shs_rhs: 3.55,
                chs: 3.60,
                // Purlins and Girts
                purlins: 3.25,
                // Base rate for unknown sections
                standard: 3.40
            },

            // Steel fabrication rates ($/kg)
            steel_fabrication: {
                simple: 2.80,      // Straight cuts, standard connections
                medium: 4.20,      // Some complex joints, multiple connections
                complex: 6.50,     // Complex geometry, special connections
                very_complex: 9.20 // Architectural steelwork, curved members
            },

            // Steel treatment ($/kg)
            steel_treatment: {
                shop_primer: 0.60,
                hot_dip_galv: 1.40,
                powder_coating: 2.20,
                fire_protection: 1.80
            },

            // Steel erection ($/kg)
            steel_erection: {
                ground_level: 1.80,
                low_rise: 2.40,     // Up to 3 stories
                mid_rise: 3.20,     // 4-8 stories  
                high_rise: 4.80,    // 8+ stories
                heavy_lift: 6.50    // Requires large cranes
            },

            // Concrete rates ($/m³)
            concrete: {
                n20: 320, n25: 340, n32: 360, n40: 420, n50: 480, n65: 580,
                pumping: 35,        // $/m³
                pumping_minimum: 850, // Minimum charge
                high_rise_pump: 45  // $/m³ for heights >30m
            },

            // Reinforcement ($/tonne for bars, $/m² for mesh)
            reinforcement: {
                deformed_bars: {
                    n12: 3200, n16: 3250, n20: 3300, n24: 3350, 
                    n28: 3400, n32: 3450, n36: 3500
                },
                mesh: {
                    sl62: 12.50, sl72: 13.80, sl82: 15.20, sl92: 16.50,
                    sl102: 18.20, sl112: 19.80
                },
                cutting_bending: 280, // $/tonne additional
                placing: 450          // $/tonne
            },

            // Formwork ($/m²)
            formwork: {
                slab_flat: 45,
                slab_complex: 65,
                beam_standard: 85,
                beam_complex: 120,
                column_square: 95,
                column_round: 140,
                wall_straight: 75,
                wall_curved: 180,
                stairs: 220,
                architectural: 350
            },

            // Precast concrete ($/m²)
            precast: {
                wall_panels: 320,
                tilt_panels: 280,
                floor_planks: 95,
                architectural: 450,
                handling_erection: 85  // $/m² additional
            },

            // Foundations and earthworks
            earthworks: {
                excavation: 28,     // $/m³
                backfill: 22,       // $/m³
                compaction: 18,     // $/m³
                rock_breaking: 85,  // $/m³
                disposal: 35,       // $/m³
                imported_fill: 45   // $/m³
            },

            // Mechanical fixings and anchors
            anchors: {
                m12_mechanical: 42,
                m16_mechanical: 58,
                m20_mechanical: 78,
                m24_mechanical: 105,
                chemical_anchor: 35, // $/unit base + drilling
                expansion_anchor: 25,
                through_bolt: 18
            },

            // Professional services (% of construction cost)
            professional: {
                structural_design: 0.08,    // 8% of construction
                drafting: 0.03,            // 3% of construction
                project_management: 0.06,   // 6% of construction
                site_supervision: 0.04,     // 4% of construction
                engineering_inspection: 0.02, // 2% of construction
                certification: 0.01         // 1% of construction
            },

            // Equipment and crane hire ($/day or $/hour)
            equipment: {
                mobile_crane_25t: 1800,    // $/day
                mobile_crane_50t: 2800,    // $/day
                mobile_crane_100t: 4500,   // $/day
                tower_crane: 3200,         // $/day
                concrete_pump: 1200,       // $/day
                elevated_platform: 450,    // $/day
                welding_equipment: 180     // $/day
            },

            // Transport and logistics ($/tonne or $/km)
            transport: {
                local_delivery: 85,        // $/tonne <50km
                regional_delivery: 120,    // $/tonne 50-200km
                interstate: 180,           // $/tonne >200km
                oversized_load: 350,       // $/trip additional
                crane_mobilization: 1200   // $/trip
            }
        };
    }

    _initializeComplexityFactors() {
        return {
            // Factors based on member count and variety
            member_count: {
                simple: { min: 0, max: 25, factor: 1.0 },
                medium: { min: 26, max: 75, factor: 1.1 },
                complex: { min: 76, max: 150, factor: 1.25 },
                very_complex: { min: 151, max: 999, factor: 1.4 }
            },
            
            // Factors based on section variety
            section_variety: {
                low: { threshold: 5, factor: 1.0 },
                medium: { threshold: 15, factor: 1.1 },
                high: { threshold: 25, factor: 1.2 },
                very_high: { threshold: 999, factor: 1.3 }
            },

            // Factors based on project size
            project_size: {
                small: { max_weight: 10, factor: 1.15 },     // Small projects have higher $/kg
                medium: { max_weight: 50, factor: 1.0 },
                large: { max_weight: 150, factor: 0.95 },    // Economies of scale
                very_large: { max_weight: 999, factor: 0.90 }
            },

            // Height complexity factors
            height_factors: {
                ground_level: 1.0,
                low_rise: 1.15,      // 3-10m
                mid_rise: 1.35,      // 10-30m
                high_rise: 1.65      // >30m
            }
        };
    }

    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            console.log('💰 Starting enhanced cost estimation...');
            
            if (!analysisResult?.quantityTakeoff) {
                throw new Error("Invalid analysis result: missing quantityTakeoff");
            }

            const quantities = analysisResult.quantityTakeoff;
            const locationFactor = this.locationFactors[location] || 1.0;
            const estimationItems = [];

            // Calculate complexity factors upfront
            const complexityFactors = this._calculateComplexityFactors(quantities);
            console.log('📊 Complexity factors:', complexityFactors);

            // Generate detailed estimates for each category
            estimationItems.push(...await this._estimateDetailedSteelWorks(quantities, location, complexityFactors));
            estimationItems.push(...await this._estimateDetailedConcreteWorks(quantities, location));
            estimationItems.push(...await this._estimateDetailedReinforcement(quantities, location));
            estimationItems.push(...await this._estimateFormwork(quantities, location));
            estimationItems.push(...await this._estimateEarthworks(quantities, location));
            estimationItems.push(...await this._estimateEquipmentAndTransport(quantities, location, complexityFactors));
            estimationItems.push(...await this._estimateProfessionalServices(analysisResult, estimationItems, location));

            // Calculate comprehensive cost summary
            const costSummary = this._calculateEnhancedCostSummary(
                estimationItems, 
                location, 
                analysisResult.riskAssessment || {},
                complexityFactors
            );

            const estimationData = {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                categories: this._groupByCategory(estimationItems),
                assumptions: this._generateDetailedAssumptions(analysisResult, complexityFactors),
                exclusions: this._generateDetailedExclusions(),
                location: location,
                location_factor: locationFactor,
                complexity_analysis: complexityFactors,
                estimation_date: new Date().toISOString(),
                confidence_score: this._calculateConfidenceScore(estimationItems, analysisResult),
                validity_period_days: 60,
                market_rates_date: "March 2025"
            };

            console.log(`✅ Estimation complete. Total: ${costSummary.total_inc_gst?.toLocaleString()}`);
            return estimationData;

        } catch (error) {
            console.error(`Enhanced estimation error: ${error.message}`);
            throw error;
        }
    }

    _calculateComplexityFactors(quantities) {
        const steelSummary = quantities.steel_quantities?.summary || {};
        const members = quantities.steel_quantities?.members || [];
        
        const memberCount = steelSummary.member_count || 0;
        const totalWeight = steelSummary.total_steel_weight_tonnes || 0;
        const uniqueSections = new Set(members.map(m => m.section)).size;

        // Determine complexity levels
        let memberComplexity = 'simple';
        let sectionComplexity = 'low';
        let sizeComplexity = 'medium';

        // Member count complexity
        for (const [level, config] of Object.entries(this.steelComplexityFactors.member_count)) {
            if (memberCount >= config.min && memberCount <= config.max) {
                memberComplexity = level;
                break;
            }
        }

        // Section variety complexity
        for (const [level, config] of Object.entries(this.steelComplexityFactors.section_variety)) {
            if (uniqueSections <= config.threshold) {
                sectionComplexity = level;
                break;
            }
        }

        // Project size complexity
        for (const [level, config] of Object.entries(this.steelComplexityFactors.project_size)) {
            if (totalWeight <= config.max_weight) {
                sizeComplexity = level;
                break;
            }
        }

        return {
            member_count: memberCount,
            unique_sections: uniqueSections,
            total_weight_tonnes: totalWeight,
            member_complexity: memberComplexity,
            section_complexity: sectionComplexity,
            size_complexity: sizeComplexity,
            overall_factor: this._calculateOverallComplexityFactor(memberComplexity, sectionComplexity, sizeComplexity)
        };
    }

    _calculateOverallComplexityFactor(memberComplexity, sectionComplexity, sizeComplexity) {
        const memberFactor = this.steelComplexityFactors.member_count[memberComplexity]?.factor || 1.0;
        const sectionFactor = this.steelComplexityFactors.section_variety[sectionComplexity]?.factor || 1.0;
        const sizeFactor = this.steelComplexityFactors.project_size[sizeComplexity]?.factor || 1.0;
        
        // Weighted average: member count 40%, sections 35%, size 25%
        return (memberFactor * 0.4) + (sectionFactor * 0.35) + (sizeFactor * 0.25);
    }

    async _estimateDetailedSteelWorks(quantities, location, complexityFactors) {
        const items = [];
        const steelMembers = quantities.steel_quantities?.members || [];
        const locationFactor = this.locationFactors[location] || 1.0;
        const overallComplexityFactor = complexityFactors.overall_factor;

        if (steelMembers.length === 0) return items;

        let totalSteelWeight = 0;
        const categoryWeights = {
            beam: 0, column: 0, purlin: 0, hollow: 0, other: 0
        };

        // Process each member type
        for (const member of steelMembers) {
            const weight = member.total_weight_kg / 1000; // Convert to tonnes
            const memberType = member.member_type || 'other';
            
            totalSteelWeight += weight;
            categoryWeights[memberType] = (categoryWeights[memberType] || 0) + weight;

            // Determine supply rate based on section type
            const supplyRate = this._getSteelSupplyRate(member.section) * locationFactor;
            
            items.push(new EstimationItem({
                code: `STEEL_SUP_${member.section.replace(/\s+/g, '_')}`,
                description: `Steel Supply - ${member.section}`,
                quantity: weight,
                unit: "tonne",
                unitRate: supplyRate,
                totalCost: weight * supplyRate,
                category: "Steel Structure",
                subcategory: "Supply",
                confidence: 0.9
            }));
        }

        // Add fabrication costs with complexity adjustments
        if (totalSteelWeight > 0) {
            const fabricationComplexity = this._determineFabricationComplexity(complexityFactors);
            const fabricationRate = this.currentMarketRates.steel_fabrication[fabricationComplexity] * locationFactor * overallComplexityFactor;
            
            items.push(new EstimationItem({
                code: "STEEL_FAB_001",
                description: `Steel Fabrication (${fabricationComplexity} complexity)`,
                quantity: totalSteelWeight,
                unit: "tonne",
                unitRate: fabricationRate,
                totalCost: totalSteelWeight * fabricationRate,
                category: "Steel Structure",
                subcategory: "Fabrication",
                notes: `Complexity factor: ${overallComplexityFactor.toFixed(2)}`,
                confidence: 0.85
            }));

            // Hot-dip galvanizing
            const galvRate = this.currentMarketRates.steel_treatment.hot_dip_galv * locationFactor;
            items.push(new EstimationItem({
                code: "STEEL_GALV_001",
                description: "Hot-dip Galvanizing",
                quantity: totalSteelWeight,
                unit: "tonne",
                unitRate: galvRate,
                totalCost: totalSteelWeight * galvRate,
                category: "Steel Structure",
                subcategory: "Treatment",
                confidence: 0.9
            }));

            // Erection costs based on project complexity
            const erectionComplexity = this._determineErectionComplexity(complexityFactors);
            const erectionRate = this.currentMarketRates.steel_erection[erectionComplexity] * locationFactor;
            
            items.push(new EstimationItem({
                code: "STEEL_ERECT_001",
                description: `Steel Erection (${erectionComplexity})`,
                quantity: totalSteelWeight,
                unit: "tonne",
                unitRate: erectionRate,
                totalCost: totalSteelWeight * erectionRate,
                category: "Steel Structure",
                subcategory: "Erection",
                confidence: 0.8
            }));

            // Transport costs
            const transportRate = this._calculateTransportRate(totalSteelWeight, location);
            items.push(new EstimationItem({
                code: "STEEL_TRANS_001",
                description: "Steel Transport & Delivery",
                quantity: totalSteelWeight,
                unit: "tonne",
                unitRate: transportRate,
                totalCost: totalSteelWeight * transportRate,
                category: "Steel Structure",
                subcategory: "Transport",
                confidence: 0.85
            }));
        }

        return items;
    }

    _getSteelSupplyRate(section) {
        const s = section.toLowerCase();
        const rates = this.currentMarketRates.steel_supply;
        
        if (s.includes('ub')) {
            const depth = parseInt(section.match(/(\d+)/)?.[1] || '200');
            if (depth <= 250) return rates.ub_light;
            if (depth <= 360) return rates.ub_medium;
            return rates.ub_heavy;
        }
        if (s.includes('uc')) {
            const depth = parseInt(section.match(/(\d+)/)?.[1] || '200');
            return depth <= 200 ? rates.uc_light : rates.uc_heavy;
        }
        if (s.includes('pfc')) return rates.pfc;
        if (s.includes('shs') || s.includes('rhs')) return rates.shs_rhs;
        if (s.includes('chs')) return rates.chs;
        if (s.includes('z') || s.includes('c')) return rates.purlins;
        
        return rates.standard;
    }

    _determineFabricationComplexity(complexityFactors) {
        const memberComplexity = complexityFactors.member_complexity;
        const sectionComplexity = complexityFactors.section_complexity;
        
        if (memberComplexity === 'very_complex' || sectionComplexity === 'very_high') {
            return 'very_complex';
        }
        if (memberComplexity === 'complex' || sectionComplexity === 'high') {
            return 'complex';
        }
        if (memberComplexity === 'medium' || sectionComplexity === 'medium') {
            return 'medium';
        }
        return 'simple';
    }

    _determineErectionComplexity(complexityFactors) {
        const totalWeight = complexityFactors.total_weight_tonnes;
        const memberCount = complexityFactors.member_count;
        
        if (totalWeight > 100 || memberCount > 150) {
            return 'heavy_lift';
        }
        if (totalWeight > 50 || memberCount > 75) {
            return 'mid_rise';
        }
        if (totalWeight > 20 || memberCount > 25) {
            return 'low_rise';
        }
        return 'ground_level';
    }

    _calculateTransportRate(weight, location) {
        const baseRate = this.currentMarketRates.transport.local_delivery;
        
        // Add surcharge for remote locations
        const remoteSurcharge = ['Darwin', 'Cairns', 'Hobart'].includes(location) ? 1.3 : 1.0;
        
        // Add surcharge for heavy loads
        const weightSurcharge = weight > 30 ? 1.2 : weight > 15 ? 1.1 : 1.0;
        
        return baseRate * remoteSurcharge * weightSurcharge;
    }

    async _estimateDetailedConcreteWorks(quantities, location) {
        const items = [];
        const concreteElements = quantities.concrete_quantities?.elements || [];
        const locationFactor = this.locationFactors[location] || 1.0;

        for (const element of concreteElements) {
            const volume = parseFloat(element.volume_m3) || 0;
            if (volume <= 0) continue;

            const grade = element.grade || 'n32';
            const gradeKey = grade.toLowerCase();
            const concreteRate = (this.currentMarketRates.concrete[gradeKey] || 360) * locationFactor;

            // Concrete supply
            items.push(new EstimationItem({
                code: `CON_${element.element_type?.toUpperCase()}_${grade.toUpperCase()}`,
                description: `${element.element_type} concrete ${grade.toUpperCase()}`,
                quantity: volume,
                unit: "m³",
                unitRate: concreteRate,
                totalCost: volume * concreteRate,
                category: "Concrete",
                subcategory: element.element_type || "General",
                confidence: 0.9
            }));

            // Concrete pumping
            const pumpRate = this.currentMarketRates.concrete.pumping * locationFactor;
            const pumpCost = Math.max(volume * pumpRate, this.currentMarketRates.concrete.pumping_minimum);
            
            items.push(new EstimationItem({
                code: `CON_PUMP_${element.element_type?.toUpperCase()}`,
                description: `Concrete pumping - ${element.element_type}`,
                quantity: volume,
                unit: "m³",
                unitRate: pumpCost / volume,
                totalCost: pumpCost,
                category: "Concrete",
                subcategory: "Pumping",
                confidence: 0.85
            }));
        }

        return items;
    }

    async _estimateDetailedReinforcement(quantities, location) {
        const items = [];
        const reinforcement = quantities.reinforcement_quantities || {};
        const locationFactor = this.locationFactors[location] || 1.0;

        // Deformed bars
        if (reinforcement.deformed_bars) {
            Object.entries(reinforcement.deformed_bars).forEach(([barType, weightKg]) => {
                const weight = parseFloat(weightKg) || 0;
                if (weight <= 0) return;

                const weightTonnes = weight / 1000;
                const supplyRate = (this.currentMarketRates.reinforcement.deformed_bars[barType] || 3300) * locationFactor;
                
                // Supply
                items.push(new EstimationItem({
                    code: `REBAR_SUP_${barType.toUpperCase()}`,
                    description: `${barType.toUpperCase()} deformed bars - supply`,
                    quantity: weightTonnes,
                    unit: "tonne",
                    unitRate: supplyRate,
                    totalCost: weightTonnes * supplyRate,
                    category: "Reinforcement",
                    subcategory: "Deformed Bars",
                    confidence: 0.9
                }));

                // Cutting and bending
                const cuttingRate = this.currentMarketRates.reinforcement.cutting_bending * locationFactor;
                items.push(new EstimationItem({
                    code: `REBAR_CUT_${barType.toUpperCase()}`,
                    description: `${barType.toUpperCase()} cutting & bending`,
                    quantity: weightTonnes,
                    unit: "tonne",
                    unitRate: cuttingRate,
                    totalCost: weightTonnes * cuttingRate,
                    category: "Reinforcement",
                    subcategory: "Processing",
                    confidence: 0.85
                }));

                // Placing
                const placingRate = this.currentMarketRates.reinforcement.placing * locationFactor;
                items.push(new EstimationItem({
                    code: `REBAR_PLACE_${barType.toUpperCase()}`,
                    description: `${barType.toUpperCase()} placing & fixing`,
                    quantity: weightTonnes,
                    unit: "tonne",
                    unitRate: placingRate,
                    totalCost: weightTonnes * placingRate,
                    category: "Reinforcement",
                    subcategory: "Installation",
                    confidence: 0.8
                }));
            });
        }

        // Mesh reinforcement
        if (reinforcement.mesh) {
            Object.entries(reinforcement.mesh).forEach(([meshType, areaM2]) => {
                const area = parseFloat(areaM2) || 0;
                if (area <= 0) return;

                const rate = (this.currentMarketRates.reinforcement.mesh[meshType] || 15.0) * locationFactor;
                items.push(new EstimationItem({
                    code: `MESH_${meshType.toUpperCase()}`,
                    description: `${meshType.toUpperCase()} reinforcement mesh`,
                    quantity: area,
                    unit: "m²",
                    unitRate: rate,
                    totalCost: area * rate,
                    category: "Reinforcement",
                    subcategory: "Mesh",
                    confidence: 0.9
                }));
            });
        }

        return items;
    }

    async _estimateFormwork(quantities, location) {
        const items = [];
        const concreteElements = quantities.concrete_quantities?.elements || [];
        const locationFactor = this.locationFactors[location] || 1.0;

        for (const element of concreteElements) {
            const volume = parseFloat(element.volume_m3) || 0;
            if (volume <= 0) continue;

            // Estimate formwork area based on element type and volume
            const formworkData = this._estimateFormworkArea(element.element_type, volume);
            if (formworkData.area <= 0) continue;

            const rate = (this.currentMarketRates.formwork[formworkData.type] || 75) * locationFactor;
            
            items.push(new EstimationItem({
                code: `FORM_${element.element_type?.toUpperCase()}`,
                description: `Formwork - ${element.element_type}`,
                quantity: formworkData.area,
                unit: "m²",
                unitRate: rate,
                totalCost: formworkData.area * rate,
                category: "Formwork",
                subcategory: element.element_type || "General",
                notes: `Estimated from ${volume}m³ concrete`,
                confidence: 0.75
            }));
        }

        return items;
    }

    _estimateFormworkArea(elementType, volume) {
        // Rough formwork area estimates based on typical proportions
        switch (elementType?.toLowerCase()) {
            case 'foundation':
                return { area: volume * 2.5, type: 'beam_standard' }; // Footings
            case 'slab':
                return { area: volume * 0.4, type: 'slab_flat' }; // Edge forms only
            case 'beam':
                return { area: volume * 8, type: 'beam_standard' }; // Beam sides/soffits
            case 'column':
                return { area: volume * 12, type: 'column_square' }; // Column faces
            case 'wall':
                return { area: volume * 6, type: 'wall_straight' }; // Both faces
            default:
                return { area: volume * 4, type: 'slab_flat' }; // Conservative estimate
        }
    }

    async _estimateEarthworks(quantities, location) {
        const items = [];
        const concreteVolume = quantities.concrete_quantities?.summary?.total_concrete_m3 || 0;
        const locationFactor = this.locationFactors[location] || 1.0;

        if (concreteVolume > 0) {
            // Estimate excavation volume (typically 1.5x concrete volume for allowances)
            const excavationVolume = concreteVolume * 1.5;
            const excavationRate = this.currentMarketRates.earthworks.excavation * locationFactor;

            items.push(new EstimationItem({
                code: "EARTH_EXCAV_001",
                description: "General excavation",
                quantity: excavationVolume,
                unit: "m³",
                unitRate: excavationRate,
                totalCost: excavationVolume * excavationRate,
                category: "Earthworks",
                subcategory: "Excavation",
                notes: `Estimated from ${concreteVolume}m³ concrete`,
                confidence: 0.7
            }));

            // Backfill (assume 30% of excavation)
            const backfillVolume = excavationVolume * 0.3;
            const backfillRate = this.currentMarketRates.earthworks.backfill * locationFactor;

            items.push(new EstimationItem({
                code: "EARTH_BACKFILL_001",
                description: "Backfill and compaction",
                quantity: backfillVolume,
                unit: "m³",
                unitRate: backfillRate,
                totalCost: backfillVolume * backfillRate,
                category: "Earthworks",
                subcategory: "Backfill",
                confidence: 0.7
            }));
        }

        return items;
    }

    async _estimateEquipmentAndTransport(quantities, location, complexityFactors) {
        const items = [];
        const steelWeight = quantities.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        const locationFactor = this.locationFactors[location] || 1.0;

        if (steelWeight > 0) {
            // Crane requirements based on project size and complexity
            const craneData = this._determineCraneRequirements(steelWeight, complexityFactors);
            const craneDays = this._estimateCraneDays(steelWeight, complexityFactors);
            
            const craneRate = this.currentMarketRates.equipment[craneData.type] * locationFactor;
            const totalCraneHire = craneDays * craneRate;

            items.push(new EstimationItem({
                code: "EQUIP_CRANE_001",
                description: `${craneData.type.replace('_', ' ')} hire`,
                quantity: craneDays,
                unit: "day",
                unitRate: craneRate,
                totalCost: totalCraneHire,
                category: "Equipment",
                subcategory: "Crane Hire",
                notes: `${steelWeight}T steel structure`,
                confidence: 0.8
            }));

            // Crane mobilization
            const mobilizationCost = this.currentMarketRates.transport.crane_mobilization * locationFactor;
            items.push(new EstimationItem({
                code: "EQUIP_CRANE_MOB_001",
                description: "Crane mobilization/demobilization",
                quantity: 1,
                unit: "LS",
                unitRate: mobilizationCost,
                totalCost: mobilizationCost,
                category: "Equipment",
                subcategory: "Mobilization",
                confidence: 0.9
            }));
        }

        return items;
    }

    _determineCraneRequirements(steelWeight, complexityFactors) {
        const memberCount = complexityFactors.member_count;
        
        if (steelWeight > 100 || memberCount > 150) {
            return { type: 'mobile_crane_100t', capacity: '100T' };
        }
        if (steelWeight > 30 || memberCount > 75) {
            return { type: 'mobile_crane_50t', capacity: '50T' };
        }
        return { type: 'mobile_crane_25t', capacity: '25T' };
    }

    _estimateCraneDays(steelWeight, complexityFactors) {
        // Base calculation: 1 day per 5 tonnes, minimum 2 days
        let days = Math.max(2, Math.ceil(steelWeight / 5));
        
        // Adjust for complexity
        const complexityMultiplier = complexityFactors.overall_factor;
        days = Math.ceil(days * complexityMultiplier);
        
        return days;
    }

    async _estimateProfessionalServices(analysisResult, constructionItems, location) {
        const items = [];
        const baseCost = constructionItems.reduce((sum, item) => sum + item.totalCost, 0);
        const locationFactor = this.locationFactors[location] || 1.0;
        const rates = this.currentMarketRates.professional;

        // Structural engineering design
        const designCost = baseCost * rates.structural_design * locationFactor;
        items.push(new EstimationItem({
            code: "PROF_STRUCT_001",
            description: "Structural engineering design",
            quantity: 1,
            unit: "LS",
            unitRate: designCost,
            totalCost: designCost,
            category: "Professional Services",
            subcategory: "Design",
            notes: `${(rates.structural_design * 100).toFixed(1)}% of construction cost`,
            confidence: 0.85
        }));

        // Project management
        const pmCost = baseCost * rates.project_management * locationFactor;
        items.push(new EstimationItem({
            code: "PROF_PM_001",
            description: "Project management",
            quantity: 1,
            unit: "LS",
            unitRate: pmCost,
            totalCost: pmCost,
            category: "Professional Services",
            subcategory: "Management",
            confidence: 0.8
        }));

        // Site supervision
        const supervisionCost = baseCost * rates.site_supervision * locationFactor;
        items.push(new EstimationItem({
            code: "PROF_SUPER_001",
            description: "Site supervision",
            quantity: 1,
            unit: "LS",
            unitRate: supervisionCost,
            totalCost: supervisionCost,
            category: "Professional Services",
            subcategory: "Supervision",
            confidence: 0.8
        }));

        return items;
    }

    _calculateEnhancedCostSummary(items, location, riskAssessment, complexityFactors) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const locationFactor = this.locationFactors[location] || 1.0;
        
        // Risk adjustments
        const complexityMultiplier = riskAssessment.cost_factors?.complexity_multiplier || complexityFactors.overall_factor;
        const dataConfidenceFactor = riskAssessment.cost_factors?.data_confidence_factor || 1.0;
        const sizeMultiplier = riskAssessment.cost_factors?.size_factor || 1.0;
        
        // Apply adjustments
        const adjustedCost = baseCost * complexityMultiplier * dataConfidenceFactor * sizeMultiplier;
        
        // Contingencies
        const designContingency = adjustedCost * 0.05;      // 5% design development
        const constructionContingency = adjustedCost * 0.08; // 8% construction risk
        const clientContingency = adjustedCost * 0.05;       // 5% client contingency
        
        const subtotalExGst = adjustedCost + designContingency + constructionContingency + clientContingency;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;

        return {
            base_cost: Math.round(baseCost * 100) / 100,
            location_factor: locationFactor,
            complexity_multiplier: complexityMultiplier,
            data_confidence_factor: dataConfidenceFactor,
            size_multiplier: sizeMultiplier,
            adjusted_cost: Math.round(adjustedCost * 100) / 100,
            design_contingency: Math.round(designContingency * 100) / 100,
            construction_contingency: Math.round(constructionContingency * 100) / 100,
            client_contingency: Math.round(clientContingency * 100) / 100,
            subtotal_ex_gst: Math.round(subtotalExGst * 100) / 100,
            gst: Math.round(gst * 100) / 100,
            total_inc_gst: Math.round(totalIncGst * 100) / 100,
            currency: 'AUD',
            breakdown_percentages: {
                base_construction: ((baseCost / totalIncGst) * 100).toFixed(1),
                risk_adjustments: (((adjustedCost - baseCost) / totalIncGst) * 100).toFixed(1),
                contingencies: (((designContingency + constructionContingency + clientContingency) / totalIncGst) * 100).toFixed(1),
                gst: ((gst / totalIncGst) * 100).toFixed(1)
            }
        };
    }

    _groupByCategory(items) {
        const categories = {};
        items.forEach(item => {
            const category = item.category;
            if (!categories[category]) {
                categories[category] = { 
                    items: [], 
                    total: 0, 
                    subcategories: {} 
                };
            }
            categories[category].items.push(item.toObject());
            categories[category].total += item.totalCost;
            
            // Group by subcategory
            const subcategory = item.subcategory || 'General';
            if (!categories[category].subcategories[subcategory]) {
                categories[category].subcategories[subcategory] = { items: [], total: 0 };
            }
            categories[category].subcategories[subcategory].items.push(item.toObject());
            categories[category].subcategories[subcategory].total += item.totalCost;
        });
        return categories;
    }

    _generateDetailedAssumptions(analysisResult, complexityFactors) {
        const assumptions = [
            "All steel sections conform to AS/NZS 3679.1-2016",
            "Standard structural connections as per AS 4100-2020",
            "Hot-dip galvanizing to AS/NZS 4680-2006 for all structural steel",
            "Site access suitable for delivery trucks and mobile crane operation",
            "Standard foundation conditions (no rock, groundwater, or contamination)",
            "No special fire rating or architectural requirements",
            "Standard 8-hour working days, Monday to Friday",
            "Materials available from local suppliers",
            "No heritage, environmental, or planning restrictions"
        ];

        // Add project-specific assumptions
        const steelWeight = analysisResult.quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        const memberCount = complexityFactors.member_count;
        const confidence = analysisResult.confidence || 0;

        if (confidence < 0.8) {
            assumptions.push("Quantities estimated from limited drawing data - detailed verification recommended");
        }

        if (steelWeight > 50) {
            assumptions.push("Heavy lift mobile crane access available on site");
            assumptions.push("Crane pad construction included in earthworks");
        }

        if (memberCount > 100) {
            assumptions.push("Staged delivery of steel members to minimize site storage");
        }

        if (complexityFactors.section_complexity === 'high' || complexityFactors.section_complexity === 'very_high') {
            assumptions.push("Multiple steel suppliers may be required due to section variety");
        }

        assumptions.push(`Analysis based on ${memberCount} structural members totaling ${steelWeight.toFixed(1)} tonnes`);
        assumptions.push(`Project complexity assessed as ${complexityFactors.member_complexity} (factor: ${complexityFactors.overall_factor.toFixed(2)})`);

        return assumptions;
    }

    _generateDetailedExclusions() {
        return [
            "Building permits, development applications, and approval fees",
            "Soil investigation, survey, and geotechnical reports",
            "Mechanical services (HVAC, plumbing, fire services)",
            "Electrical services and lighting",
            "Architectural finishes and cladding systems",
            "Doors, windows, and glazing",
            "Temporary works not specifically mentioned",
            "Site establishment, amenities, and security",
            "Consultant fees beyond those specified",
            "Authority charges and utility connections",
            "Escalation beyond the validity period",
            "Variations to the documented scope",
            "Work outside normal business hours",
            "Special access equipment or scaffolding",
            "Environmental impact assessments",
            "Acoustic or thermal performance requirements",
            "Landscaping and external works",
            "Road works and traffic management",
            "Demolition and hazardous materials removal",
            "Design changes after commencement"
        ];
    }

    _calculateConfidenceScore(items, analysisResult) {
        let totalConfidence = 0;
        let weightedSum = 0;

        items.forEach(item => {
            const weight = item.totalCost;
            totalConfidence += item.confidence * weight;
            weightedSum += weight;
        });

        const itemConfidence = weightedSum > 0 ? totalConfidence / weightedSum : 0.5;
        const dataConfidence = analysisResult.confidence || 0.5;
        
        // Combined confidence (60% item confidence, 40% data confidence)
        const overallConfidence = (itemConfidence * 0.6) + (dataConfidence * 0.4);
        
        return Math.round(overallConfidence * 100) / 100;
    }
}
                
