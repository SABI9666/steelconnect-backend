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

    /** * Initialize comprehensive base rates database 
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
                // Universal Beams
                "200 UB 22.3": { rate: 3.15, unit: "kg", weight_per_m: 22.3 },
                "410 UB 53.7": { rate: 3.15, unit: "kg", weight_per_m: 53.7 },
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
                "150 X 150 X 6.0 SHS": { rate: 3.25, unit: "kg", weight_per_m: 26.6 },
                "100 X 100 X 2.5 SHS": { rate: 3.20, unit: "kg", weight_per_m: 7.5 },
                "150 X 150 X 5.0 SHS": { rate: 3.25, unit: "kg", weight_per_m: 22.3 },
                "150 X 150 X 3.0 SHS": { rate: 3.25, unit: "kg", weight_per_m: 13.6 },
                "150 X 150 X 4.0 SHS": { rate: 3.25, unit: "kg", weight_per_m: 18.0 },
                "75 X 75 X 5.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 11.0 },
                "125 X 125 X 4.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 18.9 },
                "100 X 100 X 5.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 14.9 },
                "125 X 125 X 5.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 23.4 },
                "50 X 50 X 2 SHS": { rate: 3.20, unit: "kg", weight_per_m: 3.0 },
                "100 X 100 X 6 SHS": { rate: 3.20, unit: "kg", weight_per_m: 17.7 },
                "150 X 50 X 9.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 31.0 },

                // Rectangular Hollow Sections
                "200 X 100 X 5.0 SHS": { rate: 3.20, unit: "kg", weight_per_m: 28.0 },
                "200 X 100 X 3.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 17.1 },
                "200 X 100 X 5.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 28.0 },
                "150 X 50 X 4.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 15.0 },
                "125 X 75 X 3.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 11.4 },
                "200 X 150 X 9.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 56.8 },
                "200 X 150 X 6.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 39.5 },
                "250 X 150 X 5.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 38.0 },
                "200 X 100 X 6.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 33.1 },
                "150 X 150 X 4.0 RHS": { rate: 3.25, unit: "kg", weight_per_m: 22.7 },
                "150 X 100 X 10.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 44.0 },
                "200 X 100 X 9.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 47.0 },
                "200 X 50 X 6.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 28.0 },
                "150 X 50 X 5.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 18.5 },
                "150 X 100 X 5.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 23.4 },
                "150 X 100 X 10 RHS": { rate: 3.20, unit: "kg", weight_per_m: 44.0 },
                "150 X 50 X 6.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 22.0 },
                "150 X 100 X 6.0 RHS": { rate: 3.20, unit: "kg", weight_per_m: 27.8 },
                
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

                // Generic sections for fallback
                "250 UB": { rate: 3.15, unit: "kg", weight_per_m: 31.4 },
                "310 UB": { rate: 3.15, unit: "kg", weight_per_m: 40.4 },
                "200 UB": { rate: 3.15, unit: "kg", weight_per_m: 25.4 },
                "180 UB": { rate: 3.15, unit: "kg", weight_per_m: 18.2 },
                "410 UB": { rate: 3.15, unit: "kg", weight_per_m: 59.7 },
                "360 UB": { rate: 3.15, unit: "kg", weight_per_m: 50.7 },
                "460 UB": { rate: 3.15, unit: "kg", weight_per_m: 67.1 }
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

    async generateEstimation(analysisResult, location = "Sydney") {
        try {
            const estimationItems = [];
            
            if (!analysisResult || !analysisResult.quantityTakeoff) {
                throw new Error("Invalid analysis result: missing quantityTakeoff");
            }

            const quantities = analysisResult.quantityTakeoff;

            const concreteItems = await this._estimateConcreteWorks(quantities, location);
            estimationItems.push(...concreteItems);

            const steelItems = await this._estimateSteelWorks(quantities, location);
            estimationItems.push(...steelItems);

            const reinfItems = await this._estimateReinforcement(quantities, location);
            estimationItems.push(...reinfItems);

            const miscItems = await this._estimateMiscellaneousWorks(quantities, location);
            estimationItems.push(...miscItems);

            const professionalItems = await this._estimateProfessionalServices(analysisResult, location);
            estimationItems.push(...professionalItems);

            const costSummary = await this._calculateCostSummary(
                estimationItems,
                location,
                analysisResult.riskAssessment || {}
            );

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

    async _estimateConcreteWorks(quantities, location) {
        const items = [];
        const concreteQty = quantities.concrete_quantities || {};

        if (!concreteQty.elements || !Array.isArray(concreteQty.elements)) {
            return items;
        }

        for (const element of concreteQty.elements) {
            const volume = parseFloat(element.volume_m3) || 0;
            const grade = element.grade || 'n32';

            if (volume > 0) {
                const gradeKey = grade.toLowerCase();
                const concreteRate = (this.baseRates.concrete[gradeKey]?.rate || 320) * (this.locationFactors[location] || 1.0);

                items.push(new EstimationItem({
                    code: `CON_${element.element_type?.toUpperCase()}_001`,
                    description: `${element.element_type} concrete ${grade.toUpperCase()}`,
                    quantity: volume, unit: "m³", unitRate: concreteRate,
                    totalCost: volume * concreteRate, category: "Concrete",
                    subcategory: element.element_type
                }));

                const pumpingRate = this.baseRates.concrete.pumping.rate;
                const pumpingCost = Math.max(volume * pumpingRate, this.baseRates.concrete.pumping.minimum);
                
                items.push(new EstimationItem({
                    code: `CON_PUMP_001`, description: `Concrete pumping - ${element.element_type}`,
                    quantity: volume, unit: "m³", unitRate: pumpingCost / volume,
                    totalCost: pumpingCost, category: "Concrete", subcategory: "Pumping"
                }));
            }
        }
        return items;
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
            const section = member.section || '';
            const totalLength = parseFloat(member.total_length_m) || 0;
            const weight = parseFloat(member.total_weight_kg) || 0;
            const quantity = parseInt(member.quantity) || 1;

            const sectionDetails = this._findSteelSectionDetails(section);

            if (!sectionDetails) {
                console.log(`Steel section "${section}" not found. Using fallback estimation.`);
                const estimatedWeightPerM = this._estimateWeightPerMeter(section);
                const estimatedWeight = weight > 0 ? weight : (totalLength > 0 ? totalLength * estimatedWeightPerM : estimatedWeightPerM * 6 * quantity);
                
                if (estimatedWeight > 0) {
                    totalWeight += estimatedWeight;
                    const fallbackRate = 3.2 * (this.locationFactors[location] || 1.0);
                    
                    items.push(new EstimationItem({
                        code: `STEEL_SUPPLY_${i + 1}`, description: `Structural Steel Supply - ${section}`,
                        quantity: estimatedWeight, unit: "kg", unitRate: fallbackRate,
                        totalCost: estimatedWeight * fallbackRate, category: "Structural Steel",
                        subcategory: "Supply", notes: "Estimated section - verify with supplier"
                    }));
                }
                continue;
            }

            let finalWeightKg = weight;
            if (finalWeightKg <= 0 && sectionDetails.weight_per_m && totalLength > 0) {
                finalWeightKg = totalLength * sectionDetails.weight_per_m;
            } else if (finalWeightKg <= 0) {
                finalWeightKg = 6 * quantity * sectionDetails.weight_per_m;
            }

            if (finalWeightKg > 0) {
                totalWeight += finalWeightKg;
                const locationFactor = this.locationFactors[location] || 1.0;
                const supplyRate = sectionDetails.rate * locationFactor;

                items.push(new EstimationItem({
                    code: `STEEL_SUPPLY_${i + 1}`, description: `Structural Steel Supply - ${section}`,
                    quantity: finalWeightKg, unit: "kg", unitRate: supplyRate,
                    totalCost: finalWeightKg * supplyRate, category: "Structural Steel", subcategory: "Supply"
                }));
            }
        }

        if (totalWeight > 0) {
            const totalWeightTonnes = totalWeight / 1000;
            const fabRate = this.baseRates.fabrication.medium.rate;
            items.push(new EstimationItem({
                code: "STEEL_FAB_001", description: "Structural Steel Fabrication (Medium Complexity)",
                quantity: totalWeightTonnes, unit: "tonne", unitRate: fabRate,
                totalCost: totalWeightTonnes * fabRate, category: "Structural Steel", subcategory: "Fabrication"
            }));

            const galvRate = this.baseRates.treatment.galvanizing.rate;
            const galvMinCharge = this.baseRates.treatment.galvanizing.minimum;
            const galvCost = Math.max(totalWeightTonnes * galvRate, galvMinCharge);
            items.push(new EstimationItem({
                code: "STEEL_TREAT_001", description: "Hot-dip Galvanizing",
                quantity: totalWeightTonnes, unit: "tonne", unitRate: totalWeightTonnes > 0 ? galvCost / totalWeightTonnes : 0,
                totalCost: galvCost, category: "Structural Steel", subcategory: "Treatment"
            }));

            const erectionRate = this.baseRates.erection.steel_erection.rate;
            items.push(new EstimationItem({
                code: "STEEL_ERECT_001", description: "Structural Steel Erection",
                quantity: totalWeightTonnes, unit: "tonne", unitRate: erectionRate,
                totalCost: totalWeightTonnes * erectionRate, category: "Structural Steel", subcategory: "Erection"
            }));
        }
        return items;
    }

    async _estimateReinforcement(quantities, location) {
        const items = [];
        const reinforcement = quantities.reinforcement_quantities || {};
        const locationFactor = this.locationFactors[location] || 1.0;

        if (reinforcement.deformed_bars) {
            Object.entries(reinforcement.deformed_bars).forEach(([barType, weightKg]) => {
                const weight = parseFloat(weightKg) || 0;
                if (weight > 0) {
                    const weightTonnes = weight / 1000;
                    const rate = this.baseRates.reinforcement[`${barType}_bars`]?.rate || 2850;
                    items.push(new EstimationItem({
                        code: `REINF_${barType.toUpperCase()}_001`, description: `${barType.toUpperCase()} deformed bars`,
                        quantity: weightTonnes, unit: "tonne", unitRate: rate * locationFactor,
                        totalCost: weightTonnes * rate * locationFactor, category: "Reinforcement", subcategory: "Deformed Bars"
                    }));
                }
            });
        }

        if (reinforcement.mesh) {
            Object.entries(reinforcement.mesh).forEach(([meshType, areaM2]) => {
                const area = parseFloat(areaM2) || 0;
                if (area > 0) {
                    const rate = this.baseRates.reinforcement[`${meshType}_mesh`]?.rate || 9.0;
                    items.push(new EstimationItem({
                        code: `MESH_${meshType.toUpperCase()}_001`, description: `${meshType.toUpperCase()} reinforcement mesh`,
                        quantity: area, unit: "m²", unitRate: rate * locationFactor,
                        totalCost: area * rate * locationFactor, category: "Reinforcement", subcategory: "Mesh"
                    }));
                }
            });
        }
        return items;
    }

    async _estimateMiscellaneousWorks(quantities, location) {
        const items = [];
        const misc = quantities.miscellaneous || {};
        const locationFactor = this.locationFactors[location] || 1.0;

        if (misc.anchors) {
            Object.entries(misc.anchors).forEach(([anchorType, quantity]) => {
                const qty = parseInt(quantity) || 0;
                if (qty > 0) {
                    const rate = this.baseRates.anchors[anchorType]?.rate || 40;
                    items.push(new EstimationItem({
                        code: `ANCHOR_${anchorType.toUpperCase()}_001`, description: `${anchorType.replace('_', ' ')} anchors`,
                        quantity: qty, unit: "each", unitRate: rate * locationFactor,
                        totalCost: qty * rate * locationFactor, category: "Miscellaneous", subcategory: "Anchors"
                    }));
                }
            });
        }
        return items;
    }

    async _estimateProfessionalServices(analysisResult, location) {
        const items = [];
        const baseCost = this._calculateBaseCost(analysisResult);
        const locationFactor = this.locationFactors[location] || 1.0;

        const engineeringRate = baseCost * 0.08;
        items.push(new EstimationItem({
            code: "PROF_ENG_001", description: "Structural Engineering Design",
            quantity: 1, unit: "LS", unitRate: engineeringRate * locationFactor,
            totalCost: engineeringRate * locationFactor, category: "Professional Services", subcategory: "Engineering"
        }));

        const pmRate = baseCost * 0.05;
        items.push(new EstimationItem({
            code: "PROF_PM_001", description: "Project Management",
            quantity: 1, unit: "LS", unitRate: pmRate * locationFactor,
            totalCost: pmRate * locationFactor, category: "Professional Services", subcategory: "Management"
        }));
        return items;
    }

    async _calculateCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        const locationFactor = this.locationFactors[location] || 1.0;
        const complexityMultiplier = riskAssessment.cost_factors?.complexity_multiplier || 1.0;
        const dataConfidenceFactor = riskAssessment.cost_factors?.data_confidence_factor || 1.0;
        const riskAdjusted = baseCost * complexityMultiplier * dataConfidenceFactor;
        const siteAccessContingency = riskAdjusted * 0.05;
        const unforeseenContingency = riskAdjusted * 0.10;
        const subtotalExGst = riskAdjusted + siteAccessContingency + unforeseenContingency;
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;

        return {
            base_cost: Math.round(baseCost * 100) / 100,
            location_factor: locationFactor,
            location_adjusted: Math.round(baseCost * 100) / 100,
            complexity_multiplier: complexityMultiplier,
            data_confidence_factor: dataConfidenceFactor,
            risk_adjusted: Math.round(riskAdjusted * 100) / 100,
            site_access_contingency: Math.round(siteAccessContingency * 100) / 100,
            unforeseen_contingency: Math.round(unforeseenContingency * 100) / 100,
            subtotal_ex_gst: Math.round(subtotalExGst * 100) / 100,
            gst: Math.round(gst * 100) / 100,
            total_inc_gst: Math.round(totalIncGst * 100) / 100,
            currency: 'AUD'
        };
    }

    _findSteelSectionDetails(sectionName) {
        if (!sectionName) return null;

        const normalizedSectionName = sectionName.toUpperCase().replace(/\s+/g, " ").trim();
        if (this.baseRates.structural_steel[normalizedSectionName]) {
            return this.baseRates.structural_steel[normalizedSectionName];
        }

        const getNormalizedKey = (key) => key.toUpperCase().replace(/\s+/g, "").replace(/[×X]/g, 'X');
        const cleanSectionKey = normalizedSectionName.replace(/\s+/g, "").replace(/[×X]/g, 'X');

        for (const [key, details] of Object.entries(this.baseRates.structural_steel)) {
            if (getNormalizedKey(key) === cleanSectionKey) {
                return details;
            }
        }

        const typeMatch = normalizedSectionName.match(/^(\d+\s*(?:UB|UC|PFC))/);
        const weightMatch = normalizedSectionName.match(/(\d+\.?\d*)$/);

        if (typeMatch && weightMatch) {
            const sectionType = typeMatch[1].replace(/\s+/g, ' ');
            const targetWeight = parseFloat(weightMatch[1]);
            let bestMatch = null;
            let smallestDiff = Infinity;

            for (const [key, details] of Object.entries(this.baseRates.structural_steel)) {
                if (key.startsWith(sectionType)) {
                    const keyWeight = details.weight_per_m;
                    const diff = Math.abs(targetWeight - keyWeight);
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
        return null;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20;
        const sectionLower = section.toLowerCase().replace(/\s/g, '');
        const weightMatch = section.match(/(\d+\.?\d*)\s*$/);
        if (weightMatch) {
            const weight = parseFloat(weightMatch[1]);
            if (weight > 0 && weight < 500) return weight;
        }
        const weightTable = { '150ub': 14.0, '180ub': 18.2, '200ub': 25.4, '250ub': 31.4, '310ub': 40.4, '360ub': 50.7, '410ub': 59.7, '460ub': 67.1, '100shs': 14.9, '125shs': 18.9, '150shs': 35.4, '100pfc': 10.4, '150pfc': 17.0, '200pfc': 23.4, '250pfc': 35.0, '300pfc': 40.0, '380pfc': 50.0, 'z200': 19.0, 'z250': 24.0, 'z150': 19.0, 'c200': 19.0, 'c150': 19.0, 'c100': 15.0 };
        for (const [key, weight] of Object.entries(weightTable)) {
            if (sectionLower.includes(key)) return weight;
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
        const steelCost = (steelSummary.total_steel_weight_tonnes || 0) * 3500;
        const concreteCost = (concreteSummary.total_concrete_m3 || 0) * 400;
        return steelCost + concreteCost;
    }

    _groupByCategory(items) {
        const categories = {};
        items.forEach(item => {
            const category = item.category;
            if (!categories[category]) {
                categories[category] = { items: [], total: 0 };
            }
            categories[category].items.push(item.toObject());
            categories[category].total += item.totalCost;
        });
        return categories;
    }

    _generateAssumptions(analysisResult) {
        const assumptions = [ "Steel sections conform to AS/NZS standards", "Standard connection details unless noted", "Site access available for delivery and crane operations", "All concrete work includes standard reinforcement", "Hot-dip galvanizing for all structural steel", "Standard foundation conditions assumed" ];
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
        return [ "Building permits and approvals", "Site survey and soil testing", "Electrical and mechanical services", "Architectural finishes", "Temporary works not specified", "Price escalation beyond validity period", "Variations to scope of work" ];
    }

    _calculateConfidenceScore(items) {
        if (items.length === 0) return 0;
        const averageConfidence = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
        return Math.round(averageConfidence * 100) / 100;
    }
}






