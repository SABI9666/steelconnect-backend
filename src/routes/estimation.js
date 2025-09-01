import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

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
    limits: { fileSize: 50 * 1024 * 1024 },
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

const getFileInfo = (file) => ({
    fileId: Date.now() + '-' + Math.round(Math.random() * 1E9),
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

// Route that matches your script.js: /estimation/contractor/:email
router.get('/contractor/:email', authenticate, isContractor, async (req, res) => {
    try {
        const { email } = req.params;
        
        // Verify the email matches the authenticated user's email
        if (req.user.email !== email) {
            return res.status(403).json({
                success: false,
                message: 'Access denied - email mismatch'
            });
        }

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
                _id: doc.id,
                id: doc.id,
                ...data,
                statusInfo: getStatusInfo(data.status),
                canDownloadResult: !!(data.resultFile && data.status === 'completed')
            });
        });

        const totalSnapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', req.user.userId)
            .get();
        const total = totalSnapshot.size;

        res.json({
            success: true,
            estimations,
            data: estimations,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total,
                limit
            }
        });

    } catch (error) {
        console.error('Get contractor estimations by email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimations',
            error: error.message
        });
    }
});

// Route for script.js estimation tool submission: /estimation/contractor/submit
router.post('/contractor/submit', authenticate, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        const {
            projectTitle,
            description,
            contractorName,
            contractorEmail,
            dimensions,
            materials,
            deadline,
            budget,
            location,
            additionalNotes
        } = req.body;

        // Validation
        if (!projectTitle || !description) {
            if (req.files && req.files.length > 0) {
                const filePaths = req.files.map(file => file.path);
                await deleteFiles(filePaths);
            }
            return res.status(400).json({
                success: false,
                message: 'Project title and description are required'
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
            projectTitle,
            projectType: projectTitle, // For compatibility
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
                _id: docRef.id,
                ...estimationData
            }
        });

    } catch (error) {
        console.error('Create estimation error:', error);
        
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

// Get single estimation files (for viewEstimationFiles function)
router.get('/:id/files', authenticate, async (req, res) => {
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

        const files = (estimationData.uploadedFiles || []).map(file => ({
            name: file.originalName,
            uploadedAt: file.uploadDate,
            url: `/api/estimation/${req.params.id}/download/${file.fileId}`,
            size: file.fileSize
        }));

        res.json({
            success: true,
            files
        });

    } catch (error) {
        console.error('Get estimation files error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch estimation files',
            error: error.message
        });
    }
});

// Get estimation result (for downloadEstimationResult function)
router.get('/:id/result', authenticate, isContractor, async (req, res) => {
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

        res.json({
            success: true,
            resultFile: {
                url: `/api/estimation/${req.params.id}/result/download`,
                name: estimationData.resultFile.originalName,
                uploadDate: estimationData.resultFile.uploadDate
            }
        });

    } catch (error) {
        console.error('Get result error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get result file',
            error: error.message
        });
    }
});

// Download result file
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

// Download uploaded file
router.get('/:id/download/:fileId', authenticate, async (req, res) => {
    try {
        const { id, fileId } = req.params;

        const estimationDoc = await adminDb.collection('estimations').doc(id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        const file = estimationData.uploadedFiles?.find(f => f.fileId === fileId);

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
});

// Delete estimation
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

        if (estimationData.contractorId !== req.user.userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

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

// Get single estimation
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

        res.json({
            success: true,
            estimation: {
                id: estimationDoc.id,
                _id: estimationDoc.id,
                ...estimationData,
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

// Get estimation statistics
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

            if (recent.length < 3) {
                recent.push({
                    id: doc.id,
                    projectType: data.projectType || data.projectTitle,
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

// Test route
router.get('/test/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Estimation routes are working!',
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'GET /contractor/:email - Get contractor estimations by email',
            'POST /contractor/submit - Submit estimation request',
            'GET /:id - Get single estimation',
            'GET /:id/files - Get estimation files',
            'GET /:id/result - Get estimation result',
            'GET /:id/result/download - Download result file',
            'GET /:id/download/:fileId - Download uploaded file',
            'DELETE /:id - Delete estimation',
            'GET /stats/summary - Get contractor statistics'
        ]
    });
});

export default router;
