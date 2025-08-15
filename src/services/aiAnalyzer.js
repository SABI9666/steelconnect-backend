// Improved AI Analyzer with better prompting and validation
import Anthropic from '@anthropic-ai/sdk';

export class aiAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20241022";
        this.steelWeights = this.initializeSteelWeights();
    }

    initializeSteelWeights() {
        // Comprehensive Australian steel weights database
        return {
            'UB': {
                150: [14.0, 18.0],
                180: [16.1, 18.1, 22.2],
                200: [18.2, 22.3, 25.4, 29.8],
                250: [25.7, 31.4, 37.3],
                310: [32.0, 40.4, 46.2],
                360: [44.7, 50.7, 56.7],
                410: [53.7, 59.7, 67.1],
                460: [67.1, 74.6, 82.1]
            },
            'UC': {
                100: [14.8],
                150: [23.4, 30.0, 37.2],
                200: [46.2, 52.0, 59.5],
                250: [72.4, 89.5],
                310: [96.8, 118.0, 137.0, 158.0]
            },
            'PFC': {
                75: 7.5, 100: 10.4, 125: 13.4, 150: 17.0,
                180: 20.9, 200: 23.4, 230: 27.6, 250: 31.1,
                300: 37.9, 380: 48.2, 430: 54.9
            }
        };
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('🤖 Starting improved AI analysis...');
            
            // Create a more detailed summary for AI
            const detailedSummary = this._createDetailedSummary(structuredData);
            
            // Perform analysis in stages for better accuracy
            const quantityTakeoff = await this._performEnhancedQuantityTakeoff(detailedSummary, structuredData);
            const specifications = await this._extractSpecifications(detailedSummary);
            const riskAssessment = this._performRiskAssessment(structuredData, quantityTakeoff);
            
            const analysisResults = {
                projectId,
                confidence: this._calculateOverallConfidence(structuredData, quantityTakeoff),
                quantityTakeoff,
                specifications,
                scopeIdentification: this._identifyProjectScope(quantityTakeoff),
                riskAssessment,
                assumptions: this._generateAssumptions(structuredData, quantityTakeoff)
            };
            
            // Validate results
            if (!this._validateResults(analysisResults)) {
                console.warn('AI analysis validation failed, using enhanced fallback');
                analysisResults.quantityTakeoff = this._calculateEnhancedFallback(structuredData);
                analysisResults.confidence = Math.max(0.6, analysisResults.confidence * 0.8);
            }

            return analysisResults;

        } catch (error) {
            console.error(`AI analysis error: ${error.message}`);
            return this._generateEnhancedFallback(structuredData, projectId);
        }
    }

    _createDetailedSummary(data) {
        if (!data || !data.steel_schedules) {
            return "No structural data available for analysis.";
        }

        const members = data.steel_schedules;
        const summary = {
            totalMembers: members.length,
            memberDetails: [],
            categories: {}
        };

        // Categorize and detail each member
        members.forEach(member => {
            const category = this._classifyMember(member.designation);
            const weight = this._getAccurateWeight(member.designation);
            const length = parseFloat(member.length) || 6.0;
            const quantity = parseInt(member.quantity) || 1;

            summary.memberDetails.push({
                designation: member.designation,
                category,
                quantity,
                length,
                estimatedWeight: weight,
                totalWeight: weight * length * quantity
            });

            if (!summary.categories[category]) {
                summary.categories[category] = { count: 0, weight: 0 };
            }
            summary.categories[category].count += quantity;
            summary.categories[category].weight += weight * length * quantity;
        });

        return this._formatSummaryForAI(summary);
    }

    _formatSummaryForAI(summary) {
        const categoryBreakdown = Object.entries(summary.categories)
            .map(([cat, data]) => `${cat}: ${data.count} members, ${data.weight.toFixed(1)}kg`)
            .join('; ');

        const memberList = summary.memberDetails
            .slice(0, 20) // Limit for token efficiency
            .map(m => `${m.designation}(${m.quantity}x${m.length}m)`)
            .join(', ');

        return `
PROJECT ANALYSIS:
Total Members: ${summary.totalMembers}
Categories: ${categoryBreakdown}
Sample Members: ${memberList}
${summary.memberDetails.length > 20 ? '... and more' : ''}
        `.trim();
    }

    async _performEnhancedQuantityTakeoff(summary, originalData) {
        const prompt = `You are a structural engineer analyzing Australian steel drawings. Provide accurate quantity takeoff based on the following data.

STRUCTURAL DATA:
${summary}

REQUIREMENTS:
1. Use EXACT Australian steel section weights (e.g., 250 UB 31.4 = 31.4 kg/m)
2. Calculate realistic member lengths (typical range 3-12m)
3. Account for ALL members found in the data
4. Provide detailed breakdown by member type

Return ONLY this JSON structure:
{
  "steel_quantities": {
    "members": [
      {
        "section": "250 UB 31.4",
        "total_length_m": 48.0,
        "weight_per_m": 31.4,
        "total_weight_kg": 1507.2,
        "member_type": "beam",
        "quantity": 8,
        "average_length_m": 6.0
      }
    ],
    "summary": {
      "total_steel_weight_tonnes": 15.5,
      "beam_weight_tonnes": 8.2,
      "column_weight_tonnes": 4.1,
      "purlin_weight_tonnes": 2.0,
      "hollow_section_weight_tonnes": 1.2,
      "member_count": 85,
      "beam_count": 32,
      "column_count": 18,
      "purlin_count": 28,
      "hollow_section_count": 7
    }
  },
  "concrete_quantities": {
    "elements": [
      {
        "element_type": "foundation",
        "volume_m3": 25.0,
        "grade": "N32"
      }
    ],
    "summary": {
      "total_concrete_m3": 45.0,
      "foundation_m3": 25.0,
      "slab_m3": 20.0
    }
  },
  "reinforcement_quantities": {
    "deformed_bars": {
      "n12": 2400,
      "n16": 1800,
      "n20": 1200
    },
    "mesh": {
      "sl72": 450,
      "sl82": 320
    }
  }
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                temperature: 0.1,
                messages: [{ role: "user", content: prompt }]
            });

            const responseText = response.content[0]?.text || '';
            const quantities = this._parseAndValidateJSON(responseText);
            
            if (!quantities || !this._validateQuantities(quantities, originalData)) {
                console.log('AI quantities failed validation, using calculated fallback');
                return this._calculateEnhancedFallback(originalData);
            }

            return this._enhanceQuantities(quantities, originalData);

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return this._calculateEnhancedFallback(originalData);
        }
    }

    _parseAndValidateJSON(text) {
        try {
            // Clean the response text
            let cleanText = text
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .replace(/^\s*[^{]*/, '') // Remove text before first {
                .replace(/[^}]*$/, '') // Remove text after last }
                .trim();

            // Find the main JSON object
            const startIndex = cleanText.indexOf('{');
            const endIndex = cleanText.lastIndexOf('}');
            
            if (startIndex === -1 || endIndex === -1) {
                throw new Error('No valid JSON structure found');
            }

            const jsonString = cleanText.substring(startIndex, endIndex + 1);
            const parsed = JSON.parse(jsonString);

            // Basic validation
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Invalid JSON object');
            }

            return parsed;

        } catch (error) {
            console.error('JSON parsing failed:', error.message);
            return null;
        }
    }

    _validateQuantities(quantities, originalData) {
        try {
            // Check required structure
            if (!quantities.steel_quantities || !quantities.steel_quantities.members) {
                return false;
            }

            const aiMemberCount = quantities.steel_quantities.summary?.member_count || 0;
            const originalMemberCount = originalData.steel_schedules?.length || 0;

            // AI should account for at least 80% of original members
            if (originalMemberCount > 5 && aiMemberCount < originalMemberCount * 0.8) {
                console.log(`Member count mismatch: AI=${aiMemberCount}, Original=${originalMemberCount}`);
                return false;
            }

            // Validate individual members have required fields
            const members = quantities.steel_quantities.members;
            const validMembers = members.filter(member => 
                member.section && 
                member.weight_per_m > 0 && 
                member.total_weight_kg > 0
            );

            return validMembers.length > members.length * 0.8;

        } catch (error) {
            console.error('Quantity validation error:', error);
            return false;
        }
    }

    _enhanceQuantities(quantities, originalData) {
        // Cross-reference with original data to ensure accuracy
        const enhanced = JSON.parse(JSON.stringify(quantities));
        
        if (originalData.steel_schedules) {
            // Map original data to enhance AI results
            const originalMap = new Map();
            originalData.steel_schedules.forEach(member => {
                const key = this._normalizeSection(member.designation);
                if (!originalMap.has(key)) {
                    originalMap.set(key, []);
                }
                originalMap.get(key).push(member);
            });

            // Enhance AI members with original data
            enhanced.steel_quantities.members = enhanced.steel_quantities.members.map(aiMember => {
                const normalizedSection = this._normalizeSection(aiMember.section);
                const originalMembers = originalMap.get(normalizedSection) || [];
                
                if (originalMembers.length > 0) {
                    const totalOriginalQty = originalMembers.reduce((sum, m) => sum + (parseInt(m.quantity) || 1), 0);
                    const avgOriginalLength = originalMembers.reduce((sum, m) => sum + (parseFloat(m.length) || 6), 0) / originalMembers.length;
                    
                    // Use original data if significantly different
                    if (Math.abs(aiMember.quantity - totalOriginalQty) > totalOriginalQty * 0.3) {
                        aiMember.quantity = totalOriginalQty;
                        aiMember.total_length_m = totalOriginalQty * avgOriginalLength;
                        aiMember.total_weight_kg = aiMember.weight_per_m * aiMember.total_length_m;
                    }
                }
                
                return aiMember;
            });

            // Recalculate summary
            this._recalculateSummary(enhanced.steel_quantities);
        }

        return enhanced;
    }

    _calculateEnhancedFallback(data) {
        console.log('🔧 Calculating enhanced fallback quantities...');
        
        const fallback = {
            steel_quantities: {
                members: [],
                summary: {
                    total_steel_weight_tonnes: 0,
                    beam_weight_tonnes: 0,
                    column_weight_tonnes: 0,
                    purlin_weight_tonnes: 0,
                    hollow_section_weight_tonnes: 0,
                    member_count: 0,
                    beam_count: 0,
                    column_count: 0,
                    purlin_count: 0,
                    hollow_section_count: 0
                }
            },
            concrete_quantities: {
                elements: [],
                summary: { total_concrete_m3: 0 }
            },
            reinforcement_quantities: {
                deformed_bars: { n12: 0, n16: 0, n20: 0 },
                mesh: { sl72: 0, sl82: 0 }
            }
        };

        if (!data || !data.steel_schedules) {
            return fallback;
        }

        // Group similar members
        const memberGroups = new Map();
        data.steel_schedules.forEach(member => {
            const key = this._normalizeSection(member.designation);
            if (!memberGroups.has(key)) {
                memberGroups.set(key, []);
            }
            memberGroups.get(key).push(member);
        });

        // Process each group
        memberGroups.forEach((members, section) => {
            const totalQuantity = members.reduce((sum, m) => sum + (parseInt(m.quantity) || 1), 0);
            const avgLength = members.reduce((sum, m) => sum + (parseFloat(m.length) || 6), 0) / members.length;
            const weightPerM = this._getAccurateWeight(section);
            const memberType = this._classifyMember(section);
            const totalWeight = weightPerM * avgLength * totalQuantity;

            fallback.steel_quantities.members.push({
                section: section,
                total_length_m: parseFloat((avgLength * totalQuantity).toFixed(2)),
                weight_per_m: weightPerM,
                total_weight_kg: parseFloat(totalWeight.toFixed(2)),
                member_type: memberType,
                quantity: totalQuantity,
                average_length_m: parseFloat(avgLength.toFixed(2))
            });

            // Update summary
            const weightTonnes = totalWeight / 1000;
            fallback.steel_quantities.summary.total_steel_weight_tonnes += weightTonnes;
            fallback.steel_quantities.summary.member_count += totalQuantity;

            // Update category-specific counts
            switch (memberType) {
                case 'beam':
                    fallback.steel_quantities.summary.beam_weight_tonnes += weightTonnes;
                    fallback.steel_quantities.summary.beam_count += totalQuantity;
                    break;
                case 'column':
                    fallback.steel_quantities.summary.column_weight_tonnes += weightTonnes;
                    fallback.steel_quantities.summary.column_count += totalQuantity;
                    break;
                case 'purlin':
                    fallback.steel_quantities.summary.purlin_weight_tonnes += weightTonnes;
                    fallback.steel_quantities.summary.purlin_count += totalQuantity;
                    break;
                case 'hollow':
                    fallback.steel_quantities.summary.hollow_section_weight_tonnes += weightTonnes;
                    fallback.steel_quantities.summary.hollow_section_count += totalQuantity;
                    break;
            }
        });

        // Round summary values
        Object.keys(fallback.steel_quantities.summary).forEach(key => {
            if (typeof fallback.steel_quantities.summary[key] === 'number' && key.includes('weight')) {
                fallback.steel_quantities.summary[key] = parseFloat(fallback.steel_quantities.summary[key].toFixed(3));
            }
        });

        // Estimate concrete and reinforcement
        this._estimateConcreteAndReinforcement(fallback);

        return fallback;
    }

    _estimateConcreteAndReinforcement(quantities) {
        const steelWeight = quantities.steel_quantities.summary.total_steel_weight_tonnes;
        const memberCount = quantities.steel_quantities.summary.member_count;

        // Estimate concrete based on steel structure size
        if (steelWeight > 0) {
            const estimatedConcrete = Math.max(10, steelWeight * 8); // Rule of thumb: 8m³ concrete per tonne steel
            
            quantities.concrete_quantities.elements.push({
                element_type: "foundation",
                volume_m3: parseFloat((estimatedConcrete * 0.6).toFixed(1)),
                grade: "N32"
            });

            if (memberCount > 20) {
                quantities.concrete_quantities.elements.push({
                    element_type: "slab",
                    volume_m3: parseFloat((estimatedConcrete * 0.4).toFixed(1)),
                    grade: "N32"
                });
            }

            quantities.concrete_quantities.summary.total_concrete_m3 = parseFloat(estimatedConcrete.toFixed(1));
        }

        // Estimate reinforcement
        const concreteVolume = quantities.concrete_quantities.summary.total_concrete_m3;
        if (concreteVolume > 0) {
            quantities.reinforcement_quantities.deformed_bars.n12 = Math.round(concreteVolume * 50);
            quantities.reinforcement_quantities.deformed_bars.n16 = Math.round(concreteVolume * 35);
            quantities.reinforcement_quantities.deformed_bars.n20 = Math.round(concreteVolume * 25);
            quantities.reinforcement_quantities.mesh.sl72 = Math.round(concreteVolume * 15);
            quantities.reinforcement_quantities.mesh.sl82 = Math.round(concreteVolume * 10);
        }
    }

    _getAccurateWeight(section) {
        const normalized = this._normalizeSection(section);
        
        // Match against database
        const ubMatch = normalized.match(/(\d+)\s*UB\s*(\d+\.?\d*)/);
        if (ubMatch) {
            const depth = parseInt(ubMatch[1]);
            const weight = parseFloat(ubMatch[2]);
            if (this.steelWeights.UB[depth]?.includes(weight)) {
                return weight;
            }
        }

        const ucMatch = normalized.match(/(\d+)\s*UC\s*(\d+\.?\d*)/);
        if (ucMatch) {
            const depth = parseInt(ucMatch[1]);
            const weight = parseFloat(ucMatch[2]);
            if (this.steelWeights.UC[depth]?.includes(weight)) {
                return weight;
            }
        }

        const pfcMatch = normalized.match(/(\d+)\s*PFC/);
        if (pfcMatch) {
            const depth = parseInt(pfcMatch[1]);
            return this.steelWeights.PFC[depth] || this._estimateWeight(section);
        }

        return this._estimateWeight(section);
    }

    _estimateWeight(section) {
        const s = section.toLowerCase();
        const numbers = section.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        if (numbers.length === 0) return 20;

        const depth = numbers[0];

        if (s.includes('ub')) {
            return depth <= 200 ? depth * 0.125 : depth <= 300 ? depth * 0.14 : depth * 0.16;
        }
        if (s.includes('uc')) {
            return depth * 0.22;
        }
        if (s.includes('pfc')) {
            return depth * 0.11;
        }
        if ((s.includes('shs') || s.includes('rhs')) && numbers.length >= 3) {
            const [dim1, dim2, thickness] = numbers;
            return 2 * (dim1 + (dim2 || dim1)) * thickness * 0.00785;
        }

        return Math.max(10, depth * 0.12);
    }

    _classifyMember(section) {
        const s = section.toLowerCase();
        if (s.includes('ub') || s.includes('pfc')) return 'beam';
        if (s.includes('uc')) return 'column';
        if (s.includes('shs') || s.includes('rhs')) return 'hollow';
        if (s.includes('z') || s.includes('c')) return 'purlin';
        return 'beam';
    }

    _normalizeSection(section) {
        return section.replace(/\s+/g, ' ').replace(/[×]/g, 'x').trim().toUpperCase();
    }

    _recalculateSummary(steelQuantities) {
        const summary = {
            total_steel_weight_tonnes: 0,
            beam_weight_tonnes: 0,
            column_weight_tonnes: 0,
            purlin_weight_tonnes: 0,
            hollow_section_weight_tonnes: 0,
            member_count: 0,
            beam_count: 0,
            column_count: 0,
            purlin_count: 0,
            hollow_section_count: 0
        };

        steelQuantities.members.forEach(member => {
            const weightTonnes = member.total_weight_kg / 1000;
            summary.total_steel_weight_tonnes += weightTonnes;
            summary.member_count += member.quantity;

            switch (member.member_type) {
                case 'beam':
                    summary.beam_weight_tonnes += weightTonnes;
                    summary.beam_count += member.quantity;
                    break;
                case 'column':
                    summary.column_weight_tonnes += weightTonnes;
                    summary.column_count += member.quantity;
                    break;
                case 'purlin':
                    summary.purlin_weight_tonnes += weightTonnes;
                    summary.purlin_count += member.quantity;
                    break;
                case 'hollow':
                    summary.hollow_section_weight_tonnes += weightTonnes;
                    summary.hollow_section_count += member.quantity;
                    break;
            }
        });

        // Round values
        Object.keys(summary).forEach(key => {
            if (typeof summary[key] === 'number' && key.includes('weight')) {
                summary[key] = parseFloat(summary[key].toFixed(3));
            }
        });

        steelQuantities.summary = summary;
    }

    async _extractSpecifications(summary) {
        const prompt = `Extract material specifications from this structural data:

${summary}

Return only JSON:
{
  "concrete_specifications": {
    "grades_found": ["N32", "N40"],
    "typical_applications": {
      "N32": "general structural elements",
      "N40": "high strength applications"
    }
  },
  "steel_specifications": {
    "sections_used": ["UB", "UC", "PFC", "SHS"],
    "steel_grade": "300PLUS",
    "treatment": "hot_dip_galvanized"
  },
  "standards_applicable": ["AS 3600-2018", "AS 4100-2020", "AS 1170"]
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 1000,
                temperature: 0.1,
                messages: [{ role: "user", content: prompt }]
            });

            return this._parseAndValidateJSON(response.content[0]?.text || '') || this._getDefaultSpecifications();
        } catch (error) {
            console.error('Specification extraction error:', error);
            return this._getDefaultSpecifications();
        }
    }

    _performRiskAssessment(structuredData, quantityTakeoff) {
        const risks = [];
        const totalWeight = quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        const memberCount = quantityTakeoff?.steel_quantities?.summary?.member_count || 0;
        const confidence = structuredData.confidence || 0;

        if (confidence < 0.7) {
            risks.push({
                risk: "Low data extraction confidence",
                probability: "high",
                impact: "Cost variance 15-25%",
                mitigation: "Manual quantity verification required"
            });
        }

        if (totalWeight > 50) {
            risks.push({
                risk: "Large steel structure - complex logistics",
                probability: "medium",
                impact: "Schedule delays, increased costs",
                mitigation: "Early contractor engagement, detailed planning"
            });
        }

        if (memberCount > 100) {
            risks.push({
                risk: "High member count - fabrication complexity",
                probability: "medium",
                impact: "Extended fabrication time",
                mitigation: "Standardize connections, modular approach"
            });
        }

        return {
            technical_risks: risks,
            data_quality_risks: [{
                extraction_confidence: confidence,
                recommendation: confidence < 0.8 ? "manual_verification_required" : "acceptable",
                confidence_level: confidence > 0.9 ? "high" : confidence > 0.7 ? "medium" : "low"
            }],
            cost_factors: {
                complexity_multiplier: this._calculateComplexityMultiplier(totalWeight, memberCount),
                data_confidence_factor: Math.max(0.85, Math.min(1.15, confidence + 0.1)),
                size_factor: totalWeight > 100 ? 1.1 : totalWeight > 50 ? 1.05 : 1.0
            }
        };
    }

    _calculateComplexityMultiplier(weight, memberCount) {
        let multiplier = 1.0;
        
        if (weight > 100) multiplier += 0.15;
        else if (weight > 50) multiplier += 0.1;
        else if (weight > 20) multiplier += 0.05;
        
        if (memberCount > 150) multiplier += 0.1;
        else if (memberCount > 75) multiplier += 0.05;
        
        return Math.min(1.3, multiplier); // Cap at 30% increase
    }

    _calculateOverallConfidence(structuredData, quantityTakeoff) {
        let confidence = structuredData.confidence || 0.5;
        
        // Boost confidence if quantities are reasonable
        const totalWeight = quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        const memberCount = quantityTakeoff?.steel_quantities?.summary?.member_count || 0;
        
        if (totalWeight > 0 && memberCount > 0) {
            confidence = Math.min(0.95, confidence + 0.1);
        }
        
        // Reduce confidence for very large projects (higher uncertainty)
        if (totalWeight > 200 || memberCount > 300) {
            confidence *= 0.9;
        }
        
        return parseFloat(confidence.toFixed(2));
    }

    _identifyProjectScope(quantityTakeoff) {
        const summary = quantityTakeoff?.steel_quantities?.summary || {};
        const totalWeight = summary.total_steel_weight_tonnes || 0;
        const memberCount = summary.member_count || 0;
        
        let complexity = 'low';
        let duration = 30;
        
        if (totalWeight > 100 || memberCount > 150) {
            complexity = 'high';
            duration = 90;
        } else if (totalWeight > 30 || memberCount > 50) {
            complexity = 'medium';
            duration = 60;
        }

        return {
            work_packages: [
                {
                    package_name: "Steel Structure",
                    description: `${memberCount} steel members, ${totalWeight}T total`,
                    complexity: complexity,
                    estimated_duration_days: duration,
                    scope_items: [
                        "Fabrication of steel members",
                        "Hot-dip galvanizing",
                        "Site delivery and erection",
                        "Connection bolting and welding"
                    ]
                },
                {
                    package_name: "Foundation Works",
                    description: "Concrete foundations and anchors",
                    complexity: complexity === 'high' ? 'medium' : 'low',
                    estimated_duration_days: Math.max(10, duration * 0.3)
                }
            ],
            project_complexity: complexity,
            estimated_total_duration_days: duration,
            critical_path: ["Foundation works", "Steel fabrication", "Site erection"]
        };
    }

    _generateAssumptions(structuredData, quantityTakeoff) {
        const assumptions = [
            "Steel sections conform to AS/NZS 3679.1",
            "Standard structural connections as per AS 4100",
            "Hot-dip galvanizing to AS/NZS 4680",
            "Site access suitable for delivery trucks and mobile crane",
            "Standard foundation conditions",
            "No special fire rating requirements"
        ];

        const confidence = structuredData.confidence || 0;
        if (confidence < 0.8) {
            assumptions.push("Quantities estimated from limited drawing data - verification recommended");
        }

        const memberCount = quantityTakeoff?.steel_quantities?.summary?.member_count || 0;
        if (memberCount > 0) {
            assumptions.push(`Based on analysis of ${memberCount} structural members`);
        }

        const totalWeight = quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        if (totalWeight > 50) {
            assumptions.push("Heavy lift crane required for erection");
        }

        return assumptions;
    }

    _getDefaultSpecifications() {
        return {
            concrete_specifications: {
                grades_found: ["N32"],
                typical_applications: { "N32": "general structural elements" }
            },
            steel_specifications: {
                sections_used: ["UB", "UC", "PFC"],
                steel_grade: "300PLUS",
                treatment: "hot_dip_galvanized"
            },
            standards_applicable: ["AS 3600-2018", "AS 4100-2020", "AS 1170"]
        };
    }

    _validateResults(results) {
        try {
            return results && 
                   results.quantityTakeoff && 
                   results.quantityTakeoff.steel_quantities && 
                   results.quantityTakeoff.steel_quantities.members &&
                   results.quantityTakeoff.steel_quantities.members.length > 0 &&
                   results.quantityTakeoff.steel_quantities.summary &&
                   results.quantityTakeoff.steel_quantities.summary.total_steel_weight_tonnes > 0;
        } catch (error) {
            return false;
        }
    }

    _generateEnhancedFallback(structuredData, projectId) {
        console.log('🚨 Generating enhanced fallback analysis...');
        
        return {
            projectId: projectId || `FALLBACK_${Date.now()}`,
            confidence: Math.max(0.6, (structuredData?.confidence || 0) * 0.8),
            quantityTakeoff: this._calculateEnhancedFallback(structuredData),
            specifications: this._getDefaultSpecifications(),
            scopeIdentification: {
                work_packages: [{
                    package_name: "Steel Structure",
                    description: "Basic steel structure",
                    complexity: "medium",
                    estimated_duration_days: 45
                }],
                project_complexity: "medium"
            },
            riskAssessment: {
                technical_risks: [{
                    risk: "Limited data availability",
                    probability: "high",
                    impact: "Estimation accuracy",
                    mitigation: "Detailed review required"
                }],
                cost_factors: {
                    complexity_multiplier: 1.2,
                    data_confidence_factor: 0.8
                }
            },
            assumptions: [
                "Estimated quantities based on limited data",
                "Manual verification strongly recommended",
                "Standard construction assumptions applied"
            ]
        };
    }
}
