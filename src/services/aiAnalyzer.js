// Enhanced AI Analyzer with Better Prompt Engineering
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4096;
        this.model = "claude-3-5-sonnet-20241022"; // Updated model
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
You are an expert structural engineer analyzing construction drawings. I will provide you with STRUCTURED DATA extracted from PDF drawings, not just raw text.

STRUCTURED DRAWING DATA:
Project Info: ${JSON.stringify(data.project_info, null, 2)}
Steel Schedules: ${JSON.stringify(data.steel_schedules, null, 2)}
Concrete Elements: ${JSON.stringify(data.concrete_elements, null, 2)}
Dimensions Found: ${JSON.stringify(data.dimensions_found, null, 2)}
Processing Confidence: ${data.confidence * 100}%

KEY CONTEXT:
- This is STRUCTURED data, not raw text
- Steel schedules contain parsed member information
- Concrete elements have identified grades and specifications
- Dimensions are already extracted and parsed

Please analyze this structured data and provide a detailed JSON response:

{
    "project_info": {
        "project_name": "extracted or inferred name",
        "drawing_number": "${data.project_info?.drawing_number || 'not found'}",
        "revision": "${data.project_info?.revision || 'not found'}",
        "drawing_type": "structural framing/foundation plan/etc"
    },
    "structural_systems": {
        "foundation_type": "analyze from concrete elements and context",
        "structural_system": "steel frame/concrete frame/hybrid",
        "floor_systems": ["based on schedules and dimensions"],
        "roof_system": "analyze from member types and schedules"
    },
    "steel_analysis": {
        "total_members_identified": ${data.steel_schedules?.reduce((sum, sched) => sum + sched.items.length, 0) || 0},
        "member_types": [/* extract from steel_schedules */],
        "max_member_size": "largest section found",
        "total_estimated_weight": "calculate from schedules if possible"
    },
    "concrete_analysis": {
        "grades_identified": [/* from concrete_elements */],
        "element_types_inferred": [/* slab/beam/column/footing based on context */],
        "estimated_volumes": "calculate where possible from dimensions"
    }
}

IMPORTANT: 
- Use the STRUCTURED data, don't just repeat raw text
- Calculate actual quantities where member schedules provide length × quantity
- Infer element types from context and standard practice
- Provide realistic estimates based on the parsed information
`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const analysisText = response.content[0].text;
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return { 
                    error: "Could not parse structured analysis",
                    raw_analysis: analysisText,
                    input_confidence: data.confidence
                };
            }

        } catch (error) {
            console.error(`Drawing structure analysis error: ${error.message}`);
            return {
                error: error.message,
                fallback_analysis: this._generateFallbackAnalysis(data)
            };
        }
    }

    async _performIntelligentQuantityTakeoff(data) {
        const prompt = `
Perform QUANTITY TAKEOFF as an expert quantity surveyor using this STRUCTURED data:

STEEL SCHEDULE DATA:
${JSON.stringify(data.steel_schedules, null, 2)}

CONCRETE ELEMENTS:
${JSON.stringify(data.concrete_elements, null, 2)}

DIMENSIONS DATA:
${JSON.stringify(data.dimensions_found, null, 2)}

Calculate detailed quantities in JSON format:

{
    "steel_quantities": {
        "members": [
            /* For each item in steel schedules, calculate: */
            {
                "section": "from schedule data",
                "total_length_m": "length × quantity from schedule",
                "weight_per_m": "standard weight from steel tables",
                "total_weight_kg": "calculated total weight",
                "member_type": "beam/column/brace inferred from section",
                "quantity": "number of pieces"
            }
        ],
        "summary": {
            "total_steel_weight_tonnes": "sum all weights / 1000",
            "beam_weight_tonnes": "beams only",
            "column_weight_tonnes": "columns only",
            "member_count": "total pieces"
        }
    },
    "concrete_quantities": {
        "elements": [
            /* Estimate from dimensions and concrete elements */
            {
                "element_type": "slab/beam/column/footing - infer from context",
                "grade": "from concrete_elements data",
                "volume_m3": "calculate from dimensions where possible",
                "area_m2": "for slabs",
                "linear_m": "for beams",
                "estimated": true/false
            }
        ],
        "summary": {
            "total_concrete_m3": "sum all volumes",
            "n32_concrete_m3": "by grade",
            "n40_concrete_m3": "by grade",
            "slab_area_m2": "total slab area"
        }
    },
    "calculation_notes": [
        "Steel weights calculated using standard AS/NZS sections",
        "Concrete volumes estimated from available dimensions",
        "Missing data estimated using typical structural proportions"
    ]
}

