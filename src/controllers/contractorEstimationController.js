// controllers/contractorEstimationController.js
const Estimation = require('../models/Estimation');
const User = require('../models/User'); // Assuming you have a User model
const { getFileInfo, getFileType, deleteFiles } = require('../middleware/fileUpload');
const path = require('path');
const fs = require('fs');

// Get all estimations for the contractor
const getEstimations = async (req, res) => {
    try {
        const contractorId = req.user.id; // From auth middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        const sort = req.query.sort || '-createdAt';

        // Build query
        const query = { contractorId };
        if (status) {
            query.status = status;
        }

        const estimations = await Estimation.find(query)
            .populate('estimatedBy', 'name email')
            .sort(sort)
            .limit(limit)
            .skip((page - 1) * limit)
            .lean();

        const total = await Estimation.countDocuments(query);

        // Add status info and format response
        const formattedEstimations = estimations.map(est => {
            const estimation = new Estimation(est);
            return {
                ...est,
                statusInfo: estimation.getStatusInfo(),
                totalFiles: est.uploadedFiles.length + (est.resultFile ? 1 : 0)
            };
        });

        res.json({
            success: true,
            estimations: formattedEstimations,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total,
                limit
            }
        });

    } catch (error) {
        console.error('Get estimations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimations',
            error: error.message
        });
    }
};

// Get single estimation details
const getEstimation = async (req, res) => {
    try {
        const { id } = req.params;
        const contractorId = req.user.id;

        const estimation = await Estimation.findOne({
            _id: id,
            contractorId
        }).populate('estimatedBy', 'name email');

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Mark as viewed by contractor
        if (!estimation.viewedByContractor) {
            estimation.viewedByContractor = true;
            estimation.lastViewedDate = new Date();
            await estimation.save();
        }

        res.json({
            success: true,
            estimation: {
                ...estimation.toObject(),
                statusInfo: estimation.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Get estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation',
            error: error.message
        });
    }
};

// Create new estimation request
const createEstimation = async (req, res) => {
    try {
        const contractorId = req.user.id;
        const {
            projectTitle,
            description,
            category,
            priority,
            expectedBudget,
            deadline
        } = req.body;

        // Validate required fields
        if (!projectTitle || !description) {
            return res.status(400).json({
                success: false,
                message: 'Project title and description are required'
            });
        }

        // Process uploaded files
        const uploadedFiles = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                uploadedFiles.push({
                    ...getFileInfo(file),
                    fileType: getFileType(file.originalname, file.mimetype)
                });
            });
        }

        // Create estimation
        const estimation = new Estimation({
            contractorId,
            projectTitle: projectTitle.trim(),
            description: description.trim(),
            category: category || 'other',
            priority: priority || 'medium',
            expectedBudget: expectedBudget ? parseFloat(expectedBudget) : undefined,
            deadline: deadline ? new Date(deadline) : undefined,
            uploadedFiles
        });

        await estimation.save();

        // Populate contractor info for response
        await estimation.populate('contractorId', 'name email');

        res.status(201).json({
            success: true,
            message: 'Estimation request created successfully',
            estimation: {
                ...estimation.toObject(),
                statusInfo: estimation.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Create estimation error:', error);
        
        // Clean up uploaded files if estimation creation failed
        if (req.files) {
            const filePaths = req.files.map(file => file.path);
            await deleteFiles(filePaths);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create estimation request',
            error: error.message
        });
    }
};

