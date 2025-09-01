import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

const isAdmin = (req, res, next) => {
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
        
        if (decoded.role !== 'admin' && decoded.type !== 'admin') {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied. Admin privileges required.' 
            });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token.' 
        });
    }
};

router.use(isAdmin);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/results';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'result-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for result uploads'), false);
        }
    }
});

const getFileInfo = (file) => ({
    originalName: file.originalname,
    fileName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype
});

const deleteFile = async (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
    }
};

router.get('/dashboard', async (req, res) => {
    try {
        const [usersSnapshot, quotesSnapshot, messagesSnapshot, jobsSnapshot, estimationsSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get()
        ]);

        let pendingEstimations = 0;
        let completedEstimations = 0;
        let inProgressEstimations = 0;
        const recentEstimations = [];

        estimationsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'pending') pendingEstimations++;
            if (data.status === 'completed') completedEstimations++;
            if (data.status === 'in-progress') inProgressEstimations++;
            
            if (recentEstimations.length < 5) {
                recentEstimations.push({
                    id: doc.id,
                    ...data,
                    contractorName: 'Loading...'
                });
            }
        });

        const stats = {
            totalUsers: usersSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalMessages: messagesSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            pendingEstimations,
            completedEstimations,
            inProgressEstimations,
            recentActivity: recentEstimations
        };

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch dashboard statistics.',
            error: error.message 
        });
    }
});

router.get('/estimations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        const contractorId = req.query.contractorId;

        let query = adminDb.collection('estimations');
        
        if (status) {
            query = query.where('status', '==', status);
        }
        if (contractorId) {
            query = query.where('contractorId', '==', contractorId);
        }

        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .offset((page - 1) * limit)
            .get();

        const estimations = [];
        const contractorIds = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            estimations.push({
                id: doc.id,
                ...data,
                totalFiles: (data.uploadedFiles ? data.uploadedFiles.length : 0) + (data.resultFile ? 1 : 0),
                statusInfo: getStatusInfo(data.status)
            });
            if (data.contractorId) {
                contractorIds.add(data.contractorId);
            }
        });

        const contractorData = {};
        if (contractorIds.size > 0) {
            const contractorPromises = Array.from(contractorIds).map(async (id) => {
                try {
                    const contractorDoc = await adminDb.collection('users').doc(id).get();
                    if (contractorDoc.exists) {
                        const data = contractorDoc.data();
                        contractorData[id] = {
                            name: data.name,
                            email: data.email,
                            type: data.type
                        };
                    }
                } catch (error) {
                    console.error('Error fetching contractor:', error);
                }
            });
            await Promise.all(contractorPromises);
        }

        const formattedEstimations = estimations.map(est => ({
            ...est,
            contractor: contractorData[est.contractorId] || null
        }));

        const totalSnapshot = await query.get();
        const total = totalSnapshot.size;

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
});

router.get('/estimations/:id', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

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
                statusInfo: getStatusInfo(estimationData.status)
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

router.put('/estimations/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const updateData = {
            status,
            updatedAt: new Date().toISOString()
        };

        if (status === 'in-progress') {
            const currentData = estimationDoc.data();
            if (!currentData.estimationStartDate) {
                updateData.estimationStartDate = new Date().toISOString();
                updateData.estimatedBy = req.user.userId || req.user.id;
            }
        }

        if (status === 'completed') {
            const currentData = estimationDoc.data();
            if (!currentData.estimationCompletedDate) {
                updateData.estimationCompletedDate = new Date().toISOString();
            }
        }

        await estimationRef.update(updateData);

        const updatedDoc = await estimationRef.get();
        const updatedData = updatedDoc.data();

        res.json({
            success: true,
            message: 'Estimation status updated successfully',
            estimation: {
                id: updatedDoc.id,
                ...updatedData,
                statusInfo: getStatusInfo(updatedData.status)
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
});

router.put('/estimations/:id/amount', async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        await estimationRef.update({
            estimatedAmount: parseFloat(amount),
            updatedAt: new Date().toISOString()
        });

        const updatedDoc = await estimationRef.get();

        res.json({
            success: true,
            message: 'Estimation amount updated successfully',
            estimation: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update amount error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation amount',
            error: error.message
        });
    }
});

router.post('/estimations/:id/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No result file provided'
            });
        }

        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            await deleteFile(req.file.path);
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const currentData = estimationDoc.data();

        if (currentData.resultFile && currentData.resultFile.filePath) {
            await deleteFile(currentData.resultFile.filePath);
        }

        const updateData = {
            resultFile: {
                ...getFileInfo(req.file),
                uploadDate: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        };

        if (currentData.status !== 'completed') {
            updateData.status = 'completed';
            updateData.estimationCompletedDate = new Date().toISOString();
            updateData.estimatedBy = req.user.userId || req.user.id;
        }

        await estimationRef.update(updateData);

        const updatedDoc = await estimationRef.get();

        res.json({
            success: true,
            message: 'Result PDF uploaded successfully',
            estimation: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Upload result error:', error);
        
        if (req.file) {
            await deleteFile(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Failed to upload result PDF',
            error: error.message
        });
    }
});

router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const { type } = req.query;

        const estimationDoc = await adminDb.collection('estimations').doc(id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        let file;

        if (type === 'result' && estimationData.resultFile) {
            file = estimationData.resultFile;
        } else if (estimationData.uploadedFiles) {
            file = estimationData.uploadedFiles.find(f => f.fileId === fileId || f.fileName === fileId);
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
});

router.put('/estimations/:id/notes', async (req, res) => {
    try {
        const { notes } = req.body;

        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        await estimationRef.update({
            adminNotes: notes || '',
            updatedAt: new Date().toISOString()
        });

        const updatedDoc = await estimationRef.get();

        res.json({
            success: true,
            message: 'Notes updated successfully',
            estimation: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Update notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notes',
            error: error.message
        });
    }
});

router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type !== 'admin') {
                const { password, ...userWithoutPassword } = userData;
                users.push({ id: doc.id, ...userWithoutPassword });
            }
        });

        res.json({ success: true, users });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch users.',
            error: error.message 
        });
    }
});

router.put('/users/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        await adminDb.collection('users').doc(req.params.id).update({ 
            status,
            updatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'User status updated successfully.' });

    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update user status.',
            error: error.message 
        });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.id).delete();
        res.json({ success: true, message: 'User deleted successfully.' });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete user.',
            error: error.message 
        });
    }
});

function getStatusInfo(status) {
    const statusMap = {
        'pending': { text: 'Pending Review', color: 'orange' },
        'in-progress': { text: 'In Progress', color: 'blue' },
        'completed': { text: 'Completed', color: 'green' },
        'rejected': { text: 'Rejected', color: 'red' },
        'cancelled': { text: 'Cancelled', color: 'gray' }
    };
    return statusMap[status] || { text: status, color: 'gray' };
}

router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Admin routes are working!',
        user: req.user,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'GET /dashboard - Admin dashboard stats',
            'GET /estimations - List all estimations',
            'GET /estimations/:id - Get single estimation',
            'PUT /estimations/:id/status - Update estimation status',
            'PUT /estimations/:id/amount - Update estimation amount',
            'POST /estimations/:id/upload-result - Upload result PDF',
            'GET /estimations/:id/files/:fileId/download?type=uploaded|result - Download files',
            'PUT /estimations/:id/notes - Add admin notes',
            'GET /users - List all users',
            'PUT /users/:id/status - Update user status',
            'DELETE /users/:id - Delete user'
        ]
    });
});

export default router;
