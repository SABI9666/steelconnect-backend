import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import mongoose from 'mongoose';

// --- Service and Model Imports ---
// Ensure the paths to these files are correct relative to your 'src/routes' directory
import { PdfProcessor } from '../services/pdfprocessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import ReportGenerator from '../services/reportGenerator.js';
import Estimation from '../models/estimation.js'; // Assuming your model is in 'src/models'

const router = express.Router();

// --- Multer Configuration for File Uploads ---
// This setup saves the uploaded file to the 'uploads/' directory temporarily
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter: (req, file, cb) => {
        // Allow only PDF files
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed.'), false);
        }
        cb(null, true);
    }
});

// --- Initialize Services ---
// By initializing them outside the route handlers, they are created only once.
try {
    var pdfProcessor = new PdfProcessor();
    var reportGenerator = new ReportGenerator();
    var estimationEngine = new EstimationEngine();
} catch (e) {
    console.error("Failed to initialize services:", e);
}


/**
 * =================================================================
 * POST /api/estimation/generate-from-upload
 * Main route to upload a PDF and generate a cost estimation.
 * =================================================================
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    // Note: using upload.single('drawing') is more specific than upload.any()
    // It expects the file to be sent with the field name 'drawing'.
    
    console.log('🚀 Received request for estimation generation...');
    const startTime = Date.now();
    let filePath;

    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded or incorrect field name used. Expecting field name "drawing".' });
        }
        filePath = req.file.path;
        console.log(`📄 File received and saved to: ${filePath}`);

        const { projectName = 'Unnamed Project', location = 'Sydney', clientName = '' } = req.body;
        console.log('📋 Project details:', { projectName, location, clientName });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Server configuration error: ANTHROPIC_API_KEY is not set.');
        }

        // --- Step 1: Extract PDF Content ---
        console.log('[1/5] Extracting text from PDF...');
        const fileBuffer = await fs.readFile(filePath);
        const uint8Array = new Uint8Array(fileBuffer);
        const extractedContent = await pdfProcessor.extractTextFromPdf(uint8Array);
        if (!extractedContent.success) {
            throw new Error('PDF text extraction failed.');
        }
        const structuredData = pdfProcessor.extractSteelInformation(extractedContent.text);
        console.log(`[1/5] ✅ PDF Extraction Complete. Found ${structuredData.structuralMembers?.length || 0} members.`);

        // --- Step 2: AI Analysis ---
        console.log('[2/5] Starting AI analysis...');
        const aiAnalyzer = new EnhancedAIAnalyzer(apiKey);
        const projectId = `PROJ_${Date.now()}`;
        const mockStructuredDataForAI = {
            steel_schedules: (structuredData.structuralMembers || []).map(member => ({
                designation: member.designation || 'Unknown',
                quantity: member.quantity || 1,
                length: member.length || 6,
                weight: member.weight || 0
            })),
            concrete_elements: [],
            confidence: 0.85 // Base confidence, can be improved
        };
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(mockStructuredDataForAI, projectId);
        console.log(`[2/5] ✅ AI Analysis Complete.`);

        // --- Step 3: Cost Estimation ---
        console.log('[3/5] Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResults, location);
        console.log(`[3/5] ✅ Cost Estimation Complete. Total: ${estimationData.cost_summary?.total_inc_gst || 0}`);

        // --- Step 4: Save to Database ---
        console.log('[4/5] Saving estimation to database...');
        const estimation = new Estimation({
            projectName,
            projectLocation: location,
            clientName,
            originalFilename: req.file.originalname,
            fileSize: req.file.size,
            structuredData: { schedules: structuredData.structuralMembers || [] },
            analysisResults,
            estimationData,
            status: 'Draft',
            user: req.body.userId // Assuming userId might be passed from an authenticated frontend
        });
        const savedEstimation = await estimation.save();
        console.log(`[4/5] ✅ Estimation saved with ID: ${savedEstimation._id}`);

        // --- Step 5: Final Response ---
        const response = {
            success: true,
            projectId: savedEstimation._id.toString(),
            estimationData,
            summary: {
                totalCost: estimationData.cost_summary?.total_inc_gst || 0,
                currency: 'AUD',
                location
            }
        };
        console.log('🎉 Estimation process completed successfully.');
        res.status(201).json(response);

    } catch (error) {
        console.error('❌ An error occurred during the estimation process:', error);
        // Pass the error to the global error handler in server.js
        next(error);
    } finally {
        // Cleanup: always try to delete the uploaded file
        if (filePath) {
            try {
                await fs.unlink(filePath);
                console.log('🗑️ Temporary file cleaned up.');
            } catch (cleanupError) {
                console.warn(`⚠️  Failed to clean up temporary file ${filePath}:`, cleanupError.message);
            }
        }
    }
});


/**
 * =================================================================
 * GET /api/estimation/:id/report
 * Fetches an estimation and generates a report in the specified format.
 * =================================================================
 */
router.get('/:id/report', async (req, res, next) => {
    console.log(`📄 Request received for report for estimation ID: ${req.params.id}`);
    try {
        const { format = 'html' } = req.query;
        const estimationId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(estimationId)) {
            return res.status(400).json({ success: false, error: 'Invalid estimation ID format.' });
        }

        const estimation = await Estimation.findById(estimationId);
        if (!estimation) {
            return res.status(404).json({ success: false, error: 'Estimation not found.' });
        }

        console.log(`Generating '${format}' report...`);
        // The report generator handles different formats internally
        const report = await reportGenerator.generateReport(estimation.estimationData, format, estimationId);

        res.setHeader('Content-Type', report.type);
        res.send(report.content);
        console.log(`✅ Successfully sent '${format}' report.`);

    } catch (error) {
        console.error(`❌ Error generating report for ID ${req.params.id}:`, error);
        next(error);
    }
});


// Add other routes like GET /:id, DELETE /:id etc. here if needed...

export default router;