// Update estimation (only allowed for pending status)
const updateEstimation = async (req, res) => {
    try {
        const { id } = req.params;
        const contractorId = req.user.id;
        const updates = req.body;

        const estimation = await Estimation.findOne({
            _id: id,
            contractorId,
            status: 'pending' // Only allow updates for pending estimations
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found or cannot be updated'
            });
        }

        // Update allowed fields
        const allowedUpdates = [
            'projectTitle', 'description', 'category', 
            'priority', 'expectedBudget', 'deadline'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                if (field === 'expectedBudget' && updates[field]) {
                    estimation[field] = parseFloat(updates[field]);
                } else if (field === 'deadline' && updates[field]) {
                    estimation[field] = new Date(updates[field]);
                } else if (updates[field]) {
                    estimation[field] = updates[field].toString().trim();
                }
            }
        });

        await estimation.save();

        res.json({
            success: true,
            message: 'Estimation updated successfully',
            estimation: {
                ...estimation.toObject(),
                statusInfo: estimation.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Update estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation',
            error: error.message
        });
    }
};

// Add files to existing estimation
const addFiles = async (req, res) => {
    try {
        const { id } = req.params;
        const contractorId = req.user.id;

        const estimation = await Estimation.findOne({
            _id: id,
            contractorId,
            status: { $in: ['pending', 'in-progress'] }
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found or cannot add files'
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files provided'
            });
        }

        // Process new files
        const newFiles = req.files.map(file => ({
            ...getFileInfo(file),
            fileType: getFileType(file.originalname, file.mimetype)
        }));

        // Add to existing files
        estimation.uploadedFiles.push(...newFiles);
        await estimation.save();

        res.json({
            success: true,
            message: `${newFiles.length} file(s) added successfully`,
            estimation: {
                ...estimation.toObject(),
                statusInfo: estimation.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Add files error:', error);
        
        // Clean up uploaded files if operation failed
        if (req.files) {
            const filePaths = req.files.map(file => file.path);
            await deleteFiles(filePaths);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to add files',
            error: error.message
        });
    }
};

// Delete estimation (only pending)
const deleteEstimation = async (req, res) => {
    try {
        const { id } = req.params;
        const contractorId = req.user.id;

        const estimation = await Estimation.findOne({
            _id: id,
            contractorId,
            status: 'pending'
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found or cannot be deleted'
            });
        }

        // Delete associated files
        const filePaths = estimation.uploadedFiles.map(file => file.filePath);
        if (estimation.resultFile) {
            filePaths.push(estimation.resultFile.filePath);
        }

        await deleteFiles(filePaths);
        await Estimation.findByIdAndDelete(id);

        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });

    } catch (error) {
        console.error('Delete estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete estimation',
            error: error.message
        });
    }
};

// Download file
const downloadFile = async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const contractorId = req.user.id;
        const { type } = req.query; // 'uploaded' or 'result'

        const estimation = await Estimation.findOne({
            _id: id,
            contractorId
        });

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        let file;
        if (type === 'result' && estimation.resultFile) {
            file = estimation.resultFile;
        } else {
            file = estimation.uploadedFiles.find(f => f._id.toString() === fileId);
        }

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const filePath = path.resolve(file.filePath);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        
        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download file',
            error: error.message
        });
    }
};

// Get contractor's estimation statistics
const getStats = async (req, res) => {
    try {
        const contractorId = req.user.id;

        const stats = await Estimation.aggregate([
            { $match: { contractorId: req.user._id } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$estimatedAmount' }
                }
            }
        ]);

        const summary = {
            pending: { count: 0, totalAmount: 0 },
            'in-progress': { count: 0, totalAmount: 0 },
            completed: { count: 0, totalAmount: 0 },
            rejected: { count: 0, totalAmount: 0 },
            cancelled: { count: 0, totalAmount: 0 },
            total: { count: 0, totalAmount: 0 }
        };

        stats.forEach(item => {
            if (summary[item._id]) {
                summary[item._id] = {
                    count: item.count,
                    totalAmount: item.totalAmount || 0
                };
            }
            summary.total.count += item.count;
            summary.total.totalAmount += item.totalAmount || 0;
        });

        res.json({
            success: true,
            stats: summary
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get statistics',
            error: error.message
        });
    }
};

module.exports = {
    getEstimations,
    getEstimation,
    createEstimation,
    updateEstimation,
    addFiles,
    deleteEstimation,
    downloadFile,
    getStats
};
