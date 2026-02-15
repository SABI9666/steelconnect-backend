// src/services/aiEstimationService.js - AI-Powered Construction Cost Estimation Engine
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const SYSTEM_PROMPT = `You are the world's most experienced and precise construction cost estimator with 40+ years of expertise across ALL construction trades globally. You produce institutional-grade cost estimates that match or exceed the quality of top firms like Turner & Townsend, Rider Levett Bucknall, and AECOM.

CRITICAL RULES:
1. Always provide costs in the user's specified currency and region
2. Use current market rates for the specified region
3. Break down EVERY trade with line items, quantities, unit costs, and totals
4. Include labor, material, equipment, and overhead for each trade
5. Apply regional cost indices and market adjustments
6. Include contingency, escalation, overhead & profit
7. Provide both detailed and summary views
8. Flag assumptions and exclusions clearly
9. Use industry-standard CSI MasterFormat divisions where applicable
10. All numbers must be realistic and defensible

You must respond ONLY in valid JSON format. No markdown, no explanation outside JSON.`;

export async function generateSmartQuestions(projectInfo) {
    try {
        const prompt = `Based on this project information, generate targeted follow-up questions needed to produce an accurate construction cost estimate.

PROJECT INFO:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Files uploaded: ${projectInfo.fileCount} files (${projectInfo.fileNames?.join(', ') || 'N/A'})

Generate 8-12 critical questions grouped into categories. Each question should have options where applicable to make it easy for the user.

Respond in this exact JSON format:
{
    "questionGroups": [
        {
            "groupTitle": "Project Basics",
            "groupIcon": "fa-building",
            "questions": [
                {
                    "id": "q1",
                    "question": "What is the project type?",
                    "type": "select",
                    "required": true,
                    "options": ["Commercial Office", "Residential", "Industrial", "Retail", "Healthcare", "Educational", "Mixed-Use", "Other"],
                    "helpText": "This determines applicable building codes and cost standards"
                },
                {
                    "id": "q2",
                    "question": "What is the total project area?",
                    "type": "input",
                    "inputType": "text",
                    "required": true,
                    "placeholder": "e.g., 50,000 sq ft or 4,645 sq m",
                    "helpText": "Total gross floor area including all levels"
                }
            ]
        }
    ]
}

Question types allowed: "select" (dropdown with options), "input" (text/number field), "multiselect" (multiple choice), "textarea" (long text).

Focus questions on:
1. Project type, size, and location/region
2. Structure type (steel frame, concrete, wood, etc.)
3. Number of floors/levels
4. Quality/finish level (economy, standard, premium, luxury)
5. Specific trades needed (structural steel, rebar, MEP, finishes, etc.)
6. Timeline and phasing
7. Site conditions (new construction, renovation, demolition needed?)
8. Special requirements (seismic zone, environmental, LEED certification, etc.)
9. Currency and region for pricing

Make questions specific to what was described in the project info.`;

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = response.content[0].text;
        // Parse JSON from response, handling potential markdown wrapping
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating questions:', error);
        return getDefaultQuestions();
    }
}

export async function generateAIEstimate(projectInfo, answers, fileNames) {
    try {
        const prompt = `Generate a COMPREHENSIVE, WORLD-CLASS construction cost estimate based on the following project information and questionnaire answers.

PROJECT INFORMATION:
- Title: ${projectInfo.projectTitle}
- Description: ${projectInfo.description}
- Files: ${fileNames?.join(', ') || 'N/A'}

QUESTIONNAIRE ANSWERS:
${JSON.stringify(answers, null, 2)}

Produce a COMPLETE detailed cost estimate. Respond in this exact JSON format:

{
    "summary": {
        "projectTitle": "string",
        "projectType": "string",
        "location": "string",
        "currency": "string (e.g., USD, INR, AED, GBP)",
        "currencySymbol": "string (e.g., $, ₹, د.إ, £)",
        "totalArea": "string",
        "estimateDate": "string (today's date)",
        "confidenceLevel": "string (Low/Medium/High)",
        "estimateClass": "string (Class 1-5 per AACE)",
        "grandTotal": number,
        "costPerUnit": number,
        "unitLabel": "string (per sq ft / per sq m)"
    },
    "trades": [
        {
            "division": "string (CSI Division number)",
            "tradeName": "string (e.g., Structural Steel, Concrete, etc.)",
            "tradeIcon": "string (fa icon class)",
            "subtotal": number,
            "percentOfTotal": number,
            "lineItems": [
                {
                    "description": "string",
                    "quantity": number,
                    "unit": "string (tons, cy, sf, lf, ea, etc.)",
                    "materialCost": number,
                    "laborCost": number,
                    "equipmentCost": number,
                    "unitTotal": number,
                    "lineTotal": number
                }
            ]
        }
    ],
    "costBreakdown": {
        "directCosts": number,
        "generalConditions": number,
        "generalConditionsPercent": number,
        "overhead": number,
        "overheadPercent": number,
        "profit": number,
        "profitPercent": number,
        "contingency": number,
        "contingencyPercent": number,
        "escalation": number,
        "escalationPercent": number,
        "totalWithMarkups": number
    },
    "tradesSummary": [
        {
            "tradeName": "string",
            "amount": number,
            "percentage": number
        }
    ],
    "assumptions": ["string array of key assumptions made"],
    "exclusions": ["string array of items NOT included"],
    "notes": ["string array of important notes"],
    "marketInsights": {
        "regionalFactor": "string (description of regional pricing adjustments)",
        "materialTrends": "string (current material market trends)",
        "laborMarket": "string (current labor availability/rates)"
    }
}

IMPORTANT:
- Include ALL relevant trades for this project type (minimum 8-15 trades)
- Every trade must have detailed line items
- Use current ${new Date().getFullYear()} market rates for the specified region
- All numbers must be realistic and consistent
- Grand total must equal sum of all trades + markups
- Include: Site Work, Concrete/Foundations, Structural (Steel/Rebar), Exterior Envelope, Roofing, Interior Finishes, MEP (Mechanical/Electrical/Plumbing), Fire Protection, Elevators (if applicable), Specialties, General Conditions, etc.`;

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }]
        });

        const text = response.content[0].text;
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating estimate:', error);
        throw new Error('Failed to generate AI estimate. Please try again.');
    }
}

