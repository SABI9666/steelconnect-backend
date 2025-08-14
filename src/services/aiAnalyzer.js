// Enhanced AI Analyzer with Better Prompt Engineering
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4096;
        this.model = "claude-3-5-sonnet-20240620";
    }

    // --- This helper function creates a concise summary to reduce token usage ---
    _createSummaryForAI(data) {
        if (!data || !data.steel_schedules) {
            return "No structural data provided.";
        }
        const memberSummary = data.steel_schedules.map(item => `${item.designation || 'Unknown Section'}`).join(', ');
        const concreteSummary = data.concrete_elements ? `Concrete elements found: ${data.concrete_elements.length}` : '';
        
        return `
        Steel Members Identified: ${memberSummary}.
        ${concreteSummary}
        Dimensions Found: ${data.dimensions_found?.length || 0}.
        Initial Data Extraction Confidence: ${(data.confidence * 100).toFixed(0)}%.
        `;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            
            const summary = this._createSummaryForAI(structuredData);

            const analysisResults = {
                projectId,
                confidence: structuredData.confidence || 0,
                quantityTakeoff: await this._performIntelligentQuantityTakeoff(summary, structuredData),
                specifications: await this._extractDetailedSpecifications(summary),
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

    async _performIntelligentQuantityTakeoff(summary, originalData) {
        const prompt = `
As an expert quantity surveyor, calculate detailed quantities from this structural data summary:

SUMMARY:
${summary}

Based on the summary, provide a detailed quantity takeoff. Use standard Australian steel section weights (e.g., 200UB25.4 = 25.4 kg/m). Calculate totals by multiplying length × quantity × weight_per_m. If length or quantity isn't given, make a reasonable assumption (e.g., 6m length, quantity of 1).

Return ONLY valid JSON in this exact format (no additional text):
{
    "steel_quantities": {
        "members": [
            {
                "section": "section name from schedule",
                "total_length_m": 0,
                "weight_per_m": 0,
                "total_weight_kg": 0,
                "member_type": "beam",
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
        "summary": {
            "total_concrete_m3": 0
        }
    }
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const quantities = this._parseJsonResponse(response.content[0].text, this._calculateFallbackQuantities(originalData));
            return this._validateAndCleanQuantities(quantities);

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return this._calculateFallbackQuantities(originalData);
        }
    }

    async _extractDetailedSpecifications(summary) {
        const prompt = `
From the following summary of steel and concrete members, extract the likely material specifications and applicable Australian standards.

SUMMARY:
${summary}

Return ONLY valid JSON in this exact format (no additional text):
{
    "concrete_specifications": {
        "grades_found": ["N32", "N40"],
        "typical_applications": {
            "N32": "slabs, beams, footings",
            "N40": "columns, high-stress elements"
        }
    },
    "steel_specifications": {
        "sections_used": [],
        "steel_grade": "300PLUS grade typical for structural sections"
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
                steel_specifications: { sections_used: [], steel_grade: "300PLUS grade" },
                standards_applicable: ["AS 3600", "AS 4100"]
            });

        } catch (error) {
            console.error(`Specification extraction error: ${error.message}`);
            return {
                concrete_specifications: { grades_found: [], typical_applications: {} },
                steel_specifications: { sections_used: [], steel_grade: "300PLUS grade" },
                standards_applicable: ["AS 3600", "AS 4100"]
            };
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

    // --- FIXED: Improved JSON parsing with better error handling ---
    _parseJsonResponse(text, fallback) {
        if (!text || typeof text !== 'string') {
            console.warn('Invalid text input for JSON parsing');
            return fallback;
        }

        try {
            // Remove any markdown formatting
            let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            
            // Find the JSON object bounds more carefully
            const openBrace = cleanText.indexOf('{');
            const closeBrace = cleanText.lastIndexOf('}');
            
            if (openBrace === -1 || closeBrace === -1 || openBrace >= closeBrace) {
                console.warn('No valid JSON structure found in response');
                return fallback;
            }
            
            let jsonString = cleanText.substring(openBrace, closeBrace + 1);
            
            // Clean up common JSON formatting issues
            jsonString = jsonString
                .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas
                .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')  // Quote unquoted keys
                .replace(/:\s*([^",{\[\s][^,}\]]*[^",}\]\s])\s*([,}\]])/g, ':"$1"$2')  // Quote unquoted string values
                .replace(/"\s*(\d+\.?\d*)\s*"/g, '$1');  // Unquote numbers
                
            // Try to parse the cleaned JSON
            const parsed = JSON.parse(jsonString);
            
            // Basic validation that it's an object
            if (typeof parsed !== 'object' || parsed === null) {
                console.warn('Parsed JSON is not a valid object');
                return fallback;
            }
            
            return parsed;
            
        } catch (error) {
            console.error(`JSON parsing error: ${error.message}`);
            console.error('Raw text:', text.substring(0, 500)); // Log first 500 chars for debugging
            return fallback;
        }
    }

    _calculateMemberCount(data) {
        if (!data || !data.steel_schedules || !Array.isArray(data.steel_schedules)) {
            return 0;
        }
        return data.steel_schedules.length;
    }
    
    _calculateFallbackQuantities(data) {
        const fallback = {
            steel_quantities: {
                members: [],
                summary: { 
                    total_steel_weight_tonnes: 0, 
                    beam_weight_tonnes: 0,
                    column_weight_tonnes: 0,
                    member_count: 0 
                }
            },
            concrete_quantities: {
                summary: { total_concrete_m3: 0 }
            }
        };

        if (data && data.steel_schedules && Array.isArray(data.steel_schedules)) {
            let totalWeight = 0;
            let beamWeight = 0;
            let columnWeight = 0;
            let memberCount = 0;

            for (const item of data.steel_schedules) {
                const length = parseFloat(item.length) || 6;
                const quantity = parseInt(item.quantity) || 1;
                const weightPerM = this._estimateWeightPerMeter(item.designation);
                const weight = (length * quantity * weightPerM) / 1000; // Convert to tonnes
                const memberType = this._classifyMember(item.designation);

                fallback.steel_quantities.members.push({
                    section: item.designation || 'unknown',
                    total_length_m: length * quantity,
                    weight_per_m: weightPerM,
                    total_weight_kg: weight * 1000,
                    member_type: memberType,
                    quantity: quantity
                });

                totalWeight += weight;
                if (memberType === 'beam') {
                    beamWeight += weight;
                } else if (memberType === 'column') {
                    columnWeight += weight;
                }
                memberCount += quantity;
            }

            fallback.steel_quantities.summary = {
                total_steel_weight_tonnes: parseFloat(totalWeight.toFixed(2)),
                beam_weight_tonnes: parseFloat(beamWeight.toFixed(2)),
                column_weight_tonnes: parseFloat(columnWeight.toFixed(2)),
                member_count: memberCount
            };
        }

        return fallback;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20;
        
        const sectionLower = section.toLowerCase().replace(/\s/g, '');
        
        // More comprehensive weight mapping
        const weightPatterns = [
            { pattern: /(\d+)ub(\d+\.?\d*)/, handler: (m) => parseFloat(m[2]) },
            { pattern: /(\d+)uc(\d+\.?\d*)/, handler: (m) => parseFloat(m[2]) },
            { pattern: /(\d+)pfc/, handler: (m) => parseInt(m[1]) * 0.12 },
            { pattern: /(\d+)x(\d+)x(\d+\.?\d*)shs/, handler: (m) => parseInt(m[1]) * parseInt(m[2]) * parseFloat(m[3]) / 100 },
            { pattern: /(\d+)x(\d+)x(\d+\.?\d*)rhs/, handler: (m) => parseInt(m[1]) * parseInt(m[2]) * parseFloat(m[3]) / 120 },
            { pattern: /z(\d+)(\d+)/, handler: (m) => parseInt(m[1]) * 0.15 },
            { pattern: /c(\d+)(\d+)/, handler: (m) => parseInt(m[1]) * 0.12 }
        ];
        
        for (const { pattern, handler } of weightPatterns) {
            const match = sectionLower.match(pattern);
            if (match) {
                const weight = handler(match);
                return Math.max(5, weight); // Minimum 5 kg/m
            }
        }
        
        // Fallback based on first number found
        const numberMatch = section.match(/(\d+)/);
        if (numberMatch) {
            const size = parseInt(numberMatch[1]);
            return Math.max(10, size * 0.15);
        }
        
        return 20; // Default fallback
    }

    _classifyMember(section) {
        if (!section) return 'beam';
        const sectionLower = section.toLowerCase();
        if (sectionLower.includes('ub')) return 'beam';
        if (sectionLower.includes('uc') || sectionLower.includes('shs')) return 'column';
        if (sectionLower.includes('pfc')) return 'beam';
        if (sectionLower.includes('rhs')) return 'beam';
        if (sectionLower.includes('z') || sectionLower.includes('c')) return 'purlin';
        return 'beam';
    }

    _validateAndCleanQuantities(quantities) {
        if (!quantities || typeof quantities !== 'object') {
            return this._calculateFallbackQuantities({});
        }

        // Ensure steel_quantities structure
        if (!quantities.steel_quantities) {
            quantities.steel_quantities = { members: [], summary: {} };
        }
        if (!quantities.steel_quantities.summary) {
            quantities.steel_quantities.summary = {};
        }
        if (!Array.isArray(quantities.steel_quantities.members)) {
            quantities.steel_quantities.members = [];
        }

        const steelSummary = quantities.steel_quantities.summary;
        steelSummary.total_steel_weight_tonnes = Math.max(0, parseFloat(steelSummary.total_steel_weight_tonnes) || 0);
        steelSummary.beam_weight_tonnes = Math.max(0, parseFloat(steelSummary.beam_weight_tonnes) || 0);
        steelSummary.column_weight_tonnes = Math.max(0, parseFloat(steelSummary.column_weight_tonnes) || 0);
        steelSummary.member_count = Math.max(0, parseInt(steelSummary.member_count) || 0);

        // Ensure concrete_quantities structure
        if (!quantities.concrete_quantities) {
            quantities.concrete_quantities = { summary: {} };
        }
        if (!quantities.concrete_quantities.summary) {
            quantities.concrete_quantities.summary = {};
        }

        const concreteSummary = quantities.concrete_quantities.summary;
        concreteSummary.total_concrete_m3 = Math.max(0, parseFloat(concreteSummary.total_concrete_m3) || 0);

        return quantities;
    }
}
