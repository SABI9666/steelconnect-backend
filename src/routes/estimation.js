const express = require('express');
const router = express.Router();
const Estimation = require('../models/Estimation');
const EstimationService = require('../services/estimationService');
const FileProcessor = require('../services/fileProcessor');
const ReportGenerator = require('../services/reportGenerator');
const { validateEstimationInput } = require('../middleware/validation');

// POST /api/estimation/calculate - Calculate steel estimation
router.post('/calculate', validateEstimationInput, async (req, res) => {
    try {
        const {
            projectName,
            projectLocation,
            structureType,
            projectComplexity,
            steelGrade,
            coatingRequirement,
            region,
            totalTonnage,
            additionalRequirements,
            clientId
        } = req.body;

        // Generate detailed estimation
        const estimationResult = await EstimationService.calculateDetailedEstimation({
            projectName,
            projectLocation,
            structureType,
            projectComplexity,
            steelGrade,
            coatingRequirement,
            region,
            totalTonnage: parseFloat(totalTonnage),
            additionalRequirements
        });

        // Save estimation to database
        const savedEstimation = await EstimationService.saveEstimation({
            ...estimationResult,
            userId: req.user.id,
            clientId: clientId || null
        });

        res.status(201).json({
            success: true,
            message: 'Estimation calculated successfully',
            data: savedEstimation
        });

    } catch (error) {
        console.error('Estimation calculation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to calculate estimation',
            error: error.message
        });
    }
});

// POST /api/estimation/process-files - Process uploaded files for tonnage extraction
router.post('/process-files', async (req, res) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }

        const processedResults = [];
        
        for (const [fieldName, files] of Object.entries(req.files)) {
            const fileArray = Array.isArray(files) ? files : [files];
            
            for (const file of fileArray) {
                try {
                    const result = await FileProcessor.processFile(file, fieldName);
                    processedResults.push(result);
                } catch (fileError) {
                    console.error(`Error processing file ${file.name}:`, fileError);
                    processedResults.push({
                        fileName: file.name,
                        success: false,
                        error: fileError.message
                    });
                }
            }
        }

        // Calculate total extracted tonnage
        const totalExtractedTonnage = processedResults
            .filter(result => result.success && result.extractedTonnage)
            .reduce((total, result) => total + result.extractedTonnage, 0);

        res.json({
            success: true,
            data: {
                processedFiles: processedResults,
                totalExtractedTonnage,
                summary: {
                    totalFiles: processedResults.length,
                    successfulExtractions: processedResults.filter(r => r.success && r.extractedTonnage).length,
                    failedProcessing: processedResults.filter(r => !r.success).length
                }
            }
        });

    } catch (error) {
        console.error('File processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process files',
            error: error.message
        });
    }
});

// GET /api/estimation/history - Get user's estimation history
router.get('/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const estimations = await Estimation.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email');

        const total = await Estimation.countDocuments({ userId: req.user.id });

        res.json({
            success: true,
            data: estimations,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Estimation history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation history',
            error: error.message
        });
    }
});

// GET /api/estimation/:id - Get specific estimation
router.get('/:id', async (req, res) => {
    try {
        const estimation = await Estimation.findOne({
            _id: req.params.id,
            userId: req.user.id
        }).populate('userId', 'name email');

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            data: estimation
        });

    } catch (error) {
        console.error('Estimation fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation',
            error: error.message
        });
    }
});

// PUT /api/estimation/:id - Update estimation
router.put('/:id', validateEstimationInput, async (req, res) => {
    try {
        const estimation = await Estimation.findOne({
            _id: req.params.id,
            userId: req.user.id
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Recalculate with new parameters
        const updatedEstimationData = await EstimationService.calculateDetailedEstimation(req.body);

        // Update estimation
        Object.assign(estimation, {
            ...updatedEstimationData,
            updatedAt: new Date()
        });

        await estimation.save();

        res.json({
            success: true,
            message: 'Estimation updated successfully',
            data: estimation
        });

    } catch (error) {
        console.error('Estimation update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation',
            error: error.message
        });
    }
});

// DELETE /api/estimation/:id - Delete estimation
router.delete('/:id', async (req, res) => {
    try {
        const estimation = await Estimation.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });

    } catch (error) {
        console.error('Estimation deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete estimation',
            error: error.message
        });
    }
});

// POST /api/estimation/:id/generate-report - Generate detailed PDF report
router.post('/:id/generate-report', async (req, res) => {
    try {
        const estimation = await Estimation.findOne({
            _id: req.params.id,
            userId: req.user.id
        }).populate('userId', 'name email');

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const reportBuffer = await ReportGenerator.generateDetailedReport(estimation);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Steel_Estimation_${estimation.projectName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
        
        res.send(reportBuffer);

    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate report',
            error: error.message
        });
    }
});

// GET /api/estimation/analytics/dashboard - Get estimation analytics dashboard
router.get('/analytics/dashboard', async (req, res) => {
    try {
        const userId = req.user.id;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [
            totalEstimations,
            recentEstimations,
            avgProjectSize,
            regionDistribution,
            complexityDistribution
        ] = await Promise.all([
            Estimation.countDocuments({ userId }),
            Estimation.countDocuments({ 
                userId, 
                createdAt: { $gte: thirtyDaysAgo } 
            }),
            Estimation.aggregate([
                { $match: { userId: req.user._id } },
                { $group: { _id: null, avgTonnage: { $avg: '$totalTonnage' } } }
            ]),
            Estimation.aggregate([
                { $match: { userId: req.user._id } },
                { $group: { _id: '$region', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Estimation.aggregate([
                { $match: { userId: req.user._id } },
                { $group: { _id: '$projectComplexity', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                totalEstimations,
                recentEstimations,
                averageProjectSize: avgProjectSize[0]?.avgTonnage || 0,
                regionDistribution,
                complexityDistribution,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Analytics dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics data',
            error: error.message
        });
    }
});

module.exports = router;