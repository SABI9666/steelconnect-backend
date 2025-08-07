const Estimation = require('../models/Estimation');

class EstimationService {
    // Regional pricing data with comprehensive cost structures
    static regionalPricing = {
        'us': { 
            basePrice: 1200, fabrication: 800, erection: 600, 
            currency: 'USD', multiplier: 1.0,
            laborRate: 85, craneRate: 180, overheadRate: 0.15
        },
        'canada': { 
            basePrice: 1400, fabrication: 900, erection: 700, 
            currency: 'CAD', multiplier: 1.15,
            laborRate: 95, craneRate: 200, overheadRate: 0.17
        },
        'uk': { 
            basePrice: 950, fabrication: 650, erection: 500, 
            currency: 'GBP', multiplier: 0.8,
            laborRate: 70, craneRate: 150, overheadRate: 0.20
        },
        'australia': { 
            basePrice: 1600, fabrication: 1000, erection: 800, 
            currency: 'AUD', multiplier: 1.3,
            laborRate: 105, craneRate: 220, overheadRate: 0.18
        },
        'germany': { 
            basePrice: 1100, fabrication: 750, erection: 600, 
            currency: 'EUR', multiplier: 0.9,
            laborRate: 80, craneRate: 170, overheadRate: 0.16
        },
        'india': { 
            basePrice: 45000, fabrication: 25000, erection: 18000, 
            currency: 'INR', multiplier: 75,
            laborRate: 800, craneRate: 3500, overheadRate: 0.12
        }
    };

    // Steel grades with comprehensive properties
    static steelGrades = {
        'A36': { multiplier: 1.0, strength: 250, weldability: 'Excellent' },
        'A572-50': { multiplier: 1.15, strength: 345, weldability: 'Good' },
        'A992': { multiplier: 1.2, strength: 345, weldability: 'Excellent' },
        'S355': { multiplier: 1.1, strength: 355, weldability: 'Good' },
        'Grade-50': { multiplier: 1.15, strength: 345, weldability: 'Good' },
        'Weathering': { multiplier: 1.4, strength: 345, weldability: 'Fair' }
    };

    // Project complexity factors
    static complexityFactors = {
        'simple': { factor: 1.0, description: 'Standard structural work', timeMultiplier: 1.0 },
        'moderate': { factor: 1.25, description: 'Some complex connections', timeMultiplier: 1.2 },
        'complex': { factor: 1.6, description: 'Complex geometry', timeMultiplier: 1.5 },
        'architectural': { factor: 2.0, description: 'Architectural exposed steel', timeMultiplier: 1.8 }
    };

    // Structure type factors
    static structureFactors = {
        'commercial-building': { factor: 1.0, baseTimeline: 12 },
        'warehouse': { factor: 0.8, baseTimeline: 8 },
        'bridge': { factor: 1.8, baseTimeline: 20 },
        'tower': { factor: 1.5, baseTimeline: 16 },
        'stadium': { factor: 1.4, baseTimeline: 18 },
        'petrochemical': { factor: 2.2, baseTimeline: 24 }
    };

    // Coating multipliers
    static coatingFactors = {
        'none': { multiplier: 1.0, costPerSqm: 0 },
        'primer': { multiplier: 1.05, costPerSqm: 15 },
        'intermediate': { multiplier: 1.15, costPerSqm: 35 },
        'heavy-duty': { multiplier: 1.3, costPerSqm: 55 },
        'marine': { multiplier: 1.5, costPerSqm: 75 },
        'fire-resistant': { multiplier: 1.4, costPerSqm: 85 }
    };

