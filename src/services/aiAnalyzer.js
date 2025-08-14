// Enhanced AI Analyzer with Robust JSON Parsing and Error Handling
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 3000;
        this.model = "claude-3-5-sonnet-20241022";
    }

    // Creates a concise summary to reduce token usage
    _createSummaryForAI(data) {
        if (!data || !data.steel_schedules) {
            return "No structural data provided.";
        }
        
        const memberSummary = data.steel_schedules
            .slice(0, 20) // Limit to first 20 members to reduce token usage
            .map(item => item.designation || 'Unknown Section')
            .join(', ');
        
        const concreteSummary = data.concrete_elements ? `Concrete elements: ${data.concrete_elements.length}` : '';
        
        return `Steel Members: ${memberSummary}${data.steel_schedules.length > 20 ? ` and ${data.steel_schedules.length - 20} more` : ''}. ${concreteSummary} Confidence: ${(data.confidence * 100).toFixed(0)}%.`;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            
            const summary = this._createSummaryForAI(structuredData);

            const quantityTakeoff = await this._performIntelligentQuantityTakeoff(summary, structuredData);

            const analysisResults = {
                projectId,
                confidence: structuredData.confidence || 0,
                quantityTakeoff,
                specifications: await this._extractDetailedSpecifications(summary),
                scopeIdentification: this._identifyProjectScope(structuredData),
                riskAssessment: this._assessProjectRisks(structuredData),
                assumptions: this._generateIntelligentAssumptions(structuredData)
            };
            
            if (!analysisResults.quantityTakeoff || !analysisResults.quantityTakeoff.steel_quantities.members.length) {
                console.warn('AI analysis resulted in empty quantities, using final fallback.');
                analysisResults.quantityTakeoff = this._calculateFallbackQuantities(structuredData);
            }

            return analysisResults;

        } catch (error) {
            console.error(`Enhanced AI analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    async _performIntelligentQuantityTakeoff(summary, originalData) {
        const prompt = `Analyze this structural data and return quantities as JSON.

DATA: ${summary}

Rules:
1. Use standard Australian steel weights (e.g., 250UB31.4 = 31.4 kg/m)
2. Assume 6m length if not specified
3. Return ONLY valid JSON with no extra text

{
  "steel_quantities": {
    "members": [
      {
        "section": "250 UB 31.4",
        "total_length_m": 6,
        "weight_per_m": 31.4,
        "total_weight_kg": 188.4,
        "member_type": "beam",
        "quantity": 1
      }
    ],
    "summary": {
      "total_steel_weight_tonnes": 0.188,
      "beam_weight_tonnes": 0.188,
      "column_weight_tonnes": 0,
      "member_count": 1
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
                temperature: 0.1,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const responseText = response.content[0]?.text || '';
            console.log('AI Response received, length:', responseText.length);

            const quantities = this._parseJsonResponse(responseText, () => this._calculateFallbackQuantities(originalData));

            // --- Enhanced Validation Logic ---
            // Get the member count from the AI's response and from the original PDF extraction.
            const aiMemberCount = quantities.steel_quantities?.summary?.member_count || quantities.steel_quantities?.members?.length || 0;
            const originalMemberCount = originalData.steel_schedules.length;

            // If the AI result accounts for less than 75% of the members found in the PDF, it's wrong.
            if (originalMemberCount > 10 && aiMemberCount < originalMemberCount * 0.75) {
                console.log(`AI result member count (${aiMemberCount}) is significantly lower than extracted count (${originalMemberCount}). Using fallback.`);
                return this._calculateFallbackQuantities(originalData);
            }

            return this._validateAndCleanQuantities(quantities);

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            console.error('Falling back to calculated quantities...');
            return this._calculateFallbackQuantities(originalData);
        }
    }

    async _extractDetailedSpecifications(summary) {
        const prompt = `Extract material specs from: ${summary}

Return JSON only:
{
  "concrete_specifications": {
    "grades_found": ["N32"],
    "typical_applications": {"N32": "general structural"}
  },
  "steel_specifications": {
    "sections_used": [],
    "steel_grade": "300PLUS"
  },
  "standards_applicable": ["AS 3600", "AS 4100"]
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 1000,
                temperature: 0.1,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            return this._parseJsonResponse(response.content[0]?.text || '', () => this._getDefaultSpecifications());

        } catch (error) {
            console.error(`Specification extraction error: ${error.message}`);
            return this._getDefaultSpecifications();
        }
    }

    _parseJsonResponse(text, fallbackFn) {
        if (!text || typeof text !== 'string') {
            console.warn('Invalid text input for JSON parsing, using fallback.');
            return fallbackFn();
        }

        try {
            let cleanText = text
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .replace(/^[^{]*({.*})[^}]*$/s, '$1')
                .trim();

            const openBrace = cleanText.indexOf('{');
            const closeBrace = cleanText.lastIndexOf('}');
            
            if (openBrace === -1 || closeBrace === -1 || openBrace >= closeBrace) {
                console.warn('No valid JSON structure found, using fallback.');
                return fallbackFn();
            }
            
            let jsonString = cleanText.substring(openBrace, closeBrace + 1);
            
            const parsed = JSON.parse(jsonString);
            
            if (typeof parsed !== 'object' || parsed === null) {
                console.warn('Parsed JSON is not a valid object, using fallback.');
                return fallbackFn();
            }
            
            return parsed;
            
        } catch (error) {
            console.error(`JSON parsing failed: ${error.message}. Using fallback.`);
            return fallbackFn();
        }
    }

    _calculateFallbackQuantities(data) {
        console.log('Calculating fallback quantities from structured data...');
        
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
                const totalWeightKg = length * quantity * weightPerM;
                const memberType = this._classifyMember(item.designation);

                fallback.steel_quantities.members.push({
                    section: item.designation || 'Unknown',
                    total_length_m: length * quantity,
                    weight_per_m: weightPerM,
                    total_weight_kg: totalWeightKg,
                    member_type: memberType,
                    quantity: quantity
                });

                const weightTonnes = totalWeightKg / 1000;
                totalWeight += weightTonnes;
                
                if (memberType === 'beam') {
                    beamWeight += weightTonnes;
                } else if (memberType === 'column') {
                    columnWeight += weightTonnes;
                }
                memberCount += quantity;
            }

            fallback.steel_quantities.summary = {
                total_steel_weight_tonnes: parseFloat(totalWeight.toFixed(3)),
                beam_weight_tonnes: parseFloat(beamWeight.toFixed(3)),
                column_weight_tonnes: parseFloat(columnWeight.toFixed(3)),
                member_count: memberCount
            };
        }

        console.log('Fallback quantities calculated:', fallback.steel_quantities.summary);
        return fallback;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20;
        
        const sectionLower = section.toLowerCase().replace(/\s+/g, '');
        
        const weightMappings = {
            '150ub14': 14.0, '150ub18': 18.0,
            '180ub16': 16.1, '180ub18': 18.1, '180ub22': 22.2,
            '200ub18': 18.2, '200ub22': 22.3, '200ub25': 25.4, '200ub29': 29.8,
            '250ub25': 25.7, '250ub31': 31.4, '250ub37': 37.3,
            '310ub32': 32.0, '310ub40': 40.4, '310ub46': 46.2,
            '360ub44': 44.7, '360ub50': 50.7, '360ub56': 56.7,
            '410ub53': 53.7, '410ub59': 59.7, '410ub67': 67.1,
            '460ub67': 67.1, '460ub74': 74.6, '460ub82': 82.1,
            '100uc14': 14.8, '150uc23': 23.4, '150uc30': 30.0,
            '200uc46': 46.2, '200uc52': 52.0, '200uc59': 59.5,
            '250uc72': 72.4, '250uc89': 89.5,
            '310uc96': 96.8, '310uc118': 118.0, '310uc137': 137.0,
            '75pfc': 7.5, '100pfc': 10.4, '125pfc': 13.4,
            '150pfc': 17.0, '180pfc': 20.9, '200pfc': 23.4,
            '230pfc': 27.6, '250pfc': 31.1, '300pfc': 37.9,
            '380pfc': 48.2, '430pfc': 54.9,
            '50shs': 6.0, '65shs': 8.0, '75shs': 11.0,
            '89shs': 13.4, '100shs': 14.9, '125shs': 18.9,
            '150shs': 22.3, '200shs': 29.7, '250shs': 37.1,
            'z150': 15.0, 'z200': 19.0, 'z250': 24.0,
            'c150': 15.0, 'c200': 19.0, 'c250': 24.0,
            'c100': 12.0
        };
        
        for (const [key, weight] of Object.entries(weightMappings)) {
            if (sectionLower.includes(key)) {
                return weight;
            }
        }
        
        const numberMatch = section.match(/(\d+)/);
        if (numberMatch) {
            const size = parseInt(numberMatch[1]);
            return Math.max(10, Math.min(size * 0.2, 50));
        }
        
        return 20;
    }

    _classifyMember(section) {
        if (!section) return 'beam';
        const sectionLower = section.toLowerCase();
        
        if (sectionLower.includes('ub') || sectionLower.includes('pfc')) return 'beam';
        if (sectionLower.includes('uc') || sectionLower.includes('shs')) return 'column';
        if (sectionLower.includes('rhs')) return 'beam';
        if (sectionLower.includes('z') || sectionLower.includes('c')) return 'purlin';
        
        return 'beam';
    }

    _validateAndCleanQuantities(quantities) {
        if (!quantities || typeof quantities !== 'object') {
            return this._calculateFallbackQuantities({});
        }

        if (!quantities.steel_quantities) quantities.steel_quantities = {};
        if (!quantities.steel_quantities.summary) quantities.steel_quantities.summary = {};
        if (!Array.isArray(quantities.steel_quantities.members)) quantities.steel_quantities.members = [];

        const summary = quantities.steel_quantities.summary;
        summary.total_steel_weight_tonnes = Math.max(0, parseFloat(summary.total_steel_weight_tonnes) || 0);
        summary.beam_weight_tonnes = Math.max(0, parseFloat(summary.beam_weight_tonnes) || 0);
        summary.column_weight_tonnes = Math.max(0, parseFloat(summary.column_weight_tonnes) || 0);
        summary.member_count = Math.max(0, parseInt(summary.member_count) || 0);

        if (!quantities.concrete_quantities) quantities.concrete_quantities = {};
        if (!quantities.concrete_quantities.summary) quantities.concrete_quantities.summary = {};
        
        const concreteSummary = quantities.concrete_quantities.summary;
        concreteSummary.total_concrete_m3 = Math.max(0, parseFloat(concreteSummary.total_concrete_m3) || 0);

        quantities.steel_quantities.members = quantities.steel_quantities.members.map(member => ({
            section: member.section || 'Unknown',
            total_length_m: Math.max(0, parseFloat(member.total_length_m) || 6),
            weight_per_m: Math.max(0, parseFloat(member.weight_per_m) || 20),
            total_weight_kg: Math.max(0, parseFloat(member.total_weight_kg) || 120),
            member_type: member.member_type || 'beam',
            quantity: Math.max(1, parseInt(member.quantity) || 1)
        }));

        return quantities;
    }

    _identifyProjectScope(data) {
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

    _assessProjectRisks(data) {
        const risks = [];
        const memberCount = this._calculateMemberCount(data);

        if ((data.confidence || 0) < 0.7) {
            risks.push({
                risk: "Low drawing data extraction confidence",
                probability: "high",
                impact: "cost variance 10-20%",
                mitigation: "Manual review recommended"
            });
        }

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
                recommendation: (data.confidence || 0) < 0.8 ? "manual_verification_required" : "acceptable"
            }],
            cost_factors: {
                complexity_multiplier: memberCount > 50 ? 1.1 : 1.0,
                data_confidence_factor: Math.max(0.9, data.confidence || 0.5)
            }
        };
    }

    _generateIntelligentAssumptions(data) {
        const assumptions = [
            "Steel sections conform to AS/NZS standards",
            "Standard connection details unless noted",
            "Site access available for delivery and crane operations"
        ];
        const memberCount = this._calculateMemberCount(data);

        if ((data.confidence || 0) < 0.8) {
            assumptions.push("Quantities estimated due to limited data extraction");
        }

        if (memberCount > 0) {
            assumptions.push(`Approximately ${memberCount} steel members as per schedules`);
        }

        return assumptions;
    }

    _calculateMemberCount(data) {
        if (!data || !data.steel_schedules || !Array.isArray(data.steel_schedules)) {
            return 0;
        }
        return data.steel_schedules.reduce((sum, item) => sum + (parseInt(item.quantity) || 1), 0);
    }

    _getDefaultSpecifications() {
        return {
            concrete_specifications: { 
                grades_found: ['N32'], 
                typical_applications: { 'N32': 'general structural' }
            },
            steel_specifications: { 
                sections_used: [], 
                steel_grade: "300PLUS grade" 
            },
            standards_applicable: ["AS 3600", "AS 4100"]
        };
    }

    _generateFallbackAnalysis(structuredData, projectId) {
        console.log('Generating fallback analysis due to AI failure...');
        
        return {
            projectId,
            confidence: structuredData.confidence || 0.5,
            quantityTakeoff: this._calculateFallbackQuantities(structuredData),
            specifications: this._getDefaultSpecifications(),
            scopeIdentification: this._identifyProjectScope(structuredData),
            riskAssessment: this._assessProjectRisks(structuredData),
            assumptions: this._generateIntelligentAssumptions(structuredData)
        };
    }
}
