import express from 'express';
import multer from 'multer';
import path from 'path';
import mongoose from 'mongoose';

// --- Service, Model, and Firebase Imports ---
import { adminStorage } from '../config/firebase.js';
import { PdfProcessor } from '../services/pdfprocessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import ReportGenerator from '../services/reportGenerator.js';
import Estimation from '../models/estimation.js'; 

const router = express.Router();

// --- Multer Configuration for In-Memory Storage ---
// This setup keeps the uploaded file in memory as a buffer, instead of saving it to disk.
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return cb(new Error('Only PDF files are allowed.'), false);
        }
        cb(null, true);
    }
});

// --- Initialize Services ---
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
 * Main route to upload a PDF, save to Firebase, and generate a cost estimation.
 * =================================================================
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    console.log('🚀 Received request for estimation generation...');
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded. Expecting field name "drawing".' });
        }
        console.log(`📄 File received in memory: ${req.file.originalname}`);

        // --- NEW: Step 1 - Upload to Firebase Storage ---
        console.log('[1/6] Uploading file to Firebase Storage...');
        const bucket = adminStorage.bucket();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const firebaseFileName = `estimations/${req.file.fieldname}-${uniqueSuffix}${path.extname(req.file.originalname)}`;
        
        const fileUpload = bucket.file(firebaseFileName);
        
        await fileUpload.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype }
        });

        // Get the public URL for the file
        const [url] = await fileUpload.getSignedUrl({
            action: 'read',
            expires: '03-09-2491' // A far-future expiration date
        });
        console.log(`[1/6] ✅ File uploaded to Firebase: ${url}`);
        
        // --- Step 2: Extract PDF Content ---
        const { projectName = 'Unnamed Project', location = 'Sydney', clientName = '' } = req.body;
        console.log('[2/6] Extracting text from PDF...');
        
        // Use the buffer directly from memory, no need for fs.readFile
        const fileBuffer = req.file.buffer;
        const uint8Array = new Uint8Array(fileBuffer);
        const extractedContent = await pdfProcessor.extractTextFromPdf(uint8Array);

        if (!extractedContent.success) {
            throw new Error('PDF text extraction failed.');
        }
        const structuredData = pdfProcessor.extractSteelInformation(extractedContent.text);
        console.log(`[2/6] ✅ PDF Extraction Complete. Found ${structuredData.structuralMembers?.length || 0} members.`);

        // --- Step 3: AI Analysis ---
        console.log('[3/6] Starting AI analysis...');
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('Server configuration error: ANTHROPIC_API_KEY is not set.');
        }
        const aiAnalyzer = new EnhancedAIAnalyzer(apiKey);
        const projectId = `PROJ_${Date.now()}`;
        const mockStructuredDataForAI = {
            steel_schedules: (structuredData.structuralMembers || []).map(member => ({
                designation: member.designation || 'Unknown', quantity: member.quantity || 1,
                length: member.length || 6, weight: member.weight || 0
            })),
            concrete_elements: [], confidence: 0.85
        };
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(mockStructuredDataForAI, projectId);
        console.log(`[3/6] ✅ AI Analysis Complete.`);

        // --- Step 4: Cost Estimation ---
        console.log('[4/6] Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResults, location);
        console.log(`[4/6] ✅ Cost Estimation Complete. Total: ${estimationData.cost_summary?.total_inc_gst || 0}`);

        // --- Step 5: Save to Database ---
        console.log('[5/6] Saving estimation to database...');
        const estimation = new Estimation({
            projectName,
            projectLocation: location,
            clientName,
            originalFilename: req.file.originalname,
            storageUrl: url, // <-- ADD: Save the Firebase URL
            fileSize: req.file.size,
            structuredData: { schedules: structuredData.structuralMembers || [] },
            analysisResults,
            estimationData,
            status: 'Draft',
            user: req.body.userId
        });
        const savedEstimation = await estimation.save();
        console.log(`[5/6] ✅ Estimation saved with ID: ${savedEstimation._id}`);

        // --- Step 6: Final Response ---
        const response = {
            success: true,
            projectId: savedEstimation._id.toString(),
            storageUrl: url, // Include the URL in the response
            estimationData,
            summary: {
                totalCost: estimationData.cost_summary?.total_inc_gst || 0,
                currency: 'AUD', location
            }
        };
        console.log('🎉 Estimation process completed successfully.');
        res.status(201).json(response);

    } catch (error) {
        console.error('❌ An error occurred during the estimation process:', error);
        next(error);
    } 
    // --- REMOVED: No 'finally' block needed as no local file is created ---
});


/**
 * =================================================================
 * GET /api/estimation/:id/report
 * Fetches an estimation and generates a report.
 * =================================================================
 */
router.get('/:id/report', async (req, res, next) => {
    // This route remains unchanged
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
        const report = await reportGenerator.generateReport(estimation.estimationData, format, estimationId);

        res.setHeader('Content-Type', report.type);
        res.send(report.content);
        console.log(`✅ Successfully sent '${format}' report.`);

    } catch (error) {
        console.error(`❌ Error generating report for ID ${req.params.id}:`, error);
        next(error);
    }
});

export default router;
