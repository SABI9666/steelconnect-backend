// Enhanced AI Analyzer with improved error handling and data processing
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000; // Increased for better responses
        this.model = "claude-3-5-sonnet-20241022";
    }

    // Improved data preparation for AI analysis
    _createStructuredSummary(data) {
        if (!data || !data.steel_schedules) {
            return "No structural data provided.";
        }
        
        // Group similar members to reduce token usage
        const memberGroups = {};
        data.steel_schedules.forEach(item => {
            const designation = item.designation || 'Unknown Section';
            if (!memberGroups[designation]) {
                memberGroups[designation] = {
                    designation,
                    totalQuantity: 0,
                    lengths: [],
                    weights: []
                };
            }
            memberGroups[designation].totalQuantity += (item.quantity || 1);
            if (item.length) memberGroups[designation].lengths.push(item.length);
            if (item.weight) memberGroups[designation].weights.push(item.weight);
        });
        
        const groupSummary = Object.values(memberGroups)
            .slice(0, 25) // Limit to prevent token overflow
            .map(group => `${group.designation} (Qty: ${group.totalQuantity})`)
            .join(', ');
        
        return `Steel Members: ${groupSummary}. Total unique sections: ${Object.keys(memberGroups).length}. Confidence: ${(data.confidence * 100).toFixed(0)}%.`;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            
            // Use fallback calculation first to ensure we have data
            const fallbackQuantities = this._calculateFallbackQuantities(structuredData);
            
            const analysisResults = {
                projectId,
                confidence: structuredData.confidence || 0.85,
                quantityTakeoff: fallbackQuantities,
                specifications: this._getDefaultSpecifications(),
                scopeIdentification: this._identifyProjectScope(structuredData),
                riskAssessment: this._assessProjectRisks(structuredData),
                assumptions: this._generateIntelligentAssumptions(structuredData)
            };

            // Try AI enhancement, but don't fail if it doesn't work
            try {
                const aiEnhancedQuantities = await this._performIntelligentQuantityTakeoff(structuredData);
                if (aiEnhancedQuantities && this._validateQuantityStructure(aiEnhancedQuantities)) {
                    // Merge AI results with fallback, preferring AI where valid
                    analysisResults.quantityTakeoff = this._mergeQuantities(fallbackQuantities, aiEnhancedQuantities);
                    console.log('✅ AI enhancement successful');
                } else {
                    console.log('⚠️ AI enhancement failed, using fallback calculations');
                }
            } catch (aiError) {
                console.log('⚠️ AI analysis failed, using calculated quantities:', aiError.message);
            }

            return analysisResults;

        } catch (error) {
            console.error(`Enhanced AI analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    async _performIntelligentQuantityTakeoff(structuredData) {
        const summary = this._createStructuredSummary(structuredData);

        const prompt = `Analyze structural steel data and return JSON quantities.

STEEL DATA: ${summary}

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "steel_quantities": {
    "members": [
      {
        "section": "250 UB 31.4",
        "total_length_m": 60,
        "weight_per_m": 31.4,
        "total_weight_kg": 1884,
        "member_type": "beam",
        "quantity": 10
      }
    ],
    "summary": {
      "total_steel_weight_tonnes": 1.884,
      "beam_weight_tonnes": 1.884,
      "column_weight_tonnes": 0,
      "member_count": 10
    }
  }
}

Rules:
- Use actual Australian steel section weights
- Group similar sections
- Calculate realistic totals
- member_type: "beam", "column", "purlin", or "brace"`;

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
            
            if (responseText.length < 50) {
                console.warn('AI response too short, likely failed');
                return null;
            }

            const quantities = this._parseJsonResponse(responseText);
            return this._validateAndCleanQuantities(quantities);

        } catch (error) {
            console.error(`AI quantity takeoff error: ${error.message}`);
            return null;
        }
    }

    _parseJsonResponse(text) {
        if (!text || typeof text !== 'string') {
            console.warn('Invalid text input for JSON parsing');
            return null;
        }

        try {
            // Clean and extract JSON more aggressively
            let cleanText = text
                .replace(/```json\s*/g, '')
                .replace(/```\s*/g, '')
                .replace(/^[^{]*({[\s\S]*})[^}]*$/s, '$1')
                .trim();

            // Find the main JSON object
            const openBrace = cleanText.indexOf('{');
            const closeBrace = cleanText.lastIndexOf('}');
            
            if (openBrace === -1 || closeBrace === -1 || openBrace >= closeBrace) {
                console.warn('No valid JSON structure found in response');
                return null;
            }
            
            let jsonString = cleanText.substring(openBrace, closeBrace + 1);
            
            // Fix common JSON issues
            jsonString = jsonString
                .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
                .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Quote keys
                .replace(/:\s*([a-zA-Z_][a-zA-Z0-9_\s]*[a-zA-Z0-9_])\s*([,}\]])/g, ':"$1"$2') // Quote string values
                .replace(/"\s*(-?\d+\.?\d*)\s*"/g, '$1'); // Unquote numbers
                
            const parsed = JSON.parse(jsonString);
            
            if (typeof parsed !== 'object' || parsed === null) {
                console.warn('Parsed result is not a valid object');
                return null;
            }
            
            return parsed;
            
        } catch (error) {
            console.error(`JSON parsing failed: ${error.message}`);
            console.log('Failed text:', text.substring(0, 500) + '...');
            return null;
        }
    }

    _validateQuantityStructure(quantities) {
        if (!quantities || typeof quantities !== 'object') return false;
        if (!quantities.steel_quantities) return false;
        if (!quantities.steel_quantities.summary) return false;
        if (!Array.isArray(quantities.steel_quantities.members)) return false;
        
        return quantities.steel_quantities.members.length > 0;
    }

    _mergeQuantities(fallback, aiResult) {
        if (!aiResult || !this._validateQuantityStructure(aiResult)) {
            return fallback;
        }

        // Use AI result if it has reasonable data
        const aiMemberCount = aiResult.steel_quantities?.summary?.member_count || 0;
        const fallbackMemberCount = fallback.steel_quantities?.summary?.member_count || 0;
        
        // If AI result has significantly fewer members, supplement with fallback
        if (aiMemberCount < fallbackMemberCount * 0.5) {
            console.log('AI result has too few members, using enhanced fallback');
            return this._enhanceFallbackWithAIInsights(fallback, aiResult);
        }

        return aiResult;
    }

    _enhanceFallbackWithAIInsights(fallback, aiResult) {
        // Use fallback structure but apply AI insights where helpful
        const enhanced = { ...fallback };
        
        // Apply AI member classifications if available
        if (aiResult?.steel_quantities?.members) {
            enhanced.steel_quantities.members.forEach((member, index) => {
                const aiMember = aiResult.steel_quantities.members.find(ai => 
                    ai.section && member.section && 
                    ai.section.toLowerCase().includes(member.section.toLowerCase().split(' ')[0])
                );
                
                if (aiMember && aiMember.member_type) {
                    member.member_type = aiMember.member_type;
                }
            });
        }

        return enhanced;
    }

    _calculateFallbackQuantities(data) {
        console.log('Calculating enhanced fallback quantities from structured data...');
        
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

        if (!data?.steel_schedules || !Array.isArray(data.steel_schedules)) {
            console.log('No steel schedules found in data');
            return fallback;
        }

        let totalWeight = 0;
        let beamWeight = 0;
        let columnWeight = 0;
        let memberCount = 0;

        // Group similar members to avoid duplication and improve accuracy
        const memberGroups = {};
        
        data.steel_schedules.forEach(item => {
            const designation = (item.designation || 'Unknown').trim();
            const length = parseFloat(item.length) || 6;
            const quantity = parseInt(item.quantity) || 1;
            
            const groupKey = `${designation}_${length}`;
            
            if (!memberGroups[groupKey]) {
                memberGroups[groupKey] = {
                    section: designation,
                    length: length,
                    quantity: 0,
                    weightPerM: this._estimateWeightPerMeter(designation)
                };
            }
            
            memberGroups[groupKey].quantity += quantity;
        });

        // Process grouped members
        Object.values(memberGroups).forEach(group => {
            const totalLength = group.length * group.quantity;
            const totalWeightKg = totalLength * group.weightPerM;
            const memberType = this._classifyMember(group.section);

            fallback.steel_quantities.members.push({
                section: group.section,
                total_length_m: totalLength,
                weight_per_m: group.weightPerM,
                total_weight_kg: totalWeightKg,
                member_type: memberType,
                quantity: group.quantity
            });

            const weightTonnes = totalWeightKg / 1000;
            totalWeight += weightTonnes;
            
            if (memberType === 'beam' || memberType === 'purlin') {
                beamWeight += weightTonnes;
            } else if (memberType === 'column') {
                columnWeight += weightTonnes;
            } else {
                beamWeight += weightTonnes; // Default to beam
            }
            
            memberCount += group.quantity;
        });

        fallback.steel_quantities.summary = {
            total_steel_weight_tonnes: parseFloat(totalWeight.toFixed(3)),
            beam_weight_tonnes: parseFloat(beamWeight.toFixed(3)),
            column_weight_tonnes: parseFloat(columnWeight.toFixed(3)),
            member_count: memberCount
        };

        console.log('Enhanced fallback quantities calculated:', fallback.steel_quantities.summary);
        return fallback;
    }

    _estimateWeightPerMeter(section) {
        if (!section) return 20;
        
        const sectionLower = section.toLowerCase().replace(/\s+/g, '');
        
        // Comprehensive Australian steel section weights
        const weightMappings = {
            // Universal Beams (exact matches)
            '150ub14': 14.0, '150ub18': 18.0,
            '180ub16': 16.1, '180ub18': 18.1, '180ub22': 22.2,
            '200ub18': 18.2, '200ub22': 22.3, '200ub25': 25.4, '200ub29': 29.8,
            '250ub25': 25.7, '250ub31': 31.4, '250ub37': 37.3,
            '310ub32': 32.0, '310ub40': 40.4, '310ub46': 46.2,
            '360ub44': 44.7, '360ub50': 50.7, '360ub56': 56.7,
            '410ub53': 53.7, '410ub59': 59.7, '410ub67': 67.1,
            '460ub67': 67.1, '460ub74': 74.6, '460ub82': 82.1,
            
            // Universal Columns
            '100uc14': 14.8, '150uc23': 23.4, '150uc30': 30.0,
            '200uc46': 46.2, '200uc52': 52.0, '200uc59': 59.5,
            '250uc72': 72.4, '250uc89': 89.5,
            '310uc96': 96.8, '310uc118': 118.0, '310uc137': 137.0,
            
            // Parallel Flange Channels
            '75pfc': 7.5, '100pfc': 10.4, '125pfc': 13.4,
            '150pfc': 17.0, '180pfc': 20.9, '200pfc': 23.4,
            '230pfc': 27.6, '250pfc': 31.1, '300pfc': 37.9,
            '380pfc': 48.2, '430pfc': 54.9,
            
            // Hollow Sections (estimated)
            '50x50x3shs': 4.5, '75x75x5shs': 11.0, '89x89x5shs': 13.4,
            '100x100x6shs': 17.7, '125x125x5shs': 18.9, '150x150x6shs': 26.6,
            
            // Purlins and Girts
            'z150': 15.0, 'z200': 19.0, 'z250': 24.0, 'z300': 28.0,
            'c150': 15.0, 'c200': 19.0, 'c250': 24.0, 'c300': 28.0
        };
        
        // Try exact match first
        for (const [key, weight] of Object.entries(weightMappings)) {
            if (sectionLower.includes(key)) {
                return weight;
            }
        }
        
        // Pattern-based extraction with better accuracy
        const patterns = [
            // Match weight at end: "250 UB 31.4" -> 31.4
            { regex: /(\d+)\s*ub\s*(\d+\.?\d*)/, handler: (m) => parseFloat(m[2]) },
            { regex: /(\d+)\s*uc\s*(\d+\.?\d*)/, handler: (m) => parseFloat(m[2]) },
            { regex: /(\d+)\s*pfc\s*(\d+\.?\d*)/, handler: (m) => parseFloat(m[2]) },
            
            // Generic patterns by depth
            { regex: /(\d+)\s*ub/, handler: (m) => this._estimateUBWeight(parseInt(m[1])) },
            { regex: /(\d+)\s*uc/, handler: (m) => this._estimateUCWeight(parseInt(m[1])) },
            { regex: /(\d+)\s*pfc/, handler: (m) => parseInt(m[1]) * 0.15 },
            
            // Hollow sections
            { regex: /(\d+)x(\d+)x(\d+\.?\d*)shs/, handler: (m) => {
                const perimeter = 4 * parseInt(m[1]);
                const thickness = parseFloat(m[3]);
                return Math.max(5, perimeter * thickness * 0.00785);
            }},
            { regex: /(\d+)x(\d+)x(\d+\.?\d*)rhs/, handler: (m) => {
                const perimeter = 2 * (parseInt(m[1]) + parseInt(m[2]));
                const thickness = parseFloat(m[3]);
                return Math.max(5, perimeter * thickness * 0.00785);
            }},
            
            // Purlins
            { regex: /[zc](\d+)/, handler: (m) => Math.max(10, parseInt(m[1]) * 0.15) }
        ];
        
        for (const { regex, handler } of patterns) {
            const match = sectionLower.match(regex);
            if (match) {
                const weight = handler(match);
                if (weight > 0 && weight < 300) { // Reasonable bounds
                    return weight;
                }
            }
        }
        
        return 20; // Conservative fallback
    }

    _estimateUBWeight(depth) {
        // Based on common Australian UB sections
        if (depth <= 150) return 16;
        if (depth <= 200) return 23;
        if (depth <= 250) return 31;
        if (depth <= 310) return 42;
        if (depth <= 360) return 52;
        if (depth <= 410) return 62;
        return 75;
    }

    _estimateUCWeight(depth) {
        // Based on common Australian UC sections
        if (depth <= 150) return 25;
        if (depth <= 200) return 52;
        if (depth <= 250) return 80;
        if (depth <= 310) return 115;
        return 140;
    }

    _classifyMember(section) {
        if (!section) return 'beam';
        const sectionLower = section.toLowerCase();
        
        if (sectionLower.includes('ub') || sectionLower.includes('pfc')) return 'beam';
        if (sectionLower.includes('uc')) return 'column';
        if (sectionLower.includes('shs') && !sectionLower.includes('x50x') && !sectionLower.includes('x75x')) return 'column';
        if (sectionLower.includes('rhs')) return 'beam';
        if (sectionLower.includes('z') || sectionLower.includes('c')) return 'purlin';
        if (sectionLower.includes('angle') || sectionLower.includes('l')) return 'brace';
        
        return 'beam'; // Default
    }

    _validateAndCleanQuantities(quantities) {
        if (!quantities || typeof quantities !== 'object') {
            console.warn('Quantities validation failed, using empty structure');
            return this._getEmptyQuantityStructure();
        }

        // Ensure required structure exists
        if (!quantities.steel_quantities) quantities.steel_quantities = {};
        if (!quantities.steel_quantities.summary) quantities.steel_quantities.summary = {};
        if (!Array.isArray(quantities.steel_quantities.members)) quantities.steel_quantities.members = [];

        // Validate and clean summary
        const summary = quantities.steel_quantities.summary;
        summary.total_steel_weight_tonnes = Math.max(0, parseFloat(summary.total_steel_weight_tonnes) || 0);
        summary.beam_weight_tonnes = Math.max(0, parseFloat(summary.beam_weight_tonnes) || 0);
        summary.column_weight_tonnes = Math.max(0, parseFloat(summary.column_weight_tonnes) || 0);
        summary.member_count = Math.max(0, parseInt(summary.member_count) || 0);

        // Validate and clean members
        quantities.steel_quantities.members = quantities.steel_quantities.members
            .filter(member => member && typeof member === 'object')
            .map(member => ({
                section: (member.section || 'Unknown').toString().trim(),
                total_length_m: Math.max(0, parseFloat(member.total_length_m) || 6),
                weight_per_m: Math.max(0, parseFloat(member.weight_per_m) || 20),
                total_weight_kg: Math.max(0, parseFloat(member.total_weight_kg) || 120),
                member_type: this._validateMemberType(member.member_type),
                quantity: Math.max(1, parseInt(member.quantity) || 1)
            }));

        // Ensure concrete structure
        if (!quantities.concrete_quantities) quantities.concrete_quantities = {};
        if (!quantities.concrete_quantities.summary) quantities.concrete_quantities.summary = {};
        quantities.concrete_quantities.summary.total_concrete_m3 = Math.max(0, parseFloat(quantities.concrete_quantities.summary.total_concrete_m3) || 0);

        return quantities;
    }

    _validateMemberType(type) {
        const validTypes = ['beam', 'column', 'purlin', 'brace'];
        return validTypes.includes(type) ? type : 'beam';
    }

    _getEmptyQuantityStructure() {
        return {
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
    }

    // Keep existing methods for scope, risk assessment, etc.
    _identifyProjectScope(data) {
        const memberCount = this._calculateMemberCount(data);
        let complexity = 'low';
        if (memberCount > 50) complexity = 'medium';
        if (memberCount > 100) complexity = 'high';

        return {
            work_packages: [
                {
                    package_name: "Steel Structure",
                    description: `${memberCount} steel members identified`,
                    complexity: complexity,
                    estimated_duration_days: Math.max(10, Math.ceil(memberCount / 10))
                }
            ],
            project_complexity: complexity,
            member_count_basis: memberCount,
            data_confidence: data.confidence || 0.85
        };
    }

    _assessProjectRisks(data) {
        const risks = [];
        const confidence = data.confidence || 0.85;
        
        if (confidence < 0.7) {
            risks.push({
                risk: "Low drawing data extraction confidence",
                probability: "high",
                impact: "cost variance 10-20%",
                mitigation: "Manual review recommended"
            });
        }

        return {
            technical_risks: risks,
            data_quality_risks: [{
                extraction_confidence: confidence,
                recommendation: confidence < 0.8 ? "manual_verification_recommended" : "acceptable"
            }],
            cost_factors: {
                complexity_multiplier: this._calculateMemberCount(data) > 50 ? 1.1 : 1.0,
                data_confidence_factor: Math.max(0.9, confidence)
            }
        };
    }

    _generateIntelligentAssumptions(data) {
        return [
            "Steel sections conform to AS/NZS standards",
            "Standard connection details unless noted",
            "Hot-dip galvanizing for all structural steel",
            "Site access available for delivery and crane operations",
            `Approximately ${this._calculateMemberCount(data)} steel members as per schedules`
        ];
    }

    _calculateMemberCount(data) {
        return data?.steel_schedules?.length || 0;
    }

    _getDefaultSpecifications() {
        return {
            concrete_specifications: {
                grades_found: ['N32'],
                typical_applications: { 'N32': 'general structural' }
            },
            steel_specifications: {
                sections_used: [],
                steel_grade: "300PLUS"
            },
            standards_applicable: ["AS 3600", "AS 4100"]
        };
    }

    _generateFallbackAnalysis(structuredData, projectId) {
        console.log('Generating comprehensive fallback analysis...');
        
        return {
            projectId,
            confidence: structuredData.confidence || 0.85,
            quantityTakeoff: this._calculateFallbackQuantities(structuredData),
            specifications: this._getDefaultSpecifications(),
            scopeIdentification: this._identifyProjectScope(structuredData),
            riskAssessment: this._assessProjectRisks(structuredData),
            assumptions: this._generateIntelligentAssumptions(structuredData)
        };
    }
}
