// routes/estimation.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
// --- CORRECTED IMPORT ---
import { PdfProcessor } from '../services/pdfprocessor.js'; // Corrected filename and class name
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
import ReportGenerator from '../services/reportGenerator.js';


const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for estimation'));
        }
    }
});

// Initialize services
const pdfProcessor = new PdfProcessor(); // Corrected class name
const reportGenerator = new ReportGenerator();

/**
 * POST /api/estimation/upload
 * Upload PDF and generate cost estimation
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        console.log('🚀 Starting estimation process...');

        // Validate request
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No PDF file uploaded'
            });
        }

        const {
            projectName = 'Unnamed Project',
            location = 'Sydney',
            clientName = ''
        } = req.body;

        console.log('📋 Project details:', { projectName, location, clientName });

        // Validate API key
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY not configured');
        }

        const startTime = Date.now();
        const filePath = req.file.path;

        // This section uses your original logic which called methods not present in your PdfProcessor.
        // It's preserved as requested but may cause future errors.
        // Step 1: Extract PDF content
        console.log('📄 Extracting PDF content...');
        const extractedContent = await pdfProcessor.extractTextFromPdf(filePath);
        const structuredData = pdfProcessor.extractSteelInformation(extractedContent.text);


        console.log('✅ PDF extraction completed:', {
            confidence: extractedContent.success ? 100 : 0,
            schedules: structuredData.structuralMembers?.length || 0,
            elements: 0
        });

        // Step 2: AI Analysis
        console.log('🤖 Starting AI analysis...');
        const aiAnalyzer = new EnhancedAIAnalyzer(apiKey);
        const projectId = `PROJ_${Date.now()}`;
        const mockStructuredDataForAI = {
            project_info: {},
            steel_schedules: structuredData.structuralMembers,
            concrete_elements: [],
            dimensions_found: structuredData.dimensions,
            confidence: 0.85
        };
        const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(mockStructuredDataForAI, projectId);


        console.log('✅ AI analysis completed:', {
            confidence: analysisResults.confidence,
            steelMembers: analysisResults.quantityTakeoff?.steel_quantities?.summary?.member_count || 0,
            concreteVolume: analysisResults.quantityTakeoff?.concrete_quantities?.summary?.total_concrete_m3 || 0
        });

        // Step 3: Cost Estimation
        console.log('💰 Generating cost estimation...');
        const estimationEngine = new EstimationEngine();
        const estimationData = await estimationEngine.generateEstimation(analysisResults, location);

        console.log('✅ Cost estimation completed:', {
            totalCost: estimationData.cost_summary?.total_inc_gst || 0,
            lineItems: estimationData.items?.length || 0
        });

        // Step 4: Save to database (if mongoose is connected)
        let savedEstimation = null;
        try {
            const estimation = new Estimation({
                projectName,
                projectLocation: location,
                clientName,
                originalFilename: req.file.originalname,
                fileSize: req.file.size,
                extractionConfidence: extractedContent.success ? 1 : 0,
                structuredData: {
                    schedules: structuredData.structuralMembers || [],
                    dimensions: structuredData.dimensions || [],
                    specifications: [],
                    titleBlocks: []
                },
                analysisResults,
                processingMetadata: {
                    pdfPages: extractedContent.pages || 0,
                    structuredElementsFound: structuredData.structuralMembers?.length || 0,
                    aiAnalysisConfidence: analysisResults.confidence,
                    processingTimeMs: Date.now() - startTime,
                    enhancedProcessing: true,
                    qualityMetrics: {
                        textExtractionSuccess: true,
                        scheduleExtractionSuccess: (structuredData.structuralMembers?.length || 0) > 0,
                        specificationExtractionSuccess: false,
                        dimensionExtractionSuccess: (structuredData.dimensions?.length || 0) > 0
                    }
                },
                estimationData,
                status: 'Draft',
                user: req.body.userId || '000000000000000000000000' // Default user if not provided
            });

            savedEstimation = await estimation.save();
            console.log('💾 Estimation saved to database:', savedEstimation._id);
        } catch (dbError) {
            console.warn('⚠️ Database save failed:', dbError.message);
            // Continue without saving to database
        }

        // Step 5: Clean up uploaded file
        try {
            await fs.unlink(filePath);
            console.log('🗑️ Temporary file cleaned up');
        } catch (cleanupError) {
            console.warn('⚠️ File cleanup failed:', cleanupError.message);
        }

        // Prepare response
        const response = {
            success: true,
            projectId: savedEstimation?._id || projectId,
            estimationData,
            processing: {
                timeMs: Date.now() - startTime,
                confidence: analysisResults.confidence,
                pagesProcessed: extractedContent.pages || 0,
                structuredElementsFound: {
                     members: structuredData.structuralMembers?.length || 0
                }
            },
            summary: {
                totalCost: estimationData.cost_summary?.total_inc_gst || 0,
                baseCost: estimationData.cost_summary?.base_cost || 0,
                gst: estimationData.cost_summary?.gst || 0,
                lineItems: estimationData.items?.length || 0,
                categories: Object.keys(estimationData.categories || {}).length,
                currency: 'AUD',
                location
            }
        };

        console.log('🎉 Estimation process completed successfully');
        res.json(response);

    } catch (error) {
        console.error('❌ Estimation error:', error);

        // Clean up file if it exists
        if (req.file?.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.warn('⚠️ Error cleanup failed:', cleanupError.message);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/estimation/:id
 * Get estimation by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const estimation = await Estimation.findById(req.params.id);
        
        if (!estimation) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            estimation
        });

    } catch (error) {
        console.error('Error fetching estimation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/estimation/:id/report
 * Generate and return HTML report
 */
