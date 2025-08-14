import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';

// Enhanced service imports
import { adminStorage } from '../config/firebase.js';
import { EnhancedPdfProcessor } from '../services/pdfprocessor.js';
import { ImprovedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EnhancedCostEstimationEngine } from '../services/cost-estimation-engine.js';
import ReportGenerator from '../services/reportGenerator.js';
import Estimation from '../models/estimation.js';

const router = express.Router();

// Enhanced multer configuration with better validation
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 20 * 1024 * 1024, // Increased to 20MB
        fieldSize: 2 * 1024 * 1024   // 2MB for text fields
    },
    fileFilter: (req, file, cb) => {
        console.log('📁 File received:', {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
        
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'), false);
        }
        
        // Additional file validation
        if (!file.originalname.toLowerCase().endsWith('.pdf')) {
            return cb(new Error('File must have .pdf extension'), false);
        }
        
        cb(null, true);
    }
});

// Initialize enhanced services
let pdfProcessor, aiAnalyzer, estimationEngine, reportGenerator;

try {
    pdfProcessor = new EnhancedPdfProcessor();
    estimationEngine = new EnhancedCostEstimationEngine();
    reportGenerator = new ReportGenerator();
    console.log('✅ Enhanced services initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
}

/**
 * Enhanced Firebase upload with retry logic and validation
 */
const uploadToFirebaseWithRetry = async (buffer, originalname, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const bucket = adminStorage.bucket();
            const timestamp = Date.now();
            const randomSuffix = Math.round(Math.random() * 1E9);
            const sanitizedName = originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const destinationPath = `drawings/${timestamp}-${randomSuffix}-${sanitizedName}`;
            
            const file = bucket.file(destinationPath);
            
            const stream = file.createWriteStream({
                metadata: {
                    contentType: 'application/pdf',
                    cacheControl: 'public, max-age=31536000', // 1 year cache
                    metadata: {
                        uploadedAt: new Date().toISOString(),
                        originalName: originalname,
                        size: buffer.length.toString()
                    }
                },
                resumable: false // For smaller files, direct upload is faster
            });

            return new Promise((resolve, reject) => {
                stream.on('error', (err) => {
                    console.error(`Firebase upload attempt ${attempt} failed:`, err.message);
                    if (attempt === maxRetries) {
                        reject(new Error(`Firebase upload failed after ${maxRetries} attempts: ${err.message}`));
                    } else {
                        // Retry after a delay
                        setTimeout(() => resolve(null), 1000 * attempt);
                    }
                });

                stream.on('finish', async () => {
                    try {
                        // Make file publicly readable (optional)
                        await file.makePublic();
                        console.log(`✅ File uploaded successfully: ${destinationPath}`);
                        resolve(destinationPath);
                    } catch (error) {
                        console.warn('Warning: Could not make file public:', error.message);
                        resolve(destinationPath); // Still return success
                    }
                });

                stream.end(buffer);
            });
            
        } catch (error) {
            console.error(`Upload attempt ${attempt} error:`, error);
            if (attempt === maxRetries) {
                throw error;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    return null;
};

/**
 * Enhanced validation middleware
 */
const validateRequest = (req, res, next) => {
    const { projectName, location, clientName } = req.body;
    
    const errors = [];
    
    if (!projectName || projectName.trim().length === 0) {
        errors.push('Project name is required');
    }
    
    if (projectName && projectName.length > 100) {
        errors.push('Project name must be less than 100 characters');
    }
    
    if (location && !['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 
                    'Canberra', 'Darwin', 'Hobart', 'Newcastle', 'Wollongong', 
                    'Gold Coast', 'Cairns'].includes(location)) {
        errors.push('Invalid location specified');
    }
    
    if (clientName && clientName.length > 100) {
        errors.push('Client name must be less than 100 characters');
    }
    
    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors
        });
    }
    
    next();
};

/**
 * =================================================================
 * POST /api/estimation/generate-from-upload
 * Enhanced main route with comprehensive error handling and logging
 * =================================================================
 */
