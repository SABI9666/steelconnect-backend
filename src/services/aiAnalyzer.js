/ src/services/aiAnalyzer.js - PRODUCTION VERSION
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is required');
        }
        
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20240620";
        
        // Initialize Australian Steel Standards
        this.ausWeights = this._initializeAusWeights();
        
        console.log('✅ Enhanced AI Analyzer initialized with Australian Standards');
    }

    _initializeAusWeights() {
        return {
            // Universal Beams (AS/NZS 3679.1) - kg/m
            UB: {
                '150UB14.0': 14.0, '150UB18.0': 18.0,
                '180UB16.1': 16.1, '180UB18.1': 18.1, '180UB22.2': 22.2,
                '200UB18.2': 18.2, '200UB22.3': 22.3, '200UB25.4': 25.4, '200UB29.8': 29.8,
                '250UB25.7': 25.7, '250UB31.4': 31.4, '250UB37.3': 37.3,
                '310UB32.0': 32.0, '310UB40.4': 40.4, '310UB46.2': 46.2,
                '360UB44.7': 44.7, '360UB56.7': 56.7,
                '410UB53.7': 53.7, '410UB59.7': 59.7,
                '460UB67.1': 67.1, '460UB74.6': 74.6, '460UB82.1': 82.1,
                '530UB82.0': 82.0, '530UB92.4': 92.4,
                '610UB101': 101, '610UB113': 113, '610UB125': 125
            },
            
            // Universal Columns (AS/NZS 3679.1) - kg/m
            UC: {
                '150UC19.7': 19.7, '150UC23.4': 23.4, '150UC30.0': 30.0, '150UC37.2': 37.2,
                '200UC46.2': 46.2, '200UC52.2': 52.2, '200UC59.5': 59.5,
                '250UC72.9': 72.9, '250UC89.5': 89.5,
                '310UC96.8': 96.8, '310UC118': 118, '310UC137': 137, '310UC158': 158,
                '360UC44.7': 44.7, '360UC56.7': 56.7, '360UC72.9': 72.9
            },
            
            // Parallel Flange Channels (AS/NZS 3679.1) - kg/m
            PFC: {
                '75PFC6.0': 6.0, '75PFC7.5': 7.5, '75PFC9.3': 9.3,
                '100PFC10.9': 10.9, '100PFC14.5': 14.5,
                '125PFC15.0': 15.0, '125PFC16.0': 16.0,
                '150PFC18.0': 18.0, '150PFC23.0': 23.0,
                '180PFC20.0': 20.0, '180PFC22.0': 22.0, '180PFC26.0': 26.0,
                '200PFC23.4': 23.4, '200PFC29.0': 29.0,
                '250PFC31.0': 31.0, '250PFC35.0': 35.0,
                '300PFC41.0': 41.0, '300PFC46.0': 46.0,
                '380PFC50.0': 50.0, '380PFC55.0': 55.0
            },
            
            // C Purlins (AS/NZS 4600) - kg/m
            C_PURLINS: {
                'C100/10': 3.9, 'C100/13': 4.9, 'C100/15': 5.7, 'C100/17': 6.4, 'C100/20': 7.4,
                'C125/10': 4.8, 'C125/13': 6.1, 'C125/15': 7.1, 'C125/17': 8.0, 'C125/20': 9.2,
                'C150/10': 5.7, 'C150/13': 7.3, 'C150/15': 8.5, 'C150/17': 9.6, 'C150/20': 11.0,
                'C200/13': 9.7, 'C200/15': 11.2, 'C200/17': 12.8, 'C200/20': 14.8, 'C200/25': 18.0,
                'C250/15': 13.9, 'C250/17': 15.9, 'C250/20': 18.4, 'C250/25': 22.5, 'C250/30': 26.5,
                'C300/15': 16.7, 'C300/17': 19.1, 'C300/20': 22.1, 'C300/25': 27.1, 'C300/30': 31.9,
                'C350/17': 22.3, 'C350/20': 25.8, 'C350/25': 31.7, 'C350/30': 37.3
            },
            
            // Square Hollow Sections (AS/NZS 1163) - kg/m
            SHS: {
                '25x25x1.6': 1.19, '25x25x2.0': 1.45, '25x25x2.5': 1.77,
                '50x50x2.0': 3.07, '50x50x2.5': 3.77, '50x50x3.0': 4.47, '50x50x4.0': 5.82,
                '75x75x2.5': 5.77, '75x75x3.0': 6.89, '75x75x4.0': 9.09, '75x75x5.0': 11.2,
                '90x90x3.0': 8.38, '90x90x4.0': 11.1, '90x90x5.0': 13.7, '90x90x6.0': 16.3,
                '100x100x3.0': 9.42, '100x100x4.0': 12.5, '100x100x5.0': 15.4, '100x100x6.0': 18.4,
                '125x125x4.0': 15.9, '125x125x5.0': 19.7, '125x125x6.0': 23.4, '125x125x8.0': 30.5,
                '150x150x5.0': 23.9, '150x150x6.0': 28.6, '150x150x8.0': 37.4, '150x150x9.0': 41.8,
                '200x200x6.0': 38.9, '200x200x8.0': 51.1, '200x200x9.0': 57.3, '200x200x10': 63.4,
                '250x250x8.0': 65.5, '250x250x9.0': 73.6, '250x250x10': 81.5, '250x250x12': 96.9
            },
            
            // Rectangular Hollow Sections (AS/NZS 1163) - kg/m
            RHS: {
                '50x25x2.0': 2.42, '50x25x2.5': 2.96, '50x25x3.0': 3.48,
                '65x35x2.5': 3.87, '65x35x3.0': 4.57, '65x35x4.0': 5.95,
                '75x50x2.5': 4.77, '75x50x3.0': 5.67, '75x50x4.0': 7.44, '75x50x5.0': 9.12,
                '150x100x5.0': 19.7, '150x100x6.0': 23.4, '150x100x8.0': 30.5,
                '200x100x6.0': 28.6, '200x100x8.0': 37.4, '200x100x9.0': 41.8,
                '250x150x6.0': 38.9, '250x150x8.0': 51.1, '250x150x9.0': 57.3, '250x150x10': 63.4
            }
        };
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('🚀 Starting Australian Steel Standards Analysis...');
            
            // Transform structured data to comprehensive format
            const comprehensiveData = this._transformToComprehensiveData(structuredData);
            
            // Use the comprehensive analyzer
            return await this.analyzeCompleteSteelProject(comprehensiveData, projectId);
            
        } catch (error) {
            console.error('❌ Structural drawings analysis failed:', error.message);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    _transformToComprehensiveData(structuredData) {
        const steelSchedules = structuredData.steel_schedules || [];
        
        const comprehensiveData = {
            mainMembers: [],
            hollowSections: [],
            angles: [],
            purlins: [],
            plates: [],
            bars: [],
            connections: [],
            hardware: []
        };

        steelSchedules.forEach(item => {
            const designation = item.designation || '';
            const quantity = parseInt(item.quantity) || 1;
            const length = parseFloat(item.length) || 6000; // Default 6m in mm
            
            const memberData = {
                designation,
                quantity,
                length,
                notes: item.notes || ''
            };

            // Categorize based on designation
            const d = designation.toUpperCase();
            
            if (d.includes('UB') || d.includes('UC') || d.includes('PFC')) {
                comprehensiveData.mainMembers.push(memberData);
            } else if (d.includes('SHS') || d.includes('RHS') || d.includes('CHS')) {
                comprehensiveData.hollowSections.push(memberData);
            } else if (d.includes('L') && (d.includes('X') || d.includes('x'))) {
                comprehensiveData.angles.push(memberData);
            } else if (d.includes('C') || d.includes('Z')) {
                comprehensiveData.purlins.push(memberData);
            } else if (d.includes('PL') || d.includes('PLATE')) {
                comprehensiveData.plates.push(memberData);
            } else if (d.includes('BAR') || d.includes('FB') || d.includes('RB')) {
                comprehensiveData.bars.push(memberData);
            } else if (d.includes('M') && (d.includes('BOLT') || /M\d{1,2}/.test(d))) {
                comprehensiveData.connections.push(memberData);
            } else {
                // Default to main members if unclear
                comprehensiveData.mainMembers.push(memberData);
            }
        });

        console.log('📋 Categorized steel data:', {
            mainMembers: comprehensiveData.mainMembers.length,
            hollowSections: comprehensiveData.hollowSections.length,
            angles: comprehensiveData.angles.length,
            purlins: comprehensiveData.purlins.length,
            plates: comprehensiveData.plates.length,
            bars: comprehensiveData.bars.length,
            connections: comprehensiveData.connections.length,
            hardware: comprehensiveData.hardware.length
        });

        return comprehensiveData;
    }

    async analyzeCompleteSteelProject(comprehensiveData, projectId) {
        try {
            console.log('🚀 Starting COMPREHENSIVE Australian Steel Analysis...');
            
            const summary = this._createComprehensiveSummary(comprehensiveData);
            let quantityTakeoff = await this._performAustralianSteelAnalysis(summary, comprehensiveData);
            
            // Enhanced result validation
            const hasResults = this._validateAnalysisResults(quantityTakeoff);
            
            if (!hasResults.isValid) {
                console.log(`⚠️ AI analysis incomplete (${hasResults.reason}), using enhanced fallback...`);
                quantityTakeoff = this._calculateComprehensiveFallback(comprehensiveData);
            }
            
            // Transform to expected format for the estimation engine
            const transformedQuantities = this._transformToEstimationFormat(quantityTakeoff);
            
            return {
                projectId,
                confidence: hasResults.isValid ? 0.9 : 0.7,
                quantityTakeoff: transformedQuantities,
                riskAssessment: this._assessComprehensiveRisks(comprehensiveData),
                specifications: {
                    steel_grade: '300PLUS',
                    concrete_grade: 'N32',
                    bolt_grade: '8.8/S'
                },
                standards: {
                    compliance: 'AS/NZS 3679, AS/NZS 1163, AS/NZS 4600, AS/NZS 4291',
                    weightSource: 'Australian Steel Institute Standards'
                }
            };
        } catch (error) {
            console.error(`❌ Comprehensive steel analysis error: ${error.message}`);
            return this._generateComprehensiveFallback(comprehensiveData, projectId);
        }
    }

    _createComprehensiveSummary(steelData) {
        console.log('🔄 Creating comprehensive summary for AI analysis...');
        
        const summaryParts = [];
        
        if (steelData.mainMembers?.length > 0) {
            const mainList = steelData.mainMembers.map(m => `${m.quantity || 1}x ${m.designation}`).join(', ');
            summaryParts.push(`MAIN MEMBERS: ${mainList}`);
        }
        
        if (steelData.hollowSections?.length > 0) {
            const hollowList = steelData.hollowSections.map(h => `${h.quantity || 1}x ${h.designation}`).join(', ');
            summaryParts.push(`HOLLOW SECTIONS: ${hollowList}`);
        }
        
        if (steelData.angles?.length > 0) {
            const angleList = steelData.angles.map(a => `${a.quantity || 1}x ${a.designation}`).join(', ');
            summaryParts.push(`ANGLES: ${angleList}`);
        }
        
        if (steelData.purlins?.length > 0) {
            const purlinList = steelData.purlins.map(p => `${p.quantity || 1}x ${p.designation}`).join(', ');
            summaryParts.push(`PURLINS: ${purlinList}`);
        }
        
        const summary = summaryParts.length > 0 ? summaryParts.join('. ') : 'No steel components found';
        return summary;
    }

    async _performAustralianSteelAnalysis(summary, originalData) {
        const prompt = `You are an expert Australian structural steel quantity surveyor. Analyze the steel data and provide a comprehensive takeoff using exact Australian standard weights.

STEEL DATA: ${summary}

Use AS/NZS standard weights:
- 250UB31.4 = 31.4 kg/m
- C200/15 = 11.2 kg/m  
- SHS 100x100x5.0 = 15.4 kg/m
- Default length: 6 meters

Return ONLY valid JSON:
{
  "steel_quantities": {
    "members": [
      {
        "section": "250UB31.4",
        "total_length_m": 60,
        "weight_per_m": 31.4,
        "total_weight_kg": 1884,
        "member_type": "beam",
        "quantity": 10,
        "average_length_m": 6
      }
    ],
    "summary": {
      "total_steel_weight_tonnes": 1.884,
      "member_count": 10,
      "beam_weight_tonnes": 1.130,
      "column_weight_tonnes": 0.565,
      "purlin_weight_tonnes": 0.189
    }
  },
  "concrete_quantities": {
    "elements": [
      {
        "element_type": "foundation",
        "volume_m3": 15.0,
        "grade": "N32"
      }
    ],
    "summary": {
      "total_concrete_m3": 15.0
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
            console.log('🤖 AI Response received');
            
            return this._parseJsonResponse(responseText, originalData);
        } catch (error) {
            console.error(`❌ AI Analysis API error: ${error.message}`);
            return this._calculateComprehensiveFallback(originalData);
        }
    }

    _parseJsonResponse(text, fallbackData) {
        try {
            let jsonString = text.trim();
            jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === 0) {
                throw new Error('No JSON found');
            }
            
            jsonString = jsonString.substring(jsonStart, jsonEnd);
            const parsed = JSON.parse(jsonString);
            
            console.log('✅ Successfully parsed AI response');
            return parsed;
            
        } catch (error) {
            console.error(`❌ JSON parsing failed: ${error.message}`);
            return this._calculateComprehensiveFallback(fallbackData);
        }
    }

    _transformToEstimationFormat(australianData) {
        // Transform the Australian steel format to match the estimation engine expectations
        if (australianData.steel_quantities) {
            // Already in correct format
            return australianData;
        }

        // Transform from comprehensive format
        const members = [];
        let totalWeight = 0;

        // Process each category
        ['main_members', 'hollow_sections', 'angles', 'purlins'].forEach(category => {
            if (australianData[category]?.items) {
                australianData[category].items.forEach(item => {
                    const memberType = this._getMemberType(item.section, category);
                    members.push({
                        section: item.section,
                        total_length_m: item.total_length_m,
                        weight_per_m: item.weight_per_m,
                        total_weight_kg: item.total_weight_kg,
                        member_type: memberType,
                        quantity: item.quantity,
                        average_length_m: item.total_length_m / item.quantity
                    });
                    totalWeight += item.total_weight_kg;
                });
            }
        });

        return {
            steel_quantities: {
                members: members,
                summary: {
                    total_steel_weight_tonnes: totalWeight / 1000,
                    member_count: members.length,
                    beam_weight_tonnes: totalWeight * 0.6 / 1000,
                    column_weight_tonnes: totalWeight * 0.3 / 1000,
                    purlin_weight_tonnes: totalWeight * 0.1 / 1000
                }
            },
            concrete_quantities: {
                elements: [
                    {
                        element_type: "foundation",
                        volume_m3: Math.max(10, totalWeight / 1000 * 8),
                        grade: "N32"
                    }
                ],
                summary: {
                    total_concrete_m3: Math.max(10, totalWeight / 1000 * 8)
                }
            },
            reinforcement_quantities: {
                deformed_bars: {
                    n12: Math.round(totalWeight * 1.5),
                    n16: Math.round(totalWeight * 1.2),
                    n20: Math.round(totalWeight * 0.8)
                },
                mesh: {
                    sl72: Math.round(totalWeight * 0.8),
                    sl82: Math.round(totalWeight * 0.5)
                }
            }
        };
    }

    _getMemberType(section, category) {
        const s = section.toUpperCase();
        
        if (category === 'main_members') {
            if (s.includes('UB') || s.includes('PFC')) return 'beam';
            if (s.includes('UC')) return 'column';
        }
        if (category === 'hollow_sections') return 'hollow';
        if (category === 'angles') return 'angle';
        if (category === 'purlins') return 'purlin';
        
        return 'beam'; // default
    }

    _calculateComprehensiveFallback(data) {
        console.log('🔄 Calculating comprehensive Australian steel fallback...');
        
        const steelMembers = [];
        let totalWeight = 0;

        // Process all categories
        Object.values(data).forEach(category => {
            if (Array.isArray(category)) {
                category.forEach(item => {
                    const quantity = item.quantity || 1;
                    const length = (item.length || 6000) / 1000; // Convert to meters
                    const weight = this._getAustralianWeight(item.designation);
                    const totalItemWeight = quantity * length * weight;
                    
                    steelMembers.push({
                        section: item.designation,
                        total_length_m: quantity * length,
                        weight_per_m: weight,
                        total_weight_kg: totalItemWeight,
                        member_type: this._classifyMemberType(item.designation),
                        quantity: quantity,
                        average_length_m: length
                    });
                    
                    totalWeight += totalItemWeight;
                });
            }
        });

        return {
            steel_quantities: {
                members: steelMembers,
                summary: {
                    total_steel_weight_tonnes: totalWeight / 1000,
                    member_count: steelMembers.length,
                    beam_weight_tonnes: totalWeight * 0.6 / 1000,
                    column_weight_tonnes: totalWeight * 0.3 / 1000,
                    purlin_weight_tonnes: totalWeight * 0.1 / 1000
                }
            },
            concrete_quantities: {
                elements: [
                    {
                        element_type: "foundation",
                        volume_m3: Math.max(10, totalWeight / 1000 * 8),
                        grade: "N32"
                    }
                ],
                summary: {
                    total_concrete_m3: Math.max(10, totalWeight / 1000 * 8)
                }
            }
        };
    }

    _getAustralianWeight(designation) {
        const cleanDesignation = designation.toUpperCase().replace(/\s+/g, '');
        
        // Check all weight databases
        if (this.ausWeights.UB[cleanDesignation]) return this.ausWeights.UB[cleanDesignation];
        if (this.ausWeights.UC[cleanDesignation]) return this.ausWeights.UC[cleanDesignation];
        if (this.ausWeights.PFC[cleanDesignation]) return this.ausWeights.PFC[cleanDesignation];
        if (this.ausWeights.SHS[cleanDesignation]) return this.ausWeights.SHS[cleanDesignation];
        if (this.ausWeights.RHS[cleanDesignation]) return this.ausWeights.RHS[cleanDesignation];
        if (this.ausWeights.C_PURLINS[cleanDesignation]) return this.ausWeights.C_PURLINS[cleanDesignation];
        
        // Extract weight from designation if available
        const weightMatch = designation.match(/([0-9]+(?:\.[0-9]+))$/);
        if (weightMatch) {
            const weight = parseFloat(weightMatch[1]);
            if (weight > 1 && weight < 500) return weight;
        }
        
        // Intelligent defaults
        return this._getIntelligentDefault(designation);
    }

    _getIntelligentDefault(designation) {
        const d = designation.toUpperCase();
        
        if (d.includes('150')) return 18;
        if (d.includes('200')) return 25;
        if (d.includes('250')) return 32;
        if (d.includes('300') || d.includes('310')) return 42;
        if (d.includes('360')) return 52;
        if (d.includes('C') || d.includes('Z')) return 12;
        if (d.includes('SHS') || d.includes('RHS')) return 15;
        
        return 25; // Generic default
    }

    _classifyMemberType(designation) {
        const d = designation.toUpperCase();
        
        if (d.includes('UB') || d.includes('PFC')) return 'beam';
        if (d.includes('UC')) return 'column';
        if (d.includes('C') || d.includes('Z')) return 'purlin';
        if (d.includes('SHS') || d.includes('RHS') || d.includes('CHS')) return 'hollow';
        if (d.includes('L') && (d.includes('X') || d.includes('x'))) return 'angle';
        
        return 'beam';
    }

    _validateAnalysisResults(quantityTakeoff) {
        if (!quantityTakeoff || typeof quantityTakeoff !== 'object') {
            return { isValid: false, reason: 'Invalid structure' };
        }
        
        // Check for steel quantities
        if (quantityTakeoff.steel_quantities?.summary?.total_steel_weight_tonnes > 0) {
            return { isValid: true };
        }
        
        // Check comprehensive format
        const categories = ['main_members', 'hollow_sections', 'angles', 'purlins'];
        for (const category of categories) {
            if (quantityTakeoff[category]?.summary?.total_weight_tonnes > 0) {
                return { isValid: true };
            }
        }
        
        return { isValid: false, reason: 'No weight data found' };
    }

    _assessComprehensiveRisks(data) {
        const totalItems = Object.values(data).reduce((sum, category) => {
            return sum + (Array.isArray(category) ? category.length : 0);
        }, 0);
        
        let complexityMultiplier = 1.05;
        
        if (totalItems > 50) complexityMultiplier += 0.10;
        if (totalItems > 100) complexityMultiplier += 0.05;
        
        return {
            cost_factors: {
                complexity_multiplier: Math.round(complexityMultiplier * 100) / 100,
                data_confidence_factor: totalItems > 10 ? 0.95 : 0.85,
                size_factor: totalItems > 50 ? 0.95 : 1.0
            }
        };
    }

    _generateFallbackAnalysis(structuredData, projectId) {
        console.log('🔄 Generating fallback analysis...');
        
        const steelSchedules = structuredData.steel_schedules || [];
        const members = [];
        let totalWeight = 0;
        
        steelSchedules.forEach(schedule => {
            const quantity = parseInt(schedule.quantity) || 1;
            const length = parseFloat(schedule.length) / 1000 || 6.0;
            const weightPerM = this._getAustralianWeight(schedule.designation);
            const totalMemberWeight = quantity * length * weightPerM;
            
            members.push({
                section: schedule.designation,
                total_length_m: quantity * length,
                weight_per_m: weightPerM,
                total_weight_kg: totalMemberWeight,
                member_type: this._classifyMemberType(schedule.designation),
                quantity: quantity,
                average_length_m: length
            });
            
            totalWeight += totalMemberWeight;
        });

        return {
            projectId,
            confidence: 0.7,
            quantityTakeoff: {
                steel_quantities: {
                    members: members,
                    summary: {
                        total_steel_weight_tonnes: totalWeight / 1000,
                        member_count: steelSchedules.length,
                        beam_weight_tonnes: totalWeight * 0.6 / 1000,
                        column_weight_tonnes: totalWeight * 0.3 / 1000,
                        purlin_weight_tonnes: totalWeight * 0.1 / 1000
                    }
                },
                concrete_quantities: {
                    elements: [{
                        element_type: "foundation",
                        volume_m3: Math.max(10, totalWeight / 1000 * 8),
                        grade: "N32"
                    }],
                    summary: {
                        total_concrete_m3: Math.max(10, totalWeight / 1000 * 8)
                    }
                }
            },
            riskAssessment: {
                cost_factors: {
                    complexity_multiplier: 1.1,
                    data_confidence_factor: 0.8,
                    size_factor: 1.0
                }
            },
            specifications: {
                steel_grade: '300PLUS',
                concrete_grade: 'N32',
                bolt_grade: '8.8/S'
            }
        };
    }

    _generateComprehensiveFallback(comprehensiveData, projectId) {
        console.log('🔄 Generating comprehensive fallback analysis...');
        
        return {
            projectId,
            confidence: 0.7,
            quantityTakeoff: this._calculateComprehensiveFallback(comprehensiveData),
            riskAssessment: this._assessComprehensiveRisks(comprehensiveData),
            specifications: {
                steel_grade: '300PLUS',
                concrete_grade: 'N32',
                bolt_grade: '8.8/S'
            },
            standards: {
                compliance: 'AS/NZS 3679, AS/NZS 1163, AS/NZS 4600 (Fallback Mode)',
                weightSource: 'Australian Steel Institute Standards + Estimates'
            },
            fallbackMode: true
        };
    }
}
