import express from 'express';
console.log('DEBUG: Express imported');

import multer from 'multer';
console.log('DEBUG: Multer imported');

import mongoose from 'mongoose';
console.log('DEBUG: Mongoose imported');

// TEST IMPORT 1: Firebase (✅ WORKING)
import { adminStorage } from '../config/firebase.js';
console.log('DEBUG: Firebase imported successfully');

// TEST IMPORT 2: PdfProcessor (uncomment this next)
import { PdfProcessor } from '../services/pdfprocessor.js';
console.log('DEBUG: PdfProcessor imported successfully');

// KEEP THESE COMMENTED FOR NOW - ADD ONE BY ONE
// import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
// import { EstimationEngine } from '../services/cost-estimation-engine.js';
// import Estimation from '../models/estimation.js';

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

// COMMENT OUT SERVICE INITIALIZATION FOR NOW
// try {
//     var pdfProcessor = new PdfProcessor();
//     var estimationEngine = new EstimationEngine();
// } catch (e) {
//     console.error("Failed to initialize core services:", e);
// }


// COMMENT OUT FIREBASE FUNCTION FOR NOW
// const uploadToFirebase = (buffer, originalname) => {
//     return new Promise((resolve, reject) => {
//         const bucket = adminStorage.bucket();
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         const destinationPath = `drawings/${uniqueSuffix}-${originalname}`;
//         const file = bucket.file(destinationPath);

//         const stream = file.createWriteStream({
//             metadata: {
//                 contentType: 'application/pdf',
//             },
//         });

//         stream.on('error', (err) => {
//             reject(new Error(`Firebase upload failed: ${err.message}`));
//         });

//         stream.on('finish', () => {
//             resolve(destinationPath);
//         });

//         stream.end(buffer);
//     });
// };


// SIMPLIFIED ROUTE FOR TESTING
router.post('/generate-from-upload', upload.single('drawing'), async (req, res, next) => {
    console.log('[TEST] Basic route working...');
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
        }
        
        const { projectName = 'Test Project', location = 'Sydney' } = req.body;
        console.log('[TEST] Project details:', { projectName, location });

        // Simple response without any service calls
        const response = {
            success: true,
            message: 'Basic upload test successful',
            projectName,
            location,
            fileName: req.file.originalname,
            fileSize: req.file.size
        };
        
        console.log('[TEST] Route completed successfully.');
        res.status(201).json(response);

    } catch (error) {
        console.error('[TEST ERROR]:', error);
        next(error);
    }
});

// SIMPLIFIED REPORT ROUTE
router.get('/:id/report', async (req, res, next) => {
    try {
        res.json({ 
            success: true, 
            message: "Report route working - simplified version",
            id: req.params.id
        });
    } catch (error) {
        next(error);
    }
});

console.log('DEBUG: All routes defined successfully');
console.log('DEBUG: About to export router...');


export default router;
