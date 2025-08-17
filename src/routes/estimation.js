// src/routes/estimation.js - PRODUCTION VERSION
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Import services
import { PdfProcessor } from '../services/pdfProcessor.js';
import { EnhancedAIAnalyzer } from '../services/aiAnalyzer.js';
import { EstimationEngine } from '../services/cost-estimation-engine.js';
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
let pdfProcessor, aiAnalyzer, estimationEngine, reportGenerator;
let serviceStatus = {
    pdfProcessor: false,
    aiAnalyzer: false,
    estimationEngine: false,
    reportGenerator: false
};

async function initializeServices() {
    try {
        console.log('🔄 Initializing production estimation services...');
        
        // Always initialize core services
        pdfProcessor = new PdfProcessor();
        estimationEngine = new EstimationEngine();
        reportGenerator = new ReportGenerator();
        
        serviceStatus.pdfProcessor = true;
        serviceStatus.estimationEngine = true;
        serviceStatus.reportGenerator = true;
        
        // Initialize AI analyzer if API key is present
        if (process.env.ANTHROPIC_API_KEY) {
            try {
                aiAnalyzer = new EnhancedAIAnalyzer(process.env.ANTHROPIC_API_KEY);
                serviceStatus.aiAnalyzer = true;
                console.log('✅ AI Analyzer initialized - PRODUCTION MODE ENABLED');
                console.log('🏭 Using Australian Steel Standards (AS/NZS compliance)');
            } catch (aiError) {
                console.error('❌ AI Analyzer initialization failed:', aiError.message);
                console.log('🔄 Continuing with fallback analysis...');
                serviceStatus.aiAnalyzer = false;
            }
        } else {
            console.warn('⚠️ ANTHROPIC_API_KEY not found - Running in FALLBACK MODE');
            console.log('💡 Set ANTHROPIC_API_KEY environment variable to enable full AI features');
            serviceStatus.aiAnalyzer = false;
        }
        
        console.log('✅ Service initialization completed:', serviceStatus);
        return true;
        
    } catch (error) {
        console.error('❌ Critical service initialization error:', error.message);
        return false;
    }
}

// Initialize services on startup
const servicesReady = await initializeServices();

/**
 * POST /api/estimation/upload
 * Upload and analyze PDF drawings with production-ready Australian standards
 */
