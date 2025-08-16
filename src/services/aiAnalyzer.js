// Enhanced AI Analyzer with Robust JSON Parsing and Error Handling
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20240620";
    }

    _createSummaryForAI(data) {
        const mainMembers = data.mainMembers?.map(m => m.designation).join(', ') || 'None';
        const purlins = data.purlins?.map(p => p.designation).join(', ') || 'None';
        const plates = data.platesAndFittings?.map(p => `${p.quantity}x ${p.designation}`).join(', ') || 'None';
        const bolts = data.connections?.map(c => `${c.quantity}x ${c.size}`).join(', ') || 'None';

        return `Analyze structural data. Main Members: ${mainMembers}. Purlins: ${purlins}. Plates/Stiffeners: ${plates}. Bolts: ${bolts}.`;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            const summary = this._createSummaryForAI(structuredData);
            const quantityTakeoff = await this._performSteelQuantityTakeoff(summary, structuredData);
            
            // --- VALIDATION: If AI result is empty, ensure fallback is used ---
            const finalTakeoff = (quantityTakeoff.main_members?.items?.length > 0 || quantityTakeoff.purlins?.items?.length > 0)
                ? quantityTakeoff
                : this._calculateFallbackQuantities(structuredData);
            
            if (!finalTakeoff.main_members?.items?.length && !finalTakeoff.purlins?.items?.length) {
                console.warn('AI analysis and fallback both resulted in empty quantities.');
            }

            return {
                projectId,
                confidence: 0.85,
                quantityTakeoff: finalTakeoff,
                riskAssessment: this._assessProjectRisks(structuredData)
            };
        } catch (error) {
            console.error(`Steel AI analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    async _performSteelQuantityTakeoff(summary, originalData) {
        const prompt = `You are an expert Australian structural steel quantity surveyor. Your task is to analyze the provided steel member data and generate a detailed quantity takeoff.

        DATA: ${summary}
        
        RULES:
        1. Use standard Australian section weights (e.g., 250UB31.4 = 31.4 kg/m). If a weight is ambiguous (e.g., "250 UB"), use a common weight for that size.
        2. Assume a default length of 6 meters for any member if not specified.
        3. For plates and stiffeners, estimate a reasonable area (e.g., 0.3 m²) to calculate weight if dimensions are missing. A 10mm plate weighs 78.5 kg/m².
        4. Group items logically into 'main_members' (UB, UC, PFC, SHS, RHS, Angles), 'purlins' (C and Z sections), and 'plates_fittings' (plates, stiffeners, cleats).
        5. Return ONLY valid JSON with no extra text or explanations.
        
        {
          "main_members": { "items": [], "summary": { "total_weight_tonnes": 0, "member_count": 0 }},
          "purlins": { "items": [], "summary": { "total_weight_tonnes": 0, "member_count": 0 }},
          "plates_fittings": { "items": [], "summary": { "total_weight_tonnes": 0 }},
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
            console.log('AI Response received, length:', responseText.length);
            return this._parseJsonResponse(responseText, () => this._calculateFallbackQuantities(originalData));
        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return this._calculateFallbackQuantities(originalData);
        }
    }

    _parseJsonResponse(text, fallbackFn) {
        try {
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            if (!jsonString) return fallbackFn();
            return JSON.parse(jsonString);
        } catch (error) {
            console.error(`JSON parsing failed: ${error.message}. Using fallback.`);
            return fallbackFn();
        }
    }

    _calculateFallbackQuantities(data) {
        console.log('Calculating steel-only fallback quantities...');
        const fallback = {
            main_members: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            purlins: { items: [], summary: { total_weight_tonnes: 0, member_count: 0 } },
            plates_fittings: { items: [], summary: { total_weight_tonnes: 0 } },
            connections: { bolts: [] }
        };
        const defaultWeightPerM = 30; // Average kg/m for fallback

        // --- FIX: Calculate fallback using the new 'mainMembers' and 'purlins' data structure ---
        (data.mainMembers || []).forEach(item => {
            const quantity = item.quantity || 1;
            const totalWeightKg = quantity * 6 * defaultWeightPerM;
            fallback.main_members.items.push({ section: item.designation, quantity: quantity, total_length_m: quantity * 6, total_weight_kg: totalWeightKg });
            fallback.main_members.summary.total_weight_tonnes += totalWeightKg / 1000;
            fallback.main_members.summary.member_count += quantity;
        });
        
        (data.purlins || []).forEach(item => {
            const quantity = item.quantity || 1;
            const totalWeightKg = quantity * 6 * 5; // Lighter weight for purlins
            fallback.purlins.items.push({ section: item.designation, quantity: quantity, total_length_m: quantity * 6, total_weight_kg: totalWeightKg });
            fallback.purlins.summary.total_weight_tonnes += totalWeightKg / 1000;
            fallback.purlins.summary.member_count += quantity;
        });

        console.log('Fallback quantities calculated:', {
            main_members: fallback.main_members.summary,
            purlins: fallback.purlins.summary
        });
        return fallback;
    }

    _assessProjectRisks(data) {
        const memberCount = (data.mainMembers?.length || 0) + (data.purlins?.length || 0);
        return {
            cost_factors: {
                complexity_multiplier: memberCount > 75 ? 1.15 : 1.05,
                data_confidence_factor: 0.9
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
