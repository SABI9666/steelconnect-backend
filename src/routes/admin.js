// src/routes/admin.js - FIXED VERSION with proper estimation integration
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Import MongoDB models (assuming you have these)
// You'll need to create these models if they don't exist
let User, Quote, Message, Job, Estimation;
try {
    const models = await import('../models/index.js'); // Assuming you have a models index
    User = models.User;
    Quote = models.Quote;
    Message = models.Message;
    Job = models.Job;
    Estimation = models.Estimation;
} catch (error) {
    console.warn('⚠️ Some MongoDB models not available:', error.message);
}

const router = express.Router();

// --- ADMIN AUTHENTICATION MIDDLEWARE ---
const isAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authorization token required.' 
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        
        // Check if user is admin
        if (decoded.type !== 'admin' && decoded.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Admin access required.' 
            });
        }

        req.user = decoded;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
        });
    }
};

// Apply admin middleware to all routes
router.use(isAdmin);

// --- FILE UPLOAD CONFIGURATION ---
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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for result uploads'), false);
        }
    }
});

// --- UTILITY FUNCTIONS ---
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

// --- ADMIN DASHBOARD ROUTES ---

// Get admin dashboard statistics
router.get('/dashboard', async (req, res) => {
    try {
        let stats = {
            totalUsers: 0,
            totalQuotes: 0,
            totalMessages: 0,
            totalJobs: 0,
            totalEstimations: 0,
            pendingEstimations: 0,
            completedEstimations: 0,
            recentActivity: []
        };

        // If MongoDB models are available, use them
        if (User && Quote && Message && Job && Estimation) {
            const [users, quotes, messages, jobs, estimations, pending, completed] = await Promise.all([
                User.countDocuments(),
                Quote.countDocuments(),
                Message.countDocuments(),
                Job.countDocuments(),
                Estimation.countDocuments(),
                Estimation.countDocuments({ status: 'pending' }),
                Estimation.countDocuments({ status: 'completed' })
            ]);

            stats = {
                totalUsers: users,
                totalQuotes: quotes,
                totalMessages: messages,
                totalJobs: jobs,
                totalEstimations: estimations,
                pendingEstimations: pending,
                completedEstimations: completed
            };

            // Get recent estimations
            const recentEstimations = await Estimation.find()
                .populate('contractorId', 'name email')
                .sort('-createdAt')
                .limit(5)
                .lean();

            stats.recentActivity = recentEstimations;
        }

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

// --- ESTIMATION MANAGEMENT ROUTES ---

// Get all estimations
router.get('/estimations', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

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

        // Format estimations with additional info
        const formattedEstimations = estimations.map(est => {
            const estimation = new Estimation(est);
            return {
                ...est,
                statusInfo: estimation.getStatusInfo ? estimation.getStatusInfo() : { text: est.status, color: 'gray' },
                totalFiles: (est.uploadedFiles ? est.uploadedFiles.length : 0) + (est.resultFile ? 1 : 0)
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
});

// Get single estimation
router.get('/estimations/:id', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

        const estimation = await Estimation.findById(req.params.id)
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
                statusInfo: estimation.getStatusInfo ? estimation.getStatusInfo() : { text: estimation.status, color: 'gray' }
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

// Update estimation status
router.put('/estimations/:id/status', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

        const { status } = req.body;
        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const estimation = await Estimation.findById(req.params.id);
        if (!estimation) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        estimation.status = status;
        
        if (status === 'in-progress' && !estimation.estimationStartDate) {
            estimation.estimationStartDate = new Date();
            estimation.estimatedBy = req.user.userId;
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
                statusInfo: estimation.getStatusInfo ? estimation.getStatusInfo() : { text: estimation.status, color: 'gray' }
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

// Update estimation amount
router.put('/estimations/:id/amount', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        const estimation = await Estimation.findById(req.params.id);
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
});

// Upload result PDF
router.post('/estimations/:id/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!Estimation) {
            if (req.file) await deleteFile(req.file.path);
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No result file provided'
            });
        }

        const estimation = await Estimation.findById(req.params.id);
        if (!estimation) {
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
            estimation.estimatedBy = req.user.userId;
        }

        await estimation.save();

        res.json({
            success: true,
            message: 'Result PDF uploaded successfully',
            estimation: estimation.toObject()
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

// Download contractor's uploaded files
router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

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
            file = estimation.uploadedFiles?.find(f => f._id.toString() === fileId);
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

// Add admin notes to estimation
router.put('/estimations/:id/notes', async (req, res) => {
    try {
        if (!Estimation) {
            return res.status(503).json({
                success: false,
                message: 'Estimation service not available'
            });
        }

        const { notes } = req.body;

        const estimation = await Estimation.findById(req.params.id);
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
        console.error('Update notes error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notes',
            error: error.message
        });
    }
});

// --- USER MANAGEMENT ROUTES ---

// Get all users (contractors and designers)
router.get('/users', async (req, res) => {
    try {
        // Try MongoDB first
        if (User) {
            const users = await User.find({ role: { $ne: 'admin' } }, '-password').lean();
            return res.json({ success: true, users });
        }

        // Fallback to Firebase
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

// Update user status
router.put('/users/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        // Try MongoDB first
        if (User) {
            await User.findByIdAndUpdate(req.params.id, { status });
            return res.json({ success: true, message: 'User status updated successfully.' });
        }

        // Fallback to Firebase
        await adminDb.collection('users').doc(req.params.id).update({ status });
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

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        // Try MongoDB first
        if (User) {
            await User.findByIdAndDelete(req.params.id);
            return res.json({ success: true, message: 'User deleted successfully.' });
        }

        // Fallback to Firebase
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

// --- TEST ROUTE ---
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
            'GET /estimations/:id/files/:fileId/download - Download files',
            'PUT /estimations/:id/notes - Add admin notes',
            'GET /users - List all users',
            'PUT /users/:id/status - Update user status',
            'DELETE /users/:id - Delete user'
        ]
    });
});

export default router;