router.post('/generate-from-upload', 
    upload.single('drawing'), 
    validateRequest, 
    async (req, res, next) => {
        const startTime = Date.now();
        const sessionId = `EST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🚀 [${sessionId}] Starting enhanced estimation process...`);
        
        try {
            // Step 0: Validate file upload
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No PDF file uploaded',
                    details: 'Please ensure you upload a PDF file with field name "drawing"'
                });
            }
            
            const { 
                projectName = 'Unnamed Project', 
                location = 'Sydney', 
                clientName = '', 
                userId,
                priority = 'normal'
            } = req.body;
            
            console.log(`📋 [${sessionId}] Project details:`, { 
                projectName, location, clientName, 
                fileSize: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
                fileName: req.file.originalname
            });

            // Validate API key
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                throw new Error('Server configuration error: ANTHROPIC_API_KEY not configured');
            }

            // Step 1: Upload to Firebase with retry logic
            console.log(`[1/7] [${sessionId}] Uploading to Firebase Storage...`);
            const fileBuffer = req.file.buffer;
            const storagePath = await uploadToFirebaseWithRetry(fileBuffer, req.file.originalname);
            
            if (!storagePath) {
                throw new Error('Failed to upload file to storage after multiple attempts');
            }
            
            console.log(`[1/7] [${sessionId}] ✅ Upload complete: ${storagePath}`);
            
            // Step 2: Enhanced PDF text extraction
            console.log(`[2/7] [${sessionId}] Extracting text and structure from PDF...`);
            const uint8Array = new Uint8Array(fileBuffer);
            const extractedContent = await pdfProcessor.extractTextFromPdf(uint8Array);
            
            if (!extractedContent.success) {
                throw new Error(`PDF extraction failed: ${extractedContent.error}`);
            }
            
            console.log(`[2/7] [${sessionId}] ✅ PDF extraction complete:`, {
                pages: extractedContent.pages,
                textLength: extractedContent.text.length,
                structuredDataCount: extractedContent.structuredData?.length || 0
            });

            // Step 3: Enhanced steel information extraction
            console.log(`[3/7] [${sessionId}] Extracting steel information...`);
            const structuredData = pdfProcessor.extractSteelInformation(
                extractedContent.text, 
                extractedContent.structuredData
            );
            
            console.log(`[3/7] [${sessionId}] ✅ Steel extraction complete:`, {
                membersFound: structuredData.structuralMembers?.length || 0,
                categories: Object.keys(structuredData.summary?.categories || {}).join(', ')
            });

            // Step 4: Enhanced AI analysis
            console.log(`[4/7] [${sessionId}] Starting enhanced AI analysis...`);
            
            // Initialize AI analyzer with error handling
            if (!aiAnalyzer) {
                aiAnalyzer = new ImprovedAIAnalyzer(apiKey);
            }
            
            // Prepare structured data for AI
            const aiInputData = {
                steel_schedules: (structuredData.structuralMembers || []).map(member => ({
                    designation: member.designation || 'Unknown',
                    quantity: member.quantity || 1,
                    length: member.length || 6.0,
                    weight: member.weight || 0,
                    mark: member.mark || '',
                    category: member.category || 'other'
                })),
                confidence: Math.min(0.95, Math.max(0.5, 
                    (structuredData.structuralMembers?.length || 0) > 10 ? 0.85 : 0.7
                )),
                extractedFromPages: extractedContent.pages,
                hasStructuredData: (extractedContent.structuredData?.length || 0) > 0
            };
            
            const analysisResults = await aiAnalyzer.analyzeStructuralDrawings(
                aiInputData, 
                sessionId
            );
            
            console.log(`[4/7] [${sessionId}] ✅ AI analysis complete:`, {
                confidence: analysisResults.confidence,
                steelWeight: analysisResults.quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0,
                memberCount: analysisResults.quantityTakeoff?.steel_quantities?.summary?.member_count || 0
            });

            // Step 5: Enhanced cost estimation
            console.log(`[5/7] [${sessionId}] Generating enhanced cost estimation...`);
            const estimationData = await estimationEngine.generateEstimation(analysisResults, location);
            
            console.log(`[5/7] [${sessionId}] ✅ Cost estimation complete:`, {
                totalCost: estimationData.cost_summary?.total_inc_gst || 0,
                itemCount: estimationData.items?.length || 0,
                confidence: estimationData.confidence_score
            });

            // Step 6: Enhanced database storage
            console.log(`[6/7] [${sessionId}] Saving to database...`);
            const estimation = new Estimation({
                projectName: projectName.trim(),
                projectLocation: location,
                clientName: clientName.trim(),
                originalFilename: req.file.originalname,
                fileSize: req.file.size,
                storagePath,
                sessionId,
                
                // Enhanced extraction data
                extractionData: {
                    pages: extractedContent.pages,
                    textLength: extractedContent.text.length,
                    structuredDataCount: extractedContent.structuredData?.length || 0,
                    extractionConfidence: extractedContent.success ? 0.9 : 0.3
                },
                
                // Steel analysis data
                structuredData: {
                    schedules: structuredData.structuralMembers || [],
                    summary: structuredData.summary,
                    categories: structuredData.summary?.categories || {}
                },
                
                // AI analysis results
                analysisResults: {
                    ...analysisResults,
                    processingTime: Date.now() - startTime
                },
                
                // Cost estimation
                estimationData,
                
                // Metadata
                status: 'Complete',
                user: userId || null,
                priority,
                processingMetrics: {
                    totalProcessingTime: Date.now() - startTime,
                    steps: [
                        'Upload', 'PDF Extract', 'Steel Analysis', 
                        'AI Analysis', 'Cost Estimation', 'Database Save'
                    ]
                }
            });
            
            const savedEstimation = await estimation.save();
            console.log(`[6/7] [${sessionId}] ✅ Saved with ID: ${savedEstimation._id}`);

            // Step 7: Prepare response
            console.log(`[7/7] [${sessionId}] Preparing response...`);
            const processingTime = Date.now() - startTime;
            
            const response = {
                success: true,
                sessionId,
                projectId: savedEstimation._id.toString(),
                estimationData: {
                    ...estimationData,
                    processing_time_ms: processingTime
                },
                summary: {
                    totalCost: estimationData.cost_summary?.total_inc_gst || 0,
                    currency: 'AUD',
                    location,
                    confidence: estimationData.confidence_score,
                    steelWeight: analysisResults.quantityTakeoff?.steel_quantities?.summary?.total_steel_weight_tonnes || 0,
                    memberCount: analysisResults.quantityTakeoff?.steel_quantities?.summary?.member_count || 0,
                    itemCount: estimationData.items?.length || 0
                },
                metadata: {
                    processingTimeMs: processingTime,
                    pdfPages: extractedContent.pages,
                    extractedMembers: structuredData.structuralMembers?.length || 0,
                    validityDays: 60,
                    generatedAt: new Date().toISOString()
                }
            };
            
            console.log(`🎉 [${sessionId}] Estimation completed successfully in ${processingTime}ms`);
            console.log(`💰 [${sessionId}] Total cost: $${(response.summary.totalCost || 0).toLocaleString()}`);
            
            res.status(201).json(response);

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ [${sessionId}] Estimation failed after ${processingTime}ms:`, error);
            
            // Try to save error state to database for debugging
            try {
                if (req.file) {
                    const errorEstimation = new Estimation({
                        projectName: req.body.projectName || 'Failed Project',
                        projectLocation: req.body.location || 'Unknown',
                        originalFilename: req.file.originalname,
                        fileSize: req.file.size,
                        sessionId,
                        status: 'Failed',
                        errorInfo: {
                            message: error.message,
                            stack: error.stack,
                            processingTime
                        }
                    });
                    await errorEstimation.save();
                }
            } catch (saveError) {
                console.error(`Failed to save error state: ${saveError.message}`);
            }
            
            next(error);
        }
    }
);

/**
 * Enhanced report generation endpoint
 */
router.get('/:id/report/:format?', async (req, res, next) => {
    try {
        const { id, format = 'html' } = req.params;
        
        console.log(`📊 Generating ${format.toUpperCase()} report for estimation ${id}`);
        
        // Validate estimation ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid estimation ID format'
            });
        }
        
        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        // Generate report
        const reportData = await reportGenerator.generateReport(
            estimation.estimationData,
            format.toLowerCase(),
            id
        );
        
        // Set appropriate headers based on format
        switch (format.toLowerCase()) {
            case 'pdf':
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="estimation-${id}.pdf"`);
                break;
            case 'csv':
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="estimation-${id}.csv"`);
                break;
            case 'json':
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="estimation-${id}.json"`);
                break;
            default: // html
                res.setHeader('Content-Type', 'text/html');
                break;
        }
        
        res.send(reportData.content);
        
    } catch (error) {
        console.error('Report generation error:', error);
        next(error);
    }
});

