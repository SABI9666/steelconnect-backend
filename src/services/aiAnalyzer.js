// services/aiAnalyzer.js
import Anthropic from '@anthropic-ai/sdk';

/**
 * Represents a structural element extracted from drawings
 */
class StructuralElement {
    constructor(elementType, material, dimensions, quantity, specifications, location, notes = '') {
        this.elementType = elementType;  // beam, column, slab, footing, etc.
        this.material = material;        // concrete, steel, timber
        this.dimensions = dimensions;    // length, width, height, thickness
        this.quantity = quantity;
        this.specifications = specifications;  // grade, reinforcement, etc.
        this.location = location;        // building level, grid reference
        this.notes = notes;
    }
}

/**
 * AI-powered analysis of structural drawings using Claude API
 */
class AIAnalyzer {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
        this.maxTokens = 4096;
        // Using the latest and most advanced Sonnet model.
        this.model = "claude-3-5-sonnet-20240620";
    }

    /**
     * Main analysis function that processes extracted drawing content
     * and returns structured data for cost estimation
     */
    async analyzeStructuralDrawings(extractedContent, projectId) {
        try {
            // Combine all extracted content
            const combinedContent = this._combineContent(extractedContent);

            // Perform multi-stage analysis
            const analysisResults = {
                projectId,
                drawingAnalysis: await this._analyzeDrawingContent(combinedContent),
                quantityTakeoff: await this._performQuantityTakeoff(combinedContent),
                specifications: await this._extractSpecifications(combinedContent),
                scopeIdentification: await this._identifyScope(combinedContent),
                riskAssessment: await this._assessRisks(combinedContent),
                assumptions: await this._generateAssumptions(combinedContent)
            };

            return analysisResults;

        } catch (error) {
            console.error(`AI analysis error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Combine text from multiple drawing files
     */
    _combineContent(extractedContent) {
        const combined = [];

        for (const content of extractedContent) {
            combined.push(`--- ${content.filename} ---`);
            combined.push(content.text);
            combined.push(`Tables: ${JSON.stringify(content.tables || [])}`);
            combined.push(`Metadata: ${JSON.stringify(content.metadata || {})}`);
            combined.push('---');
        }

        return combined.join('\n');
    }

    /**
     * Analyze drawing content to identify structural elements
     */
    async _analyzeDrawingContent(content) {
        const prompt = `
        You are an expert structural engineer analyzing construction drawings.
        Please analyze the following structural drawing content and extract key information.

        CONTENT TO ANALYZE:
        ${content.substring(0, 8000)}

        Please provide a detailed analysis in JSON format with the following structure:
        {
            "project_info": {
                "project_name": "extracted name",
                "location": "extracted location",
                "drawing_numbers": ["list of drawing numbers"],
                "revision": "latest revision",
                "date": "drawing date"
            },
            "structural_systems": {
                "foundation_type": "pad footings/strip footings/slab on ground/piles",
                "structural_system": "concrete frame/steel frame/masonry/timber",
                "floor_systems": ["slab types identified"],
                "roof_system": "roof structure type"
            },
            "concrete_elements": [
                {
                    "element_type": "slab/beam/column/footing",
                    "location": "ground floor/level 1/etc",
                    "dimensions": "length x width x thickness",
                    "concrete_grade": "N20/N25/N32/N40",
                    "reinforcement": "mesh type/bar sizes",
                    "quantity_estimate": "area or volume",
                    "notes": "any special requirements"
                }
            ],
            "steel_elements": [
                {
                    "element_type": "beam/column/brace/purlin",
                    "section_size": "150UB14/100SHS/etc",
                    "length": "estimated length",
                    "quantity": "number of members",
                    "connections": "bolted/welded",
                    "treatment": "galvanized/painted",
                    "notes": "special requirements"
                }
            ],
            "material_specifications": {
                "concrete_grades": ["N20", "N32", "N40"],
                "steel_grades": ["300", "350", "450"],
                "reinforcement_grades": ["D500N", "D500L"],
                "special_materials": []
            }
        }

        Focus on quantities, dimensions, materials, and specifications that would be needed for cost estimation.
        Be as specific as possible with dimensions and quantities.
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

            // Parse the response
            const analysisText = response.content[0].text;

            // Try to extract JSON from the response
            const jsonMatch = analysisText.match(/\{.*\}/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                // If no JSON found, return structured text analysis
                return { raw_analysis: analysisText };
            }

        } catch (error) {
            console.error(`Drawing analysis error: ${error.message}`);
            return {
                error: error.message,
                raw_content: content.substring(0, 1000)
            };
        }
    }

    /**
     * Perform detailed quantity takeoff from drawings
     */
    async _performQuantityTakeoff(content) {
        const prompt = `
        As a quantity surveyor, perform a detailed quantity takeoff from these structural drawings.

        DRAWING CONTENT:
        ${content.substring(0, 8000)}

        Please extract quantities in this JSON format:
        {
            "concrete_quantities": {
                "footings": {
                    "volume_m3": 0,
                    "formwork_m2": 0,
                    "details": []
                },
                "slabs": {
                    "area_m2": 0,
                    "volume_m3": 0,
                    "thickness_mm": 0,
                    "details": []
                },
                "beams": {
                    "volume_m3": 0,
                    "formwork_m2": 0,
                    "details": []
                },
                "columns": {
                    "volume_m3": 0,
                    "formwork_m2": 0,
                    "details": []
                }
            },
            "reinforcement_quantities": {
                "deformed_bars": {
                    "n12_kg": 0,
                    "n16_kg": 0,
                    "n20_kg": 0,
                    "n24_kg": 0
                },
                "mesh": {
                    "sl72_m2": 0,
                    "sl82_m2": 0,
                    "other_m2": 0
                }
            },
            "structural_steel": {
                "beams": [
                    {"section": "150UB14", "length_m": 0, "quantity": 0},
                    {"section": "200UB18", "length_m": 0, "quantity": 0}
                ],
                "columns": [
                    {"section": "100SHS5", "length_m": 0, "quantity": 0}
                ],
                "connections": {
                    "bolted_connections": 0,
                    "welded_connections": 0,
                    "base_plates": 0
                }
            },
            "miscellaneous": {
                "anchors": {
                    "mechanical_m12": 0,
                    "mechanical_m16": 0,
                    "chemical_anchors": 0
                },
                "formwork_area_m2": 0,
                "excavation_m3": 0,
                "backfill_m3": 0
            }
        }

        Be specific with quantities and provide realistic estimates based on the drawings.
        Look for schedules, dimensions, and repetitive elements to calculate quantities accurately.
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
            const jsonMatch = analysisText.match(/\{.*\}/s);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return {
                    error: "Could not extract quantities",
                    raw_response: analysisText
                };
            }

        } catch (error) {
            console.error(`Quantity takeoff error: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Extract material specifications and standards
     */
    async _extractSpecifications(content) {
        const prompt = `
        Extract all material specifications, standards, and technical requirements from these drawings:

        ${content.substring(0, 6000)}

        Return in JSON format:
        {
            "concrete_specs": {
                "grades": ["N32", "N40"],
                "slump": "120mm",
                "cover_requirements": {
                    "footings": "65mm all around",
                    "slabs_internal": "30mm top, 50mm edge",
                    "slabs_external": "45mm top, 50mm edge"
                },
                "curing_requirements": "7 days continuous",
                "testing_requirements": []
            },
            "steel_specs": {
                "structural_steel_grade": "Grade 300/350",
                "connection_category": "CC2",
                "corrosion_protection": "Hot dip galvanized",
                "bolt_grades": "Grade 8.8/S",
                "welding_standards": "AS/NZS 5131"
            },
            "reinforcement_specs": {
                "bar_grade": "D500N",
                "mesh_grade": "D500L",
                "lap_requirements": "manufacturer requirements",
                "cover_verification": "required"
            },
            "standards_referenced": [
                "AS 3600 - Concrete Structures",
                "AS 4100 - Steel Structures",
                "AS 4671 - Reinforcement"
            ],
            "special_requirements": [],
            "testing_inspection": []
        }
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
            const jsonMatch = analysisText.match(/\{.*\}/s);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return { raw_specifications: analysisText };
            }

        } catch (error) {
            console.error(`Specification extraction error: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Identify project scope and work packages
     */
    async _identifyScope(content) {
        const prompt = `
        Analyze the scope of structural work from these drawings:

        ${content.substring(0, 6000)}

        Identify work packages in JSON format:
        {
            "work_packages": [
                {
                    "package_name": "Foundations",
                    "description": "Excavation, pad footings, strip footings",
                    "complexity": "medium",
                    "estimated_duration_days": 15
                },
                {
                    "package_name": "Concrete Structure",
                    "description": "Slabs, beams, columns",
                    "complexity": "medium",
                    "estimated_duration_days": 25
                },
                {
                    "package_name": "Structural Steel",
                    "description": "Steel frame, connections, erection",
                    "complexity": "high",
                    "estimated_duration_days": 20
                }
            ],
            "project_complexity": "low/medium/high",
            "access_requirements": [],
            "special_equipment": [],
            "coordination_requirements": [],
            "critical_path_items": []
        }
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
            const jsonMatch = analysisText.match(/\{.*\}/s);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return { raw_scope: analysisText };
            }

        } catch (error) {
            console.error(`Scope identification error: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Assess project risks and factors affecting cost
     */
    async _assessRisks(content) {
        const prompt = `
        Assess risks and cost factors from these structural drawings:

        ${content.substring(0, 6000)}

        Provide risk assessment in JSON:
        {
            "technical_risks": [
                {
                    "risk": "Complex connections",
                    "probability": "medium",
                    "impact": "cost increase 5-10%",
                    "mitigation": "Detailed shop drawings"
                }
            ],
            "site_risks": [
                {
                    "risk": "Access constraints",
                    "probability": "unknown",
                    "impact": "potential delays",
                    "mitigation": "Site visit required"
                }
            ],
            "material_risks": [],
            "cost_factors": {
                "complexity_multiplier": 1.0,
                "access_factor": 1.0,
                "market_conditions": "stable",
                "project_size_factor": 1.0
            },
            "recommendations": []
        }
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
            const jsonMatch = analysisText.match(/\{.*\}/s);

            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                return { raw_assessment: analysisText };
            }

        } catch (error) {
            console.error(`Risk assessment error: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Generate list of assumptions for the estimate
     */
    async _generateAssumptions(content) {
        const prompt = `
        Based on these structural drawings, list key assumptions that should be made for cost estimation:

        ${content.substring(0, 4000)}

        Return as a simple list of assumption statements:
        - Ground conditions as per geotechnical report
        - Standard site access during working hours
        - Materials delivered to site boundary
        - No contaminated material encountered
        - Existing services locations as shown
        - Work completed during normal weather
        - etc.

        Focus on assumptions that affect cost and constructability.
        `;

        try {
            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 1500,
                messages: [{
                    role: "user",
                    content: prompt
                }]
            });

            const analysisText = response.content[0].text;

            // Extract list items
            const assumptions = [];
            const lines = analysisText.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
                    assumptions.push(trimmedLine.substring(1).trim());
                }
            }

            return assumptions.length > 0 ? assumptions : [analysisText];

        } catch (error) {
            console.error(`Assumptions generation error: ${error.message}`);
            return [`Error generating assumptions: ${error.message}`];
        }
    }

    /**
     * Update model based on user feedback (placeholder for learning mechanism)
     */
    async updateModelFeedback(feedbackData) {
        // This would implement a learning mechanism to improve estimates
        // based on feedback comparing actual vs estimated costs
        console.log(`Received feedback for project ${feedbackData.projectId}`);

        // For now, just log the feedback
        // In production, this would update model weights or training data
        return Promise.resolve();
    }

    /**
     * Estimate token count for text
     */
    getTokenCount(text) {
        // Rough approximation: 1 token ≈ 4 characters
        return Math.floor(text.length / 4);
    }
}

// UPDATED: Export the classes so they can be imported by other files.
export { AIAnalyzer, StructuralElement };