router.get('/:id/report', async (req, res) => {
    try {
        const { format = 'html' } = req.query;
        
        let estimationData;
        
        // Try to get from database first
        try {
            const estimation = await Estimation.findById(req.params.id);
            if (estimation) {
                estimationData = estimation.estimationData;
            } else {
                return res.status(404).json({
                    success: false,
                    error: 'Estimation not found'
                });
            }
        } catch (dbError) {
            console.warn('Database query failed:', dbError.message);
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }

        // Generate report
        const report = await reportGenerator.generateReport(estimationData, format, req.params.id);

        // Set appropriate headers based on format
        if (format === 'html') {
            res.setHeader('Content-Type', 'text/html');
            res.send(report.content);
        } else if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.send(report.content);
        } else if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="estimation-${req.params.id}.csv"`);
            res.send(report.content);
        } else {
            res.status(400).json({
                success: false,
                error: 'Unsupported format. Use html, json, or csv'
            });
        }

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/estimation/reports/:id/download
 * Download report as file
 */
router.get('/reports/:id/download', async (req, res) => {
    try {
        const { format = 'html' } = req.query;
        
        let estimationData;
        
        try {
            const estimation = await Estimation.findById(req.params.id);
            if (estimation) {
                estimationData = estimation.estimationData;
            } else {
                return res.status(404).json({
                    success: false,
                    error: 'Estimation not found'
                });
            }
        } catch (dbError) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }

        const report = await reportGenerator.generateReport(estimationData, format, req.params.id);

        // Set download headers
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `estimation-${req.params.id}-${timestamp}.${format}`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        if (format === 'html') {
            res.setHeader('Content-Type', 'text/html');
        } else if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
        } else if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
        }

        res.send(report.content);

    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/estimation
 * List all estimations with pagination
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            location,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const query = {};
        if (status) query.status = status;
        if (location) query.projectLocation = location;

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
            select: 'projectName projectLocation clientName status extractionConfidence estimationData.cost_summary.total_inc_gst createdAt updatedAt'
        };

        let result;
        try {
            const estimations = await Estimation.find(query)
                .sort(options.sort)
                .limit(options.limit)
                .skip((options.page - 1) * options.limit)
                .select(options.select);

            const total = await Estimation.countDocuments(query);

            result = {
                estimations,
                pagination: {
                    page: options.page,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            };
        } catch (dbError) {
            console.warn('Database query failed:', dbError.message);
            result = {
                estimations: [],
                pagination: { page: 1, limit: 10, total: 0, pages: 0 }
            };
        }

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Error listing estimations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/estimation/:id
 * Update estimation
 */
router.put('/:id', async (req, res) => {
    try {
        const updateData = req.body;
        
        // Remove fields that shouldn't be updated directly
        delete updateData._id;
        delete updateData.createdAt;
        delete updateData.processingMetadata;

        const estimation = await Estimation.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!estimation) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            estimation
        });

    } catch (error) {
        console.error('Error updating estimation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/estimation/:id
 * Delete estimation
 */
router.delete('/:id', async (req, res) => {
    try {
        const estimation = await Estimation.findByIdAndDelete(req.params.id);

        if (!estimation) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/estimation/:id/duplicate
 * Duplicate an existing estimation
 */
router.post('/:id/duplicate', async (req, res) => {
    try {
        const originalEstimation = await Estimation.findById(req.params.id);

        if (!originalEstimation) {
            return res.status(404).json({
                success: false,
                error: 'Original estimation not found'
            });
        }

        // Create duplicate with modified data
        const duplicateData = originalEstimation.toObject();
        delete duplicateData._id;
        delete duplicateData.createdAt;
        delete duplicateData.updatedAt;
        
        duplicateData.projectName += ' (Copy)';
        duplicateData.status = 'Draft';
        duplicateData.version = 1;

        const duplicatedEstimation = new Estimation(duplicateData);
        await duplicatedEstimation.save();

        res.json({
            success: true,
            estimation: duplicatedEstimation
        });

    } catch (error) {
        console.error('Error duplicating estimation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/estimation/stats/summary
 * Get estimation statistics
 */
router.get('/stats/summary', async (req, res) => {
    try {
        let stats;
        
        try {
            const totalEstimations = await Estimation.countDocuments();
            const draftEstimations = await Estimation.countDocuments({ status: 'Draft' });
            const approvedEstimations = await Estimation.countDocuments({ status: 'Approved' });
            
            const totalValueResult = await Estimation.aggregate([
                { $match: { status: { $ne: 'Archived' } } },
                { $group: { _id: null, total: { $sum: '$estimationData.cost_summary.total_inc_gst' } } }
            ]);
            
            const avgConfidenceResult = await Estimation.aggregate([
                { $group: { _id: null, avg: { $avg: '$extractionConfidence' } } }
            ]);

            stats = {
                totalEstimations,
                draftEstimations,
                approvedEstimations,
                totalValue: totalValueResult[0]?.total || 0,
                averageConfidence: avgConfidenceResult[0]?.avg || 0,
                recentActivity: await Estimation.find()
                    .sort({ updatedAt: -1 })
                    .limit(5)
                    .select('projectName status updatedAt')
            };
        } catch (dbError) {
            console.warn('Database stats query failed:', dbError.message);
            stats = {
                totalEstimations: 0,
                draftEstimations: 0,
                approvedEstimations: 0,
                totalValue: 0,
                averageConfidence: 0,
                recentActivity: []
            };
        }

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 10MB.'
            });
        }
    }
    
    console.error('Estimation route error:', error);
    res.status(500).json({
        success: false,
        error: error.message
    });
});

export default router;