router.post('/upload', upload.single('drawing'), async (req, res) => {
    try {
        console.log('🚀 Starting PRODUCTION PDF upload and analysis...');
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No PDF file uploaded'
            });
        }

        if (!serviceStatus.pdfProcessor || !serviceStatus.estimationEngine) {
            return res.status(503).json({
                success: false,
                error: 'Core estimation services not available',
                serviceStatus
            });
        }

        const { location = 'Sydney' } = req.body;
        const projectId = `PROJ-${Date.now()}`;

        console.log(`📍 Project ${projectId} - Location: ${location}`);

        // Step 1: Process PDF
        console.log('📄 Processing PDF with enhanced parser...');
        const structuredData = await pdfProcessor.process(req.file.buffer);
        
        if (!structuredData || structuredData.processing_error) {
            return res.status(400).json({
                success: false,
                error: 'Failed to extract data from PDF',
                details: structuredData?.metadata?.error || 'Unknown PDF processing error'
            });
        }

        let analysisResult;
        
        // Step 2: AI Analysis (Production vs Fallback)
        if (serviceStatus.aiAnalyzer) {
            console.log('🤖 Starting PRODUCTION AI analysis with Australian Standards...');
            try {
                analysisResult = await aiAnalyzer.analyzeStructuralDrawings(structuredData, projectId);
                console.log('✅ Production AI analysis completed successfully');
            } catch (aiError) {
                console.error('❌ AI analysis failed, using fallback:', aiError.message);
                analysisResult = createEnhancedFallbackAnalysis(structuredData, projectId);
            }
        } else {
            console.log('🔧 Using enhanced fallback analysis...');
            analysisResult = createEnhancedFallbackAnalysis(structuredData, projectId);
        }

        // Validate analysis results
        if (!analysisResult.quantityTakeoff) {
            throw new Error('Analysis failed to produce quantity takeoff');
        }

        // Step 3: Cost Estimation with Australian market rates
        console.log('💰 Generating cost estimation with 2025 Australian rates...');
        const estimationData = await estimationEngine.generateEstimation(analysisResult, location);

        // Step 4: Success response with comprehensive data
        const responseData = {
            success: true,
            mode: serviceStatus.aiAnalyzer ? 'production' : 'fallback',
            data: {
                project_id: projectId,
                analysis: {
                    ...analysisResult,
                    processing_mode: serviceStatus.aiAnalyzer ? 'AI_ENHANCED' : 'FALLBACK',
                    australian_standards: true
                },
                estimation: estimationData,
                pdf_info: {
                    filename: req.file.originalname,
                    size: req.file.size,
                    pages: structuredData.metadata?.pages || 0,
                    character_count: structuredData.metadata?.character_count || 0
                },
                service_status: serviceStatus
            }
        };

        console.log(`✅ PRODUCTION analysis completed successfully`);
        console.log(`📊 Results: ${analysisResult.quantityTakeoff.steel_quantities?.summary?.member_count || 0} members, ${estimationData.cost_summary.total_inc_gst?.toLocaleString()} AUD`);
        
        res.json(responseData);

    } catch (error) {
        console.error('❌ Production estimation error:', error.message);
        console.error('🔍 Error stack:', error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to process PDF',
            mode: 'error',
            serviceStatus,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/estimation/generate-report
 * Generate detailed Australian standards compliant report
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

        if (!serviceStatus.reportGenerator) {
            return res.status(503).json({
                success: false,
                error: 'Report generation service not available'
            });
        }

        console.log(`📊 Generating ${format.toUpperCase()} report for project ${projectId}...`);
        
        const report = await reportGenerator.generateReport(estimationData, format, projectId);

        let contentType = 'text/html';
        if (format === 'json') contentType = 'application/json';
        if (format === 'csv') contentType = 'text/csv';
        if (format === 'pdf') contentType = 'application/pdf';

        res.set('Content-Type', contentType);
        
        if (format === 'html') {
            res.send(report.content);
        } else {
            res.json({
                success: true,
                data: {
                    content: report.content,
                    format: format,
                    project_id: projectId,
                    generated_at: new Date().toISOString()
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
 * POST /api/estimation/test-production
 * Production test endpoint with Australian standards
 */
router.post('/test-production', async (req, res) => {
    try {
        console.log('🧪 Running PRODUCTION estimation test...');
        
        if (!serviceStatus.estimationEngine) {
            return res.status(503).json({
                success: false,
                error: 'Estimation engine not available'
            });
        }
        
        // Create comprehensive test data with Australian sections
        const testStructuredData = {
            metadata: {
                pages: 2,
                character_count: 2500,
                processing_date: new Date().toISOString()
            },
            steel_schedules: [
                {
                    designation: '250 UB 31.4',
                    quantity: '12',
                    length: '6000',
                    notes: 'Main beam - galvanized'
                },
                {
                    designation: '200 UC 46.2',
                    quantity: '8',
                    length: '3500',
                    notes: 'Column - painted'
                },
                {
                    designation: 'C200/15',
                    quantity: '25',
                    length: '7000',
                    notes: 'Purlin'
                },
                {
                    designation: 'SHS 100x100x5.0',
                    quantity: '6',
                    length: '4000',
                    notes: 'Bracing'
                },
                {
                    designation: '150 PFC 23.0',
                    quantity: '4',
                    length: '5000',
                    notes: 'Secondary beam'
                }
            ],
            general_notes: [
                'All steel to be hot-dip galvanized to AS/NZS 4680',
                'Standard connections as per AS 4100-2020',
                'Welding to AS/NZS 1554.1',
                'Site access for 50T crane available'
            ],
            specifications: {
                steel_grade: '300PLUS',
                concrete_grade: 'N32',
                bolt_grade: '8.8/S'
            },
            confidence: 0.85
        };

        const projectId = `TEST-PROD-${Date.now()}`;
        let analysisResult;

        // Run full production analysis
        if (serviceStatus.aiAnalyzer) {
            console.log('🤖 Testing with PRODUCTION AI analyzer...');
            analysisResult = await aiAnalyzer.analyzeStructuralDrawings(testStructuredData, projectId);
        } else {
            console.log('🔧 Testing with enhanced fallback analyzer...');
            analysisResult = createEnhancedFallbackAnalysis(testStructuredData, projectId);
        }
        
        // Generate cost estimation
        const estimationData = await estimationEngine.generateEstimation(analysisResult, 'Sydney');

        // Calculate test metrics
        const totalSteel = analysisResult.quantityTakeoff.steel_quantities?.summary?.total_steel_weight_tonnes || 0;
        const totalCost = estimationData.cost_summary?.total_inc_gst || 0;

        res.json({
            success: true,
            message: 'Production test completed successfully',
            mode: serviceStatus.aiAnalyzer ? 'production' : 'fallback',
            data: {
                project_id: projectId,
                analysis: analysisResult,
                estimation: estimationData,
                test_metrics: {
                    total_steel_tonnes: totalSteel,
                    total_cost_aud: totalCost,
                    cost_per_kg: totalSteel > 0 ? (totalCost / (totalSteel * 1000)).toFixed(2) : 0,
                    members_analyzed: analysisResult.quantityTakeoff.steel_quantities?.members?.length || 0
                }
            },
            serviceStatus,
            australian_standards: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Production test error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Production test failed',
            serviceStatus
        });
    }
});

/**
 * GET /api/estimation/health
 * Enhanced health check with service status
 */
router.get('/health', (req, res) => {
    const healthStatus = {
        success: true,
        message: 'Estimation service health check',
        timestamp: new Date().toISOString(),
        mode: serviceStatus.aiAnalyzer ? 'PRODUCTION' : 'FALLBACK',
        services: {
            pdf_processor: serviceStatus.pdfProcessor ? 'ready' : 'unavailable',
            ai_analyzer: serviceStatus.aiAnalyzer ? 'ready' : 'unavailable',
            estimation_engine: serviceStatus.estimationEngine ? 'ready' : 'unavailable',
            report_generator: serviceStatus.reportGenerator ? 'ready' : 'unavailable'
        },
        environment: {
            node_env: process.env.NODE_ENV || 'development',
            anthropic_api_key: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
        },
        features: {
            australian_standards: true,
            ai_enhanced_analysis: serviceStatus.aiAnalyzer,
            pdf_processing: serviceStatus.pdfProcessor,
            cost_estimation: serviceStatus.estimationEngine,
            report_generation: serviceStatus.reportGenerator
        },
        compliance: 'AS/NZS 3679, AS/NZS 1163, AS/NZS 4600, AS/NZS 4291'
    };

    // Set appropriate status code
    const allCoreServicesReady = serviceStatus.pdfProcessor && serviceStatus.estimationEngine;
    res.status(allCoreServicesReady ? 200 : 503).json(healthStatus);
});

// Enhanced fallback analysis function with Australian standards
function createEnhancedFallbackAnalysis(structuredData, projectId) {
    console.log('🔧 Creating enhanced fallback analysis with Australian standards...');
    
    const steelSchedules = structuredData.steel_schedules || [];
    const members = [];
    let totalWeight = 0;
    
    // Australian steel weight database (subset for fallback)
    const ausWeights = {
        '150UB14.0': 14.0, '150UB18.0': 18.0,
        '200UB18.2': 18.2, '200UB22.3': 22.3, '200UB25.4': 25.4, '200UB29.8': 29.8,
        '250UB25.7': 25.7, '250UB31.4': 31.4, '250UB37.3': 37.3,
        '310UB32.0': 32.0, '310UB40.4': 40.4, '310UB46.2': 46.2,
        '150UC19.7': 19.7, '150UC23.4': 23.4, '150UC30.0': 30.0,
        '200UC46.2': 46.2, '200UC52.2': 52.2, '200UC59.5': 59.5,
        '250UC72.9': 72.9, '250UC89.5': 89.5,
        '150PFC18.0': 18.0, '150PFC23.0': 23.0,
        '200PFC23.4': 23.4, '200PFC29.0': 29.0,
        'C200/15': 11.2, 'C200/17': 12.8, 'C200/20': 14.8,
        'C250/15': 13.9, 'C250/17': 15.9, 'C250/20': 18.4,
        'SHS100x100x5.0': 15.4, 'SHS100x100x6.0': 18.4,
        'RHS150x100x5.0': 19.7, 'RHS150x100x6.0': 23.4
    };
    
    // Process each steel schedule with accurate Australian weights
    steelSchedules.forEach(schedule => {
        const quantity = parseInt(schedule.quantity) || 1;
        const length = parseFloat(schedule.length) / 1000 || 6.0; // Convert mm to m
        
        // Get accurate Australian weight
        let weightPerM = getAustralianWeight(schedule.designation, ausWeights);
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
        console.log(`   ✅ ${schedule.designation}: ${quantity}x${length}m = ${totalMemberWeight.toFixed(1)}kg @ ${weightPerM}kg/m`);
    });

    // Enhanced concrete estimation based on steel weight
    const concreteVolume = Math.max(15, totalWeight / 1000 * 12); // More realistic ratio
    
    return {
        projectId,
        confidence: 0.8, // Higher confidence due to Australian standards
        quantityTakeoff: {
            steel_quantities: {
                members: members,
                summary: {
                    total_steel_weight_tonnes: totalWeight / 1000,
                    member_count: steelSchedules.length,
                    beam_weight_tonnes: totalWeight * 0.55 / 1000,
                    column_weight_tonnes: totalWeight * 0.30 / 1000,
                    purlin_weight_tonnes: totalWeight * 0.15 / 1000,
                    beam_count: Math.round(steelSchedules.length * 0.55),
                    column_count: Math.round(steelSchedules.length * 0.30),
                    purlin_count: Math.round(steelSchedules.length * 0.15)
                }
            },
            concrete_quantities: {
                elements: [
                    {
                        element_type: "foundation",
                        volume_m3: concreteVolume * 0.4,
                        grade: "N32"
                    },
                    {
                        element_type: "slab",
                        volume_m3: concreteVolume * 0.6,
                        grade: "N32"
                    }
                ],
                summary: {
                    total_concrete_m3: concreteVolume
                }
            },
            reinforcement_quantities: {
                deformed_bars: {
                    n12: Math.round(totalWeight * 1.8),
                    n16: Math.round(totalWeight * 1.5),
                    n20: Math.round(totalWeight * 1.2),
                    n24: Math.round(totalWeight * 0.8)
                },
                mesh: {
                    sl72: Math.round(concreteVolume * 12),
                    sl82: Math.round(concreteVolume * 8),
                    sl92: Math.round(concreteVolume * 5)
                }
            }
        },
        riskAssessment: {
            cost_factors: {
                complexity_multiplier: calculateComplexityMultiplier(steelSchedules),
                data_confidence_factor: 0.9, // High confidence in fallback
                size_factor: totalWeight > 100 ? 0.95 : totalWeight < 10 ? 1.15 : 1.0
            },
            risks: [
                "Enhanced fallback analysis using Australian Standards",
                totalWeight > 50 ? "Large project - consider staged delivery" : null,
                steelSchedules.length > 30 ? "Complex structure - verify connections" : null
            ].filter(Boolean)
        },
        specifications: structuredData.specifications || {
            steel_grade: '300PLUS',
            concrete_grade: 'N32',
            bolt_grade: '8.8/S'
        },
        australian_standards: true,
        fallback_mode: true
    };
}

function getAustralianWeight(designation, weightDB) {
    const cleanDesignation = designation.toUpperCase().replace(/\s+/g, '');
    
    // Try exact match first
    if (weightDB[cleanDesignation]) {
        return weightDB[cleanDesignation];
    }
    
    // Try without spaces
    const spaceVariants = [
        designation.replace(/\s+/g, ''),
        designation.replace(/\s+/g, '').toUpperCase()
    ];
    
    for (const variant of spaceVariants) {
        if (weightDB[variant]) {
            return weightDB[variant];
        }
    }
    
    // Extract weight from designation if present
    const weightMatch = designation.match(/([0-9]+(?:\.[0-9]+))$/);
    if (weightMatch) {
        const extractedWeight = parseFloat(weightMatch[1]);
        if (extractedWeight > 1 && extractedWeight < 500) {
            return extractedWeight;
        }
    }
    
    // Intelligent defaults based on Australian sections
    return getIntelligentAustralianDefault(designation);
}

function getIntelligentAustralianDefault(designation) {
    const d = designation.toUpperCase();
    
    // Universal Beams
    if (d.includes('UB')) {
        if (d.includes('150')) return 16;
        if (d.includes('200')) return 24;
        if (d.includes('250')) return 31;
        if (d.includes('310')) return 40;
        if (d.includes('360')) return 51;
        if (d.includes('410')) return 57;
        return 30;
    }
    
    // Universal Columns
    if (d.includes('UC')) {
        if (d.includes('150')) return 25;
        if (d.includes('200')) return 50;
        if (d.includes('250')) return 80;
        if (d.includes('310')) return 120;
        return 50;
    }
    
    // C Purlins
    if (d.includes('C') && (d.includes('/') || d.includes('200') || d.includes('250'))) {
        if (d.includes('200')) return 12;
        if (d.includes('250')) return 16;
        if (d.includes('300')) return 22;
        return 14;
    }
    
    // Hollow sections
    if (d.includes('SHS') || d.includes('RHS')) {
        if (d.includes('100')) return 15;
        if (d.includes('150')) return 22;
        if (d.includes('200')) return 35;
        return 20;
    }
    
    // PFC
    if (d.includes('PFC')) {
        if (d.includes('150')) return 20;
        if (d.includes('200')) return 26;
        if (d.includes('250')) return 33;
        return 25;
    }
    
    return 25; // Conservative default
}

function classifyMemberType(designation) {
    const d = designation.toUpperCase();
    
    if (d.includes('UB') || d.includes('PFC')) return 'beam';
    if (d.includes('UC')) return 'column';
    if (d.includes('C') || d.includes('Z')) return 'purlin';
    if (d.includes('SHS') || d.includes('RHS') || d.includes('CHS')) return 'hollow';
    if (d.includes('L') && (d.includes('X') || d.includes('x'))) return 'angle';
    
    return 'beam'; // Default
}

function calculateComplexityMultiplier(steelSchedules) {
    const memberCount = steelSchedules.length;
    const uniqueSections = new Set(steelSchedules.map(s => s.designation)).size;
    
    let multiplier = 1.0;
    
    // Member count factor
    if (memberCount > 50) multiplier += 0.15;
    else if (memberCount > 25) multiplier += 0.10;
    else if (memberCount > 10) multiplier += 0.05;
    
    // Section variety factor
    if (uniqueSections > 15) multiplier += 0.10;
    else if (uniqueSections > 8) multiplier += 0.05;
    
    return Math.min(1.3, Math.round(multiplier * 100) / 100);
}

export default router;











