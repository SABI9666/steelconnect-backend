// Australian Steel Standards AI Analyzer
import Anthropic from '@anthropic-ai/sdk';

export class AustralianSteelAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20240620";
        
        // Australian Steel Weight Database (AS/NZS Standards)
        this.ausWeights = this._initializeAusWeights();
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
            
            // Z Purlins (AS/NZS 4600) - kg/m
            Z_PURLINS: {
                'Z100/10': 3.7, 'Z100/13': 4.7, 'Z100/15': 5.4, 'Z100/17': 6.1, 'Z100/20': 7.1,
                'Z125/10': 4.6, 'Z125/13': 5.8, 'Z125/15': 6.8, 'Z125/17': 7.6, 'Z125/20': 8.8,
                'Z150/10': 5.4, 'Z150/13': 6.9, 'Z150/15': 8.1, 'Z150/17': 9.1, 'Z150/20': 10.5,
                'Z200/13': 9.2, 'Z200/15': 10.7, 'Z200/17': 12.2, 'Z200/20': 14.1, 'Z200/25': 17.2,
                'Z250/15': 13.2, 'Z250/17': 15.1, 'Z250/20': 17.5, 'Z250/25': 21.4, 'Z250/30': 25.2,
                'Z300/15': 15.9, 'Z300/17': 18.2, 'Z300/20': 21.0, 'Z300/25': 25.8, 'Z300/30': 30.4,
                'Z350/17': 21.2, 'Z350/20': 24.5, 'Z350/25': 30.1, 'Z350/30': 35.4
            },
            
            // Square Hollow Sections (AS/NZS 1163) - kg/m
            SHS: {
                '25x25x1.6': 1.19, '25x25x2.0': 1.45, '25x25x2.5': 1.77,
                '30x30x1.6': 1.45, '30x30x2.0': 1.77, '30x30x2.5': 2.16, '30x30x3.0': 2.54,
                '40x40x1.6': 1.96, '40x40x2.0': 2.42, '40x40x2.5': 2.96, '40x40x3.0': 3.48,
                '50x50x2.0': 3.07, '50x50x2.5': 3.77, '50x50x3.0': 4.47, '50x50x4.0': 5.82,
                '65x65x2.5': 4.97, '65x65x3.0': 5.92, '65x65x4.0': 7.78, '65x65x5.0': 9.57,
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
                '90x50x3.0': 6.53, '90x50x4.0': 8.60, '90x50x5.0': 10.6,
                '100x50x3.0': 7.09, '100x50x4.0': 9.38, '100x50x5.0': 11.6, '100x50x6.0': 13.7,
                '125x75x4.0': 12.5, '125x75x5.0': 15.4, '125x75x6.0': 18.4,
                '150x100x5.0': 19.7, '150x100x6.0': 23.4, '150x100x8.0': 30.5,
                '200x100x6.0': 28.6, '200x100x8.0': 37.4, '200x100x9.0': 41.8,
                '250x150x6.0': 38.9, '250x150x8.0': 51.1, '250x150x9.0': 57.3, '250x150x10': 63.4,
                '300x200x8.0': 65.5, '300x200x9.0': 73.6, '300x200x10': 81.5, '300x200x12': 96.9
            },
            
            // Equal Angles (AS/NZS 3679.1) - kg/m
            ANGLES: {
                'L20x20x3': 1.12, 'L25x25x3': 1.42, 'L25x25x4': 1.85,
                'L30x30x3': 1.72, 'L30x30x4': 2.25, 'L30x30x5': 2.76,
                'L40x40x3': 2.32, 'L40x40x4': 3.05, 'L40x40x5': 3.77, 'L40x40x6': 4.47,
                'L45x45x4': 3.45, 'L45x45x5': 4.27, 'L45x45x6': 5.07,
                'L50x50x4': 3.85, 'L50x50x5': 4.77, 'L50x50x6': 5.67, 'L50x50x8': 7.39,
                'L65x65x5': 6.25, 'L65x65x6': 7.42, 'L65x65x8': 9.71,
                'L75x75x6': 8.72, 'L75x75x8': 11.4, 'L75x75x10': 14.0,
                'L90x90x6': 10.6, 'L90x90x8': 13.9, 'L90x90x10': 17.1, 'L90x90x12': 20.2,
                'L100x100x8': 15.4, 'L100x100x10': 19.0, 'L100x100x12': 22.5,
                'L125x125x8': 19.6, 'L125x125x10': 24.3, 'L125x125x12': 28.8, 'L125x125x15': 35.5,
                'L150x150x10': 29.7, 'L150x150x12': 35.2, 'L150x150x15': 43.5, 'L150x150x18': 51.5,
                'L200x200x12': 47.1, 'L200x200x16': 62.1, 'L200x200x20': 76.5, 'L200x200x24': 90.4
            }
        };
    }

    _createComprehensiveSummary(steelData) {
        console.log('🔄 Creating comprehensive summary for AI analysis...');
        
        const summaryParts = [];
        
        // Main Members Summary
        if (steelData.mainMembers?.length > 0) {
            const mainList = steelData.mainMembers.map(m => `${m.quantity || 1}x ${m.designation}`).join(', ');
            summaryParts.push(`MAIN MEMBERS: ${mainList}`);
        }
        
        // Hollow Sections Summary
        if (steelData.hollowSections?.length > 0) {
            const hollowList = steelData.hollowSections.map(h => `${h.quantity || 1}x ${h.designation}`).join(', ');
            summaryParts.push(`HOLLOW SECTIONS: ${hollowList}`);
        }
        
        // Angles Summary
        if (steelData.angles?.length > 0) {
            const angleList = steelData.angles.map(a => `${a.quantity || 1}x ${a.designation}`).join(', ');
            summaryParts.push(`ANGLES: ${angleList}`);
        }
        
        // Purlins Summary
        if (steelData.purlins?.length > 0) {
            const purlinList = steelData.purlins.map(p => `${p.quantity || 1}x ${p.designation}`).join(', ');
            summaryParts.push(`PURLINS: ${purlinList}`);
        }
        
        // Plates Summary
        if (steelData.plates?.length > 0) {
            const plateList = steelData.plates.map(p => `${p.quantity || 1}x ${p.designation}`).join(', ');
            summaryParts.push(`PLATES & FITTINGS: ${plateList}`);
        }
        
        // Bars Summary
        if (steelData.bars?.length > 0) {
            const barList = steelData.bars.map(b => `${b.quantity || 1}x ${b.designation}`).join(', ');
            summaryParts.push(`BARS: ${barList}`);
        }
        
        // Connections Summary
        if (steelData.connections?.length > 0) {
            const connectionList = steelData.connections.map(c => `${c.quantity || 1}x ${c.designation}`).join(', ');
            summaryParts.push(`BOLTS: ${connectionList}`);
        }
        
        // Hardware Summary
        if (steelData.hardware?.length > 0) {
            const hardwareList = steelData.hardware.map(h => `${h.quantity || 1}x ${h.designation}`).join(', ');
            summaryParts.push(`HARDWARE: ${hardwareList}`);
        }
        
        const summary = summaryParts.length > 0 ? summaryParts.join('. ') : 'No steel components found';
        
        console.log('📊 Generated Summary:', summary.substring(0, 200) + '...');
        return summary;
    }

    async analyzeCompleteSteelProject(comprehensiveData, projectId) {
        try {
            console.log('🚀 Starting COMPREHENSIVE Australian Steel Analysis...');
            console.log('📋 Input Categories:', {
                mainMembers: comprehensiveData.mainMembers?.length || 0,
                hollowSections: comprehensiveData.hollowSections?.length || 0,
                angles: comprehensiveData.angles?.length || 0,
                purlins: comprehensiveData.purlins?.length || 0,
                plates: comprehensiveData.plates?.length || 0,
                bars: comprehensiveData.bars?.length || 0,
                connections: comprehensiveData.connections?.length || 0,
                hardware: comprehensiveData.hardware?.length || 0,
                miscellaneous: comprehensiveData.miscellaneous?.length || 0
            });

            const summary = this._createComprehensiveSummary(comprehensiveData);
            let quantityTakeoff = await this._performAustralianSteelAnalysis(summary, comprehensiveData);
            
            // Enhanced result validation
            const hasResults = this._validateAnalysisResults(quantityTakeoff);
            
            if (!hasResults.isValid) {
                console.log(`⚠️ AI analysis incomplete (${hasResults.reason}), using enhanced fallback...`);
                quantityTakeoff = this._calculateComprehensiveFallback(comprehensiveData);
            }
            
            const finalValidation = this._validateAnalysisResults(quantityTakeoff);
            console.log('✅ Final Analysis Results:', {
                totalWeight: this._getTotalWeight(quantityTakeoff),
                totalItems: this._getTotalItems(quantityTakeoff),
                categories: Object.keys(quantityTakeoff).filter(k => k !== 'summary' && quantityTakeoff[k]?.items?.length > 0)
            });

            return {
                projectId,
                confidence: finalValidation.isValid ? 0.9 : 0.7,
                quantityTakeoff: quantityTakeoff,
                riskAssessment: this._assessComprehensiveRisks(comprehensiveData),
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

    async _performAustralianSteelAnalysis(summary, originalData) {
        const prompt = `You are an expert Australian structural steel quantity surveyor specializing in AS/NZS standards. Analyze the provided steel data and generate a comprehensive quantity takeoff using exact Australian steel weights.

STEEL DATA: ${summary}

AUSTRALIAN STANDARDS COMPLIANCE:
- Use AS/NZS 3679.1 weights for UB, UC, PFC, Angles
- Use AS/NZS 1163 weights for SHS, RHS, CHS
- Use AS/NZS 4600 weights for C and Z purlins
- Use AS/NZS 3678 for plate weights (78.5 kg/m² per 10mm thickness)
- Default length: 6 meters if not specified

WEIGHT EXAMPLES:
- 250UB31.4 = 31.4 kg/m
- C200/15 = 11.2 kg/m  
- Z250/20 = 17.5 kg/m
- SHS 100x100x5.0 = 15.4 kg/m
- L100x100x10 = 19.0 kg/m
- 10mm plate = 78.5 kg/m²

CATEGORIZATION:
- main_members: UB, UC, PFC, T-sections, welded beams
- hollow_sections: SHS, RHS, CHS  
- angles: Equal and unequal angles (L sections)
- purlins: C-sections, Z-sections, top hats
- plates_fittings: All plates, stiffeners, base plates, cleats
- bars: Flat bars, round bars, square bars
- connections: All bolts and fasteners
- hardware: Washers, nuts, ancillary items

Return ONLY valid JSON with comprehensive Australian steel analysis:

{
  "main_members": {
    "items": [{"section": "250UB31.4", "quantity": 10, "total_length_m": 60, "weight_per_m": 31.4, "total_weight_kg": 1884}],
    "summary": {"total_weight_tonnes": 1.884, "member_count": 10}
  },
  "hollow_sections": {
    "items": [{"section": "SHS100x100x5.0", "quantity": 5, "total_length_m": 30, "weight_per_m": 15.4, "total_weight_kg": 462}],
    "summary": {"total_weight_tonnes": 0.462, "member_count": 5}
  },
  "angles": {
    "items": [{"section": "L100x100x10", "quantity": 8, "total_length_m": 48, "weight_per_m": 19.0, "total_weight_kg": 912}],
    "summary": {"total_weight_tonnes": 0.912, "member_count": 8}
  },
  "purlins": {
    "items": [{"section": "C200/15", "quantity": 20, "total_length_m": 120, "weight_per_m": 11.2, "total_weight_kg": 1344}],
    "summary": {"total_weight_tonnes": 1.344, "member_count": 20}
  },
  "plates_fittings": {
    "items": [{"section": "PL10", "quantity": 5, "area_m2": 1.5, "weight_per_m2": 78.5, "total_weight_kg": 588}],
    "summary": {"total_weight_tonnes": 0.588}
  },
  "bars": {
    "items": [],
    "summary": {"total_weight_tonnes": 0}
  },
  "connections": {
    "bolts": [{"size": "M20", "quantity": 50, "weight_kg": 0.4, "total_weight_kg": 20}],
    "summary": {"total_weight_tonnes": 0.02}
  },
  "hardware": {
    "items": [],
    "summary": {"total_weight_tonnes": 0}
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
            console.log('🤖 AI Response received, length:', responseText.length);
            console.log('📝 Response preview:', responseText.substring(0, 300) + '...');
            
            return this._parseAustralianJsonResponse(responseText, () => this._calculateComprehensiveFallback(originalData));
        } catch (error) {
            console.error(`❌ Australian steel analysis API error: ${error.message}`);
            return this._calculateComprehensiveFallback(originalData);
        }
    }

    _parseAustralianJsonResponse(text, fallbackFn) {
        try {
            // Enhanced JSON extraction
            let jsonString = text.trim();
            
            // Remove any markdown formatting
            jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Find the JSON object
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === 0) {
                console.log("❌ No JSON found in AI response");
                return fallbackFn();
            }
            
            jsonString = jsonString.substring(jsonStart, jsonEnd);
            
            // Clean up any formatting issues
            jsonString = jsonString
                .replace(/,\s*}/g, '}')  // Remove trailing commas
                .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays
            
            console.log('🔧 Parsing JSON string length:', jsonString.length);
            
            const parsed = JSON.parse(jsonString);
            
            // Validate structure
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Invalid JSON structure');
            }
            
            console.log('✅ Successfully parsed Australian steel JSON');
            return parsed;
            
        } catch (error) {
            console.error(`❌ JSON parsing failed: ${error.message}`);
            console.error('📋 Failed text sample:', text.substring(0, 500));
            return fallbackFn();
        }
    }

    _calculateComprehensiveFallback(data) {
        console.log('🔄 Calculating comprehensive Australian steel fallback...');
        
        const fallback = {
            main_members: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            hollow_sections: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            angles: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            purlins: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            plates_fittings: { items: [], summary: { total_weight_tonnes: 0 } },
            bars: { items: [], summary: { total_weight_tonnes: 0 } },
            connections: { bolts: [], summary: { total_weight_tonnes: 0 } },
            hardware: { items: [], summary: { total_weight_tonnes: 0 } }
        };

        // Process each category with Australian standards
        this._processCategoryFallback(data.mainMembers || [], fallback.main_members, 'main_members');
        this._processCategoryFallback(data.hollowSections || [], fallback.hollow_sections, 'hollow_sections');
        this._processCategoryFallback(data.angles || [], fallback.angles, 'angles');
        this._processCategoryFallback(data.purlins || [], fallback.purlins, 'purlins');
        this._processCategoryFallback(data.plates || [], fallback.plates_fittings, 'plates_fittings');
        this._processCategoryFallback(data.bars || [], fallback.bars, 'bars');
        this._processCategoryFallback(data.connections || [], fallback.connections, 'connections');
        this._processCategoryFallback(data.hardware || [], fallback.hardware, 'hardware');

        console.log('✅ Comprehensive fallback calculated:', {
            main_members: fallback.main_members.summary,
            hollow_sections: fallback.hollow_sections.summary,
            angles: fallback.angles.summary,
            purlins: fallback.purlins.summary,
            plates_fittings: fallback.plates_fittings.summary
        });

        return fallback;
    }

    _processCategoryFallback(items, targetCategory, categoryType) {
        if (!items || items.length === 0) return;

        items.forEach((item, index) => {
            const quantity = item.quantity || 1;
            const designation = item.designation;
            const weight = this._getAustralianWeight(designation, categoryType);
            const defaultLength = item.length || 6000; // 6m default in mm
            const lengthMeters = defaultLength / 1000;
            
            if (categoryType === 'plates_fittings') {
                // Handle plates differently (area-based)
                const area = this._estimatePlateArea(designation);
                const thickness = this._extractPlateThickness(designation);
                const weightPerM2 = 78.5 * (thickness / 10); // kg/m² for thickness
                const totalWeight = quantity * area * weightPerM2;
                
                targetCategory.items.push({
                    section: designation,
                    quantity: quantity,
                    area_m2: area,
                    thickness_mm: thickness,
                    weight_per_m2: weightPerM2,
                    total_weight_kg: totalWeight
                });
                
                targetCategory.summary.total_weight_tonnes += totalWeight / 1000;
                
            } else if (categoryType === 'connections') {
                // Handle bolts differently
                const boltWeight = this._getBoltWeight(designation);
                const totalWeight = quantity * boltWeight;
                
                targetCategory.bolts.push({
                    size: designation,
                    quantity: quantity,
                    weight_each_kg: boltWeight,
                    total_weight_kg: totalWeight
                });
                
                targetCategory.summary.total_weight_tonnes += totalWeight / 1000;
                
            } else {
                // Handle linear members (main members, purlins, angles, etc.)
                const totalLength = quantity * lengthMeters;
                const totalWeight = totalLength * weight;
                
                targetCategory.items.push({
                    section: designation,
                    quantity: quantity,
                    total_length_m: totalLength,
                    weight_per_m: weight,
                    total_weight_kg: totalWeight
                });
                
                targetCategory.summary.total_weight_tonnes += totalWeight / 1000;
                if (targetCategory.summary.member_count !== undefined) {
                    targetCategory.summary.member_count += quantity;
                }
            }
            
            console.log(`   ✅ ${categoryType}: ${designation} (${quantity}x) = ${(targetCategory.items[targetCategory.items.length - 1]?.total_weight_kg || 0).toFixed(1)}kg`);
        });
    }

    _getAustralianWeight(designation, categoryType) {
        const cleanDesignation = designation.toUpperCase().replace(/\s+/g, '');
        
        // Try exact match first
        if (categoryType === 'main_members') {
            // Check UB weights
            if (this.ausWeights.UB[cleanDesignation]) return this.ausWeights.UB[cleanDesignation];
            // Check UC weights
            if (this.ausWeights.UC[cleanDesignation]) return this.ausWeights.UC[cleanDesignation];
            // Check PFC weights
            if (this.ausWeights.PFC[cleanDesignation]) return this.ausWeights.PFC[cleanDesignation];
        }
        
        if (categoryType === 'hollow_sections') {
            if (this.ausWeights.SHS[cleanDesignation]) return this.ausWeights.SHS[cleanDesignation];
            if (this.ausWeights.RHS[cleanDesignation]) return this.ausWeights.RHS[cleanDesignation];
        }
        
        if (categoryType === 'angles') {
            if (this.ausWeights.ANGLES[cleanDesignation]) return this.ausWeights.ANGLES[cleanDesignation];
        }
        
        if (categoryType === 'purlins') {
            if (this.ausWeights.C_PURLINS[cleanDesignation]) return this.ausWeights.C_PURLINS[cleanDesignation];
            if (this.ausWeights.Z_PURLINS[cleanDesignation]) return this.ausWeights.Z_PURLINS[cleanDesignation];
        }
        
        // Try to extract weight from designation
        const weightMatch = designation.match(/([0-9]+(?:\.[0-9]+))$/);
        if (weightMatch) {
            const extractedWeight = parseFloat(weightMatch[1]);
            if (extractedWeight > 1 && extractedWeight < 500) {
                return extractedWeight;
            }
        }
        
        // Use intelligent defaults based on size and type
        return this._getIntelligentDefault(designation, categoryType);
    }

    _getIntelligentDefault(designation, categoryType) {
        const d = designation.toUpperCase();
        
        if (categoryType === 'main_members') {
            if (d.includes('150')) return 20;
            if (d.includes('200')) return 25;
            if (d.includes('250')) return 35;
            if (d.includes('300') || d.includes('310')) return 45;
            if (d.includes('360')) return 55;
            if (d.includes('400') || d.includes('410')) return 65;
            if (d.includes('460')) return 75;
            if (d.includes('530')) return 90;
            if (d.includes('610')) return 110;
            return 30; // Generic default
        }
        
        if (categoryType === 'purlins') {
            if (d.includes('100')) return 5;
            if (d.includes('125')) return 7;
            if (d.includes('150')) return 9;
            if (d.includes('200')) return 12;
            if (d.includes('250')) return 16;
            if (d.includes('300')) return 22;
            if (d.includes('350')) return 28;
            return 12; // Generic default
        }
        
        if (categoryType === 'hollow_sections') {
            // Extract dimensions for better estimate
            const dimMatch = d.match(/(\d{2,3})X(\d{2,3})X(\d{1,2}(?:\.\d)?)/);
            if (dimMatch) {
                const w = parseInt(dimMatch[1]);
                const h = parseInt(dimMatch[2]);
                const t = parseFloat(dimMatch[3]);
                // Rough formula for hollow section weight
                return Math.round(((w + h) * 2 * t * 0.00785) * 10) / 10;
            }
            return 15; // Generic default
        }
        
        if (categoryType === 'angles') {
            const angleMatch = d.match(/L(\d{2,3})X(\d{2,3})X(\d{1,2})/);
            if (angleMatch) {
                const leg1 = parseInt(angleMatch[1]);
                const leg2 = parseInt(angleMatch[2]);
                const thickness = parseInt(angleMatch[3]);
                // Rough formula for angle weight
                return Math.round(((leg1 + leg2) * thickness * 0.00785) * 10) / 10;
            }
            return 10; // Generic default
        }
        
        return 20; // Final fallback
    }

    _estimatePlateArea(designation) {
        // Try to extract dimensions from designation
        const dimMatch = designation.match(/(\d{2,4})X(\d{2,4})/);
        if (dimMatch) {
            const width = parseInt(dimMatch[1]) / 1000; // Convert mm to m
            const height = parseInt(dimMatch[2]) / 1000;
            return width * height;
        }
        
        // Default area estimates based on plate type
        if (designation.toUpperCase().includes('BASE')) return 0.5; // 0.5m² for base plates
        if (designation.toUpperCase().includes('STIFF')) return 0.2; // 0.2m² for stiffeners
        if (designation.toUpperCase().includes('SPLICE')) return 0.3; // 0.3m² for splice plates
        
        return 0.25; // Generic default
    }

    _extractPlateThickness(designation) {
        // Extract thickness from designation (e.g., "PL10" -> 10mm)
        const thickMatch = designation.match(/(?:PL|PLATE)?\s*(\d{1,3})/i);
        if (thickMatch) {
            const thickness = parseInt(thickMatch[1]);
            if (thickness >= 3 && thickness <= 100) {
                return thickness;
            }
        }
        return 10; // Default 10mm
    }

    _getBoltWeight(designation) {
        // Standard bolt weights (including nut and washer)
        const boltWeights = {
            'M12': 0.15, 'M16': 0.25, 'M20': 0.40, 'M24': 0.60, 'M30': 1.10, 'M36': 1.80
        };
        
        const sizeMatch = designation.match(/M(\d{1,2})/i);
        if (sizeMatch) {
            const size = `M${sizeMatch[1]}`;
            return boltWeights[size] || 0.30; // Default weight
        }
        
        return 0.30; // Generic bolt weight
    }

    _validateAnalysisResults(quantityTakeoff) {
        if (!quantityTakeoff || typeof quantityTakeoff !== 'object') {
            return { isValid: false, reason: 'Invalid structure' };
        }
        
        const categories = ['main_members', 'hollow_sections', 'angles', 'purlins', 'plates_fittings', 'bars', 'connections', 'hardware'];
        
        let hasData = false;
        let totalWeight = 0;
        
        categories.forEach(category => {
            const cat = quantityTakeoff[category];
            if (cat && cat.summary && cat.summary.total_weight_tonnes > 0) {
                hasData = true;
                totalWeight += cat.summary.total_weight_tonnes;
            }
        });
        
        if (!hasData) {
            return { isValid: false, reason: 'No data in any category' };
        }
        
        if (totalWeight === 0) {
            return { isValid: false, reason: 'Zero total weight' };
        }
        
        return { isValid: true, totalWeight: totalWeight };
    }

    _getTotalWeight(quantityTakeoff) {
        let total = 0;
        Object.values(quantityTakeoff).forEach(category => {
            if (category && category.summary && category.summary.total_weight_tonnes) {
                total += category.summary.total_weight_tonnes;
            }
        });
        return Math.round(total * 1000) / 1000; // Round to 3 decimal places
    }

    _getTotalItems(quantityTakeoff) {
        let total = 0;
        Object.values(quantityTakeoff).forEach(category => {
            if (category && category.items && Array.isArray(category.items)) {
                total += category.items.length;
            } else if (category && category.bolts && Array.isArray(category.bolts)) {
                total += category.bolts.length;
            }
        });
        return total;
    }

    _assessComprehensiveRisks(data) {
        const totalItems = Object.values(data).reduce((sum, category) => {
            return sum + (Array.isArray(category) ? category.length : 0);
        }, 0);
        
        const hasComplexMembers = (data.mainMembers?.length || 0) > 20;
        const hasMultipleTypes = Object.values(data).filter(category => 
            Array.isArray(category) && category.length > 0
        ).length;
        
        let complexityMultiplier = 1.05; // Base complexity
        
        if (totalItems > 100) complexityMultiplier += 0.10;
        if (hasComplexMembers) complexityMultiplier += 0.05;
        if (hasMultipleTypes >= 6) complexityMultiplier += 0.05;
        
        return {
            cost_factors: {
                complexity_multiplier: Math.round(complexityMultiplier * 100) / 100,
                data_confidence_factor: totalItems > 10 ? 0.95 : 0.85,
                project_size_factor: totalItems > 50 ? 'Large' : totalItems > 20 ? 'Medium' : 'Small'
            },
            recommendations: [
                totalItems > 100 ? 'Consider staged delivery due to large quantity' : null,
                hasMultipleTypes >= 6 ? 'Multiple steel types require careful coordination' : null,
                'Verify all dimensions and specifications before fabrication'
            ].filter(Boolean)
        };
    }

    _generateComprehensiveFallback(comprehensiveData, projectId) {
        console.log('🔄 Generating comprehensive fallback analysis...');
        
        return {
            projectId,
            confidence: 0.7,
            quantityTakeoff: this._calculateComprehensiveFallback(comprehensiveData),
            riskAssessment: this._assessComprehensiveRisks(comprehensiveData),
            standards: {
                compliance: 'AS/NZS 3679, AS/NZS 1163, AS/NZS 4600 (Fallback Mode)',
                weightSource: 'Australian Steel Institute Standards + Estimates'
            },
            fallbackMode: true
        };
    }
}
