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
        this.quantity = quantity;
        this.unit = unit;
        this.unitRate = unitRate;
        this.totalCost = totalCost;
        this.category = category;
        this.subcategory = subcategory;
        this.notes = notes;
        this.riskFactor = riskFactor;
        this.confidence = confidence;
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
class EstimationEngine {
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
                n20: { rate: 280, unit: "m³", includes: ["supply", "pour"] },
                n25: { rate: 300, unit: "m³", includes: ["supply", "pour"] },
                n32: { rate: 320, unit: "m³", includes: ["supply", "pour"] },
                n40: { rate: 380, unit: "m³", includes: ["supply", "pour", "superplasticiser"] },
                pumping: { rate: 25, unit: "m³", minimum: 800 },
                testing: { rate: 180, unit: "test" },
                curing_compound: { rate: 15, unit: "m²" }
            },
            reinforcement: {
                n12_bars: { rate: 2800, unit: "tonne", weight_per_m: 0.888 },
                n16_bars: { rate: 2850, unit: "tonne", weight_per_m: 1.578 },
                n20_bars: { rate: 2900, unit: "tonne", weight_per_m: 2.466 },
                n24_bars: { rate: 2950, unit: "tonne", weight_per_m: 3.553 },
                sl72_mesh: { rate: 8.50, unit: "m²", weight_per_m2: 5.72 },
                sl82_mesh: { rate: 9.20, unit: "m²", weight_per_m2: 6.72 },
                cutting_bending: { rate: 150, unit: "tonne" },
                installation: { rate: 200, unit: "tonne" }
            },
            structural_steel: {
                hollow_sections: {
                    "100x100x5_shs": { rate: 3.20, unit: "kg", weight_per_m: 14.9 },
                    "100x100x6_shs": { rate: 3.20, unit: "kg", weight_per_m: 17.7 },
                    "125x125x5_shs": { rate: 3.20, unit: "kg", weight_per_m: 18.9 },
                    "125x125x6_shs": { rate: 3.20, unit: "kg", weight_per_m: 22.4 },
                    "150x150x8_shs": { rate: 3.25, unit: "kg", weight_per_m: 35.4 }
                },
                universal_beams: {
                    "150ub14": { rate: 3.15, unit: "kg", weight_per_m: 14.0 },
                    "200ub18": { rate: 3.15, unit: "kg", weight_per_m: 18.2 },
                    "200ub25": { rate: 3.15, unit: "kg", weight_per_m: 25.4 },
                    "250ub26": { rate: 3.15, unit: "kg", weight_per_m: 25.7 },
                    "250ub31": { rate: 3.15, unit: "kg", weight_per_m: 31.4 },
                    "310ub32": { rate: 3.15, unit: "kg", weight_per_m: 32.0 }
                },
                channels: {
                    "100pfc": { rate: 3.25, unit: "kg", weight_per_m: 10.4 },
                    "150pfc": { rate: 3.25, unit: "kg", weight_per_m: 17.0 },
                    "200pfc": { rate: 3.25, unit: "kg", weight_per_m: 23.4 },
                    "250pfc": { rate: 3.25, unit: "kg", weight_per_m: 31.0 }
                },
                purlins: {
                    "c200": { rate: 45, unit: "m", weight_per_m: 24.0 },
                    "c250": { rate: 52, unit: "m", weight_per_m: 28.5 },
                    "c300": { rate: 58, unit: "m", weight_per_m: 34.2 }
                }
            },
            fabrication: {
                simple: { rate: 800, unit: "tonne", description: "Simple connections" },
                medium: { rate: 1200, unit: "tonne", description: "Standard connections" },
                complex: { rate: 1800, unit: "tonne", description: "Complex connections" },
                shop_drawings: { rate: 8500, unit: "item", minimum: 5000 }
            },
            treatment: {
                galvanizing: { rate: 800, unit: "tonne", minimum: 150 },
                epoxy_painting: { rate: 25, unit: "m²" },
                zinc_rich_primer: { rate: 18, unit: "m²" }
            },
            erection: {
                steel_erection: { rate: 650, unit: "tonne", includes: ["crane", "crew"] },
                crane_hire: { rate: 180, unit: "hour", minimum: 4 },
                site_welding: { rate: 120, unit: "hour" },
                temporary_works: { rate: 350, unit: "tonne" }
            },
            anchors: {
                m12_mechanical: { rate: 35, unit: "each" },
                m16_mechanical: { rate: 42, unit: "each" },
                m20_mechanical: { rate: 55, unit: "each" },
                m12_chemical: { rate: 28, unit: "each" },
                m16_chemical: { rate: 32, unit: "each" },
                m20_chemical: { rate: 38, unit: "each" },
                installation: { rate: 25, unit: "each", minimum: 500 }
            },
            formwork: {
                slab_formwork: { rate: 35, unit: "m²" },
                beam_formwork: { rate: 65, unit: "m²" },
                column_formwork: { rate: 85, unit: "m²" },
                wall_formwork: { rate: 45, unit: "m²" }
            },
            excavation: {
                general_excavation: { rate: 25, unit: "m³" },
                rock_excavation: { rate: 85, unit: "m³" },
                backfill: { rate: 18, unit: "m³" },
                compaction: { rate: 12, unit: "m³" }
            },
            professional: {
                structural_inspection: { rate: 750, unit: "visit" },
                concrete_testing: { rate: 180, unit: "test" },
                geotechnical_testing: { rate: 280, unit: "test" },
                load_testing: { rate: 450, unit: "test" },
                engineering_certification: { rate: 3500, unit: "item" }
            }
        };
    }

    /**
     * Generate comprehensive cost estimation from AI analysis
     */
    async generateEstimation(analysisResult, location) {
        try {
            const estimationItems = [];

            // Process each analysis component
            if (analysisResult.quantity_takeoff) {
                const concreteItems = await this._estimateConcreteWorks(
                    analysisResult.quantity_takeoff, location
                );
                estimationItems.push(...concreteItems);

                const steelItems = await this._estimateSteelWorks(
                    analysisResult.quantity_takeoff, location
                );
                estimationItems.push(...steelItems);

                const miscItems = await this._estimateMiscellaneousWorks(
                    analysisResult.quantity_takeoff, location
                );
                estimationItems.push(...miscItems);
            }

            // Add professional services
            const professionalItems = await this._estimateProfessionalServices(
                analysisResult, location
            );
            estimationItems.push(...professionalItems);

            // Calculate totals and apply factors
            const costSummary = await this._calculateCostSummary(
                estimationItems, location, analysisResult.risk_assessment || {}
            );

            // Generate final estimation package
            const estimationData = {
                project_id: analysisResult.project_id,
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

        // Footings
        if (concreteQty.footings?.volume_m3 > 0) {
            const volume = concreteQty.footings.volume_m3;
            const formwork = concreteQty.footings.formwork_m2 || volume * 6; // Estimate formwork

            // Concrete supply and pour
            const concreteRate = this.baseRates.concrete.n32.rate * 
                (this.locationFactors[location] || 1.0);
            
            items.push(new EstimationItem({
                code: "CON_001",
                description: "Footing concrete N32",
                quantity: volume,
                unit: "m³",
                unitRate: concreteRate,
                totalCost: volume * concreteRate,
                category: "Concrete",
                subcategory: "Footings"
            }));

            // Formwork
            const formworkRate = this.baseRates.formwork.slab_formwork.rate;
            items.push(new EstimationItem({
                code: "FORM_001",
                description: "Footing formwork",
                quantity: formwork,
                unit: "m²",
                unitRate: formworkRate,
                totalCost: formwork * formworkRate,
                category: "Formwork",
                subcategory: "Footings"
            }));

            // Excavation (estimate 1.5x concrete volume)
            const excavation = volume * 1.5;
            const excavationRate = this.baseRates.excavation.general_excavation.rate;
            items.push(new EstimationItem({
                code: "EXC_001",
                description: "Footing excavation",
                quantity: excavation,
                unit: "m³",
                unitRate: excavationRate,
                totalCost: excavation * excavationRate,
                category: "Excavation",
                subcategory: "Footings"
            }));
        }

        // Slabs
        if (concreteQty.slabs?.volume_m3 > 0) {
            const volume = concreteQty.slabs.volume_m3;
            const area = concreteQty.slabs.area_m2 || 0;

            const concreteRate = this.baseRates.concrete.n32.rate * 
                (this.locationFactors[location] || 1.0);

            items.push(new EstimationItem({
                code: "CON_002",
                description: "Slab concrete N32",
                quantity: volume,
                unit: "m³",
                unitRate: concreteRate,
                totalCost: volume * concreteRate,
                category: "Concrete",
                subcategory: "Slabs"
            }));

            if (area > 0) {
                // Slab preparation
                items.push(new EstimationItem({
                    code: "PREP_001",
                    description: "Slab preparation",
                    quantity: area,
                    unit: "m²",
                    unitRate: 15,
                    totalCost: area * 15,
                    category: "Site Preparation",
                    subcategory: "Slabs"
                }));

                // Polythene membrane
                items.push(new EstimationItem({
                    code: "MEM_001",
                    description: "Polythene membrane",
                    quantity: area,
                    unit: "m²",
                    unitRate: 8,
                    totalCost: area * 8,
                    category: "Materials",
                    subcategory: "Slabs"
                }));
            }
        }

        // Beams and Columns
        for (const element of ["beams", "columns"]) {
            if (concreteQty[element]?.volume_m3 > 0) {
                const volume = concreteQty[element].volume_m3;
                const formwork = concreteQty[element].formwork_m2 || 0;

                const concreteGrade = element === "columns" ? "n40" : "n32";
                const concreteRate = this.baseRates.concrete[concreteGrade].rate * 
                    (this.locationFactors[location] || 1.0);

                items.push(new EstimationItem({
                    code: `CON_${element.toUpperCase()}`,
                    description: `${element.charAt(0).toUpperCase() + element.slice(1)} concrete ${concreteGrade.toUpperCase()}`,
                    quantity: volume,
                    unit: "m³",
                    unitRate: concreteRate,
                    totalCost: volume * concreteRate,
                    category: "Concrete",
                    subcategory: element.charAt(0).toUpperCase() + element.slice(1)
                }));

                if (formwork > 0) {
                    const formworkType = `${element.slice(0, -1)}_formwork`;
                    const formworkRate = this.baseRates.formwork[formworkType].rate;
                    
                    items.push(new EstimationItem({
                        code: `FORM_${element.toUpperCase()}`,
                        description: `${element.charAt(0).toUpperCase() + element.slice(1)} formwork`,
                        quantity: formwork,
                        unit: "m²",
                        unitRate: formworkRate,
                        totalCost: formwork * formworkRate,
                        category: "Formwork",
                        subcategory: element.charAt(0).toUpperCase() + element.slice(1)
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
        const steelQty = quantities.structural_steel || {};
        let totalWeight = 0;

        // Steel members
        for (const memberType of ["beams", "columns"]) {
            if (steelQty[memberType]) {
                for (const member of steelQty[memberType]) {
                    const section = (member.section || "").toLowerCase().replace(/\s/g, "");
                    const length = member.length_m || 0;
                    const quantity = member.quantity || 1;

                    // Find matching rate
                    const [weightPerM, ratePerKg] = this._getSteelRates(section);

                    if (weightPerM > 0) {
                        const totalLength = length * quantity;
                        const weight = (totalLength * weightPerM) / 1000; // Convert to tonnes
                        totalWeight += weight;

                        const cost = weight * 1000 * ratePerKg * (this.locationFactors[location] || 1.0);

                        items.push(new EstimationItem({
                            code: `STEEL_${memberType.toUpperCase()}_${items.length + 1}`,
                            description: `${member.section} ${memberType.slice(0, -1)}`,
                            quantity: totalLength,
                            unit: "m",
                            unitRate: cost / totalLength,
                            totalCost: cost,
                            category: "Structural Steel",
                            subcategory: memberType.charAt(0).toUpperCase() + memberType.slice(1),
                            notes: `Weight: ${weight.toFixed(2)}t`
                        }));
                    }
                }
            }
        }

        // Fabrication costs
        if (totalWeight > 0) {
            // Determine complexity based on connection count
            const connections = steelQty.connections || {};
            let complexity = "medium"; // Default

            if ((connections.welded_connections || 0) > 20) {
                complexity = "complex";
            } else if ((connections.bolted_connections || 0) < 10) {
                complexity = "simple";
            }

            const fabRate = this.baseRates.fabrication[complexity].rate;
            const fabCost = totalWeight * fabRate;

            items.push(new EstimationItem({
                code: "FAB_001",
                description: `Steel fabrication - ${complexity}`,
                quantity: totalWeight,
                unit: "tonne",
                unitRate: fabRate,
                totalCost: fabCost,
                category: "Steel Fabrication",
                subcategory: "Fabrication"
            }));

            // Shop drawings
            items.push(new EstimationItem({
                code: "FAB_002",
                description: "Shop drawings and engineering",
                quantity: 1,
                unit: "item",
                unitRate: 8500,
                totalCost: 8500,
                category: "Steel Fabrication",
                subcategory: "Engineering"
            }));

            // Galvanizing
            const galvRate = this.baseRates.treatment.galvanizing.rate;
            const galvCost = totalWeight * galvRate;

            items.push(new EstimationItem({
                code: "GALV_001",
                description: "Hot dip galvanizing",
                quantity: totalWeight,
                unit: "tonne",
                unitRate: galvRate,
                totalCost: galvCost,
                category: "Steel Treatment",
                subcategory: "Galvanizing"
            }));

            // Erection
            const erectionRate = this.baseRates.erection.steel_erection.rate;
            const erectionCost = totalWeight * erectionRate * (this.locationFactors[location] || 1.0);

            items.push(new EstimationItem({
                code: "ERECT_001",
                description: "Steel erection including crane",
                quantity: totalWeight,
                unit: "tonne",
                unitRate: erectionRate,
                totalCost: erectionCost,
                category: "Steel Erection",
                subcategory: "Installation"
            }));
        }

        return items;
    }

    /**
     * Estimate miscellaneous works like anchors, reinforcement
     */
    async _estimateMiscellaneousWorks(quantities, location) {
        const items = [];

        // Reinforcement
        const rebarQty = quantities.reinforcement_quantities || {};

        if (rebarQty.deformed_bars) {
            const bars = rebarQty.deformed_bars;

            for (const [barSize, kg] of Object.entries(bars)) {
                if (kg > 0) {
                    const size = barSize.replace("_kg", "");
                    const rateKey = `${size}_bars`;

                    if (this.baseRates.reinforcement[rateKey]) {
                        const ratePerTonne = this.baseRates.reinforcement[rateKey].rate;
                        const tonnes = kg / 1000;
                        const cost = tonnes * ratePerTonne * (this.locationFactors[location] || 1.0);

                        items.push(new EstimationItem({
                            code: `REBAR_${size.toUpperCase()}`,
                            description: `${size.toUpperCase()} deformed bars`,
                            quantity: tonnes,
                            unit: "tonne",
                            unitRate: ratePerTonne,
                            totalCost: cost,
                            category: "Reinforcement",
                            subcategory: "Deformed Bars"
                        }));
                    }
                }
            }
        }

        // Mesh reinforcement
        if (rebarQty.mesh) {
            const mesh = rebarQty.mesh;

            for (const [meshType, m2] of Object.entries(mesh)) {
                if (m2 > 0 && meshType !== "other_m2") {
                    const rate = this.baseRates.reinforcement[`${meshType}_mesh`]?.rate || 8.5;
                    const cost = m2 * rate;

                    items.push(new EstimationItem({
                        code: `MESH_${meshType.toUpperCase()}`,
                        description: `${meshType.toUpperCase()} reinforcing mesh`,
                        quantity: m2,
                        unit: "m²",
                        unitRate: rate,
                        totalCost: cost,
                        category: "Reinforcement",
                        subcategory: "Mesh"
                    }));
                }
            }
        }

        // Anchors and fixings
        const miscQty = quantities.miscellaneous || {};

        if (miscQty.anchors) {
            const anchors = miscQty.anchors;

            for (const [anchorType, qty] of Object.entries(anchors)) {
                if (qty > 0) {
                    const rate = this.baseRates.anchors[anchorType]?.rate || 35;
                    const cost = qty * rate;

                    items.push(new EstimationItem({
                        code: `ANCHOR_${anchorType.toUpperCase()}`,
                        description: `${anchorType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} anchors`,
                        quantity: qty,
                        unit: "each",
                        unitRate: rate,
                        totalCost: cost,
                        category: "Anchors & Fixings",
                        subcategory: "Anchors"
                    }));
                }
            }

            // Installation allowance
            const totalAnchors = Object.values(anchors).reduce((sum, qty) => sum + qty, 0);
            if (totalAnchors > 0) {
                const installCost = Math.max(500, totalAnchors * 15); // Minimum $500 or $15 per anchor

                items.push(new EstimationItem({
                    code: "ANCHOR_INSTALL",
                    description: "Anchor installation and testing",
                    quantity: 1,
                    unit: "item",
                    unitRate: installCost,
                    totalCost: installCost,
                    category: "Anchors & Fixings",
                    subcategory: "Installation"
                }));
            }
        }

        return items;
    }

    /**
     * Estimate professional services and testing
     */
    async _estimateProfessionalServices(analysisResult, location) {
        const items = [];

        // Base professional services
        const services = [
            ["PROF_001", "Structural engineering inspections", 8, "visits", 750],
            ["PROF_002", "Geotechnical testing", 15, "tests", 280],
            ["PROF_003", "Concrete testing", 25, "tests", 180],
            ["PROF_004", "Compliance certification", 1, "item", 3500]
        ];

        for (const [code, desc, qty, unit, rate] of services) {
            const adjustedRate = rate * (this.locationFactors[location] || 1.0);
            const cost = qty * adjustedRate;

            items.push(new EstimationItem({
                code: code,
                description: desc,
                quantity: qty,
                unit: unit,
                unitRate: adjustedRate,
                totalCost: cost,
                category: "Professional Services",
                subcategory: "Testing & Certification"
            }));
        }

        // Project-specific services based on complexity
        const scope = analysisResult.scope_identification || {};
        const complexity = scope.project_complexity || "medium";

        if (complexity === "high") {
            // Additional services for complex projects
            items.push(new EstimationItem({
                code: "PROF_005",
                description: "Additional structural review",
                quantity: 1,
                unit: "item",
                unitRate: 2500,
                totalCost: 2500,
                category: "Professional Services",
                subcategory: "Engineering"
            }));

            items.push(new EstimationItem({
                code: "PROF_006",
                description: "Load testing (1% of anchors)",
                quantity: 3,
                unit: "tests",
                unitRate: 450,
                totalCost: 1350,
                category: "Professional Services",
                subcategory: "Testing"
            }));
        }

        return items;
    }

    /**
     * Calculate comprehensive cost summary with risk factors
     */
    async _calculateCostSummary(items, location, riskAssessment) {
        const baseCost = items.reduce((sum, item) => sum + item.totalCost, 0);

        // Apply location factor (already applied to individual items)
        const locationFactor = this.locationFactors[location] || 1.0;
        const locationAdjusted = baseCost;

        // Risk adjustments
        const riskFactors = riskAssessment.cost_factors || {};
        const complexityMult = riskFactors.complexity_multiplier || 1.0;
        const accessFactor = riskFactors.access_factor || 1.0;

        // Apply risk factors
        const riskAdjusted = locationAdjusted * complexityMult * accessFactor;

        // Contingencies
        const siteAccessContingency = riskAdjusted * 0.03;
        const unforeseenContingency = riskAdjusted * 0.05;

        // Subtotal before GST
        const subtotalExGst = riskAdjusted + siteAccessContingency + unforeseenContingency;

        // GST
        const gst = subtotalExGst * this.gstRate;
        const totalIncGst = subtotalExGst + gst;

        return {
            base_cost: Math.round(baseCost * 100) / 100,
            location_factor: locationFactor,
            location_adjusted: Math.round(locationAdjusted * 100) / 100,
            complexity_multiplier: complexityMult,
            access_factor: accessFactor,
            risk_adjusted: Math.round(riskAdjusted * 100) / 100,
            site_access_contingency: Math.round(siteAccessContingency * 100) / 100,
            unforeseen_contingency: Math.round(unforeseenContingency * 100) / 100,
            subtotal_ex_gst: Math.round(subtotalExGst * 100) / 100,
            gst: Math.round(gst * 100) / 100,
            total_inc_gst: Math.round(totalIncGst * 100) / 100,
            currency: "AUD"
        };
    }

    /**
     * Get steel rates and weights for a section
     */
    _getSteelRates(section) {
        // Clean section name
        section = section.toLowerCase().replace(/\s/g, "").replace(/x/g, "");

        // Search in different categories
        for (const category of ["hollow_sections", "universal_beams", "channels", "purlins"]) {
            const rates = this.baseRates.structural_steel[category] || {};

            // Try exact match first
            if (rates[section]) {
                return [rates[section].weight_per_m, rates[section].rate];
            }

            // Try partial matches
            for (const [key, value] of Object.entries(rates)) {
                if (section.includes(key) || key.includes(section)) {
                    return [value.weight_per_m, value.rate];
                }
            }
        }

        // Default values if not found
        console.warn(`Steel section '${section}' not found in rates database`);
        return [20.0, 3.20]; // Default 20kg/m, $3.20/kg
    }

    /**
     * Group estimation items by category
     */
    _groupByCategory(items) {
        const categories = {};

        for (const item of items) {
            const category = item.category;
            if (!categories[category]) {
                categories[category] = {
                    items: [],
                    total_cost: 0,
                    item_count: 0
                };
            }

            categories[category].items.push(item.toObject());
            categories[category].total_cost += item.totalCost;
            categories[category].item_count += 1;
        }

        // Sort categories by cost (highest first)
        const sortedCategories = Object.entries(categories)
            .sort(([,a], [,b]) => b.total_cost - a.total_cost)
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        return sortedCategories;
    }

    /**
     * Generate estimation assumptions
     */
    _generateAssumptions(analysisResult) {
        const baseAssumptions = [
            "Site access available during normal working hours",
            "Materials delivered to site boundary",
            "Standard ground conditions as per geotechnical report",
            "No contaminated materials encountered",
            "Existing services locations as documented",
            "Work completed during normal weather conditions",
            "Crane access available for steel erection",
            "Current material and labor market rates",
            "No delays due to permit approvals"
        ];

        // Add project-specific assumptions from AI analysis
        const aiAssumptions = analysisResult.assumptions || [];

        return [...baseAssumptions, ...aiAssumptions];
    }

    /**
     * Generate standard exclusions
     */
    _generateExclusions() {
        return [
            "Architectural finishes and fit-out works",
            "Electrical and mechanical services installation",
            "Building permits and council fees",
            "Crane permits and traffic management",
            "Site establishment beyond structural works",
            "Variations to existing conditions not documented",
            "Work outside normal business hours",
            "Scaffolding and temporary access platforms",
            "Contaminated soil removal",
            "Rock excavation (unless specifically noted)"
        ];
    }

    /**
     * Calculate overall confidence score for the estimation
     */
    _calculateConfidenceScore(items) {
        if (items.length === 0) {
            return 0.5;
        }

        // Weight confidence by cost
        const totalCost = items.reduce((sum, item) => sum + item.totalCost, 0);
        
        if (totalCost === 0) {
            return 0.5;
        }

        const weightedConfidence = items.reduce((sum, item) => {
            return sum + (item.confidence * (item.totalCost / totalCost));
        }, 0);

        return Math.min(1.0, Math.max(0.0, weightedConfidence));
    }

    /**
     * Get current material rates for location
     */
    async getMaterialRates(location) {
        const rates = {};

        for (const [category, materials] of Object.entries(this.baseRates)) {
            rates[category] = {};

            if (typeof materials === 'object' && materials !== null) {
                for (const [material, data] of Object.entries(materials)) {
                    if (typeof data === 'object' && data !== null && data.rate !== undefined) {
                        const adjustedRate = data.rate * (this.locationFactors[location] || 1.0);
                        rates[category][material] = {
                            ...data,
                            adjusted_rate: Math.round(adjustedRate * 100) / 100,
                            location_factor: this.locationFactors[location] || 1.0
                        };
                    }
                }
            }
        }

        return {
            rates: rates,
            last_updated: new Date().toISOString(),
            location: location
        };
    }

    /**
     * Update material rates
     */
    async updateMaterialRates(ratesData) {
        // This would typically update a database
        // For now, just log the update
        console.log(`Material rates update requested:`, ratesData);

        // In production, this would:
        // 1. Validate the new rates
        // 2. Update the database
        // 3. Refresh the in-memory cache
        // 4. Log the changes for audit
    }
}

/**
 * Report Generator Class
 * Generate various report formats from estimation data
 */
class ReportGenerator {
    constructor() {
        this.outputDir = "reports";
        // In a browser environment, you might use IndexedDB or localStorage
        // In Node.js, you would create the directory
    }

    /**
     * Generate report in specified format
     */
    async generateReport(estimationData, format, projectId) {
        try {
            switch (format) {
                case "pdf":
                    return await this._generatePdfReport(estimationData, projectId);
                case "excel":
                    return await this._generateExcelReport(estimationData, projectId);
                case "json":
                    return await this._generateJsonReport(estimationData, projectId);
                case "html":
                    return await this._generateHtmlReport(estimationData, projectId);
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
        } catch (error) {
            console.error(`Report generation error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate HTML report (browser-friendly alternative to PDF)
     */
    async _generateHtmlReport(data, projectId) {
        const filename = `estimation_${projectId}.html`;
        
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Structural Cost Estimation Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .header {
            border-bottom: 3px solid #007acc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #007acc;
            margin: 0;
            font-size: 28px;
        }
        .project-info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 30px;
        }
        .project-info table {
            width: 100%;
            border-collapse: collapse;
        }
        .project-info td {
            padding: 8px;
            border-bottom: 1px solid #dee2e6;
        }
        .project-info td:first-child {
            font-weight: bold;
            width: 150px;
        }
        .cost-summary {
            margin-bottom: 30px;
        }
        .cost-summary h2 {
            color: #007acc;
            border-bottom: 2px solid #007acc;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #007acc;
            color: white;
            font-weight: bold;
        }
        tr:nth-child(even) {
            background-color: #f2f2f2;
        }
        .total-row {
            background-color: #e8f4f8 !important;
            font-weight: bold;
            border-top: 2px solid #007acc;
        }
        .category-section {
            margin-bottom: 30px;
        }
        .category-section h3 {
            color: #495057;
            background: #e9ecef;
            padding: 10px;
            margin: 0 0 15px 0;
        }
        .assumptions, .exclusions {
            margin-top: 30px;
        }
        .assumptions h2, .exclusions h2 {
            color: #007acc;
            border-bottom: 2px solid #007acc;
            padding-bottom: 10px;
        }
        .assumptions ul, .exclusions ul {
            padding-left: 20px;
        }
        .assumptions li, .exclusions li {
            margin-bottom: 8px;
        }
        .currency {
            text-align: right;
        }
        @media print {
            body { margin: 0; }
            .header { border-bottom: 2px solid #000; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Structural Cost Estimation Report</h1>
        <p>Professional Cost Analysis and Breakdown</p>
    </div>

    <div class="project-info">
        <table>
            <tr>
                <td>Project ID:</td>
                <td>${projectId}</td>
            </tr>
            <tr>
                <td>Location:</td>
                <td>${data.location || 'N/A'}</td>
            </tr>
            <tr>
                <td>Generated:</td>
                <td>${new Date(data.estimation_date).toLocaleDateString('en-AU', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                })}</td>
            </tr>
            <tr>
                <td>Total Cost:</td>
                <td class="currency"><strong>${data.cost_summary.total_inc_gst.toLocaleString()} AUD (inc GST)</strong></td>
            </tr>
            <tr>
                <td>Confidence Score:</td>
                <td>${Math.round(data.confidence_score * 100)}%</td>
            </tr>
        </table>
    </div>

    <div class="cost-summary">
        <h2>Cost Summary</h2>
        <table>
            <thead>
                <tr>
                    <th>Item</th>
                    <th class="currency">Amount (AUD)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Base Cost</td>
                    <td class="currency">${data.cost_summary.base_cost.toLocaleString()}</td>
                </tr>
                <tr>
                    <td>Risk Adjustments</td>
                    <td class="currency">${(data.cost_summary.risk_adjusted - data.cost_summary.base_cost).toLocaleString()}</td>
                </tr>
                <tr>
                    <td>Contingencies</td>
                    <td class="currency">${(data.cost_summary.site_access_contingency + data.cost_summary.unforeseen_contingency).toLocaleString()}</td>
                </tr>
                <tr>
                    <td>Subtotal (ex GST)</td>
                    <td class="currency">${data.cost_summary.subtotal_ex_gst.toLocaleString()}</td>
                </tr>
                <tr>
                    <td>GST (${(this.gstRate || 0.10) * 100}%)</td>
                    <td class="currency">${data.cost_summary.gst.toLocaleString()}</td>
                </tr>
                <tr class="total-row">
                    <td><strong>Total (inc GST)</strong></td>
                    <td class="currency"><strong>${data.cost_summary.total_inc_gst.toLocaleString()}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="category-breakdown">
        <h2>Cost Breakdown by Category</h2>
        ${Object.entries(data.categories || {}).map(([category, categoryData]) => `
            <div class="category-section">
                <h3>${category}: ${categoryData.total_cost.toLocaleString()}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Code</th>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit</th>
                            <th class="currency">Rate</th>
                            <th class="currency">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryData.items.slice(0, 10).map(item => `
                            <tr>
                                <td>${item.code}</td>
                                <td>${item.description}</td>
                                <td>${item.quantity.toFixed(1)}</td>
                                <td>${item.unit}</td>
                                <td class="currency">${item.unitRate.toFixed(2)}</td>
                                <td class="currency">${item.totalCost.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                        ${categoryData.items.length > 10 ? `
                            <tr>
                                <td colspan="6" style="text-align: center; font-style: italic;">
                                    ... and ${categoryData.items.length - 10} more items
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            </div>
        `).join('')}
    </div>

    <div class="assumptions">
        <h2>Assumptions</h2>
        <ul>
            ${(data.assumptions || []).slice(0, 15).map(assumption => `
                <li>${assumption}</li>
            `).join('')}
        </ul>
    </div>

    <div class="exclusions">
        <h2>Exclusions</h2>
        <ul>
            ${(data.exclusions || []).slice(0, 15).map(exclusion => `
                <li>${exclusion}</li>
            `).join('')}
        </ul>
    </div>

    <script>
        // Add print functionality
        window.print = function() {
            window.print();
        };
        
        // Add export functionality
        function exportToJSON() {
            const dataStr = JSON.stringify(${JSON.stringify(data)}, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = '${filename.replace('.html', '.json')}';
            link.click();
        }
    </script>
</body>
</html>`;

        return {
            filename: filename,
            content: html,
            type: 'text/html'
        };
    }

    /**
     * Generate JSON report
     */
    async _generateJsonReport(data, projectId) {
        const filename = `estimation_${projectId}.json`;
        const content = JSON.stringify(data, null, 2);
        
        return {
            filename: filename,
            content: content,
            type: 'application/json'
        };
    }

    /**
     * Generate Excel-compatible CSV report
     */
    async _generateExcelReport(data, projectId) {
        const filename = `estimation_${projectId}.csv`;
        
        // Create CSV content for line items
        const headers = ['Code', 'Description', 'Quantity', 'Unit', 'Unit Rate', 'Total Cost', 'Category', 'Subcategory'];
        const csvRows = [headers.join(',')];
        
        // Add data rows
        for (const item of data.items || []) {
            const row = [
                `"${item.code}"`,
                `"${item.description}"`,
                item.quantity,
                `"${item.unit}"`,
                item.unitRate,
                item.totalCost,
                `"${item.category}"`,
                `"${item.subcategory}"`
            ];
            csvRows.push(row.join(','));
        }
        
        // Add summary section
        csvRows.push('');
        csvRows.push('COST SUMMARY');
        csvRows.push(`"Base Cost","${data.cost_summary.base_cost}"`);
        csvRows.push(`"Risk Adjusted","${data.cost_summary.risk_adjusted}"`);
        csvRows.push(`"Subtotal ex GST","${data.cost_summary.subtotal_ex_gst}"`);
        csvRows.push(`"GST","${data.cost_summary.gst}"`);
        csvRows.push(`"Total inc GST","${data.cost_summary.total_inc_gst}"`);
        
        const content = csvRows.join('\n');
        
        return {
            filename: filename,
            content: content,
            type: 'text/csv'
        };
    }

    /**
     * Placeholder for PDF generation
     */
    async _generatePdfReport(data, projectId) {
        // In a real implementation, you would use a PDF library
        // For now, return HTML as fallback
        return await this._generateHtmlReport(data, projectId);
    }
}

// Usage Example and Export
const estimationEngine = new EstimationEngine();
const reportGenerator = new ReportGenerator();

// Example usage function
async function runEstimationExample() {
    try {
        // Sample analysis result (normally would come from AI analysis)
        const sampleAnalysis = {
            project_id: "PROJ_2024_001",
            quantity_takeoff: {
                concrete_quantities: {
                    footings: {
                        volume_m3: 45.5,
                        formwork_m2: 180
                    },
                    slabs: {
                        volume_m3: 125.0,
                        area_m2: 500
                    }
                },
                structural_steel: {
                    beams: [
                        { section: "200UB25", length_m: 6.0, quantity: 8 },
                        { section: "250UB31", length_m: 8.0, quantity: 4 }
                    ],
                    columns: [
                        { section: "150x150x8 SHS", length_m: 3.5, quantity: 12 }
                    ]
                },
                reinforcement_quantities: {
                    deformed_bars: {
                        n16_kg: 2500,
                        n20_kg: 1800
                    },
                    mesh: {
                        sl72: 450
                    }
                }
            },
            risk_assessment: {
                cost_factors: {
                    complexity_multiplier: 1.1,
                    access_factor: 1.05
                }
            },
            scope_identification: {
                project_complexity: "medium"
            }
        };

        // Generate estimation
        const estimation = await estimationEngine.generateEstimation(sampleAnalysis, "Sydney");
        
        console.log("Estimation generated successfully:");
        console.log(`Total Cost: ${estimation.cost_summary.total_inc_gst.toLocaleString()} AUD`);
        console.log(`Confidence: ${Math.round(estimation.confidence_score * 100)}%`);
        
        // Generate HTML report
        const report = await reportGenerator.generateReport(estimation, "html", "PROJ_2024_001");
        console.log(`Report generated: ${report.filename}`);
        
        return estimation;
        
    } catch (error) {
        console.error("Error running estimation example:", error);
        throw error;
    }
}

// Export for ES modules
export {
    EstimationEngine,
    EstimationItem,
    ReportGenerator,
    runEstimationExample
};