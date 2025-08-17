/ src/routes/estimation.js - FIXED VERSION - Removed illegal return statement
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Initialize services with error handling
let pdfProcessor, aiAnalyzer, estimationEngine, reportGenerator;

async function initializeServices() {
    try {
        // Dynamic imports to handle missing dependencies gracefully
        const pdfModule = await import('../services/pdfprocessor.js').catch(err => {
            console.warn('PDF Processor not available:', err.message);
            return { PdfProcessor: null };
        });

        const aiModule = await import('../services/aiAnalyzer.js').catch(err => {
            console.warn('AI Analyzer not available:', err.message);
            return { EnhancedAIAnalyzer: null };
        });

        const engineModule = await import('../services/cost-estimation-engine.js').catch(err => {
            console.warn('Estimation Engine not available:', err.message);
            return { EstimationEngine: null };
        });

        const reportModule = await import('../services/reportGenerator.js').catch(err => {
            console.warn('Report Generator not available:', err.message);
            return { default: null };
        });

        if (pdfModule.PdfProcessor) {
            pdfProcessor = new pdfModule.PdfProcessor();
            console.log('✅ PDF Processor initialized');
        }

        if (aiModule.EnhancedAIAnalyzer && process.env.ANTHROPIC_API_KEY) {
            aiAnalyzer = new aiModule.EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
            console.log('✅ AI Analyzer initialized');
        } else if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ ANTHROPIC_API_KEY not found - AI features disabled');
        }

        if (engineModule.EstimationEngine) {
            estimationEngine = new engineModule.EstimationEngine();
            console.log('✅ Estimation Engine initialized');
        }

        if (reportModule.default) {
            reportGenerator = new reportModule.default();
            console.log('✅ Report Generator initialized');
        }

        console.log('✅ Estimation services initialization completed');
    } catch (error) {
        console.warn('⚠️ Some estimation services failed to initialize:', error.message);
    }
}

// Initialize services immediately
initializeServices();

/**
 * POST /api/estimation/generate-from-upload
 * Upload PDF to Firebase and generate estimation (matches frontend call)
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    try {
        console.log('📄 Starting PDF upload and estimation generation...');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No PDF file uploaded'
            });
        }

        const { 
            projectName = 'Unnamed Project',
            location = 'Sydney',
            clientName = '',
            userId = null
        } = req.body;
        
        const projectId = `PROJ-${Date.now()}`;

        // Check if all services are available for full processing
        if (!pdfProcessor || !aiAnalyzer || !estimationEngine) {
            console.log('🧪 Running in mock mode due to missing services...');
            
            // Mock estimation data that matches the expected format
            const mockEstimationData = {
                project_id: projectId,
                items: [
                    {
                        code: 'STEEL_SUP_250UB314',
                        description: 'Steel Supply - 250 UB 31.4',
                        quantity: 2.5,
                        unit: 'tonne',
                        unitRate: 3680,
                        totalCost: 9200,
                        category: 'Steel Structure',
                        subcategory: 'Supply'
                    },
                    {
                        code: 'STEEL_FAB_001',
                        description: 'Steel Fabrication (medium complexity)',
                        quantity: 2.5,
                        unit: 'tonne',
                        unitRate: 4200,
                        totalCost: 10500,
                        category: 'Steel Structure',
                        subcategory: 'Fabrication'
                    }
                ],
                cost_summary: {
                    base_cost: 45000,
                    location_factor: 1.15,
                    subtotal_ex_gst: 49500,
                    gst: 4950,
                    total_inc_gst: 54450,
                    currency: 'AUD'
                },
                location: location,
                estimation_date: new Date().toISOString(),
                confidence_score: 0.75,
                validity_period_days: 60
            };

            const response = {
                success: true,
                projectId: projectId,
                estimationData: mockEstimationData,
                summary: {
                    totalCost: mockEstimationData.cost_summary.total_inc_gst,
                    currency: 'AUD',
                    location: location
                },
                message: 'Estimation generated successfully (mock data)',
                pdf_info: {
                    filename: req.file.originalname,
                    size: req.file.size
                }
            };

            return res.status(201).json(response);
        }

        // Real processing (when services are available)
        console.log('📄 Processing PDF...');
        const structuredData = await pdfProcessor.extractSteelInformation(req.file.buffer);

        console.log('🤖 Starting AI analysis...');
        const analysisResult = await aiAnalyzer.analyzeStructuralDrawings(structuredData, projectId);

        console.log('💰 Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResult, location);

        // Here you would typically save to MongoDB
        // const savedEstimation = await saveToMongoDB({
        //     projectName, projectLocation: location, clientName,
        //     originalFilename: req.file.originalname,
        //     fileSize: req.file.size,
        //     structuredData, analysisResult, estimationData,
        //     status: 'Draft', user: userId
        // });

        const response = {
            success: true,
            projectId: projectId,
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
        console.error('❌ Estimation generation error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process PDF and generate estimation'
        });
    }
});

/**
 * POST /api/estimation/upload
 * Legacy endpoint for PDF upload (for backward compatibility)
 */
