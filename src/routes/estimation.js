// src/routes/estimation.js - CORRECTED AND FINAL VERSION
import express from 'express';
import multer from 'multer';

const router = express.Router();

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
// Services are now imported dynamically and checked individually to prevent crashes.
let pdfProcessor, aiAnalyzer, estimationEngine, reportGenerator;

try {
    const { PdfProcessor } = await import('../services/pdfprocessor.js');
    const { EstimationEngine } = await import('../services/cost-estimation-engine.js');
    const ReportGeneratorModule = await import('../services/reportGenerator.js');

    pdfProcessor = new PdfProcessor();
    estimationEngine = new EstimationEngine();
    reportGenerator = new ReportGeneratorModule.default();

    // Conditionally import and initialize the AI Analyzer.
    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const { EnhancedAIAnalyzer } = await import('../services/aiAnalyzer.js');
            aiAnalyzer = new EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
        } catch (e) {
            aiAnalyzer = null; // Set to null if missing, so the app doesn't crash.
            console.warn('⚠️ AI Analyzer service file could not be loaded. AI features will be disabled.');
        }
    } else {
        aiAnalyzer = null;
        console.warn('⚠️ ANTHROPIC_API_KEY not found. AI features disabled.');
    }
    console.log('✅ Estimation services initialized.');
} catch (error) {
    console.error('❌ A critical service failed to initialize:', error.message);
}

/**
 * POST /api/estimation/generate-from-upload
 * Main endpoint for PDF processing and estimation generation.
 */
router.post('/generate-from-upload', upload.single('drawing'), async (req, res) => {
    try {
        console.log('📄 Starting PDF upload and estimation generation...');
        
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
        }
        
        // Check for CORE services. The app can run without the AI Analyzer.
        if (!pdfProcessor || !estimationEngine) {
            console.error('❌ Core services (PDF Processor or Estimation Engine) are unavailable.');
            return res.status(503).json({ success: false, error: 'A core estimation service is not available. Please check server logs.' });
        }

        const { location = 'Sydney' } = req.body;
        const projectId = `PROJ-${Date.now()}`;

        // Step 1: Process the PDF to extract structured data.
        console.log('🔍 Processing PDF...');
        const structuredData = await pdfProcessor.process(req.file.buffer);

        let analysisResult;
        
        // Step 2: Use the AI Analyzer if it's available, otherwise use a reliable fallback.
        if (aiAnalyzer) {
            console.log('🤖 Starting AI analysis...');
            analysisResult = await aiAnalyzer.analyzeStructuralDrawings(structuredData, projectId);
        } else {
            // This is the fallback logic when the AI service is missing.
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

        // Step 3: Generate the detailed cost estimation using the engine.
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
 * GET /api/estimation/health
 * Health check endpoint.
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Estimation service is healthy',
        timestamp: new Date().toISOString(),
        services: {
            pdf_processor: pdfProcessor ? 'ready' : 'unavailable',
            estimation_engine: estimationEngine ? 'ready' : 'unavailable',
            report_generator: reportGenerator ? 'ready' : 'unavailable',
            ai_analyzer: aiAnalyzer ? 'ready' : 'unavailable',
            anthropic_api_key: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
        }
    });
});

// Helper function to create fallback quantities from PDF data when AI is offline.
function createFallbackQuantities(structuredData) {
    const steelSchedules = structuredData.steel_schedules || [];
    const members = [];
    let totalWeight = 0;
    
    steelSchedules.forEach(schedule => {
        const quantity = parseInt(schedule.quantity) || 1;
        const length = parseFloat(schedule.length) / 1000 || 6.0; // Convert mm to m
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

    const totalConcrete = Math.max(10, totalWeight / 1000 * 5);

    return {
        steel_quantities: {
            members: members,
            summary: { total_steel_weight_tonnes: totalWeight / 1000, member_count: steelSchedules.length }
        },
        concrete_quantities: {
            elements: [{ element_type: "foundation", volume_m3: totalConcrete, grade: "N32" }],
            summary: { total_concrete_m3: totalConcrete }
        },
        reinforcement_quantities: {
            deformed_bars: { n16: Math.round(totalConcrete * 60) }, // 60kg/m³ ratio
            mesh: { sl72: Math.round(totalConcrete * 10) } // 10m²/m³ ratio
        }
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
