import OpenAI from 'openai';
import { jsPDF } from 'jspdf';
import { adminDb } from '../config/firebase.js'; // Updated import to use Firebase

let openai = null;

// Only initialize OpenAI if API key is provided
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
} else {
    console.warn('⚠️ OPENAI_API_KEY not found. AI analysis features will be disabled.');
}

const QUOTE_ANALYSES_COLLECTION = 'quote_analyses';

/**
 * Performs AI analysis and saves the result to Firebase.
 */
export async function performAndSaveAnalysis(quote, job, userId) {
    // Check if OpenAI is available
    if (!openai) {
        throw new Error("OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.");
    }

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
        // Save to Firebase instead of SQL Server
        const analysisData = {
            quoteId: quote.id,
            jobId: job.id,
            analyzerUserId: userId,
            analysisData: analysis, // Store as object, not JSON string
            confidenceScore: analysis.confidence,
            recommendation: analysis.recommendation,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const analysisRef = adminDb.collection(QUOTE_ANALYSES_COLLECTION);
        const docRef = await analysisRef.add(analysisData);
        
        console.log(`✅ Analysis for quote ${quote.id} saved to Firebase with ID: ${docRef.id}`);
        
        // Return analysis with Firebase document ID
        return {
            id: docRef.id,
            ...analysis
        };
        
    } catch (dbError) {
        console.error("❌ Failed to save analysis to Firebase:", dbError);
        throw new Error("Failed to save analysis to Firebase");
    }
}

/**
 * Fetches a saved analysis result from Firebase.
 */
export async function getAnalysisByQuoteId(quoteId) {
    try {
        const analysisRef = adminDb.collection(QUOTE_ANALYSES_COLLECTION);
        const snapshot = await analysisRef.where('quoteId', '==', quoteId).get();
        
        if (snapshot.empty) {
            return null;
        }
        
        // Get the first (and should be only) analysis for this quote
        const doc = snapshot.docs[0];
        const analysisRecord = {
            id: doc.id,
            ...doc.data()
        };
        
        // Convert Firestore timestamps to regular dates if needed
        if (analysisRecord.createdAt && analysisRecord.createdAt.toDate) {
            analysisRecord.createdAt = analysisRecord.createdAt.toDate();
        }
        if (analysisRecord.updatedAt && analysisRecord.updatedAt.toDate) {
            analysisRecord.updatedAt = analysisRecord.updatedAt.toDate();
        }
        
        // The analysisData is already an object (not JSON string) in Firebase
        analysisRecord.analysis_data = analysisRecord.analysisData;
        
        return analysisRecord;
    } catch (error) {
        console.error("Error fetching analysis from Firebase:", error);
        throw new Error("Failed to fetch analysis from Firebase");
    }
}

/**
 * Get all analyses by analyzer user ID
 */
export async function getAnalysesByUserId(userId) {
    try {
        const analysisRef = adminDb.collection(QUOTE_ANALYSES_COLLECTION);
        const snapshot = await analysisRef.where('analyzerUserId', '==', userId).get();
        
        const analyses = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Convert Firestore timestamps
            if (data.createdAt && data.createdAt.toDate) {
                data.createdAt = data.createdAt.toDate();
            }
            if (data.updatedAt && data.updatedAt.toDate) {
                data.updatedAt = data.updatedAt.toDate();
            }
            
            analyses.push({
                id: doc.id,
                ...data
            });
        });
        
        return analyses;
    } catch (error) {
        console.error("Error fetching analyses by user ID:", error);
        throw new Error("Failed to fetch analyses");
    }
}

/**
 * Delete analysis from Firebase
 */
export async function deleteAnalysis(analysisId) {
    try {
        const analysisRef = adminDb.collection(QUOTE_ANALYSES_COLLECTION).doc(analysisId);
        await analysisRef.delete();
        return true;
    } catch (error) {
        console.error("Error deleting analysis from Firebase:", error);
        throw new Error("Failed to delete analysis");
    }
}

/**
 * Update analysis in Firebase
 */
export async function updateAnalysis(analysisId, updateData) {
    try {
        const analysisRef = adminDb.collection(QUOTE_ANALYSES_COLLECTION).doc(analysisId);
        await analysisRef.update({
            ...updateData,
            updatedAt: new Date()
        });
        
        const updatedDoc = await analysisRef.get();
        return {
            id: updatedDoc.id,
            ...updatedDoc.data()
        };
    } catch (error) {
        console.error("Error updating analysis in Firebase:", error);
        throw new Error("Failed to update analysis");
    }
}

/**
 * Generates a PDF report from analysis data using jsPDF.
 */
