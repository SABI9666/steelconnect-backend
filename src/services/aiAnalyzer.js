// Enhanced AI Analyzer with Robust JSON Parsing and Error Handling
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20240620";
    }

    _createSummaryForAI(data) {
        // FIX: Improved summary creation with better data extraction
        const mainMembers = data.mainMembers?.map(m => `${m.quantity || 1}x ${m.designation}`).join(', ') || 'None';
        const purlins = data.purlins?.map(p => `${p.quantity || 1}x ${p.designation}`).join(', ') || 'None';
        const plates = data.platesAndFittings?.map(p => `${p.quantity || 1}x ${p.designation}`).join(', ') || 'None';
        const bolts = data.connections?.map(c => `${c.quantity || 1}x ${c.designation}`).join(', ') || 'None';

        console.log('📊 Data Summary for AI:');
        console.log(`  Main Members: ${mainMembers}`);
        console.log(`  Purlins: ${purlins}`);
        console.log(`  Plates/Fittings: ${plates}`);
        console.log(`  Bolts: ${bolts}`);

        return `Analyze structural data. Main Members: ${mainMembers}. Purlins: ${purlins}. Plates/Stiffeners: ${plates}. Bolts: ${bolts}.`;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            console.log('📋 Input data structure:', {
                mainMembers: structuredData.mainMembers?.length || 0,
                purlins: structuredData.purlins?.length || 0,
                platesAndFittings: structuredData.platesAndFittings?.length || 0,
                connections: structuredData.connections?.length || 0
            });

            const summary = this._createSummaryForAI(structuredData);
            let quantityTakeoff = await this._performSteelQuantityTakeoff(summary, structuredData);
            
            // FIX: Better check for AI results
            const hasMainMembers = quantityTakeoff.main_members?.items?.length > 0;
            const hasPurlins = quantityTakeoff.purlins?.items?.length > 0;
            const hasPlates = quantityTakeoff.plates_fittings?.items?.length > 0;
            
            console.log('🔍 AI Analysis Results Check:', {
                hasMainMembers,
                hasPurlins,
                hasPlates,
                mainMemberWeight: quantityTakeoff.main_members?.summary?.total_weight_tonnes || 0,
                purlinWeight: quantityTakeoff.purlins?.summary?.total_weight_tonnes || 0
            });

            // If AI result is completely empty, use fallback
            if (!hasMainMembers && !hasPurlins && !hasPlates) {
                console.log("⚠️  AI result was empty, using fallback calculation.");
                quantityTakeoff = this._calculateFallbackQuantities(structuredData);
            }
            
            // Final check
            const finalMainWeight = quantityTakeoff.main_members?.summary?.total_weight_tonnes || 0;
            const finalPurlinWeight = quantityTakeoff.purlins?.summary?.total_weight_tonnes || 0;
            
            if (finalMainWeight === 0 && finalPurlinWeight === 0) {
                console.warn('⚠️  Both AI analysis and fallback resulted in zero quantities. Check input data format.');
                console.warn('📊 Original data sample:', JSON.stringify(structuredData, null, 2));
            }

            return {
                projectId,
                confidence: (finalMainWeight > 0 || finalPurlinWeight > 0) ? 0.85 : 0.3,
                quantityTakeoff: quantityTakeoff,
                riskAssessment: this._assessProjectRisks(structuredData)
            };
        } catch (error) {
            console.error(`❌ Steel AI analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    async _performSteelQuantityTakeoff(summary, originalData) {
        const prompt = `You are an expert Australian structural steel quantity surveyor. Your task is to analyze the provided steel member data and generate a detailed quantity takeoff.

        DATA: ${summary}
        
        RULES:
        1. Use standard Australian section weights (e.g., 250UB31.4 = 31.4 kg/m, C200/15 = 15 kg/m). 
        2. If weight is ambiguous, use reasonable defaults: UB=30kg/m, UC=35kg/m, C-sections=15kg/m, Z-sections=12kg/m
        3. Assume 6 meter default length for any member if not specified.
        4. For plates, estimate 0.3m² area and use 78.5 kg/m² for 10mm plate.
        5. Group items: 'main_members' (UB, UC, PFC, SHS, RHS, Angles), 'purlins' (C and Z sections), 'plates_fittings' (plates, stiffeners).
        6. Return ONLY valid JSON with no extra text or explanations.
        
        {
          "main_members": { 
            "items": [{"section": "250UB31.4", "quantity": 10, "total_length_m": 60, "total_weight_kg": 1884}], 
            "summary": { "total_weight_tonnes": 1.884, "member_count": 10 }
          },
          "purlins": { 
            "items": [{"section": "C200/15", "quantity": 20, "total_length_m": 120, "total_weight_kg": 1800}], 
            "summary": { "total_weight_tonnes": 1.8, "member_count": 20 }
          },
          "plates_fittings": { 
            "items": [], 
            "summary": { "total_weight_tonnes": 0 }
          },
          "connections": { "bolts": [] }
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
            console.log('📝 AI Response preview:', responseText.substring(0, 200) + '...');
            
            return this._parseJsonResponse(responseText, () => this._calculateFallbackQuantities(originalData));
        } catch (error) {
            console.error(`❌ Quantity takeoff API error: ${error.message}`);
            return this._calculateFallbackQuantities(originalData);
        }
    }

    _parseJsonResponse(text, fallbackFn) {
        try {
            // Clean up the response text
            let jsonString = text.trim();
            
            // Find JSON object boundaries
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}') + 1;
            
            if (jsonStart === -1 || jsonEnd === 0) {
                console.log("❌ No JSON object found in AI response, using fallback.");
                return fallbackFn();
            }
            
            jsonString = jsonString.substring(jsonStart, jsonEnd);
            console.log('🔧 Extracted JSON string length:', jsonString.length);
            
            const parsed = JSON.parse(jsonString);
            console.log('✅ Successfully parsed AI JSON response');
            
            return parsed;
        } catch (error) {
            console.error(`❌ JSON parsing failed: ${error.message}`);
            console.error('📋 Failed text sample:', text.substring(0, 300));
            return fallbackFn();
        }
    }

    _calculateFallbackQuantities(data) {
        console.log('🔄 Calculating fallback quantities...');
        console.log('📊 Input data for fallback:', {
            mainMembers: data.mainMembers?.length || 0,
            purlins: data.purlins?.length || 0,
            platesAndFittings: data.platesAndFittings?.length || 0
        });

        const fallback = {
            main_members: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            purlins: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            plates_fittings: { items: [], summary: { total_weight_tonnes: 0 } },
            connections: { bolts: [] }
        };

        // Process Main Members
        (data.mainMembers || []).forEach((item, index) => {
            const quantity = item.quantity || 1;
            const weightPerMeter = this._getDefaultWeight(item.designation, 'main');
            const lengthPerMember = 6; // Default 6m
            const totalLength = quantity * lengthPerMember;
            const totalWeightKg = totalLength * weightPerMeter;
            
            console.log(`🔧 Main Member ${index + 1}: ${item.designation}, Qty: ${quantity}, Weight: ${totalWeightKg}kg`);
            
            fallback.main_members.items.push({
                section: item.designation,
                quantity: quantity,
                total_length_m: totalLength,
                total_weight_kg: totalWeightKg
            });
            
            fallback.main_members.summary.total_weight_tonnes += totalWeightKg / 1000;
            fallback.main_members.summary.member_count += quantity;
        });
        
        // Process Purlins
        (data.purlins || []).forEach((item, index) => {
            const quantity = item.quantity || 1;
            const weightPerMeter = this._getDefaultWeight(item.designation, 'purlin');
            const lengthPerMember = 6; // Default 6m
            const totalLength = quantity * lengthPerMember;
            const totalWeightKg = totalLength * weightPerMeter;
            
            console.log(`🔧 Purlin ${index + 1}: ${item.designation}, Qty: ${quantity}, Weight: ${totalWeightKg}kg`);
            
            fallback.purlins.items.push({
                section: item.designation,
                quantity: quantity,
                total_length_m: totalLength,
                total_weight_kg: totalWeightKg
            });
            
            fallback.purlins.summary.total_weight_tonnes += totalWeightKg / 1000;
            fallback.purlins.summary.member_count += quantity;
        });

        // Process Plates and Fittings
        (data.platesAndFittings || []).forEach((item, index) => {
            const quantity = item.quantity || 1;
            const weightKg = quantity * 50; // Estimate 50kg per plate/fitting
            
            console.log(`🔧 Plate/Fitting ${index + 1}: ${item.designation}, Qty: ${quantity}, Weight: ${weightKg}kg`);
            
            fallback.plates_fittings.items.push({
                section: item.designation,
                quantity: quantity,
                total_weight_kg: weightKg
            });
            
            fallback.plates_fittings.summary.total_weight_tonnes += weightKg / 1000;
        });

        // Process Connections
        (data.connections || []).forEach(item => {
            fallback.connections.bolts.push({
                size: item.designation,
                quantity: item.quantity || 1
            });
        });

        console.log('✅ Fallback quantities calculated:', {
            main_members: fallback.main_members.summary,
            purlins: fallback.purlins.summary,
            plates_fittings: fallback.plates_fittings.summary
        });

        return fallback;
    }

    _getDefaultWeight(designation, type) {
        // Extract weight from designation if possible
        const designation_upper = designation.toUpperCase();
        
        // Try to extract weight from designation (e.g., "250UB31.4" -> 31.4)
        const weightMatch = designation_upper.match(/([0-9]+(?:\.[0-9]+)?)(?:\s*KG\/M)?$/);
        if (weightMatch) {
            const extractedWeight = parseFloat(weightMatch[1]);
            if (extractedWeight > 5 && extractedWeight < 500) { // Reasonable weight range
                return extractedWeight;
            }
        }
        
        // Use defaults based on type and size
        if (type === 'purlin') {
            if (designation_upper.includes('C') || designation_upper.includes('Z')) {
                return 15; // kg/m for C/Z sections
            }
        }
        
        // Default weights for main members
        if (designation_upper.includes('UB')) return 30;
        if (designation_upper.includes('UC')) return 35;
        if (designation_upper.includes('PFC')) return 25;
        if (designation_upper.includes('SHS') || designation_upper.includes('RHS')) return 20;
        if (designation_upper.includes('L') || designation_upper.includes('ANGLE')) return 15;
        
        return 25; // Generic default
    }

    _assessProjectRisks(data) {
        const memberCount = (data.mainMembers?.length || 0) + (data.purlins?.length || 0);
        return {
            cost_factors: {
                complexity_multiplier: memberCount > 75 ? 1.15 : 1.05,
                data_confidence_factor: memberCount > 0 ? 0.9 : 0.5
            }
        };
    }
    
    _generateFallbackAnalysis(structuredData, projectId) {
        return {
            projectId,
            confidence: 0.6,
            quantityTakeoff: this._calculateFallbackQuantities(structuredData),
            riskAssessment: this._assessProjectRisks(structuredData)
        };
    }
}
