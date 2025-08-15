import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';

// --- Firebase and Service Imports ---
import { adminStorage } from '../config/firebase.js'; // Assuming firebase config is in src/config
import { PdfProcessor } from '../services/pdfprocessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import Estimation from '../models/estimation.js';

const router = express.Router();

// --- Multer Configuration for In-Memory File Uploads ---
// Switched to memoryStorage to handle the file as a buffer instead of saving it to disk.
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
try {
    var pdfProcessor = new PdfProcessor();
    var estimationEngine = new EstimationEngine();
} catch (e) {
    console.error("Failed to initialize core services:", e);
}


/**
 * Helper function to upload a file buffer to Firebase Storage.
 * @param {Buffer} buffer The file buffer from multer.
 * @param {string} originalname The original name of the file.
 * @returns {Promise<string>} The destination path of the uploaded file in the bucket.
 */
const uploadToFirebase = (buffer, originalname) => {
    return new Promise((resolve, reject) => {
        const bucket = adminStorage.bucket();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const destinationPath = `drawings/${uniqueSuffix}-${originalname}`;
        const file = bucket.file(destinationPath);

        const stream = file.createWriteStream({
            metadata: {
                contentType: 'application/pdf',
            },
        });

        stream.on('error', (err) => {
            reject(new Error(`Firebase upload failed: ${err.message}`));
        });

        stream.on('finish', () => {
            resolve(destinationPath);
        });

        stream.end(buffer);
    });
};


/**
 * =================================================================
 * POST /api/estimation/generate-from-upload
 * Main route to upload a PDF to Firebase and generate a cost estimation.
 * =================================================================
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    console.log('[START] Received request for estimation generation...');
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded or incorrect field name used. Expecting field name "drawing".' });
        }
        
        const { projectName = 'Unnamed Project', location = 'Sydney', clientName = '', userId } = req.body;
        console.log('[INFO] Project details:', { projectName, location, clientName });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Server configuration error: ANTHROPIC_API_KEY is not set.');
        }

        // --- Step 1: Upload to Firebase Storage ---
        console.log('[1/6] Uploading file to Firebase Storage...');
        const fileBuffer = req.file.buffer;
        const storagePath = await uploadToFirebase(fileBuffer, req.file.originalname);
        console.log(`[1/6] SUCCESS - File uploaded to: ${storagePath}`);
        
        // --- Step 2: Extract PDF Content from Buffer ---
        console.log('[2/6] Extracting text from PDF...');
        const uint8Array = new Uint8Array(fileBuffer);
        const extractedContent = await pdfProcessor.extractTextFromPdf(uint8Array);
        if (!extractedContent.success) {
            throw new Error('PDF text extraction failed.');
        }
        const structuredData = pdfProcessor.extractSteelInformation(extractedContent.text);
        console.log(`[2/6] SUCCESS - PDF Extraction Complete. Found ${structuredData.structuralMembers?.length || 0} members.`);

        // --- Step 3: AI Analysis ---
        console.log('[3/6] Starting AI analysis...');
        const aiAnalyzer = new EnhancedAIAnalyzer(apiKey);
        const mockStructuredDataForAI = {
             steel_schedules: (structuredData.structuralMembers || []).map(member => ({
                designation: member.designation || 'Unknown', quantity: member.quantity || 1,
                length: member.length || 6, weight: member.weight || 0
            })),
            confidence: 0.85
        };
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(mockStructuredDataForAI, `PROJ_${Date.now()}`);
        console.log(`[3/6] SUCCESS - AI Analysis Complete.`);

        // --- Step 4: Cost Estimation ---
        console.log('[4/6] Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResults, location);
        console.log(`[4/6] SUCCESS - Cost Estimation Complete. Total: ${estimationData.cost_summary?.total_inc_gst || 0}`);

        // --- Step 5: Save to Database (MongoDB) ---
        console.log('[5/6] Saving estimation to database...');
        const estimation = new Estimation({
            projectName, projectLocation: location, clientName,
            originalFilename: req.file.originalname,
            fileSize: req.file.size,
            storagePath, // <-- Path to file in Firebase Storage
            structuredData: { schedules: structuredData.structuralMembers || [] },
            analysisResults, estimationData,
            status: 'Draft', user: userId
        });
        const savedEstimation = await estimation.save();
        console.log(`[5/6] SUCCESS - Estimation saved with ID: ${savedEstimation._id}`);

        // --- Step 6: Final Response ---
        const response = {
            success: true, projectId: savedEstimation._id.toString(),
            estimationData,
            summary: { totalCost: estimationData.cost_summary?.total_inc_gst || 0, currency: 'AUD', location }
        };
        console.log('[COMPLETE] Estimation process completed successfully.');
        res.status(201).json(response);

    } catch (error) {
        console.error('[ERROR] An error occurred during the estimation process:', error);
        next(error);
    }
    // The 'finally' block for cleanup is no longer needed as no local file is created.
});

// Other routes like GET /:id/report remain unchanged...
router.get('/:id/report', async (req, res, next) => {
    // This route does not need changes unless reports are also stored in Firebase.
    // For now, it fetches data from MongoDB, which is correct.
    try {
        const estimation = await Estimation.findById(req.params.id);
        if (!estimation) return res.status(404).json({ success: false, error: 'Estimation not found.' });
        // Assuming ReportGenerator works with data from DB
        res.json({ success: true, message: "Report generation logic goes here." });
    } catch (error) {
        next(error);
    }
});


export default router;
