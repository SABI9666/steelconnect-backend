import express from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';

// Import your services and models
import Estimation from '../models/Estimation.js';
import { PDFProcessor } from '../services/pdfprocessor.js';
import { AIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import { validateEstimationInput } from '../middleware/validation.js';

const router = express.Router();

// Create multer configuration locally (instead of importing from server.js)
const uploadsDir = 'uploads';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir + '/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|dwg|dxf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and CAD files are allowed'));
    }
  }
});

// Generate estimation from uploaded drawing
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
        // Clean up uploaded file
        try {
            await fs.unlink(drawingFile.path);
        } catch (error) {
            console.error('Failed to delete uploaded file:', error);
        }
        
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
            [{ 
                filename: drawingFile.originalname, 
                text: extractedContent.text, 
                tables: extractedContent.tables 
            }],
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
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    } finally {
        // Always clean up the uploaded file
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

// Manual calculation endpoint
router.post('/calculate', validateEstimationInput, async (req, res) => {
    try {
        const estimationData = req.body;
        
        // Process manual calculation
        const estimationEngine = new EstimationEngine();
        const result = await estimationEngine.calculateManualEstimation(estimationData);
        
        res.status(200).json({
            success: true,
            message: 'Estimation calculated successfully.',
            data: result
        });
    } catch (error) {
        console.error('Manual calculation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate estimation.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Process multiple files
router.post('/process-files', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded.'
            });
        }

        const results = [];
        const pdfProcessor = new PDFProcessor();

        for (const file of req.files) {
            try {
                const content = await pdfProcessor.extractContent(file.path);
                results.push({
                    filename: file.originalname,
                    success: true,
                    content: content
                });
            } catch (error) {
                results.push({
                    filename: file.originalname,
                    success: false,
                    error: error.message
                });
            }
            
            // Clean up file
            try {
                await fs.unlink(file.path);
            } catch (error) {
                console.error('Failed to delete file:', error);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Files processed.',
            data: results
        });
    } catch (error) {
        console.error('File processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process files.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get estimation history
router.get('/history', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        
        const estimations = await Estimation.find()
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
            
        const total = await Estimation.countDocuments();
        
        res.status(200).json({
            success: true,
            data: {
                estimations,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                total
            }
        });
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation history.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get specific estimation
router.get('/:id', async (req, res) => {
    try {
        const estimation = await Estimation.findById(req.params.id);
        
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found.'
            });
        }
        
        res.status(200).json({
            success: true,
            data: estimation
        });
    } catch (error) {
        console.error('Estimation fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Update estimation
router.put('/:id', validateEstimationInput, async (req, res) => {
    try {
        const updatedEstimation = await Estimation.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true }
        );
        
        if (!updatedEstimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found.'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Estimation updated successfully.',
            data: updatedEstimation
        });
    } catch (error) {
        console.error('Estimation update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Delete estimation
router.delete('/:id', async (req, res) => {
    try {
        const deletedEstimation = await Estimation.findByIdAndDelete(req.params.id);
        
        if (!deletedEstimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found.'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Estimation deleted successfully.'
        });
    } catch (error) {
        console.error('Estimation delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete estimation.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Generate report
router.post('/:id/generate-report', async (req, res) => {
    try {
        const estimation = await Estimation.findById(req.params.id);
        
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found.'
            });
        }
        
        // Generate report logic here
        // This could involve creating a PDF, Excel file, etc.
        
        res.status(200).json({
            success: true,
            message: 'Report generated successfully.',
            data: {
                reportUrl: `/api/estimation/${req.params.id}/report`,
                generatedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate report.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Analytics dashboard
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const totalEstimations = await Estimation.countDocuments();
        const recentEstimations = await Estimation.find()
            .sort({ createdAt: -1 })
            .limit(5);
            
        // Add more analytics as needed
        const analytics = {
            totalEstimations,
            recentEstimations,
            // Add more metrics here
        };
        
        res.status(200).json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics.',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

export default router;
