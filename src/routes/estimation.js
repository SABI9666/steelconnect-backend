// src/routes/estimation.js - Firebase only version for contractors
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- AUTHENTICATION MIDDLEWARE ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            error: 'Authorization token is required.' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token.' 
        });
    }
};

const isContractor = (req, res, next) => {
    if (req.user.type !== 'contractor') {
        return res.status(403).json({ 
            success: false,
            error: 'Contractor access required.' 
        });
    }
    next();
};

// --- FILE UPLOAD CONFIGURATION ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/estimations';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'estimation-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'text/plain'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, DOCX, images, and text files are allowed.'), false);
        }
    }
});

// --- UTILITY FUNCTIONS ---
const getFileInfo = (file) => ({
    fileId: Date.now() + '-' + Math.round(Math.random() * 1E9), // Add unique file ID
    originalName: file.originalname,
    fileName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype
});

const deleteFiles = async (filePaths) => {
    for (const filePath of filePaths) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error('Error deleting file:', filePath, error);
        }
    }
};

const getStatusInfo = (status) => {
    const statusMap = {
        'pending': { text: 'Pending Review', color: 'orange' },
        'in-progress': { text: 'In Progress', color: 'blue' },
        'completed': { text: 'Completed', color: 'green' },
        'rejected': { text: 'Rejected', color: 'red' },
        'cancelled': { text: 'Cancelled', color: 'gray' }
    };
    return statusMap[status] || { text: status, color: 'gray' };
};

// --- CONTRACTOR ROUTES ---

// Create new estimation request (contractor only)
router.post('/create', authenticate, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        const {
            projectType,
            description,
            dimensions,
            materials,
            deadline,
            budget,
            location,
            additionalNotes
        } = req.body;

        // Validation
        if (!projectType || !description) {
            // Clean up uploaded files
            if (req.files && req.files.length > 0) {
                const filePaths = req.files.map(file => file.path);
                await deleteFiles(filePaths);
            }
            return res.status(400).json({
                success: false,
                message: 'Project type and description are required'
            });
        }

        // Process uploaded files
        const uploadedFiles = req.files ? req.files.map(file => ({
            ...getFileInfo(file),
            uploadDate: new Date().toISOString()
        })) : [];

        // Create estimation document
        const estimationData = {
            contractorId: req.user.userId,
            projectType,
            description,
            dimensions: dimensions || '',
            materials: materials || '',
            deadline: deadline ? new Date(deadline).toISOString() : null,
            budget: budget ? parseFloat(budget) : null,
            location: location || '',
            additionalNotes: additionalNotes || '',
            uploadedFiles,
            status: 'pending',
            submissionDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await adminDb.collection('estimations').add(estimationData);

        res.status(201).json({
            success: true,
            message: 'Estimation request created successfully',
            estimation: {
                id: docRef.id,
                ...estimationData
            }
        });

    } catch (error) {
        console.error('Create estimation error:', error);
        
        // Clean up uploaded files if operation failed
        if (req.files && req.files.length > 0) {
            const filePaths = req.files.map(file => file.path);
            await deleteFiles(filePaths);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create estimation request',
            error: error.message
        });
    }
});

// Get contractor's estimations
router.get('/my-estimations', authenticate, isContractor, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;

        let query = adminDb.collection('estimations').where('contractorId', '==', req.user.userId);
        
        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .offset((page - 1) * limit)
            .get();

        const estimations = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            estimations.push({
                id: doc.id,
                ...data,
                statusInfo: getStatusInfo(data.status),
                canDownloadResult: !!(data.resultFile && data.status === 'completed')
            });
        });

        // Get total count for pagination
        const totalSnapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', req.user.userId)
            .get();
        const total = totalSnapshot.size;

        res.json({
            success: true,
            estimations,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total,
                limit
            }
        });

    } catch (error) {
        console.error('Get my estimations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimations',
            error: error.message
        });
    }
});

// Get single estimation (contractor can only see their own)
router.get('/:id', authenticate, async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        // Check if contractor can access this estimation
        if (req.user.type === 'contractor' && estimationData.contractorId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get contractor details
        let contractor = null;
        if (estimationData.contractorId) {
            try {
                const contractorDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
                if (contractorDoc.exists) {
                    const contractorData = contractorDoc.data();
                    contractor = {
                        name: contractorData.name,
                        email: contractorData.email,
                        type: contractorData.type,
                        phone: contractorData.phone,
                        company: contractorData.company
                    };
                }
            } catch (error) {
                console.error('Error fetching contractor:', error);
            }
        }

        // Get estimatedBy details
        let estimatedBy = null;
        if (estimationData.estimatedBy) {
            try {
                const adminDoc = await adminDb.collection('users').doc(estimationData.estimatedBy).get();
                if (adminDoc.exists) {
                    const adminData = adminDoc.data();
                    estimatedBy = {
                        name: adminData.name,
                        email: adminData.email
                    };
                }
            } catch (error) {
                console.error('Error fetching admin:', error);
            }
        }

        res.json({
            success: true,
            estimation: {
                id: estimationDoc.id,
                ...estimationData,
                contractor,
                estimatedBy,
                statusInfo: getStatusInfo(estimationData.status),
                canDownloadResult: !!(estimationData.resultFile && estimationData.status === 'completed')
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
});

// Download result file (contractor only for their own estimations)
router.get('/:id/result/download', authenticate, isContractor, async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        // Check if contractor owns this estimation
        if (estimationData.contractorId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!estimationData.resultFile || estimationData.status !== 'completed') {
            return res.status(404).json({
                success: false,
                message: 'Result file not available yet'
            });
        }

        const filePath = path.resolve(estimationData.resultFile.filePath);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'Result file not found on server'
            });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${estimationData.resultFile.originalName}"`);
        res.setHeader('Content-Type', estimationData.resultFile.mimeType || 'application/pdf');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download result error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download result file',
            error: error.message
        });
    }
});