    static async calculateDetailedEstimation(params) {
        const {
            projectName,
            projectLocation = '',
            structureType = 'commercial-building',
            projectComplexity = 'simple',
            steelGrade = 'A36',
            coatingRequirement = 'none',
            region = 'us',
            totalTonnage,
            additionalRequirements = []
        } = params;

        if (!totalTonnage || totalTonnage <= 0) {
            throw new Error('Invalid tonnage provided');
        }

        const pricing = this.regionalPricing[region];
        const grade = this.steelGrades[steelGrade];
        const complexity = this.complexityFactors[projectComplexity];
        const structure = this.structureFactors[structureType];
        const coating = this.coatingFactors[coatingRequirement];

        if (!pricing || !grade || !complexity || !structure || !coating) {
            throw new Error('Invalid parameters provided');
        }

        // Base calculations
        const gradeMultiplier = grade.multiplier;
        const complexityFactor = complexity.factor;
        const structureFactor = structure.factor;
        const coatingMultiplier = coating.multiplier;

        // Material costs
        const baseMaterialCost = totalTonnage * pricing.basePrice * gradeMultiplier * structureFactor;
        
        // Fabrication costs (detailed breakdown like the example)
        const fabricationBreakdown = {
            cuttingPreparation: totalTonnage * 2.50 * pricing.multiplier,
            welding: this.calculateWeldingCost(totalTonnage, pricing),
            drilling: this.calculateDrillingCost(totalTonnage, pricing),
            bendingRolling: this.calculateBendingCost(totalTonnage, structureType, pricing),
            endPlatesAndCleats: this.calculateFittingsCost(totalTonnage, pricing),
            basePlates: this.calculateBasePlatesCost(totalTonnage, pricing)
        };

        const totalFabrication = Object.values(fabricationBreakdown).reduce((sum, cost) => sum + cost, 0) * complexityFactor;

        // Surface treatment costs
        const surfaceTreatment = {
            galvanizing: totalTonnage * 0.6 * 2.80 * pricing.multiplier * (coating.multiplier - 1 + 1),
            painting: totalTonnage * 0.4 * 3.50 * pricing.multiplier * (coating.multiplier - 1 + 1),
            specialCoating: coating.costPerSqm * totalTonnage * 15 // Assume 15 sqm per tonne
        };

        const totalSurfaceTreatment = Object.values(surfaceTreatment).reduce((sum, cost) => sum + cost, 0);

        // Quality control
        const qualityControl = {
            weldingInspection: Math.ceil(totalTonnage / 50) * 850,
            toleranceCheck: Math.ceil(totalTonnage / 20) * 65,
            materialTesting: totalTonnage * 8.5
        };

        const totalQualityControl = Object.values(qualityControl).reduce((sum, cost) => sum + cost, 0);

        // Installation costs (detailed like the example)
        const installationBreakdown = {
            craneHire: this.calculateCraneTime(totalTonnage, structureType) * pricing.craneRate,
            skilledLabor: this.calculateLaborHours(totalTonnage, 'skilled', complexityFactor) * pricing.laborRate,
            semiSkilledLabor: this.calculateLaborHours(totalTonnage, 'semi-skilled', complexityFactor) * (pricing.laborRate * 0.75),
            siteWelding: this.calculateSiteWeldingCost(totalTonnage, pricing),
            anchorsAndFixings: this.calculateAnchorsCost(totalTonnage, pricing),
            sitePreparation: this.calculateSitePreparationCost(totalTonnage, pricing)
        };

        const totalInstallation = Object.values(installationBreakdown).reduce((sum, cost) => sum + cost, 0);

        // Engineering & Design costs (like the example)
        const engineeringBreakdown = {
            shopDrawings: this.calculateDrawingHours(totalTonnage) * 125,
            connectionDesign: this.calculateConnectionDesignHours(totalTonnage, projectComplexity) * 150,
            structuralCalculations: this.calculateCalculationHours(totalTonnage) * 135,
            drawingRevisions: Math.ceil(totalTonnage / 100) * 12 * 95,
            structuralReview: Math.ceil(totalTonnage / 200) * 8 * 180,
            permitDocumentation: 750,
            complianceCertification: 450
        };

        const totalEngineering = Object.values(engineeringBreakdown).reduce((sum, cost) => sum + cost, 0);

        // Project management & overheads (like the example)
        const projectManagementBreakdown = {
            projectCoordination: this.calculateProjectManagementHours(totalTonnage) * 115,
            sitSupervision: this.calculateSupervisionHours(totalTonnage, complexityFactor) * 95,
            safetyManagement: this.calculateSafetyHours(totalTonnage) * 85,
            qualityAssurance: this.calculateQAHours(totalTonnage) * 105,
            insurance: totalTonnage * 12,
            administration: this.calculateAdminCost(totalTonnage),
            siteFacilities: this.calculateTimelineWeeks(totalTonnage, structureType, complexityFactor) * 450
        };

        const totalProjectManagement = Object.values(projectManagementBreakdown).reduce((sum, cost) => sum + cost, 0);

        // Calculate subtotal
        const subtotal = baseMaterialCost + totalFabrication + totalSurfaceTreatment + 
                        totalQualityControl + totalInstallation + totalEngineering + totalProjectManagement;

        // Apply contingency and profit
        const contingency = subtotal * 0.05; // 5% contingency
        const overheadAndProfit = subtotal * pricing.overheadRate;

        const totalProjectCost = subtotal + contingency + overheadAndProfit;

        // Timeline calculation
        const estimatedWeeks = this.calculateTimelineWeeks(totalTonnage, structureType, complexityFactor);
        const breakdown = this.calculatePhaseBreakdown(estimatedWeeks);

        // Cost per tonne
        const costPerTonne = totalProjectCost / totalTonnage;

        return {
            projectName,
            projectLocation,
            structureType,
            projectComplexity,
            steelGrade,
            coatingRequirement,
            region,
            totalTonnage,
            currency: pricing.currency,
            
            // Main cost components
            costBreakdown: {
                'Material Costs': baseMaterialCost,
                'Fabrication Costs': totalFabrication,
                'Surface Treatment': totalSurfaceTreatment,
                'Quality Control': totalQualityControl,
                'Installation Costs': totalInstallation,
                'Engineering & Design': totalEngineering,
                'Project Management': totalProjectManagement,
                'Subtotal': subtotal,
                'Contingency (5%)': contingency,
                'Overhead & Profit': overheadAndProfit
            },

            // Detailed breakdowns
            fabricationDetails: fabricationBreakdown,
            surfaceTreatmentDetails: surfaceTreatment,
            qualityControlDetails: qualityControl,
            installationDetails: installationBreakdown,
            engineeringDetails: engineeringBreakdown,
            projectManagementDetails: projectManagementBreakdown,

            // Summary
            totalProjectCost,
            costPerTonne,
            estimatedWeeks,
            phaseBreakdown: breakdown,

            // Additional info
            assumptions: this.generateAssumptions(params),
            exclusions: this.generateExclusions(),
            riskFactors: this.generateRiskFactors(params),
            
            createdAt: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days validity
        };
    }

