import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';

// --- Firebase and Service Imports ---
import { adminStorage } from '../config/firebase.js';
// --- FIX: Changed from a named import { PdfProcessor } to a default import ---
import PdfProcessor from '../services/pdfprocessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import Estimation from '../models/estimation.js';

const router = express.Router();

// --- Multer Configuration for In-Memory File Uploads ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed.'), false);
        }
        cb(null, true);
    }
});

// --- Initialize Services ---
const pdfProcessor = new PdfProcessor();
const estimationEngine = new EstimationEngine();

/**
 * Helper function to upload a file buffer to Firebase Storage.
 */
const uploadToFirebase = (buffer, originalname) => {
    return new Promise((resolve, reject) => {
        const bucket = adminStorage.bucket();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const destinationPath = `drawings/${uniqueSuffix}-${originalname}`;
        const file = bucket.file(destinationPath);
        const stream = file.createWriteStream({ metadata: { contentType: 'application/pdf' } });
        stream.on('error', (err) => reject(new Error(`Firebase upload failed: ${err.message}`)));
        stream.on('finish', () => resolve(destinationPath));
        stream.end(buffer);
    });
};

/**
 * =================================================================
 * POST /api/estimation/generate-from-upload
 * Main route to upload a PDF and generate a cost estimation.
 * =================================================================
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    console.log('🚀 Received request for estimation generation...');
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded. Expecting field name "drawing".' });
        }
        
        const { projectName = 'Unnamed Project', location = 'Sydney', clientName = '', userId } = req.body;
        console.log('📋 Project details:', { projectName, location, clientName });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Server configuration error: ANTHROPIC_API_KEY is not set.');
        }

        // --- Step 1: Upload to Firebase Storage ---
        console.log('[1/6] Uploading file to Firebase Storage...');
        const fileBuffer = req.file.buffer;
        const storagePath = await uploadToFirebase(fileBuffer, req.file.originalname);
        console.log(`[1/6] ✅ File uploaded to: ${storagePath}`);
        
        // --- Step 2: Extract PDF Content from Buffer ---
        console.log('[2/6] Extracting text from PDF...');
        const structuredData = await pdfProcessor.extractSteelInformation(fileBuffer);
        
        const memberCount = structuredData.summary.totalItems || 0;
        console.log(`[2/6] ✅ PDF Extraction Complete. Found ${memberCount} members.`);

        // --- Step 3: AI Analysis ---
        console.log('[3/6] Starting AI analysis...');
        const aiAnalyzer = new EnhancedAIAnalyzer(apiKey);
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(structuredData, `PROJ_${Date.now()}`);
        console.log(`[3/6] ✅ AI Analysis Complete.`);

        // --- Step 4: Cost Estimation ---
        console.log('[4/6] Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResults, location);
        console.log(`[4/6] ✅ Cost Estimation Complete. Total: ${estimationData.cost_summary?.total_inc_gst || 0}`);

        // --- Step 5: Save to Database (MongoDB) ---
        console.log('[5/6] Saving estimation to database...');
        const estimation = new Estimation({
            projectName, projectLocation: location, clientName,
            originalFilename: req.file.originalname,
            fileSize: req.file.size,
            storagePath,
            structuredData: structuredData,
            analysisResults, estimationData,
            status: 'Draft', user: userId
        });
        const savedEstimation = await estimation.save();
        console.log(`[5/6] ✅ Estimation saved with ID: ${savedEstimation._id}`);

        // --- Step 6: Final Response ---
        const response = {
            success: true, projectId: savedEstimation._id.toString(),
            estimationData,
            summary: { totalCost: estimationData.cost_summary?.total_inc_gst || 0, currency: 'AUD', location }
        };
        console.log('🎉 Estimation process completed successfully.');
        res.status(201).json(response);

    } catch (error) {
        console.error('❌ An error occurred during the estimation process:', error);
        next(error);
    }
});

export default router;