function getDefaultQuestions() {
    return {
        questionGroups: [
            {
                groupTitle: 'Project Basics',
                groupIcon: 'fa-building',
                questions: [
                    { id: 'projectType', question: 'What is the project type?', type: 'select', required: true, options: ['Commercial Office', 'Residential - Single Family', 'Residential - Multi Family', 'Industrial / Warehouse', 'Retail', 'Healthcare', 'Educational', 'Hospitality', 'Mixed-Use', 'Infrastructure', 'Other'], helpText: 'Primary building/project classification' },
                    { id: 'totalArea', question: 'What is the total project area?', type: 'input', inputType: 'text', required: true, placeholder: 'e.g., 50,000 sq ft', helpText: 'Total gross floor area' },
                    { id: 'floors', question: 'Number of floors/levels?', type: 'select', required: true, options: ['1', '2-3', '4-6', '7-10', '11-20', '20+', 'N/A'], helpText: 'Including basement levels' },
                    { id: 'constructionType', question: 'Type of construction?', type: 'select', required: true, options: ['New Construction', 'Renovation / Remodel', 'Addition', 'Tenant Improvement', 'Demolition & Rebuild'], helpText: 'Nature of the construction work' }
                ]
            },
            {
                groupTitle: 'Structure & Materials',
                groupIcon: 'fa-hard-hat',
                questions: [
                    { id: 'structuralSystem', question: 'Primary structural system?', type: 'select', required: true, options: ['Structural Steel Frame', 'Reinforced Concrete', 'Pre-engineered Metal Building', 'Wood Frame', 'Masonry / CMU', 'Hybrid (Steel + Concrete)', 'Other'], helpText: 'Main structural framing system' },
                    { id: 'qualityLevel', question: 'Quality / finish level?', type: 'select', required: true, options: ['Economy / Basic', 'Standard / Average', 'Above Average', 'Premium / High-End', 'Luxury / Custom'], helpText: 'Overall quality tier affects material and finish selections' },
                    { id: 'tradesNeeded', question: 'Which trades are needed?', type: 'multiselect', required: false, options: ['Structural Steel', 'Rebar / Reinforcing', 'Concrete', 'Masonry', 'Roofing', 'Exterior Cladding', 'Windows & Glazing', 'Interior Framing & Drywall', 'Flooring', 'Painting', 'Mechanical (HVAC)', 'Electrical', 'Plumbing', 'Fire Protection', 'Elevators', 'Site Work', 'Landscaping'], helpText: 'Select all applicable trades' }
                ]
            },
            {
                groupTitle: 'Location & Budget',
                groupIcon: 'fa-map-marker-alt',
                questions: [
                    { id: 'region', question: 'Project location / region?', type: 'input', inputType: 'text', required: true, placeholder: 'e.g., Dallas, TX, USA or Mumbai, India', helpText: 'City, State/Province, Country for regional pricing' },
                    { id: 'currency', question: 'Preferred currency?', type: 'select', required: true, options: ['USD ($)', 'INR (₹)', 'AED (د.إ)', 'GBP (£)', 'EUR (€)', 'CAD (C$)', 'AUD (A$)', 'SAR (﷼)', 'Other'], helpText: 'Currency for the estimate' },
                    { id: 'timeline', question: 'Expected project timeline?', type: 'select', required: false, options: ['Less than 6 months', '6-12 months', '1-2 years', '2-3 years', '3+ years'], helpText: 'Affects escalation and phasing costs' },
                    { id: 'specialRequirements', question: 'Any special requirements?', type: 'textarea', required: false, placeholder: 'e.g., Seismic Zone 4, LEED Gold certification, clean room specs, blast resistant...', helpText: 'Special codes, certifications, or requirements' }
                ]
            }
        ]
    };
}

export default { generateSmartQuestions, generateAIEstimate, getDefaultQuestions };