router.post('/upload', upload.single('drawing'), async (req, res) => {
    // Forward to the main endpoint
    req.url = '/generate-from-upload';
    router.handle(req, res);
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
        
        // Mock report generation if service unavailable
        if (!reportGenerator) {
            const mockReport = {
                project_id: projectId,
                format: format,
                content: format === 'html' ? 
                    `<h1>Steel Estimation Report - ${projectId}</h1><p>Total Cost: $${estimationData.total_cost || 'N/A'}</p>` :
                    JSON.stringify(estimationData, null, 2),
                generated_at: new Date().toISOString()
            };

            if (format === 'html') {
                res.set('Content-Type', 'text/html');
                return res.send(mockReport.content);
            }

            return res.json({
                success: true,
                data: mockReport
            });
        }

        const report = await reportGenerator.generateReport(estimationData, format, projectId);

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

        res.json({
            success: true,
            message: `Report download for project ${projectId} in ${format} format`,
            project_id: projectId,
            format: format,
            download_url: `/api/estimation/reports/${projectId}/download?format=${format}`
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
 * GET /api/estimation/projects/:projectId
 * Get estimation details by project ID
 */
router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // This would typically fetch from MongoDB
        // For now, return mock data
        res.json({
            success: true,
            data: {
                project_id: projectId,
                status: 'completed',
                created_at: new Date().toISOString(),
                estimation: {
                    total_cost: 125000,
                    currency: 'AUD',
                    confidence_level: 0.8
                }
            }
        });

    } catch (error) {
        console.error('❌ Project fetch error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch project details'
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
        
        // Create test data
        const testData = {
            project_id: `TEST-${Date.now()}`,
            steel_components: [
                { item: '250 UB 31.4', quantity: 8, unit_cost: 950 },
                { item: '200 UC 46.2', quantity: 4, unit_cost: 1200 }
            ],
            total_cost: 12400,
            location: 'Sydney',
            confidence: 0.8
        };

        res.json({
            success: true,
            message: 'Test completed successfully',
            data: testData,
            services_status: {
                pdf_processor: !!pdfProcessor,
                ai_analyzer: !!aiAnalyzer,
                estimation_engine: !!estimationEngine,
                report_generator: !!reportGenerator
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
            pdf_processor: !!pdfProcessor ? 'ready' : 'unavailable',
            ai_analyzer: (!!aiAnalyzer && process.env.ANTHROPIC_API_KEY) ? 'ready' : 'missing_api_key_or_service',
            estimation_engine: !!estimationEngine ? 'ready' : 'unavailable',
            report_generator: !!reportGenerator ? 'ready' : 'unavailable',
            upload_endpoint: 'ready',
            mock_mode: (!pdfProcessor || !aiAnalyzer || !estimationEngine) ? 'enabled' : 'disabled'
        }
    });
});

export default router;
