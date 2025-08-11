// src/routes/estimation.js

import express from 'express';
import fs from 'fs/promises';
import { upload } from '../../server.js'; 

// --- FIX: Corrected all import paths to go up one directory ---
import Estimation from '../models/Estimation.js';
import { PDFProcessor } from '../services/pdfprocessor.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import { validateEstimationInput } from '../middleware/validation.js';

const router = express.Router();

router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No drawing file was uploaded.'
        });
    }

    const drawingFile = req.file;
    const { projectName, projectLocation } = req.body;

    if (!projectName || !projectLocation) {
        await fs.unlink(drawingFile.path); 
        return res.status(400).json({
            success: false,
            message: 'Project Name and Location are required.'
        });
    }

    const uploadedFilePath = drawingFile.path;

    try {
        const pdfProcessor = new PDFProcessor();
        const aiAnalyzer = new AIAnalyzer(process.env.ANTHROPIC_API_KEY);
        const estimationEngine = new EstimationEngine();

        console.log(`Processing file: ${uploadedFilePath}`);
        const extractedContent = await pdfProcessor.extractContent(uploadedFilePath);
        
        console.log('Sending content to AI Analyzer...');
        const analysisResult = await aiAnalyzer.analyzeStructuralDrawings(
            [{ filename: drawingFile.originalname, text: extractedContent.text, tables: extractedContent.tables }],
            projectName
        );

        console.log('Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(
            analysisResult,
            projectLocation
        );

        res.status(200).json({
            success: true,
            message: 'Estimation generated successfully.',
            data: estimationData
        });

    } catch (error) {
        console.error('Full estimation pipeline error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during the estimation process.',
            error: error.message
        });
    } finally {
        if (uploadedFilePath) {
            try {
                await fs.unlink(uploadedFilePath);
                console.log(`Deleted temporary file: ${uploadedFilePath}`);
            } catch (cleanupError) {
                console.error(`Failed to delete temporary file: ${uploadedFilePath}`, cleanupError);
            }
        }
    }
});

// All other routes remain the same...
router.post('/calculate', validateEstimationInput, async (req, res) => {});
router.post('/process-files', async (req, res) => {});
router.get('/history', async (req, res) => {});
router.get('/:id', async (req, res) => {});
router.put('/:id', validateEstimationInput, async (req, res) => {});
router.delete('/:id', async (req, res) => {});
router.post('/:id/generate-report', async (req, res) => {});
router.get('/analytics/dashboard', async (req, res) => {});

export default router;
