// src/routes/estimation.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { PdfProcessor } from '../services/pdfProcessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/costEstimationEngine.js';
import ReportGenerator from '../services/reportGenerator.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Initialize services
const pdfProcessor = new PdfProcessor();
const aiAnalyzer = new EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
const estimationEngine = new EstimationEngine();
const reportGenerator = new ReportGenerator();

/**
 * POST /api/estimation/upload
 * Upload and analyze PDF drawings
 */
router.post('/upload', upload.single('drawing'), async (req, res) => {
    try {
        console.log('📄 Starting PDF upload and analysis...');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No PDF file uploaded'
            });
        }

        const { location = 'Sydney' } = req.body;
        const projectId = `PROJ-${Date.now()}`;

        // Step 1: Process PDF
        console.log('🔍 Processing PDF...');
        const structuredData = await pdfProcessor.process(req.file.buffer);

        // Step 2: AI Analysis
        console.log('🤖 Starting AI analysis...');
        const analysisResult = await aiAnalyzer.analyzeStructuralDrawings(structuredData, projectId);

        // Step 3: Cost Estimation
        console.log('💰 Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResult, location);

        res.json({
            success: true,
            data: {
                project_id: projectId,
                analysis: analysisResult,
                estimation: estimationData,
                pdf_info: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    pages: structuredData.metadata?.pages || 0
                }
            }
        });

    } catch (error) {
        console.error('❌ Estimation upload error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process PDF'
        });
    }
});

/**
 * POST /api/estimation/generate-report
 * Generate detailed report from estimation data
 */
router.post('/generate-report', async (req, res) => {
    try {
        const { estimationData, format = 'html', projectId } = req.body;

        if (!estimationData || !projectId) {
            return res.status(400).json({
                success: false,
                error: 'Missing estimation data or project ID'
            });
        }

        console.log(`📊 Generating ${format.toUpperCase()} report for project ${projectId}...`);
        
        const report = await reportGenerator.generateReport(estimationData, format, projectId);

        // Set appropriate content type
        let contentType = 'text/html';
        if (format === 'json') contentType = 'application/json';
        if (format === 'csv') contentType = 'text/csv';

        res.set('Content-Type', contentType);
        
        if (format === 'html') {
            res.send(report.content);
        } else {
            res.json({
                success: true,
                data: {
                    content: report.content,
                    format: format,
                    project_id: projectId
                }
            });
        }

    } catch (error) {
        console.error('❌ Report generation error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate report'
        });
    }
});

/**
 * GET /api/estimation/reports/:projectId/download
 * Download report file
 */
router.get('/reports/:projectId/download', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { format = 'html' } = req.query;

        // This would typically retrieve stored report data
        // For now, return a simple response
        res.json({
            success: true,
            message: `Report download for project ${projectId} in ${format} format`,
            project_id: projectId,
            format: format
        });

    } catch (error) {
        console.error('❌ Report download error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to download report'
        });
    }
});

/**
 * POST /api/estimation/test
 * Test endpoint for development
 */
router.post('/test', async (req, res) => {
    try {
        console.log('🧪 Running estimation test...');
        
        // Create test data structure
        const testStructuredData = {
            metadata: {
                pages: 1,
                character_count: 1000
            },
            steel_schedules: [
                {
                    designation: '250 UB 31.4',
                    quantity: '8',
                    length: '6000',
                    notes: 'Main beam'
                },
                {
                    designation: '200 UC 46.2',
                    quantity: '4',
                    length: '3000',
                    notes: 'Column'
                }
            ],
            general_notes: [
                'All steel to be hot-dip galvanized',
                'Standard connections as per AS 4100'
            ],
            specifications: {
                steel_grade: '300PLUS',
                concrete_grade: 'N32',
                bolt_grade: '8.8/S'
            },
            confidence: 0.8
        };

        // Run AI analysis
        const projectId = `TEST-${Date.now()}`;
        const analysisResult = await aiAnalyzer.analyzeStructuralDrawings(testStructuredData, projectId);
        
        // Generate estimation
        const estimationData = await estimationEngine.generateEstimation(analysisResult, 'Sydney');

        res.json({
            success: true,
            message: 'Test completed successfully',
            data: {
                project_id: projectId,
                analysis: analysisResult,
                estimation: estimationData
            }
        });

    } catch (error) {
        console.error('❌ Test error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Test failed'
        });
    }
});

/**
 * GET /api/estimation/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Estimation service is healthy',
        timestamp: new Date().toISOString(),
        services: {
            pdf_processor: 'ready',
            ai_analyzer: process.env.ANTHROPIC_API_KEY ? 'ready' : 'missing_api_key',
            estimation_engine: 'ready',
            report_generator: 'ready'
        }
    });
});

export default router;