export function generateAnalysisPDF(analysisData, quote, job) {
    const { analysis_data: analysis } = analysisData;

    try {
        const doc = new jsPDF();
        let yPosition = 20;
        const lineHeight = 10;
        const pageHeight = 280; // A4 page height in mm
        
        // Helper function to add text and manage page breaks
        const addText = (text, fontSize = 12, isBold = false) => {
            if (yPosition > pageHeight - 20) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFontSize(fontSize);
            if (isBold) {
                doc.setFont('helvetica', 'bold');
            } else {
                doc.setFont('helvetica', 'normal');
            }
            
            // Handle long text with word wrapping
            const textLines = doc.splitTextToSize(text, 170);
            doc.text(textLines, 20, yPosition);
            yPosition += textLines.length * (fontSize * 0.4) + 5;
        };

        // Title
        addText('AI Quote Analysis Report', 20, true);
        addText(`Generated: ${new Date().toLocaleDateString()}`, 12, false);
        yPosition += 10;

        // Project & Quote Overview
        addText('Project & Quote Overview', 16, true);
        addText(`Project Title: ${job.title}`);
        addText(`Project Budget: ${job.budget}`);
        addText(`Designer: ${quote.designerName}`);
        addText(`Quote Amount: ${quote.quoteAmount}`);
        addText(`Timeline: ${quote.timeline} days`);
        yPosition += 10;

        // AI Summary & Recommendation
        addText('AI Summary & Recommendation', 16, true);
        addText(`Recommendation: ${analysis.recommendation.replace('_', ' ')}`, 12, true);
        addText(analysis.summary);
        yPosition += 10;

        // Detailed Analysis
        addText('Detailed Analysis', 16, true);
        
        // Cost Analysis
        addText('Cost Analysis:', 14, true);
        addText(`• Budget Fit: ${analysis.costAnalysis.budgetFit}`);
        addText(`• Market Comparison: ${analysis.costAnalysis.marketComparison}`);
        addText(`• Value Assessment: ${analysis.costAnalysis.valueAssessment}`);
        
        if (analysis.costAnalysis.redFlags && analysis.costAnalysis.redFlags.length > 0) {
            addText('Red Flags:', 12, true);
            analysis.costAnalysis.redFlags.forEach(flag => {
                addText(`• ${flag}`);
            });
        }
        yPosition += 5;

        // Timeline Analysis
        addText('Timeline Analysis:', 14, true);
        addText(`• Realistic Assessment: ${analysis.timelineAnalysis.realistic}`);
        addText(`• Deadline Comparison: ${analysis.timelineAnalysis.deadlineComparison}`);
        addText(`• Industry Comparison: ${analysis.timelineAnalysis.industryComparison}`);
        
        if (analysis.timelineAnalysis.concerns && analysis.timelineAnalysis.concerns.length > 0) {
            addText('Concerns:', 12, true);
            analysis.timelineAnalysis.concerns.forEach(concern => {
                addText(`• ${concern}`);
            });
        }
        yPosition += 5;

        // Technical Analysis
        addText('Technical Analysis:', 14, true);
        addText(`• Approach Quality: ${analysis.technicalAnalysis.approachQuality}`);
        addText(`• Completeness: ${analysis.technicalAnalysis.completeness}`);
        addText(`• Expertise Level: ${analysis.technicalAnalysis.expertiseLevel}`);
        
        if (analysis.technicalAnalysis.strengths && analysis.technicalAnalysis.strengths.length > 0) {
            addText('Strengths:', 12, true);
            analysis.technicalAnalysis.strengths.forEach(strength => {
                addText(`• ${strength}`);
            });
        }
        yPosition += 5;

        // Risk Analysis
        addText('Risk Assessment:', 14, true);
        addText(`• Level: ${analysis.riskAnalysis.level}`);
        addText(`• Overall: ${analysis.riskAnalysis.overall}`);
        addText(`• Mitigation: ${analysis.riskAnalysis.mitigation}`);
        
        if (analysis.riskAnalysis.factors && analysis.riskAnalysis.factors.length > 0) {
            addText('Risk Factors:', 12, true);
            analysis.riskAnalysis.factors.forEach(factor => {
                addText(`• ${factor}`);
            });
        }
        yPosition += 5;

        // Recommendations
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            addText('Recommendations:', 14, true);
            analysis.recommendations.forEach((rec, index) => {
                addText(`${index + 1}. ${rec.title}`, 12, true);
                addText(`   ${rec.description}`);
                addText(`   Action: ${rec.action}`);
            });
            yPosition += 5;
        }

        // Questions to Ask
        if (analysis.questionsToAsk && analysis.questionsToAsk.length > 0) {
            addText('Suggested Questions for the Designer', 14, true);
            analysis.questionsToAsk.forEach((question, index) => {
                addText(`${index + 1}. ${question}`);
            });
        }

        // Footer
        const finalY = Math.max(yPosition + 20, pageHeight - 10);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('This is an AI-generated report and should be used as a supplementary tool for decision-making.', 20, finalY, { maxWidth: 170, align: 'center' });

        // Return PDF as buffer
        return Buffer.from(doc.output('arraybuffer'));
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error('Failed to generate PDF report');
    }
}