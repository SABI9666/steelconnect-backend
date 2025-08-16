// src/routes/estimation.js - CORRECTED VERSION
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

// --- CORRECTED: Robust Service Initialization ---
// Services are now imported dynamically to prevent the server from crashing if a file is missing.
let pdfProcessor, aiAnalyzer, estimationEngine, reportGenerator;

try {
    const { PdfProcessor } = await import('../services/pdfprocessor.js');
    const { EstimationEngine } = await import('../services/cost-estimation-engine.js');
    const ReportGeneratorModule = await import('../services/reportGenerator.js');

    pdfProcessor = new PdfProcessor();
    estimationEngine = new EstimationEngine();
    reportGenerator = ReportGeneratorModule.default;

    // Conditionally import and initialize the AI Analyzer only if the API key is present and the file exists.
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const { EnhancedAIAnalyzer } = await import('../services/aiAnalyzer.js');
            aiAnalyzer = new EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
            console.log('✅ All estimation services initialized successfully');
        } catch (e) {
            aiAnalyzer = null;
            console.warn('⚠️ AI Analyzer service file could not be loaded. AI features will be disabled.');
        }
    } else {
        aiAnalyzer = null;
        console.warn('⚠️ ANTHROPIC_API_KEY not found. AI features disabled.');
    }

} catch (error) {
    console.error('❌ A critical service (PdfProcessor, EstimationEngine, or ReportGenerator) failed to initialize. Some endpoints may fail.', error.message);
}

/**
 * POST /api/estimation/generate-from-upload
 * Main endpoint for uploading a PDF and generating a full estimation.
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    try {
        console.log('📄 Starting PDF upload and estimation generation...');
        
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
        }

        if (!pdfProcessor || !estimationEngine) {
            return res.status(503).json({ success: false, error: 'Core estimation services are not available. Check server logs.' });
        }

        const { location = 'Sydney' } = req.body;
        const projectId = `PROJ-${Date.now()}`;

        // Step 1: Process PDF to extract text and basic structure
        console.log('🔍 Processing PDF...');
        const structuredData = await pdfProcessor.process(req.file.buffer);

        let analysisResult;
        
        // Step 2: AI Analysis (if available) or Fallback
        if (aiAnalyzer) {
            console.log('🤖 Starting AI analysis...');
            analysisResult = await aiAnalyzer.analyzeStructuralDrawings(structuredData, projectId);
        } else {
            // Fallback analysis if AI service is disabled or failed to load
            console.log('🔧 Using fallback analysis (no AI)...');
            analysisResult = {
                projectId,
                confidence: structuredData.confidence || 0.7,
                quantityTakeoff: createFallbackQuantities(structuredData),
                specifications: structuredData.specifications,
                riskAssessment: {
                    cost_factors: {
                        complexity_multiplier: 1.1,
                        data_confidence_factor: 1.0,
                        size_factor: 1.0
                    }
                }
            };
        }

        // Step 3: Generate detailed cost estimation from the analysis
        console.log('💰 Generating cost estimation...');
        const estimationData = await estimationEngine.generateEstimation(analysisResult, location);

        res.json({
            success: true,
            message: 'Estimation generated successfully',
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
        console.error('❌ Estimation generation error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to process PDF and generate estimation' });
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
            return res.status(400).json({ success: false, error: 'Missing estimation data or project ID' });
        }
        if (!reportGenerator) {
            return res.status(503).json({ success: false, error: 'Report generation service not available' });
        }

        console.log(`📊 Generating ${format.toUpperCase()} report for project ${projectId}...`);
        const report = await reportGenerator.generateReport(estimationData, format, projectId);

        let contentType = 'text/html';
        if (format === 'json') contentType = 'application/json';
        if (format === 'csv') contentType = 'text/csv';

        res.set('Content-Type', contentType);
        
        if (format === 'html') {
            res.send(report.content);
        } else {
            res.json({ success: true, data: report });
        }

    } catch (error) {
        console.error('❌ Report generation error:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Failed to generate report' });
    }
});


/**
 * GET /api/estimation/health
 * Health check endpoint for the estimation service and its sub-modules.
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Estimation service is healthy',
        timestamp: new Date().toISOString(),
        services: {
            pdf_processor: pdfProcessor ? 'ready' : 'unavailable',
            ai_analyzer: aiAnalyzer ? 'ready' : 'unavailable',
            estimation_engine: estimationEngine ? 'ready' : 'unavailable',
            report_generator: reportGenerator ? 'ready' : 'unavailable',
            anthropic_api_key: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
        }
    });
});

// --- Helper Functions for Fallback Logic ---

function createFallbackQuantities(structuredData) {
    const steelSchedules = structuredData.steel_schedules || [];
    const members = [];
    let totalWeight = 0;
    
    steelSchedules.forEach(schedule => {
        const quantity = parseInt(schedule.quantity) || 1;
        const length = parseFloat(schedule.length) / 1000 || 6.0;
        const weightPerM = estimateWeightFromDesignation(schedule.designation);
        const totalMemberWeight = quantity * length * weightPerM;
        
        members.push({
            section: schedule.designation,
            total_length_m: quantity * length,
            weight_per_m: weightPerM,
            total_weight_kg: totalMemberWeight,
            member_type: classifyMemberType(schedule.designation),
            quantity: quantity,
            average_length_m: length
        });
        totalWeight += totalMemberWeight;
    });

    return {
        steel_quantities: { members, summary: { total_steel_weight_tonnes: totalWeight / 1000, member_count: members.length } },
        concrete_quantities: { elements: [], summary: { total_concrete_m3: 0 } },
        reinforcement_quantities: { deformed_bars: {}, mesh: {} }
    };
}

function estimateWeightFromDesignation(designation) {
    const match = designation.match(/(\d+\.?\d*)/g);
    if (!match) return 20;
    if (designation.toUpperCase().includes('UB') || designation.toUpperCase().includes('UC')) {
        return parseFloat(match[match.length - 1]) || 30;
    }
    return 20;
}

function classifyMemberType(designation) {
    const d = designation.toUpperCase();
    if (d.includes('UB') || d.includes('PFC')) return 'beam';
    if (d.includes('UC')) return 'column';
    return 'beam';
}

export default router;