CALCULATION RULES:
1. For steel: Use standard weight tables (e.g., 200UB25 = 25.4 kg/m)
2. Calculate total weight = length × quantity × weight_per_m
3. For concrete: Use dimensions to calculate volumes where possible
4. Estimate missing values using engineering judgment
5. Separate quantities by material grade/type
`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const analysisText = response.content[0].text;
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const quantities = JSON.parse(jsonMatch[0]);
                // Add validation and cleanup
                return this._validateAndCleanQuantities(quantities);
            } else {
                return {
                    error: "Could not parse quantities",
                    fallback_quantities: this._calculateFallbackQuantities(data)
                };
            }

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return {
                error: error.message,
                fallback_quantities: this._calculateFallbackQuantities(data)
            };
        }
    }

    async _extractDetailedSpecifications(data) {
        const prompt = `
Extract detailed material specifications from this structural data:

CONCRETE ELEMENTS: ${JSON.stringify(data.concrete_elements, null, 2)}
STEEL SCHEDULES: ${JSON.stringify(data.steel_schedules, null, 2)}

Return specifications in JSON format:

{
    "concrete_specifications": {
        "grades_found": [/* extract from concrete_elements */],
        "typical_applications": {
            "N32": "footings, slabs, beams",
            "N40": "columns, high-stress elements"
        },
        "cover_requirements": {
            "internal_elements": "30mm typical",
            "external_elements": "40mm typical",
            "footings": "75mm minimum"
        }
    },
    "steel_specifications": {
        "sections_used": [/* extract unique sections from schedules */],
        "steel_grade": "300 grade typical",
        "connection_requirements": "bolted/welded as per AS4100",
        "surface_treatment": "galvanized for external elements"
    },
    "standards_applicable": [
        "AS 3600 - Concrete Structures",
        "AS 4100 - Steel Structures",
        "AS/NZS 4671 - Steel reinforcing materials"
    ]
}
`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 2000,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const analysisText = response.content[0].text;
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { 
                raw_specifications: analysisText 
            };

        } catch (error) {
            console.error(`Specification extraction error: ${error.message}`);
            return { error: error.message };
        }
    }

    async _identifyProjectScope(data) {
        const memberCount = data.steel_schedules?.reduce((sum, sched) => sum + sched.items.length, 0) || 0;
        const hasMultipleGrades = (data.concrete_elements?.length || 0) > 1;
        
        // Determine complexity based on actual data
        let complexity = 'low';
        if (memberCount > 50 || hasMultipleGrades) complexity = 'medium';
        if (memberCount > 100) complexity = 'high';

        return {
            work_packages: [
                {
                    package_name: "Steel Structure",
                    description: `${memberCount} steel members identified from schedules`,
                    complexity: complexity,
                    estimated_duration_days: Math.max(10, Math.ceil(memberCount / 10))
                },
                {
                    package_name: "Concrete Works",
                    description: `${data.concrete_elements?.length || 0} concrete elements with various grades`,
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
        
        // Risk assessment based on actual extracted data
        if (data.confidence < 0.7) {
            risks.push({
                risk: "Low drawing data extraction confidence",
                probability: "high",
                impact: "cost variance 10-20%",
                mitigation: "Manual review of drawings recommended"
            });
        }

        const memberCount = data.steel_schedules?.reduce((sum, sched) => sum + sched.items.length, 0) || 0;
        if (memberCount > 100) {
            risks.push({
                risk: "Complex steel structure with many members",
                probability: "medium",
                impact: "potential fabrication delays",
                mitigation: "Early engagement with fabricator"
            });
        }

        return {
            technical_risks: risks,
            data_quality_risks: [
                {
                    extraction_confidence: data.confidence || 0,
                    recommendation: data.confidence < 0.8 ? "manual_verification_required" : "data_quality_acceptable"
                }
            ],
            cost_factors: {
                complexity_multiplier: memberCount > 50 ? 1.1 : 1.0,
                data_confidence_factor: Math.max(0.9, data.confidence || 0.5)
            }
        };
    }

    async _generateIntelligentAssumptions(data) {
        const baseAssumptions = [
            "Steel sections conform to AS/NZS standards",
            "Standard connection details unless noted otherwise",
            "Site access available for delivery and crane operations"
        ];

        // Add data-specific assumptions
        if (data.confidence < 0.8) {
            baseAssumptions.push("Quantities estimated due to limited drawing data extraction");
        }

        const memberCount = data.steel_schedules?.reduce((sum, sched) => sum + sched.items.length, 0) || 0;
        if (memberCount > 0) {
            baseAssumptions.push(`Steel structure with approximately ${memberCount} members as per schedules`);
        }

        return baseAssumptions;
    }

    // Helper methods
    _generateFallbackAnalysis(data) {
        return {
            drawing_type: "structural",
            confidence_note: `Low extraction confidence: ${(data.confidence * 100).toFixed(0)}%`,
            schedules_found: data.steel_schedules?.length || 0,
            concrete_elements_found: data.concrete_elements?.length || 0
        };
    }

    _calculateFallbackQuantities(data) {
        const fallback = {
            steel_quantities: { summary: { total_steel_weight_tonnes: 0 } },
            concrete_quantities: { summary: { total_concrete_m3: 0 } }
        };

        // Basic calculation from available schedule data
        if (data.steel_schedules) {
            let totalWeight = 0;
            for (const schedule of data.steel_schedules) {
                for (const item of schedule.items) {
                    // Estimate weight using basic steel section weights
                    const length = item.length || 6; // Default 6m if not specified
                    const quantity = item.quantity || 1;
                    const weightPerM = this._estimateWeightPerMeter(item.section);
                    totalWeight += (length * quantity * weightPerM) / 1000; // Convert to tonnes
                }
            }
            fallback.steel_quantities.summary.total_steel_weight_tonnes = totalWeight;
        }

        return fallback;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20; // Default weight
        
        const sectionLower = section.toLowerCase();
        
        // Basic weight estimation table
        const weightTable = {
            '150ub14': 14.0, '200ub18': 18.2, '200ub25': 25.4,
            '250ub26': 25.7, '250ub31': 31.4, '310ub32': 32.0,
            '100shs': 14.9, '125shs': 18.9, '150shs': 35.4,
            '100pfc': 10.4, '150pfc': 17.0, '200pfc': 23.4
        };
        
        // Try to match section
        for (const [key, weight] of Object.entries(weightTable)) {
            if (sectionLower.includes(key.replace('ub', '').replace('shs', '').replace('pfc', ''))) {
                return weight;
            }
        }
        
        // Extract number for basic estimation
        const numberMatch = section.match(/(\d+)/);
        if (numberMatch) {
            const size = parseInt(numberMatch[1]);
            if (size < 150) return size * 0.1;
            if (size < 300) return size * 0.15;
            return size * 0.2;
        }
        
        return 20; // Default fallback
    }

    _validateAndCleanQuantities(quantities) {
        // Ensure all numbers are valid
        if (quantities.steel_quantities?.summary) {
            const summary = quantities.steel_quantities.summary;
            summary.total_steel_weight_tonnes = Math.max(0, parseFloat(summary.total_steel_weight_tonnes) || 0);
            summary.member_count = Math.max(0, parseInt(summary.member_count) || 0);
        }
        
        if (quantities.concrete_quantities?.summary) {
            const summary = quantities.concrete_quantities.summary;
            summary.total_concrete_m3 = Math.max(0, parseFloat(summary.total_concrete_m3) || 0);
            summary.slab_area_m2 = Math.max(0, parseFloat(summary.slab_area_m2) || 0);
        }
        
        return quantities;
    }
}
