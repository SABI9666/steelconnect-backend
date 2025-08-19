// controllers/adminEstimationController.js
const Estimation = require('../models/Estimation');
const User = require('../models/User');
const { getFileInfo, deleteFiles, deleteFile } = require('../middleware/fileUpload');
const path = require('path');
const fs = require('fs');

// Get all estimations for admin
const getAllEstimations = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const contractorId = req.query.contractorId;
        const sort = req.query.sort || '-createdAt';

        // Build query
        const query = {};
        if (status) query.status = status;
        if (contractorId) query.contractorId = contractorId;

        const estimations = await Estimation.find(query)
            .populate('contractorId', 'name email type')
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
        console.error('Get all estimations error:', error);
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

        const estimation = await Estimation.findById(id)
            .populate('contractorId', 'name email type phone company')
            .populate('estimatedBy', 'name email');

        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
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

// Update estimation status
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const adminId = req.user.id;

        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Update status and related fields
        estimation.status = status;
        
        if (status === 'in-progress' && !estimation.estimationStartDate) {
            estimation.estimationStartDate = new Date();
            estimation.estimatedBy = adminId;
        }
        
        if (status === 'completed' && !estimation.estimationCompletedDate) {
            estimation.estimationCompletedDate = new Date();
        }

        await estimation.save();

        res.json({
            success: true,
            message: 'Estimation status updated successfully',
            estimation: {
                ...estimation.toObject(),
                statusInfo: estimation.getStatusInfo()
            }
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation status',
            error: error.message
        });
    }
};

// Update estimation amount
const updateAmount = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        estimation.estimatedAmount = parseFloat(amount);
        await estimation.save();

        res.json({
            success: true,
            message: 'Estimation amount updated successfully',
            estimation: estimation.toObject()
        });

    } catch (error) {
        console.error('Update amount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation amount',
            error: error.message
        });
    }
};

// Update estimation details/breakdown
const updateDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { estimationDetails, adminNotes } = req.body;

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Update estimation details
        if (estimationDetails) {
            estimation.estimationDetails = {
                materials: estimationDetails.materials || [],
                labor: estimationDetails.labor || [],
                additionalCosts: estimationDetails.additionalCosts || [],
                notes: estimationDetails.notes || ''
            };
        }

        if (adminNotes !== undefined) {
            estimation.adminNotes = adminNotes;
        }

        await estimation.save(); // Pre-save middleware will calculate totals

        res.json({
            success: true,
            message: 'Estimation details updated successfully',
            estimation: estimation.toObject()
        });

    } catch (error) {
        console.error('Update details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation details',
            error: error.message
        });
    }
};

// Upload result PDF
const uploadResult = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = req.user.id;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No result file provided'
            });
        }

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            // Delete uploaded file if estimation not found
            await deleteFile(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Delete old result file if exists
        if (estimation.resultFile && estimation.resultFile.filePath) {
            await deleteFile(estimation.resultFile.filePath);
        }

        // Save new result file info
        estimation.resultFile = {
            ...getFileInfo(req.file),
            uploadDate: new Date()
        };

        // Update status and completion info
        if (estimation.status !== 'completed') {
            estimation.status = 'completed';
            estimation.estimationCompletedDate = new Date();
            estimation.estimatedBy = adminId;
        }

        await estimation.save();

        res.json({
            success: true,
            message: 'Result PDF uploaded successfully',
            estimation: estimation.toObject()
        });

    } catch (error) {
        console.error('Upload result error:', error);
        
        // Clean up uploaded file if operation failed
        if (req.file) {
            await deleteFile(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to upload result PDF',
            error: error.message
        });
    }
};

// Delete estimation
const deleteEstimation = async (req, res) => {
    try {
        const { id } = req.params;

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
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

// Download file (for admin)
const downloadFile = async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const { type } = req.query; // 'uploaded' or 'result'

        const estimation = await Estimation.findById(id);
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
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        
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

// Get estimation dashboard stats
const getDashboardStats = async (req, res) => {
    try {
        const summary = await Estimation.getSummary();
        
        // Additional stats
        const recentEstimations = await Estimation.find()
            .populate('contractorId', 'name email')
            .sort('-createdAt')
            .limit(5)
            .lean();

        const overdue = await Estimation.find({
            deadline: { $lt: new Date() },
            status: { $in: ['pending', 'in-progress'] }
        }).countDocuments();

        res.json({
            success: true,
            stats: {
                ...summary,
                overdue,
                recent: recentEstimations
            }
        });

    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard statistics',
            error: error.message
        });
    }
};

