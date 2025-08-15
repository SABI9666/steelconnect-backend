import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';

// Core Service Imports
import { adminStorage } from '../config/firebase.js';
import { PdfProcessor } from '../services/pdfprocessor.js';
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

// --- Service Initialization ---
let pdfProcessor, estimationEngine, aiAnalyzer;
try {
    pdfProcessor = new PdfProcessor();
    estimationEngine = new EstimationEngine();
    // Ensure you have ANTHROPIC_API_KEY set in your environment variables
    aiAnalyzer = new EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
} catch (e) {
    console.error("Fatal Error: Failed to initialize core services.", e);
    process.exit(1);
}

// --- Firebase Upload Helper Function ---
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
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
            resolve({ path: destinationPath, url: publicUrl });
        });

        stream.end(buffer);
    });
};

// --- Main Route to Generate Estimation from PDF Upload ---
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
        }

        const { projectName = 'Untitled Project', location = 'Not Specified' } = req.body;
        // Assuming user ID is available from an authentication middleware
        const userId = req.user ? req.user.id : null; 
        if (!userId) {
             return res.status(401).json({ success: false, error: 'User not authenticated.' });
        }

        // 1. Upload to Firebase
        const { path: firebasePath, url: firebaseUrl } = await uploadToFirebase(req.file.buffer, req.file.originalname);

        // 2. Process PDF to extract structured data
        const structuredData = await pdfProcessor.process(req.file.buffer);

        // 3. Analyze data with AI to get quantities and scope
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(structuredData, new mongoose.Types.ObjectId().toString());

        // 4. Calculate cost estimation based on AI analysis
        const costEstimation = await estimationEngine.generateEstimation(analysisResults, location);

        // 5. Create a new estimation document
        const newEstimation = new Estimation({
            _id: new mongoose.Types.ObjectId(),
            userId,
            projectName,
            location,
            status: 'Completed',
            drawingUrl: firebaseUrl,
            drawingPath: firebasePath,
            structuredData,
            analysisResults,
            costEstimation,
        });

        // 6. Save to MongoDB
        await newEstimation.save();

        // 7. Send successful response
        res.status(201).json({
            success: true,
            message: 'Estimation generated successfully.',
            estimationId: newEstimation._id,
            data: newEstimation,
        });

    } catch (error) {
        console.error('Error in /generate-from-upload route:', error);
        next(error); // Pass error to the global error handler
    }
});

// --- Route to Fetch a Specific Estimation Report ---
router.get('/:id/report', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Invalid estimation ID format.' });
        }

        const estimation = await Estimation.findById(id);

        if (!estimation) {
            return res.status(404).json({ success: false, error: 'Estimation not found.' });
        }
        
        // Ensure the user requesting is the one who created it (requires auth middleware)
        if (req.user && estimation.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to this resource.' });
        }

        res.status(200).json({
            success: true,
            data: estimation,
        });
        
    } catch (error) {
        console.error(`Error fetching report for ID ${req.params.id}:`, error);
        next(error);
    }
});

export default router;

