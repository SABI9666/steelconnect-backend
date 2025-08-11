// src/routes/estimation.js

import express from 'express';
import fs from 'fs/promises';
// Path goes up two levels to find server.js in the root
import { upload } from '../../server.js'; 

// Paths go up one level to find folders within 'src'
import Estimation from '../models/Estimation.js';
import { PDFProcessor } from '../services/pdfprocessor.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import { validateEstimationInput } from '../middleware/validation.js';

const router = express.Router();

router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No drawing file was uploaded.' });
    }
    const { projectName, projectLocation } = req.body;
    if (!projectName || !projectLocation) {
        await fs.unlink(req.file.path); 
        return res.status(400).json({ success: false, message: 'Project Name and Location are required.' });
    }
    try {
        const pdfProcessor = new PDFProcessor();
        const aiAnalyzer = new AIAnalyzer(process.env.ANTHROPIC_API_KEY);
        const estimationEngine = new EstimationEngine();
        const extractedContent = await pdfProcessor.extractContent(req.file.path);
        const analysisResult = await aiAnalyzer.analyzeStructuralDrawings(
            [{ filename: req.file.originalname, text: extractedContent.text, tables: extractedContent.tables }],
            projectName
        );
        const estimationData = await estimationEngine.generateEstimation(analysisResult, projectLocation);
        res.status(200).json({ success: true, message: 'Estimation generated successfully.', data: estimationData });
    } catch (error) {
        console.error('Full estimation pipeline error:', error);
        res.status(500).json({ success: false, message: 'An error occurred during the estimation process.', error: error.message });
    } finally {
        if (req.file && req.file.path) {
            try { await fs.unlink(req.file.path); } catch (cleanupError) { console.error('Failed to delete temp file', cleanupError); }
        }
    }
});

// Other routes...
router.post('/calculate', validateEstimationInput, async (req, res) => {});
router.post('/process-files', async (req, res) => {});
router.get('/history', async (req, res) => {});
router.get('/:id', async (req, res) => {});
router.put('/:id', validateEstimationInput, async (req, res) => {});
router.delete('/:id', async (req, res) => {});
router.post('/:id/generate-report', async (req, res) => {});
router.get('/analytics/dashboard', async (req, res) => {});


// FIX: Use 'export default' to make this file compatible with server.js
export default router;
