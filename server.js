<<<<<<< HEAD
// src/routes/estimation.js

import express from 'express';
import fs from 'fs/promises';
import { upload } from '../../server.js'; 

<<<<<<< HEAD
<<<<<<< HEAD
// --- FIX: Corrected all import paths to go up one directory ---
import Estimation from '../models/Estimation.js';
import { PDFProcessor } from '../services/pdfprocessor.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import { validateEstimationInput } from '../middleware/validation.js';
=======
// --- FIX: Corrected all import paths to be relative to this file ---
import auth from './routes/auth.js';
import jobs from './routes/jobs.js';
import quotes from './routes/quotes.js';
import messages from './routes/messages.js';
import estimation from './routes/estimation.js';
>>>>>>> 599817d (Initial commit)
=======
// --- FIX: All import paths must start with './src/' ---
=======
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// --- Route Imports ---
// Assumes server.js is in the project's root directory
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
import auth from './src/routes/auth.js';
import jobs from './src/routes/jobs.js';
import quotes from './src/routes/quotes.js';
import messages from './src/routes/messages.js';
import estimation from './src/routes/estimation.js';
>>>>>>> faf2f2fb81c0217be00755bf017289225e6c1374

<<<<<<< HEAD
const router = express.Router();

<<<<<<< HEAD
router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No drawing file was uploaded.'
        });
=======
const app = express();
const PORT = process.env.PORT || 3000;

<<<<<<< HEAD
// --- CORS Configuration ---
const allowedOrigins = [
  process.env.FRONTEND_URL, 
=======
// --- App Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
  'http://localhost:3000',
  'http://localhost:5173'
];

<<<<<<< HEAD
=======
// CORS, Express middleware, etc. remains the same...
const allowedOrigins = [ process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173' ];
>>>>>>> faf2f2fb81c0217be00755bf017289225e6c1374
=======
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
const corsOptions = {
  origin: function (origin, callback) {
    const vercelPreviewRegex = /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/;
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || vercelPreviewRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
>>>>>>> 599817d (Initial commit)
    }
<<<<<<< HEAD

    const drawingFile = req.file;
    const { projectName, projectLocation } = req.body;

<<<<<<< HEAD
    if (!projectName || !projectLocation) {
        await fs.unlink(drawingFile.path); 
        return res.status(400).json({
            success: false,
            message: 'Project Name and Location are required.'
        });
    }

    const uploadedFilePath = drawingFile.path;
=======
// --- File Upload & Static Serving Configuration ---
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
>>>>>>> 599817d (Initial commit)

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

<<<<<<< HEAD
export default router;
=======
=======
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json()); // Middleware to parse JSON request bodies

// --- File Upload & Static Serving Configuration ---
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir + '/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// The 'upload' constant is exported so it can be used in your route files
export const upload = multer({ storage: storage });
<<<<<<< HEAD
>>>>>>> faf2f2fb81c0217be00755bf017289225e6c1374
=======

// Serves uploaded files publicly from the /uploads endpoint
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
app.use('/uploads', express.static(uploadsDir));

// --- API Routes ---
app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API is running' }));
app.use('/api/auth', auth);
app.use('/api/jobs', jobs);
app.use('/api/quotes', quotes);
app.use('/api/messages', messages);
app.use('/api/estimation', estimation);

// --- Error Handling Middleware ---
// Catches requests to routes that don't exist
app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler to catch all other errors
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// --- Server Start ---
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

export default app;
<<<<<<< HEAD
>>>>>>> 599817d (Initial commit)
=======
>>>>>>> baa85132158071c2ea5271e3639b88be69bd07de
