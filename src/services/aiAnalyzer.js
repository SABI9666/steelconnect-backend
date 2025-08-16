/ Enhanced AI Analyzer with Robust JSON Parsing and Error Handling
import Anthropic from '@anthropic-ai/sdk';

export class EnhancedAIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4000;
        this.model = "claude-3-5-sonnet-20240620";
    }

    _createSummaryForAI(data) {
        const memberSummary = data.steel_schedules?.map(item => item.designation).join(', ') || 'No members';
        const plateSummary = data.plates?.map(p => `${p.quantity}x PL ${p.thickness}`).join(', ') || 'No plates';
        const purlinSummary = data.purlins?.map(p => p.designation).join(', ') || 'No purlins';
        const boltSummary = data.connections?.map(c => `${c.quantity}x ${c.size}`).join(', ') || 'No bolts';
        
        return `Analyze structural data. Steel Members: ${memberSummary}. Plates/Stiffeners: ${plateSummary}. Purlins: ${purlinSummary}. Bolts: ${boltSummary}. Confidence: ${(data.confidence * 100).toFixed(0)}%.`;
    }

    async analyzeStructuralDrawings(structuredData, projectId) {
        try {
            console.log('Starting enhanced AI analysis...');
            const summary = this._createSummaryForAI(structuredData);
            const quantityTakeoff = await this._performIntelligentQuantityTakeoff(summary, structuredData);
            
            return {
                projectId,
                confidence: structuredData.confidence || 0,
                quantityTakeoff,
                riskAssessment: this._assessProjectRisks(structuredData)
            };
        } catch (error) {
            console.error(`Enhanced AI analysis error: ${error.message}`);
            return this._generateFallbackAnalysis(structuredData, projectId);
        }
    }

    async _performIntelligentQuantityTakeoff(summary, originalData) {
        // --- NEW: Enhanced prompt to include plates, purlins, and bolts ---
        const prompt = `You are a structural steel quantity surveyor. From the provided data summary, generate a detailed quantity takeoff in JSON format.
DATA: ${summary}

Rules:
1. Use standard Australian steel weights.
2. Assume a 6m length for members if not specified. For plates, estimate a reasonable area (e.g., 0.5 m²) if not detailed.
3. For stiffeners, assume they are plates and categorize them as such.
4. Return ONLY valid JSON.

{
  "steel_quantities": { "members": [{ "section": "250 UB 31.4", "total_length_m": 6, "total_weight_kg": 188.4, "quantity": 1 }], "summary": { "total_steel_weight_tonnes": 0.188 }},
  "purlin_quantities": { "members": [{ "section": "Z20019", "total_length_m": 12, "total_weight_kg": 28.56, "quantity": 2 }], "summary": { "total_purlin_weight_tonnes": 0.028 }},
  "plate_quantities": { "items": [{ "description": "10mm Stiffener Plate", "area_m2": 0.5, "thickness_mm": 10, "total_weight_kg": 39.25, "quantity": 1 }], "summary": { "total_plate_weight_tonnes": 0.039 }},
  "miscellaneous": { "anchors": { "m16_chemical": 20 }, "bolts": { "m20_bolts": 150 } }
}`;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: this.maxTokens,
                messages: [{ role: "user", content: prompt }]
            });
            const responseText = response.content[0]?.text || '';
            return this._parseJsonResponse(responseText, () => this._calculateFallbackQuantities(originalData));
        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return this._calculateFallbackQuantities(originalData);
        }
    }

    _parseJsonResponse(text, fallbackFn) {
        try {
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error(`JSON parsing failed: ${error.message}. Using fallback.`);
            return fallbackFn();
        }
    }
    
    // --- Fallback logic can be simplified or enhanced as needed ---
    _calculateFallbackQuantities(data) {
        // This is a simplified fallback. A more robust version would perform calculations.
        console.log('Calculating fallback quantities...');
        return {
            steel_quantities: { members: [], summary: { total_steel_weight_tonnes: 0 }},
            purlin_quantities: { members: [], summary: { total_purlin_weight_tonnes: 0 }},
            plate_quantities: { items: [], summary: { total_plate_weight_tonnes: 0 }},
            miscellaneous: { bolts: {} }
        };
    }

    _assessProjectRisks(data) {
        const memberCount = (data.steel_schedules?.length || 0) + (data.purlins?.length || 0);
        return {
            cost_factors: {
                complexity_multiplier: memberCount > 75 ? 1.15 : 1.05,
                data_confidence_factor: Math.max(0.9, data.confidence || 0.5)
            }
        };
    }
    
    _generateFallbackAnalysis(structuredData, projectId) {
        return {
            projectId,
            confidence: structuredData.confidence || 0.5,
            quantityTakeoff: this._calculateFallbackQuantities(structuredData),
            riskAssessment: this._assessProjectRisks(structuredData)
        };
    }
}
