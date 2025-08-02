import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getQuoteById } from '../services/quoteService.js';
import { getJobById } from '../services/jobService.js';
import { performAndSaveAnalysis, getAnalysisByQuoteId, generateAnalysisPDF } from '../services/quoteAnalysisService.js';

const router = express.Router();

// This route performs a NEW analysis
router.post('/:quoteId/analyze', authenticateToken, async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { jobId } = req.body;
        const userId = req.user.id;

        const quote = await getQuoteById(quoteId);
        const job = await getJobById(jobId);

        if (!quote || !job) {
            return res.status(404).json({ success: false, message: 'Quote or Job not found' });
        }
        if (job.posterId !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized to analyze this quote' });
        }
        
        const analysis = await performAndSaveAnalysis(quote, job, userId);
        res.json({ success: true, data: { quote, job, analysis } });

    } catch (error) {
        console.error('Quote analysis route error:', error);
        res.status(500).json({ success: false, message: 'Failed to complete quote analysis.' });
    }
});

// --- NEW ROUTE ---
// This route generates a PDF from a SAVED analysis
router.get('/:quoteId/report', authenticateToken, async (req, res) => {
    try {
        const { quoteId } = req.params;
        const userId = req.user.id;

        const quote = await getQuoteById(quoteId);
        const job = await getJobById(quote.jobId);
        const savedAnalysis = await getAnalysisByQuoteId(quoteId);
        
        if (!quote || !job || !savedAnalysis) {
             return res.status(404).json({ success: false, message: 'Required data for report not found.' });
        }
        if (job.posterId !== userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized to download this report.' });
        }

        const pdfBuffer = await generateAnalysisPDF(savedAnalysis, quote, job);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Analysis-Report-${quoteId}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate PDF report.' });
    }
});


export default router;