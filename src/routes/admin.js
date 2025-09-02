// Complete admin.js routes file
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import multer from 'multer';
import { 
    getDashboardStats, 
    getAllUsers, 
    getAllQuotes, 
    getAllJobs, 
    getAllMessages, 
    getAllSubscriptions,
    updateUserStatus,
    deleteUser 
} from '../controllers/adminController.js';

const router = express.Router();

// Configure multer for result file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
});

// Middleware to check admin access
const isAdmin = (req, res, next) => {
    if (req.user && (req.user.type === 'admin' || req.user.role === 'admin')) {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            error: 'Admin access required.' 
        });
    }
};

// Apply auth and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Dashboard stats
router.get('/dashboard', getDashboardStats);

// Users management
router.get('/users', getAllUsers);
router.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const doc = await adminDb.collection('users').doc(userId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const userData = doc.data();
        const { password, ...userWithoutPassword } = userData;
        
        res.json({
            success: true,
            user: {
                id: doc.id,
                ...userWithoutPassword
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch user' 
        });
    }
});
router.patch('/users/:userId/status', updateUserStatus);
router.delete('/users/:userId', deleteUser);

// Quotes management
router.get('/quotes', getAllQuotes);
router.get('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const doc = await adminDb.collection('quotes').doc(quoteId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Quote not found' 
            });
        }
        
        res.json({
            success: true,
            quote: {
                id: doc.id,
                ...doc.data()
            }
        });
    } catch (error) {
        console.error('Error fetching quote:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch quote' 
        });
    }
});

// Jobs management
router.get('/jobs', getAllJobs);

// Messages management
router.get('/messages', getAllMessages);
router.get('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const doc = await adminDb.collection('messages').doc(messageId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Message not found' 
            });
        }
        
        const messageData = doc.data();
        
        // Mark as read
        await adminDb.collection('messages').doc(messageId).update({
            isRead: true,
            readAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: {
                id: doc.id,
                ...messageData,
                isRead: true
            }
        });
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch message' 
        });
    }
});

// Subscriptions management
router.get('/subscriptions', getAllSubscriptions);

// Estimations management (integration with estimation routes)
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = snapshot.docs.map(doc => {
            const estimationData = doc.data();
            return {
                _id: doc.id,
                id: doc.id,
                projectTitle: estimationData.projectTitle || 'Untitled',
                contractorName: estimationData.contractorName || 'Unknown',
                contractorEmail: estimationData.contractorEmail || 'N/A',
                status: estimationData.status || 'pending',
                uploadedFiles: estimationData.uploadedFiles || [],
                resultFile: estimationData.resultFile,
                estimatedAmount: estimationData.estimatedAmount,
                createdAt: estimationData.createdAt,
                ...estimationData
            };
        });

        res.json({
            success: true,
            estimations
        });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch estimations' 
        });
    }
});

// Get single estimation
router.get('/estimations/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Estimation not found' 
            });
        }
        
        res.json({
            success: true,
            estimation: {
                id: doc.id,
                ...doc.data()
            }
        });
    } catch (error) {
        console.error('Error fetching estimation:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch estimation' 
        });
    }
});

// Update estimation status
router.patch('/estimations/:estimationId/status', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'in-progress', 'completed', 'rejected', 'cancelled'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status' 
            });
        }
        
        await adminDb.collection('estimations').doc(estimationId).update({
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Estimation status updated successfully'
        });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update estimation status' 
        });
    }
});

// Upload estimation result
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { amount, notes } = req.body;
        const resultFile = req.file;

        if (!resultFile) {
            return res.status(400).json({ 
                success: false, 
                error: 'Result file is required' 
            });
        }

        const updateData = {
            status: 'completed',
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
        };

        if (amount) {
            updateData.estimatedAmount = parseFloat(amount);
        }

        if (notes) {
            updateData.adminNotes = notes;
        }

        // In production, upload file to cloud storage and get URL
        updateData.resultFile = {
            name: resultFile.originalname,
            size: resultFile.size,
            type: resultFile.mimetype,
            uploadedAt: new Date().toISOString(),
            url: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/results/${estimationId}/${resultFile.originalname}`
        };

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        res.json({
            success: true,
            message: 'Result uploaded successfully',
            resultFile: updateData.resultFile
        });

    } catch (error) {
        console.error('Error uploading result:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to upload result' 
        });
    }
});

// Get estimation files for download
router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Estimation not found' 
            });
        }
        
        const estimationData = doc.data();
        
        res.json({
            success: true,
            files: estimationData.uploadedFiles || []
        });
    } catch (error) {
        console.error('Error fetching estimation files:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch estimation files' 
        });
    }
});

// Get estimation result file
router.get('/estimations/:estimationId/result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'Estimation not found' 
            });
        }
        
        const estimationData = doc.data();
        
        if (!estimationData.resultFile) {
            return res.status(404).json({ 
                success: false, 
                error: 'Result file not available' 
            });
        }
        
        res.json({
            success: true,
            resultFile: estimationData.resultFile
        });
    } catch (error) {
        console.error('Error fetching estimation result:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch estimation result' 
        });
    }
});

export default router;