// Bulk status update
const bulkUpdateStatus = async (req, res) => {
    try {
        const { estimationIds, status } = req.body;
        const adminId = req.user.id;

        if (!estimationIds || !Array.isArray(estimationIds) || estimationIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Estimation IDs array is required'
            });
        }

        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const updateData = { status };
        
        if (status === 'in-progress') {
            updateData.estimationStartDate = new Date();
            updateData.estimatedBy = adminId;
        } else if (status === 'completed') {
            updateData.estimationCompletedDate = new Date();
        }

        const result = await Estimation.updateMany(
            { _id: { $in: estimationIds } },
            updateData
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} estimation(s) updated successfully`,
            updated: result.modifiedCount
        });

    } catch (error) {
        console.error('Bulk update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimations',
            error: error.message
        });
    }
};

// Assign estimation to admin
const assignEstimation = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminId } = req.body;
        const currentAdminId = req.user.id;

        // If no adminId provided, assign to current admin
        const assignToId = adminId || currentAdminId;

        // Verify the admin exists
        const admin = await User.findOne({
            _id: assignToId,
            $or: [{ role: 'admin' }, { type: 'admin' }]
        });

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: 'Invalid admin ID'
            });
        }

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        estimation.estimatedBy = assignToId;
        if (estimation.status === 'pending') {
            estimation.status = 'in-progress';
            estimation.estimationStartDate = new Date();
        }

        await estimation.save();
        await estimation.populate('estimatedBy', 'name email');

        res.json({
            success: true,
            message: `Estimation assigned to ${admin.name}`,
            estimation: estimation.toObject()
        });

    } catch (error) {
        console.error('Assign estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign estimation',
            error: error.message
        });
    }
};

// Add admin notes
const addNotes = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        estimation.adminNotes = notes || '';
        await estimation.save();

        res.json({
            success: true,
            message: 'Notes updated successfully',
            estimation: estimation.toObject()
        });

    } catch (error) {
        console.error('Add notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notes',
            error: error.message
        });
    }
};

// Delete uploaded file
const deleteUploadedFile = async (req, res) => {
    try {
        const { id, fileId } = req.params;

        const estimation = await Estimation.findById(id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const fileIndex = estimation.uploadedFiles.findIndex(
            file => file._id.toString() === fileId
        );

        if (fileIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const file = estimation.uploadedFiles[fileIndex];
        
        // Delete physical file
        await deleteFile(file.filePath);
        
        // Remove from database
        estimation.uploadedFiles.splice(fileIndex, 1);
        await estimation.save();

        res.json({
            success: true,
            message: 'File deleted successfully'
        });

    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            error: error.message
        });
    }
};

// Get estimation statistics for admin dashboard
const getEstimationStats = async (req, res) => {
    try {
        const summary = await Estimation.getSummary();
        
        // Additional admin-specific stats
        const avgCompletionTime = await Estimation.aggregate([
            {
                $match: {
                    status: 'completed',
                    estimationStartDate: { $exists: true },
                    estimationCompletedDate: { $exists: true }
                }
            },
            {
                $project: {
                    completionTime: {
                        $divide: [
                            { $subtract: ['$estimationCompletedDate', '$estimationStartDate'] },
                            1000 * 60 * 60 * 24 // Convert to days
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgDays: { $avg: '$completionTime' }
                }
            }
        ]);

        const monthlyStats = await Estimation.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$estimatedAmount' }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        res.json({
            success: true,
            stats: {
                ...summary,
                avgCompletionDays: avgCompletionTime[0]?.avgDays || 0,
                monthlyTrends: monthlyStats
            }
        });

    } catch (error) {
        console.error('Get estimation stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get estimation statistics',
            error: error.message
        });
    }
};

module.exports = {
    getAllEstimations,
    getEstimation,
    updateStatus,
    updateAmount,
    updateDetails,
    uploadResult,
    deleteEstimation,
    downloadFile,
    deleteUploadedFile,
    assignEstimation,
    addNotes,
    getEstimationStats,
    bulkUpdateStatus
};