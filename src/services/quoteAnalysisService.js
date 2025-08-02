import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import { query } from '../db/sql.js'; // Your SQL connection

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Performs AI analysis and saves the result to the SQL Server database.
 */
export async function performAndSaveAnalysis(quote, job, userId) {
    const systemPrompt = `You are an expert construction project analyst. Your response must be a valid JSON object with this structure: { "confidence": number, "recommendation": "string", "summary": "string", "costAnalysis": { "score": number, "budgetFit": "string", "marketComparison": "string", "valueAssessment": "string", "redFlags": ["string"] }, "timelineAnalysis": { "score": number, "realistic": "string", "deadlineComparison": "string", "industryComparison": "string", "concerns": ["string"] }, "technicalAnalysis": { "score": number, "approachQuality": "string", "completeness": "string", "expertiseLevel": "string", "strengths": ["string"] }, "riskAnalysis": { "level": "string", "overall": "string", "factors": ["string"], "mitigation": "string" }, "recommendations": [{ "type": "string", "title": "string", "description": "string", "action": "string" }], "questionsToAsk": ["string"] }.`;
    const userPrompt = `Analyze this quote based on the project details. Project Title: ${job.title}. Project Budget: ${job.budget}. Quote Amount: ${quote.quoteAmount}. Proposed Timeline: ${quote.timeline} days. Proposal Description: ${quote.description}.`;

    let analysis;
    try {
        const response = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            response_format: { type: "json_object" },
        });
        analysis = JSON.parse(response.choices[0].message.content);
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        throw new Error("Failed to get analysis from AI service.");
    }

    try {
        const sql = `
            INSERT INTO quote_analyses (id, quote_id, job_id, analyzer_user_id, analysis_data, confidence_score, recommendation)
            VALUES (NEWID(), @quote_id, @job_id, @analyzer_user_id, @analysis_data, @confidence_score, @recommendation);
        `;
        await query(sql, {
            quote_id: quote.id,
            job_id: job.id,
            analyzer_user_id: userId,
            analysis_data: JSON.stringify(analysis),
            confidence_score: analysis.confidence,
            recommendation: analysis.recommendation
        });
        console.log(`✅ Analysis for quote ${quote.id} saved to SQL Server.`);
    } catch (dbError) {
        console.error("❌ Failed to save analysis to SQL Server:", dbError);
    }
    
    return analysis;
}

/**
 * Fetches a saved analysis result from the SQL database.
 */
export async function getAnalysisByQuoteId(quoteId) {
    const sql = `SELECT * FROM quote_analyses WHERE quote_id = @quote_id`;
    const result = await query(sql, { quote_id: quoteId });
    if (result.recordset.length === 0) {
        return null;
    }
    const analysisRecord = result.recordset[0];
    analysisRecord.analysis_data = JSON.parse(analysisRecord.analysis_data);
    return analysisRecord;
}

/**
 * Generates a PDF report from analysis data.
 */
export function generateAnalysisPDF(analysisData, quote, job) {
    const { analysis_data: analysis } = analysisData;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            resolve(Buffer.concat(buffers));
        });

        const addSection = (title, contentFn) => {
            doc.fontSize(16).font('Helvetica-Bold').text(title, { underline: true }).moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            contentFn();
            doc.moveDown(2);
        };

        doc.fontSize(20).font('Helvetica-Bold').text('AI Quote Analysis Report', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(3);

        addSection('Project & Quote Overview', () => {
            doc.text(`Project Title: ${job.title}`);
            doc.text(`Project Budget: ${job.budget}`);
            doc.text(`Designer: ${quote.designerName}`);
            doc.text(`Quote Amount: ${quote.quoteAmount}`);
            doc.text(`Timeline: ${quote.timeline} days`);
        });

        addSection('AI Summary & Recommendation', () => {
            doc.font('Helvetica-Bold').text(`Recommendation: ${analysis.recommendation.replace('_', ' ')}`);
            doc.font('Helvetica').text(analysis.summary);
        });

        addSection('Detailed Analysis', () => {
            doc.font('Helvetica-Bold').text('Cost Analysis:', { underline: false }).font('Helvetica').text(`- Budget Fit: ${analysis.costAnalysis.budgetFit}\n- Market Comparison: ${analysis.costAnalysis.marketComparison}`);
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text('Timeline Analysis:', { underline: false }).font('Helvetica').text(`- Realistic Assessment: ${analysis.timelineAnalysis.realistic}\n- Deadline Comparison: ${analysis.timelineAnalysis.deadlineComparison}`);
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text('Risk Assessment:', { underline: false }).font('Helvetica').text(`- Level: ${analysis.riskAnalysis.level}\n- Overall: ${analysis.riskAnalysis.overall}`);
        });

        if (analysis.questionsToAsk && analysis.questionsToAsk.length > 0) {
            addSection('Suggested Questions for the Designer', () => {
                doc.list(analysis.questionsToAsk, { bulletRadius: 2 });
            });
        }

        doc.fontSize(8).text('This is an AI-generated report and should be used as a supplementary tool for decision-making.', 50, 750, { align: 'center', width: 500 });

        doc.end();
    });
}