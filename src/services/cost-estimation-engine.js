/** 
 * Individual cost item class 
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

/** 
 * Advanced cost estimation engine with AI-derived quantities 
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

    /** 
     * Initialize comprehensive base rates database 
     */
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
                universal_beams: {
                    "150ub14": { rate: 3.15, unit: "kg", weight_per_m: 14.0 },
                    "200ub18": { rate: 3.15, unit: "kg", weight_per_m: 18.2 },
                    "200ub25": { rate: 3.15, unit: "kg", weight_per_m: 25.4 },
                    "250ub26": { rate: 3.15, unit: "kg", weight_per_m: 25.7 },
                    "250ub31": { rate: 3.15, unit: "kg", weight_per_m: 31.4 },
                    "310ub32": { rate: 3.15, unit: "kg", weight_per_m: 32.0 }
                },
                hollow_sections: {
                    "100x100x5_shs": { rate: 3.20, unit: "kg", weight_per_m: 14.9 },
                    "125x125x5_shs": { rate: 3.20, unit: "kg", weight_per_m: 18.9 },
                    "150x150x8_shs": { rate: 3.25, unit: "kg", weight_per_m: 35.4 }
                },
                channels: {
                    "100pfc": { rate: 3.25, unit: "kg", weight_per_m: 10.4 },
                    "150pfc": { rate: 3.25, unit: "kg", weight_per_m: 17.0 },
                    "200pfc": { rate: 3.25, unit: "kg", weight_per_m: 23.4 }
                }
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
            anchors: {
                m12_mechanical: { rate: 35, unit: "each" },
                m16_mechanical: { rate: 42, unit: "each" },
                m20_mechanical: { rate: 55, unit: "each" }
            },
            formwork: {
                slab_formwork: { rate: 35, unit: "m²" },
                beam_formwork: { rate: 65, unit: "m²" },
                column_formwork: { rate: 85, unit: "m²" }
            },
            excavation: {
                general_excavation: { rate: 25, unit: "m³" },
                backfill: { rate: 18, unit: "m³" }
            }
        };
    }

    /** 
     * Generate comprehensive cost estimation from AI analysis 
     */
    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            const estimationItems = [];
            
            // Validate input
            if (!analysisResult || !analysisResult.quantityTakeoff) {
                throw new Error("Invalid analysis result: missing quantityTakeoff");
            }

            const quantities = analysisResult.quantityTakeoff;

            // Process concrete works
            const concreteItems = await this._estimateConcreteWorks(quantities, location);
            estimationItems.push(...concreteItems);

            // Process steel works
            const steelItems = await this._estimateSteelWorks(quantities, location);
            estimationItems.push(...steelItems);

            // Process reinforcement
            const reinfItems = await this._estimateReinforcement(quantities, location);
            estimationItems.push(...reinfItems);

            // Process miscellaneous works
            const miscItems = await this._estimateMiscellaneousWorks(quantities, location);
            estimationItems.push(...miscItems);

            // Add professional services
            const professionalItems = await this._estimateProfessionalServices(analysisResult, location);
            estimationItems.push(...professionalItems);

            // Calculate cost summary
            const costSummary = await this._calculateCostSummary(
                estimationItems,
                location,
                analysisResult.riskAssessment || {}
            );

            // Generate final estimation package
            const estimationData = {
                project_id: analysisResult.projectId || 'unknown',
                items: estimationItems.map(item => item.toObject()),
                cost_summary: costSummary,
                categories: this._groupByCategory(estimationItems),
                assumptions: this._generateAssumptions(analysisResult),
                exclusions: this._generateExclusions(),
                location: location,
                estimation_date: new Date().toISOString(),
                confidence_score: this._calculateConfidenceScore(estimationItems)
            };

            return estimationData;

        } catch (error) {
            console.error(`Estimation generation error: ${error.message}`);
            throw error;
        }
    }

    /** 
     * Estimate concrete works from quantities 
     */
    async _estimateConcreteWorks(quantities, location) {
        const items = [];
        const concreteQty = quantities.concrete_quantities || {};

        if (!concreteQty.elements || !Array.isArray(concreteQty.elements)) {
            return items;
        }

        // Process each concrete element
        for (const element of concreteQty.elements) {
            const volume = parseFloat(element.volume_m3) || 0;
            const area = parseFloat(element.area_m2) || 0;
            const grade = element.grade || 'n32';

            if (volume > 0) {
                const gradeKey = grade.toLowerCase();
                const concreteRate = (this.baseRates.concrete[gradeKey]?.rate || 320) * 
                    (this.locationFactors[location] || 1.0);

                items.push(new EstimationItem({
                    code: `CON_${element.element_type?.toUpperCase()}_001`,
                    description: `${element.element_type} concrete ${grade.toUpperCase()}`,
                    quantity: volume,
                    unit: "m³",
                    unitRate: concreteRate,
                    totalCost: volume * concreteRate,
                    category: "Concrete",
                    subcategory: element.element_type
                }));

                // Add concrete pumping
                const pumpingRate = this.baseRates.concrete.pumping.rate;
                const pumpingCost = Math.max(volume * pumpingRate, this.baseRates.concrete.pumping.minimum);
                
                items.push(new EstimationItem({
                    code: `CON_PUMP_001`,
                    description: `Concrete pumping - ${element.element_type}`,
                    quantity: volume,
                    unit: "m³",
                    unitRate: pumpingCost / volume,
                    totalCost: pumpingCost,
                    category: "Concrete",
                    subcategory: "Pumping"
                }));

                // Add formwork for beams and columns
                if (element.element_type === 'beam' || element.element_type === 'column') {
                    const formworkArea = area || (volume * 4); // Estimate if not provided
                    const formworkType = `${element.element_type}_formwork`;
                    const formworkRate = this.baseRates.formwork[formworkType]?.rate || 65;

                    items.push(new EstimationItem({
                        code: `FORM_${element.element_type?.toUpperCase()}_001`,
                        description: `${element.element_type} formwork`,
                        quantity: formworkArea,
                        unit: "m²",
                        unitRate: formworkRate,
                        totalCost: formworkArea * formworkRate,
                        category: "Formwork",
                        subcategory: element.element_type
                    }));
                }

                // Add excavation for footings
                if (element.element_type === 'footing') {
                    const excavation = volume * 1.2; // Add 20% for over-dig
                    const excRate = this.baseRates.excavation.general_excavation.rate;

                    items.push(new EstimationItem({
                        code: "EXC_FOOTING_001",
                        description: "Footing excavation",
                        quantity: excavation,
                        unit: "m³",
                        unitRate: excRate,
                        totalCost: excavation * excRate,
                        category: "Excavation",
                        subcategory: "Footings"
                    }));
                }
            }
        }

        return items;
    }

    /** 
     * Estimate structural steel works 
     */
    async _estimateSteelWorks(quantities, location) {
        const items = [];
        const steelQty = quantities.steel_quantities || {};

        if (!steelQty.members || !Array.isArray(steelQty.members)) {
            return items;
        }

        let totalWeight = 0;

        // Process each steel member
        for (let i = 0; i < steelQty.members.length; i++) {
            const member = steelQty.members[i];
            const section = member.section || '';
            const totalLength = parseFloat(member.total_length_m) || 0;
            const weight = parseFloat(member.total_weight_kg) || 0;
            const quantity = parseInt(member.quantity) || 1;

            // Find steel section details from the base rates database
            const sectionDetails = this._findSteelSectionDetails(section);

            if (!sectionDetails) {
                console.warn(`Steel section "${section}" not found in base rates.`);
                // Use fallback calculation
                const estimatedWeight = totalLength * this._estimateWeightPerMeter(section) * quantity;
                if (estimatedWeight > 0) {
                    totalWeight += estimatedWeight;
                    const fallbackRate = 3.2 * (this.locationFactors[location] || 1.0);
                    
                    items.push(new EstimationItem({
                        code: `STEEL_SUPPLY_${i + 1}`,
                        description: `Structural Steel Supply - ${section}`,
                        quantity: estimatedWeight,
                        unit: "kg",
                        unitRate: fallbackRate,
                        totalCost: estimatedWeight * fallbackRate,
                        category: "Structural Steel",
                        subcategory: "Supply",
                        notes: "Estimated section - verify with supplier"
                    }));
                }
                continue;
            }

            // Use provided weight, or calculate if necessary
            let finalWeightKg = weight;
            if (finalWeightKg <= 0 && sectionDetails.weight_per_m && totalLength > 0) {
                finalWeightKg = totalLength * sectionDetails.weight_per_m;
            }

            if (finalWeightKg > 0) {
                totalWeight += finalWeightKg;
                const locationFactor = this.locationFactors[location] || 1.0;
                const supplyRate = sectionDetails.rate * locationFactor;

                items.push(new EstimationItem({
                    code: `STEEL_SUPPLY_${i + 1}`,
                    description: `Structural Steel Supply - ${section}`,
                    quantity: finalWeightKg,
                    unit: "kg",
                    unitRate: supplyRate,
                    totalCost: finalWeightKg * supplyRate,
                    category: "Structural Steel",
                    subcategory: "Supply"
                }));
            }
        }

        // Add aggregate costs based on total weight
        if (totalWeight > 0) {
            const totalWeightTonnes = totalWeight / 1000;

            // Fabrication
            const fabRate = this.baseRates.fabrication.medium.rate;
            items.push(new EstimationItem({
                code: "STEEL_FAB_001",
                description: "Structural Steel Fabrication (Medium Complexity)",
                quantity: totalWeightTonnes,
                unit: "tonne",
                unitRate: fabRate,
                totalCost: totalWeightTonnes * fabRate,
                category: "Structural Steel",
                subcategory: "Fabrication"
            }));

            // Surface Treatment
            const galvRate = this.baseRates.treatment.galvanizing.rate;
            const galvMinCharge = this.baseRates.treatment.galvanizing.minimum;
            const galvCost = Math.max(totalWeightTonnes * galvRate, galvMinCharge);

            items.push(new EstimationItem({
                code: "STEEL_TREAT_001",
                description: "Hot-dip Galvanizing",
                quantity: totalWeightTonnes,
                unit: "tonne",
                unitRate: totalWeightTonnes > 0 ? galvCost / totalWeightTonnes : 0,
                totalCost: galvCost,
                category: "Structural Steel",
                subcategory: "Treatment"
            }));

            // Erection
            const erectionRate = this.baseRates.erection.steel_erection.rate;
            items.push(new EstimationItem({
                code: "STEEL_ERECT_001",
                description: "Structural Steel Erection",
                quantity: totalWeightTonnes,
                unit: "tonne",
                unitRate: erectionRate,
                totalCost: totalWeightTonnes * erectionRate,
                category: "Structural Steel",
                subcategory: "Erection"
            }));
        }

        return items;
    }

    /** 
     * Estimate reinforcement quantities 
     */
    async _estimateReinforcement(quantities, location) {
        const items = [];
        const reinforcement = quantities.reinforcement_quantities || {};

        // Process deformed bars
        if (reinforcement.deformed_bars) {
            const bars = reinforcement.deformed_bars;
            const locationFactor = this.locationFactors[location] || 1.0;

            Object.entries(bars).forEach(([barType, weightKg]) => {
                const weight = parseFloat(weightKg) || 0;
                if (weight > 0) {
                    const weightTonnes = weight / 1000;
                    const rate = this.baseRates.reinforcement[`${barType}_bars`]?.rate || 2850;
                    
                    items.push(new EstimationItem({
                        code: `REINF_${barType.toUpperCase()}_001`,
                        description: `${barType.toUpperCase()} deformed bars`,
                        quantity: weightTonnes,
                        unit: "tonne",
                        unitRate: rate * locationFactor,
                        totalCost: weightTonnes * rate * locationFactor,
                        category: "Reinforcement",
                        subcategory: "Deformed Bars"
                    }));
                }
            });
        }

        // Process mesh
        if (reinforcement.mesh) {
            const mesh = reinforcement.mesh;
            const locationFactor = this.locationFactors[location] || 1.0;

            Object.entries(mesh).forEach(([meshType, areaM2]) => {
                const area = parseFloat(areaM2) || 0;
                if (area > 0) {
                    const rate = this.baseRates.reinforcement[`${meshType}_mesh`]?.rate || 9.0;
                    
                    items.push(new EstimationItem({
                        code: `MESH_${meshType.toUpperCase()}_001`,
                        description: `${meshType.toUpperCase()} reinforcement mesh`,
                        quantity: area,
                        unit: "m²",
                        unitRate: rate * locationFactor,
                        totalCost: area * rate * locationFactor,
                        category: "Reinforcement",
                        subcategory: "Mesh"
                    }));
                }
            });
        }

        return items;
    }

    /** 
     * Estimate miscellaneous works 
     */
    async _estimateMiscellaneousWorks(quantities, location) {
        const items = [];
        const misc = quantities.miscellaneous || {};

        // Process anchors
        if (misc.anchors) {
            const anchors = misc.anchors;
            const locationFactor = this.locationFactors[location] || 1.0;

            Object.entries(anchors).forEach(([anchorType, quantity]) => {
                const qty = parseInt(quantity) || 0;
                if (qty > 0) {
                    const rate = this.baseRates.anchors[anchorType]?.rate || 40;
                    
                    items.push(new EstimationItem({
                        code: `ANCHOR_${anchorType.toUpperCase()}_001`,
                        description: `${anchorType.replace('_', ' ')} anchors`,
                        quantity: qty,
                        unit: "each",
                        unitRate: rate * locationFactor,
                        totalCost: qty * rate * locationFactor,
                        category: "Miscellaneous",
                        subcategory: "Anchors"
                    }));
                }
            });
        }

        return items;
    }

    /** 
     * Estimate professional services 
     */
    async _estimateProfessionalServices(analysisResult, location) {
        const items = [];
        const baseCost = this._calculateBaseCost(analysisResult);
        const locationFactor = this.locationFactors[location] || 1.0;

        // Engineering design (percentage of construction cost)
        const engineeringRate = baseCost * 0.08; // 8% of construction cost
        items.push(new EstimationItem({
            code: "PROF_ENG_001",
            description: "Structural Engineering Design",
            quantity: 1,
            unit: "LS",
            unitRate: engineeringRate * locationFactor,
            totalCost: engineeringRate * locationFactor,
            category: "Professional Services",
            subcategory: "Engineering"
        }));

        // Project management
        const pmRate = baseCost * 0.05; // 5% of construction cost
        items.push(new EstimationItem({
            code: "PROF_PM_001",
            description: "Project Management",
            quantity: 1,
            unit: "LS",
            unitRate: pmRate * locationFactor,
            totalCost: pmRate * locationFactor,
            category: "Professional Services",
            subcategory: "Management"
        }));

        return items;
    }

    /** 
     * Calculate comprehensive cost summary 
     */
    async _calculateCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const locationFactor = this.locationFactors[location] || 1.0;
        const complexityMultiplier = riskAssessment.cost_factors?.complexity_multiplier || 1.0;
        const dataConfidenceFactor = riskAssessment.cost_factors?.data_confidence_factor || 1.0;

        // Apply adjustments
        const locationAdjusted = baseCost * locationFactor;
        const riskAdjusted = locationAdjusted * complexityMultiplier * dataConfidenceFactor;

        // Add contingencies
        const siteAccessContingency = riskAdjusted * 0.05; // 5%
        const unforeseenContingency = riskAdjusted * 0.10; // 10%
        
        const subtotalExGst = riskAdjusted + siteAccessContingency + unforeseenContingency;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;

        return {
            base_cost: Math.round(baseCost * 100) / 100,
            location_factor: locationFactor,
            location_adjusted: Math.round(locationAdjusted * 100) / 100,
            complexity_multiplier: complexityMultiplier,
            access_factor: dataConfidenceFactor,
            risk_adjusted: Math.round(riskAdjusted * 100) / 100,
            site_access_contingency: Math.round(siteAccessContingency * 100) / 100,
            unforeseen_contingency: Math.round(unforeseenContingency * 100) / 100,
            subtotal_ex_gst: Math.round(subtotalExGst * 100) / 100,
            gst: Math.round(gst * 100) / 100,
            total_inc_gst: Math.round(totalIncGst * 100) / 100,
            currency: 'AUD'
        };
    }

    /** 
     * Helper methods 
     */
    _findSteelSectionDetails(sectionName) {
        const cleanSection = sectionName.toLowerCase().replace(/\s/g, '');
        
        for (const category of Object.values(this.baseRates.structural_steel)) {
            for (const [key, details] of Object.entries(category)) {
                if (cleanSection.includes(key.replace(/[_x]/g, '')) || 
                    key.replace(/[_x]/g, '').includes(cleanSection)) {
                    return details;
                }
            }
        }
        return null;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20;
        
        const sectionLower = section.toLowerCase().replace(/\s/g, '');
        
        const weightTable = {
            '150ub14': 14.0, '200ub18': 18.2, '200ub25': 25.4,
            '250ub26': 25.7, '250ub31': 31.4, '310ub32': 32.0,
            '100shs': 14.9, '125shs': 18.9, '150shs': 35.4,
            '100pfc': 10.4, '150pfc': 17.0, '200pfc': 23.4
        };
        
        for (const [key, weight] of Object.entries(weightTable)) {
            if (sectionLower.includes(key.replace(/[a-z]/g, ''))) {
                return weight;
            }
        }
        
        const numberMatch = section.match(/(\d+)/);
        if (numberMatch) {
            const size = parseInt(numberMatch[1]);
            return Math.max(10, size * 0.15);
        }
        
        return 20;
    }

    _calculateBaseCost(analysisResult) {
        const steelSummary = analysisResult.quantityTakeoff?.steel_quantities?.summary || {};
        const concreteSummary = analysisResult.quantityTakeoff?.concrete_quantities?.summary || {};
        
        const steelCost = (steelSummary.total_steel_weight_tonnes || 0) * 3500; // AUD per tonne
        const concreteCost = (concreteSummary.total_concrete_m3 || 0) * 400; // AUD per m3
        
        return steelCost + concreteCost;
    }

    _groupByCategory(items) {
        const categories = {};
        
        items.forEach(item => {
            const category = item.category;
            if (!categories[category]) {
                categories[category] = {
                    items: [],
                    total: 0
                };
            }
            categories[category].items.push(item.toObject());
            categories[category].total += item.totalCost;
        });

        return categories;
    }

    _generateAssumptions(analysisResult) {
        const assumptions = [
            "Steel sections conform to AS/NZS standards",
            "Standard connection details unless noted",
            "Site access available for delivery and crane operations",
            "All concrete work includes standard reinforcement",
            "Hot-dip galvanizing for all structural steel",
            "Standard foundation conditions assumed"
        ];

        if ((analysisResult.confidence || 0) < 0.8) {
            assumptions.push("Quantities estimated due to limited data extraction - manual verification recommended");
        }

        const memberCount = analysisResult.quantityTakeoff?.steel_quantities?.summary?.member_count || 0;
        if (memberCount > 0) {
            assumptions.push(`Approximately ${memberCount} steel members as per schedules`);
        }

        return assumptions;
    }

    _generateExclusions() {
        return [
            "Building permits and approvals",
            "Site survey and soil testing",
            "Electrical and mechanical services",
            "Architectural finishes",
            "Temporary works not specified",
            "Price escalation beyond validity period",
            "Variations to scope of work"
        ];
    }

    _calculateConfidenceScore(items) {
        if (items.length === 0) return 0;
        
        const averageConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
        return Math.round(averageConfidence * 100) / 100;
    }
}