// Update estimation (contractor can only update if status is pending)
router.put('/:id', authenticate, isContractor, upload.array('additionalFiles', 5), async (req, res) => {
    try {
        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            // Clean up uploaded files
            if (req.files && req.files.length > 0) {
                const filePaths = req.files.map(file => file.path);
                await deleteFiles(filePaths);
            }
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        // Check if contractor owns this estimation
        if (estimationData.contractorId !== req.user.userId) {
            // Clean up uploaded files
            if (req.files && req.files.length > 0) {
                const filePaths = req.files.map(file => file.path);
                await deleteFiles(filePaths);
            }
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if estimation can be updated
        if (estimationData.status !== 'pending') {
            // Clean up uploaded files
            if (req.files && req.files.length > 0) {
                const filePaths = req.files.map(file => file.path);
                await deleteFiles(filePaths);
            }
            return res.status(400).json({
                success: false,
                message: 'Cannot update estimation that is not in pending status'
            });
        }

        const {
            projectType,
            description,
            dimensions,
            materials,
            deadline,
            budget,
            location,
            additionalNotes
        } = req.body;

        // Prepare update data
        const updateData = {
            updatedAt: new Date().toISOString()
        };

        // Update estimation fields if provided
        if (projectType) updateData.projectType = projectType;
        if (description) updateData.description = description;
        if (dimensions !== undefined) updateData.dimensions = dimensions;
        if (materials !== undefined) updateData.materials = materials;
        if (deadline) updateData.deadline = new Date(deadline).toISOString();
        if (budget !== undefined) updateData.budget = budget ? parseFloat(budget) : null;
        if (location !== undefined) updateData.location = location;
        if (additionalNotes !== undefined) updateData.additionalNotes = additionalNotes;

        // Add new files if provided
        if (req.files && req.files.length > 0) {
            const newFiles = req.files.map(file => ({
                ...getFileInfo(file),
                uploadDate: new Date().toISOString()
            }));
            
            const existingFiles = estimationData.uploadedFiles || [];
            updateData.uploadedFiles = [...existingFiles, ...newFiles];
        }

        await estimationRef.update(updateData);

        // Get updated estimation
        const updatedDoc = await estimationRef.get();

        res.json({
            success: true,
            message: 'Estimation updated successfully',
            estimation: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update estimation error:', error);
        
        // Clean up uploaded files if operation failed
        if (req.files && req.files.length > 0) {
            const filePaths = req.files.map(file => file.path);
            await deleteFiles(filePaths);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update estimation',
            error: error.message
        });
    }
});

// Delete estimation (contractor can only delete if status is pending)
router.delete('/:id', authenticate, isContractor, async (req, res) => {
    try {
        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        // Check if contractor owns this estimation
        if (estimationData.contractorId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if estimation can be deleted
        if (estimationData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete estimation that is not in pending status'
            });
        }

        // Delete associated files
        const filePaths = [];
        if (estimationData.uploadedFiles) {
            filePaths.push(...estimationData.uploadedFiles.map(file => file.filePath));
        }
        if (estimationData.resultFile) {
            filePaths.push(estimationData.resultFile.filePath);
        }

        await deleteFiles(filePaths);
        await estimationRef.delete();

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
});

// Get estimation statistics for contractor dashboard
router.get('/stats/summary', authenticate, isContractor, async (req, res) => {
    try {
        const contractorId = req.user.userId;

        const snapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', contractorId)
            .get();

        let total = 0;
        let pending = 0;
        let inProgress = 0;
        let completed = 0;
        let rejected = 0;
        const recent = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            total++;
            
            switch (data.status) {
                case 'pending':
                    pending++;
                    break;
                case 'in-progress':
                    inProgress++;
                    break;
                case 'completed':
                    completed++;
                    break;
                case 'rejected':
                    rejected++;
                    break;
            }

            // Add to recent if within last 3 entries
            if (recent.length < 3) {
                recent.push({
                    id: doc.id,
                    projectType: data.projectType,
                    status: data.status,
                    createdAt: data.createdAt,
                    estimatedBy: data.estimatedBy
                });
            }
        });

        res.json({
            success: true,
            stats: {
                total,
                pending,
                inProgress,
                completed,
                rejected,
                recent
            }
        });

    } catch (error) {
        console.error('Get contractor stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get estimation statistics',
            error: error.message
        });
    }
});

// Get estimation status by ID (public, for status checking)
router.get('/:id/status', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        res.json({
            success: true,
            status: {
                current: estimationData.status,
                submissionDate: estimationData.submissionDate,
                completedDate: estimationData.estimationCompletedDate,
                statusInfo: getStatusInfo(estimationData.status)
            }
        });

    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get estimation status',
            error: error.message
        });
    }
});

// Test route
router.get('/test/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Estimation routes are working!',
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'POST /create - Create new estimation request (contractor)',
            'GET /my-estimations - Get contractor\'s estimations',
            'GET /:id - Get single estimation',
            'GET /:id/result/download - Download result file (contractor)',
            'PUT /:id - Update estimation (contractor, pending only)',
            'DELETE /:id - Delete estimation (contractor, pending only)',
            'GET /stats/summary - Get contractor statistics',
            'GET /:id/status - Get estimation status'
        ]
    });
});

export default router;