/**
 * Get estimation details
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid estimation ID format'
            });
        }
        
        const estimation = await Estimation.findById(id)
            .select('-__v')
            .lean();
            
        if (!estimation) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        res.json({
            success: true,
            data: estimation
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * List estimations with filtering and pagination
 */
router.get('/', async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            location,
            userId,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        const filter = {};
        if (status) filter.status = status;
        if (location) filter.projectLocation = location;
        if (userId) filter.user = userId;
        
        const options = {
            page: parseInt(page),
            limit: Math.min(parseInt(limit), 50), // Max 50 per page
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
            select: '-structuredData -analysisResults -estimationData.items', // Exclude large fields
            lean: true
        };
        
        const estimations = await Estimation.paginate(filter, options);
        
        res.json({
            success: true,
            data: estimations.docs,
            pagination: {
                page: estimations.page,
                pages: estimations.totalPages,
                total: estimations.totalDocs,
                limit: estimations.limit,
                hasNext: estimations.hasNextPage,
                hasPrev: estimations.hasPrevPage
            }
        });
        
    } catch (error) {
        next(error);
    }
});

/**
 * Enhanced error handling middleware
 */
router.use((error, req, res, next) => {
    console.error('API Error:', error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation Error',
            details: Object.values(error.errors).map(e => e.message)
        });
    }
    
    if (error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format'
        });
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            error: 'File too large',
            details: 'Maximum file size is 20MB'
        });
    }
    
    if (error.message.includes('ANTHROPIC_API_KEY')) {
        return res.status(500).json({
            success: false,
            error: 'Service configuration error',
            details: 'AI analysis service is not properly configured'
        });
    }
    
    // Generic error response
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});

export default router;
