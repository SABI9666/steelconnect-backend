// Enhanced AI Analyzer with Better Prompt Engineering
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4096;
        this.model = "claude-3-5-sonnet-20241022";
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            
            const analysisResults = {
                projectId,
                confidence: structuredData.confidence || 0,
                drawingAnalysis: await this._analyzeDrawingStructure(structuredData),
                quantityTakeoff: await this._performIntelligentQuantityTakeoff(structuredData),
                specifications: await this._extractDetailedSpecifications(structuredData),
                scopeIdentification: await this._identifyProjectScope(structuredData),
                riskAssessment: await this._assessProjectRisks(structuredData),
                assumptions: await this._generateIntelligentAssumptions(structuredData)
            };

            return analysisResults;

        } catch (error) {
            console.error(`Enhanced AI analysis error: ${error.message}`);
            throw error;
        }
    }

    async _analyzeDrawingStructure(data) {
        const prompt = `
You are an expert structural engineer analyzing construction drawings. I will provide you with STRUCTURED DATA extracted from PDF drawings.

STRUCTURED DRAWING DATA:
Project Info: ${JSON.stringify(data.project_info, null, 2)}
Steel Schedules: ${JSON.stringify(data.steel_schedules, null, 2)}
Concrete Elements: ${JSON.stringify(data.concrete_elements, null, 2)}
Dimensions Found: ${JSON.stringify(data.dimensions_found, null, 2)}
Processing Confidence: ${(data.confidence * 100).toFixed(0)}%

Analyze this data and provide a JSON response with the following structure:
{
    "project_info": {
        "project_name": "extracted or inferred name",
        "drawing_number": "number if found",
        "revision": "revision if found", 
        "drawing_type": "structural framing/foundation plan/etc"
    },
    "structural_systems": {
        "foundation_type": "analyze from concrete elements",
        "structural_system": "steel frame/concrete frame/hybrid",
        "floor_systems": ["list based on schedules"],
        "roof_system": "analyze from member types"
    },
    "steel_analysis": {
        "total_members_identified": 0,
        "member_types": ["list of sections found"],
        "max_member_size": "largest section",
        "total_estimated_weight": 0
    },
    "concrete_analysis": {
        "grades_identified": ["list of grades"],
        "element_types_inferred": ["slab/beam/column/footing"],
        "estimated_volumes": 0
    }
}

IMPORTANT: Return only valid JSON. Calculate actual quantities from the schedules provided.`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            return this._parseJsonResponse(response.content[0].text, this._generateFallbackAnalysis(data));

        } catch (error) {
            console.error(`Drawing structure analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(data);
        }
    }

    async _performIntelligentQuantityTakeoff(data) {
        const prompt = `
As an expert quantity surveyor, calculate detailed quantities from this structural data:

STEEL SCHEDULES: ${JSON.stringify(data.steel_schedules, null, 2)}
CONCRETE ELEMENTS: ${JSON.stringify(data.concrete_elements, null, 2)}
DIMENSIONS: ${JSON.stringify(data.dimensions_found, null, 2)}

Calculate quantities in this exact JSON format:
{
    "steel_quantities": {
        "members": [
            {
                "section": "section name from schedule",
                "total_length_m": 0,
                "weight_per_m": 0,
                "total_weight_kg": 0,
                "member_type": "beam/column/brace",
                "quantity": 0
            }
        ],
        "summary": {
            "total_steel_weight_tonnes": 0,
            "beam_weight_tonnes": 0,
            "column_weight_tonnes": 0,
            "member_count": 0
        }
    },
    "concrete_quantities": {
        "elements": [
            {
                "element_type": "slab/beam/column/footing",
                "grade": "concrete grade",
                "volume_m3": 0,
                "area_m2": 0,
                "linear_m": 0,
                "estimated": true
            }
        ],
        "summary": {
            "total_concrete_m3": 0,
            "n32_concrete_m3": 0,
            "n40_concrete_m3": 0,
            "slab_area_m2": 0
        }
    },
    "reinforcement_quantities": {
        "deformed_bars": {
            "n12_kg": 0,
            "n16_kg": 0,
            "n20_kg": 0,
            "n24_kg": 0
        },
        "mesh": {
            "sl72_m2": 0,
            "sl82_m2": 0
        }
    },
    "miscellaneous": {
        "anchors": {
            "m12_mechanical": 0,
            "m16_mechanical": 0,
            "m20_mechanical": 0
        }
    }
}

Use standard steel section weights (e.g., 200UB25 = 25.4 kg/m). Calculate totals by multiplying length × quantity × weight_per_m.`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const quantities = this._parseJsonResponse(response.content[0].text, this._calculateFallbackQuantities(data));
            return this._validateAndCleanQuantities(quantities);

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return this._calculateFallbackQuantities(data);
        }
    }

    async _extractDetailedSpecifications(data) {
        const prompt = `
Extract material specifications from this data:

CONCRETE: ${JSON.stringify(data.concrete_elements, null, 2)}
STEEL: ${JSON.stringify(data.steel_schedules, null, 2)}

Return JSON format:
{
    "concrete_specifications": {
        "grades_found": ["N32", "N40"],
        "typical_applications": {
            "N32": "slabs, beams, footings",
            "N40": "columns, high-stress elements"
        }
    },
    "steel_specifications": {
        "sections_used": ["200UB25", "150x150x8SHS"],
        "steel_grade": "300 grade typical"
    },
    "standards_applicable": [
        "AS 3600 - Concrete Structures",
        "AS 4100 - Steel Structures"
    ]
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 2000,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            return this._parseJsonResponse(response.content[0].text, {
                concrete_specifications: { grades_found: [], typical_applications: {} },
                steel_specifications: { sections_used: [], steel_grade: "300 grade" },
                standards_applicable: ["AS 3600", "AS 4100"]
            });

        } catch (error) {
            console.error(`Specification extraction error: ${error.message}`);
            return { error: error.message };
        }
    }

    async _identifyProjectScope(data) {
        const memberCount = this._calculateMemberCount(data);
        const hasMultipleGrades = (data.concrete_elements?.length || 0) > 1;
        
        let complexity = 'low';
        if (memberCount > 50 || hasMultipleGrades) complexity = 'medium';
        if (memberCount > 100) complexity = 'high';

        return {
            work_packages: [
                {
                    package_name: "Steel Structure",
                    description: `${memberCount} steel members identified`,
                    complexity: complexity,
                    estimated_duration_days: Math.max(10, Math.ceil(memberCount / 10))
                },
                {
                    package_name: "Concrete Works",
                    description: `${data.concrete_elements?.length || 0} concrete elements`,
                    complexity: hasMultipleGrades ? 'medium' : 'low',
                    estimated_duration_days: 15
                }
            ],
            project_complexity: complexity,
            member_count_basis: memberCount,
            data_confidence: data.confidence || 0
        };
    }

    async _assessProjectRisks(data) {
        const risks = [];
        
        if (data.confidence < 0.7) {
            risks.push({
                risk: "Low drawing data extraction confidence",
                probability: "high",
                impact: "cost variance 10-20%",
                mitigation: "Manual review recommended"
            });
        }

        const memberCount = this._calculateMemberCount(data);
        if (memberCount > 100) {
            risks.push({
                risk: "Complex steel structure",
                probability: "medium", 
                impact: "potential delays",
                mitigation: "Early fabricator engagement"
            });
        }

        return {
            technical_risks: risks,
            data_quality_risks: [{
                extraction_confidence: data.confidence || 0,
                recommendation: data.confidence < 0.8 ? "manual_verification_required" : "acceptable"
            }],
            cost_factors: {
                complexity_multiplier: memberCount > 50 ? 1.1 : 1.0,
                data_confidence_factor: Math.max(0.9, data.confidence || 0.5)
            }
        };
    }

    async _generateIntelligentAssumptions(data) {
        const assumptions = [
            "Steel sections conform to AS/NZS standards",
            "Standard connection details unless noted",
            "Site access available for delivery and crane operations"
        ];

        if (data.confidence < 0.8) {
            assumptions.push("Quantities estimated due to limited data extraction");
        }

        const memberCount = this._calculateMemberCount(data);
        if (memberCount > 0) {
            assumptions.push(`Approximately ${memberCount} steel members as per schedules`);
        }

        return assumptions;
    }

    // Helper methods
    _parseJsonResponse(text, fallback) {
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error(`JSON parsing error: ${error.message}`);
        }
        return fallback;
    }

    _calculateMemberCount(data) {
        if (!data.steel_schedules || !Array.isArray(data.steel_schedules)) {
            return 0;
        }
        return data.steel_schedules.reduce((sum, schedule) => {
            if (!schedule.items || !Array.isArray(schedule.items)) return sum;
            return sum + schedule.items.length;
        }, 0);
    }

    _generateFallbackAnalysis(data) {
        return {
            project_info: {
                drawing_number: data.project_info?.drawing_number || 'unknown',
                drawing_type: "structural"
            },
            structural_systems: {
                structural_system: "mixed",
                foundation_type: "reinforced concrete"
            },
            steel_analysis: {
                total_members_identified: this._calculateMemberCount(data),
                member_types: [],
                total_estimated_weight: 0
            },
            concrete_analysis: {
                grades_identified: ["N32"],
                element_types_inferred: ["slab", "beam"],
                estimated_volumes: 0
            }
        };
    }

    _calculateFallbackQuantities(data) {
        const fallback = {
            steel_quantities: {
                members: [],
                summary: { total_steel_weight_tonnes: 0, member_count: 0 }
            },
            concrete_quantities: {
                elements: [],
                summary: { total_concrete_m3: 0 }
            },
            reinforcement_quantities: {
                deformed_bars: { n12_kg: 0, n16_kg: 0, n20_kg: 0, n24_kg: 0 },
                mesh: { sl72_m2: 0, sl82_m2: 0 }
            },
            miscellaneous: {
                anchors: { m12_mechanical: 0, m16_mechanical: 0, m20_mechanical: 0 }
            }
        };

        // Calculate basic quantities from available data
        if (data.steel_schedules && Array.isArray(data.steel_schedules)) {
            let totalWeight = 0;
            let memberCount = 0;

            for (const schedule of data.steel_schedules) {
                if (!schedule.items || !Array.isArray(schedule.items)) continue;

                for (const item of schedule.items) {
                    const length = parseFloat(item.length) || 6;
                    const quantity = parseInt(item.quantity) || 1;
                    const weightPerM = this._estimateWeightPerMeter(item.section);
                    const weight = (length * quantity * weightPerM) / 1000;

                    fallback.steel_quantities.members.push({
                        section: item.section || 'unknown',
                        total_length_m: length * quantity,
                        weight_per_m: weightPerM,
                        total_weight_kg: weight * 1000,
                        member_type: this._classifyMember(item.section),
                        quantity: quantity
                    });

                    totalWeight += weight;
                    memberCount += quantity;
                }
            }

            fallback.steel_quantities.summary = {
                total_steel_weight_tonnes: parseFloat(totalWeight.toFixed(2)),
                beam_weight_tonnes: parseFloat((totalWeight * 0.6).toFixed(2)),
                column_weight_tonnes: parseFloat((totalWeight * 0.4).toFixed(2)),
                member_count: memberCount
            };
        }

        return fallback;
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

    _classifyMember(section) {
        if (!section) return 'beam';
        const sectionLower = section.toLowerCase();
        if (sectionLower.includes('ub')) return 'beam';
        if (sectionLower.includes('uc') || sectionLower.includes('shs')) return 'column';
        if (sectionLower.includes('pfc')) return 'beam';
        return 'beam';
    }

    _validateAndCleanQuantities(quantities) {
        if (!quantities || typeof quantities !== 'object') {
            return this._calculateFallbackQuantities({});
        }

        // Ensure steel quantities structure
        if (!quantities.steel_quantities) {
            quantities.steel_quantities = { members: [], summary: {} };
        }
        if (!quantities.steel_quantities.summary) {
            quantities.steel_quantities.summary = {};
        }

        const steelSummary = quantities.steel_quantities.summary;
        steelSummary.total_steel_weight_tonnes = Math.max(0, parseFloat(steelSummary.total_steel_weight_tonnes) || 0);
        steelSummary.member_count = Math.max(0, parseInt(steelSummary.member_count) || 0);

        // Ensure concrete quantities structure
        if (!quantities.concrete_quantities) {
            quantities.concrete_quantities = { elements: [], summary: {} };
        }
        if (!quantities.concrete_quantities.summary) {
            quantities.concrete_quantities.summary = {};
        }

        const concreteSummary = quantities.concrete_quantities.summary;
        concreteSummary.total_concrete_m3 = Math.max(0, parseFloat(concreteSummary.total_concrete_m3) || 0);

        // Ensure reinforcement structure
        if (!quantities.reinforcement_quantities) {
            quantities.reinforcement_quantities = {
                deformed_bars: { n12_kg: 0, n16_kg: 0, n20_kg: 0, n24_kg: 0 },
                mesh: { sl72_m2: 0, sl82_m2: 0 }
            };
        }

        // Ensure miscellaneous structure
        if (!quantities.miscellaneous) {
            quantities.miscellaneous = {
                anchors: { m12_mechanical: 0, m16_mechanical: 0, m20_mechanical: 0 }
            };
        }

        return quantities;
    }
}