    // Helper methods for detailed calculations
    static calculateWeldingCost(tonnage, pricing) {
        const weldingMeters = tonnage * 25; // Assume 25m of welding per tonne
        return weldingMeters * 15.00 * pricing.multiplier;
    }

    static calculateDrillingCost(tonnage, pricing) {
        const holes = tonnage * 8; // Assume 8 holes per tonne
        return holes * 8.00 * pricing.multiplier;
    }

    static calculateBendingCost(tonnage, structureType, pricing) {
        const bendingMeters = structureType === 'bridge' ? tonnage * 2 : tonnage * 0.5;
        return bendingMeters * 25.00 * pricing.multiplier;
    }

    static calculateFittingsCost(tonnage, pricing) {
        const fittingsCount = Math.ceil(tonnage / 4); // Assume 1 fitting per 4 tonnes
        return fittingsCount * 45.00 * pricing.multiplier;
    }

    static calculateBasePlatesCost(tonnage, pricing) {
        const basePlates = Math.ceil(tonnage / 12); // Assume 1 base plate per 12 tonnes
        return basePlates * 125.00 * pricing.multiplier;
    }

    static calculateCraneTime(tonnage, structureType) {
        const baseHours = tonnage / 3; // 3 tonnes per hour base rate
        const structureMultiplier = structureType === 'tower' ? 1.5 : 1.0;
        return Math.ceil(baseHours * structureMultiplier);
    }

    static calculateLaborHours(tonnage, skillLevel, complexityFactor) {
        const baseHours = skillLevel === 'skilled' ? tonnage * 3.5 : tonnage * 2.5;
        return Math.ceil(baseHours * complexityFactor);
    }

    static calculateSiteWeldingCost(tonnage, pricing) {
        const siteWeldingHours = tonnage * 1.2;
        return siteWeldingHours * 95.00 * pricing.multiplier;
    }

    static calculateAnchorsCost(tonnage, pricing) {
        const anchorsCount = tonnage * 6;
        return anchorsCount * 25.00 * pricing.multiplier;
    }

    static calculateSitePreparationCost(tonnage, pricing) {
        return tonnage * 50 * pricing.multiplier;
    }

    static calculateDrawingHours(tonnage) {
        return Math.max(20, tonnage / 10); // Minimum 20 hours, 1 hour per 10 tonnes
    }

    static calculateConnectionDesignHours(tonnage, complexity) {
        const baseHours = tonnage / 15;
        const complexityMultiplier = {
            'simple': 1.0,
            'moderate': 1.3,
            'complex': 1.8,
            'architectural': 2.2
        }[complexity] || 1.0;
        return Math.ceil(baseHours * complexityMultiplier);
    }

    static calculateCalculationHours(tonnage) {
        return Math.max(8, tonnage / 25); // Minimum 8 hours
    }

    static calculateProjectManagementHours(tonnage) {
        return Math.max(16, tonnage / 12);
    }

    static calculateSupervisionHours(tonnage, complexityFactor) {
        return Math.ceil(tonnage * 1.5 * complexityFactor);
    }

    static calculateSafetyHours(tonnage) {
        return Math.max(12, tonnage / 15);
    }

    static calculateQAHours(tonnage) {
        return Math.max(8, tonnage / 20);
    }

    static calculateAdminCost(tonnage) {
        const adminHours = Math.max(10, tonnage / 20);
        return adminHours * 75;
    }

    static calculateTimelineWeeks(tonnage, structureType, complexityFactor) {
        const baseWeeks = this.structureFactors[structureType]?.baseTimeline || 12;
        const tonnageWeeks = tonnage / 25; // Assume 25 tonnes per week base rate
        const timeMultiplier = this.complexityFactors[complexityFactor]?.timeMultiplier || 1.0;
        return Math.ceil((baseWeeks + tonnageWeeks) * timeMultiplier);
    }

    static calculatePhaseBreakdown(totalWeeks) {
        return {
            'Design & Documentation': Math.ceil(totalWeeks * 0.25),
            'Fabrication': Math.ceil(totalWeeks * 0.45),
            'Delivery & Installation': Math.ceil(totalWeeks * 0.30)
        };
    }

    static generateAssumptions(params) {
        return [
            'Standard 40-hour work week',
            'Normal site access conditions',
            'No significant structural modifications required',
            'Existing structure adequate for new loads',
            'No asbestos or contamination issues',
            'Standard workplace safety conditions',
            `Steel grade: ${params.steelGrade}`,
            `Project complexity: ${params.projectComplexity}`,
            'Prices based on current market conditions'
        ];
    }

    static generateExclusions() {
        return [
            'Material transportation beyond 100km',
            'Architectural finishes',
            'Services coordination beyond basic allowance',
            'Structural modifications to existing building',
            'Demolition works',
            'Temporary works design',
            'Special access equipment',
            'Environmental impact assessments'
        ];
    }

    static generateRiskFactors(params) {
        const risks = [
            'Coordination with existing services',
            'Weather delays',
            'Discovery of unforeseen conditions',
            'Regulatory approval delays',
            'Material price fluctuations'
        ];

        if (params.structureType === 'bridge') {
            risks.push('Traffic management requirements');
        }

        if (params.projectComplexity === 'architectural') {
            risks.push('Architectural tolerance requirements');
        }

        return risks;
    }

    static async saveEstimation(estimationData) {
        try {
            const estimation = new Estimation(estimationData);
            return await estimation.save();
        } catch (error) {
            throw new Error(`Failed to save estimation: ${error.message}`);
        }
    }

    static async getEstimationById(id, userId) {
        try {
            return await Estimation.findOne({ _id: id, userId });
        } catch (error) {
            throw new Error(`Failed to fetch estimation: ${error.message}`);
        }
    }

    static async getUserEstimations(userId, options = {}) {
        try {
            const { page = 1, limit = 10 } = options;
            const skip = (page - 1) * limit;

            const estimations = await Estimation.find({ userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const total = await Estimation.countDocuments({ userId });

            return {
                estimations,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            throw new Error(`Failed to fetch user estimations: ${error.message}`);
        }
    }

    static async deleteEstimation(id, userId) {
        try {
            const result = await Estimation.findOneAndDelete({ _id: id, userId });
            if (!result) {
                throw new Error('Estimation not found');
            }
            return result;
        } catch (error) {
            throw new Error(`Failed to delete estimation: ${error.message}`);
        }
    }

    // Analytics methods
    static async getEstimationAnalytics(userId) {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const analytics = await Estimation.aggregate([
                { $match: { userId: userId } },
                {
                    $group: {
                        _id: null,
                        totalEstimations: { $sum: 1 },
                        totalTonnage: { $sum: '$totalTonnage' },
                        totalValue: { $sum: '$totalProjectCost' },
                        avgTonnage: { $avg: '$totalTonnage' },
                        avgValue: { $avg: '$totalProjectCost' }
                    }
                }
            ]);

            const recentCount = await Estimation.countDocuments({
                userId,
                createdAt: { $gte: thirtyDaysAgo }
            });

            return {
                ...analytics[0],
                recentEstimations: recentCount,
                generatedAt: new Date()
            };
        } catch (error) {
            throw new Error(`Failed to generate analytics: ${error.message}`);
        }
    }
}

module.exports = EstimationService;