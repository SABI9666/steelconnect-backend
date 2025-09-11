// src/routes/admin.js - Complete Admin Routes with Profile Management (Corrected)
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
            'application/zip',
            'application/x-rar-compressed'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// === DASHBOARD ENDPOINT ===
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);

        // Fetching stats...
        const usersSnapshot = await adminDb.collection('users').get();
        const pendingReviewsSnapshot = await adminDb.collection('users')
            .where('profileCompleted', '==', true)
            .where('profileStatus', '==', 'pending')
            .get();
        
        const jobsSnapshot = await adminDb.collection('jobs').get();
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const estimationsSnapshot = await adminDb.collection('estimations').get();
        const messagesSnapshot = await adminDb.collection('messages').get();

        const stats = {
            totalUsers: usersSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            totalMessages: messagesSnapshot.size,
            pendingProfileReviews: pendingReviewsSnapshot.size, // Correct key for frontend
        };

        const recentUsersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').limit(5).get();
        const recentActivity = [];
        recentUsersSnapshot.forEach(doc => {
            const user = doc.data();
            recentActivity.push({
                type: 'user',
                description: `New user registered: ${user.name}`,
                timestamp: user.createdAt
            });
        });

        res.json({
            success: true,
            stats, // CORRECTED: Return stats object directly as expected by frontend
            recentActivity,
            adminUser: req.user.email,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard data',
            error: error.message
        });
    }
});


// === USERS MANAGEMENT ===
router.get('/users', async (req, res) => {
    try {
        const { type, status, page = 1, limit = 100 } = req.query; // Increased limit for simplicity
        
        let query = adminDb.collection('users').orderBy('createdAt', 'desc');
        
        const usersSnapshot = await query.get();
        let users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            const isActive = userData.canAccess !== false;
            
            users.push({
                _id: doc.id,
                id: doc.id,
                name: userData.name,
                email: userData.email,
                role: userData.type, // Frontend uses 'role', backend uses 'type'
                type: userData.type,
                isActive: isActive,
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin,
                company: userData.companyName || userData.company,
                ...userWithoutPassword
            });
        });

        // Filtering after fetch
        if (type && type !== 'all') {
            users = users.filter(u => u.type === type);
        }
        if (status) {
            users = users.filter(u => (status === 'active' && u.isActive) || (status === 'inactive' && !u.isActive));
        }

        res.json({
            success: true,
            users: users, // CORRECTED: Changed 'data' to 'users'
            pagination: {
                totalUsers: users.length,
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

router.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const userDoc = await adminDb.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = userDoc.data();
        const { password, ...userWithoutPassword } = userData;
        
        // Add stats for details view
        const userStats = {
            quotesRequested: (await adminDb.collection('quotes').where('userId', '==', userId).get()).size,
            jobsCompleted: (await adminDb.collection('jobs').where('userId', '==', userId).where('status', '==', 'completed').get()).size,
            messagesSent: (await adminDb.collection('messages').where('senderId', '==', userId).get()).size
        };

        res.json({
            success: true,
            user: {
                _id: userDoc.id,
                id: userDoc.id,
                role: userData.type, // Align with frontend expectations
                ...userWithoutPassword,
                stats: userStats
            }
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        await adminDb.collection('users').doc(userId).update({
            canAccess: isActive,
            isActive: isActive,
        });
        res.json({ success: true, message: `User status updated successfully` });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status', error: error.message });
    }
});

router.delete('/users/:userId', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.userId).delete();
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
    }
});

// === PROFILE REVIEWS MANAGEMENT ===
router.get('/profile-reviews', async (req, res) => {
    try {
        const query = adminDb.collection('users')
            .where('profileCompleted', '==', true)
            .orderBy('submittedAt', 'desc');

        const usersSnapshot = await query.get();
        const reviews = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            reviews.push({
                _id: doc.id,
                status: userData.profileStatus || 'pending',
                createdAt: userData.submittedAt,
                reviewedAt: userData.reviewedAt,
                reviewNotes: userData.reviewNotes || userData.rejectionReason,
                user: {
                    _id: doc.id,
                    name: userData.name,
                    email: userData.email,
                    type: userData.type
                }
            });
        });

        res.json({
            success: true,
            reviews: reviews, // CORRECTED: Changed 'data' to 'reviews' and simplified structure
        });

    } catch (error) {
        console.error('Error fetching profile reviews:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews', error: error.message });
    }
});

router.get('/profile-reviews/:reviewId', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.reviewId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'Profile review not found' });
        
        const userData = userDoc.data();
        const review = {
            _id: userDoc.id,
            status: userData.profileStatus,
            reviewNotes: userData.reviewNotes || userData.rejectionReason,
            user: userData,
            profileData: userData.profileData
        };

        res.json({ success: true, review: review }); // CORRECTED: Unwrapped from 'data' object

    } catch (error) {
        console.error('Error fetching profile review:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile review details', error: error.message });
    }
});

router.get('/profile-reviews/:reviewId/files', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.reviewId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({
            success: true,
            data: { // This endpoint is handled correctly on the frontend, keeping it as is.
                files: userDoc.data().uploadedFiles || []
            }
        });
    } catch (error) {
        console.error('Error fetching profile files:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile files', error: error.message });
    }
});

router.get('/profile-reviews/:reviewId/files/:fileName/download', async (req, res) => {
    try {
        const { reviewId, fileName } = req.params;
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });

        const file = (userDoc.data().uploadedFiles || []).find(f => f.name === fileName);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });

        res.redirect(file.url);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ success: false, message: 'Error downloading file', error: error.message });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { notes } = req.body;
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: notes || 'Profile approved by admin'
        });
        res.json({ success: true, message: 'Profile approved successfully' });
    } catch (error) {
        console.error('Error approving profile:', error);
        res.status(500).json({ success: false, message: 'Error approving profile', error: error.message });
    }
});

router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'rejected',
            canAccess: false,
            isActive: false,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason,
            rejectionReason: reason
        });
        res.json({ success: true, message: 'Profile rejected successfully' });
    } catch (error) {
        console.error('Error rejecting profile:', error);
        res.status(500).json({ success: false, message: 'Error rejecting profile', error: error.message });
    }
});


// === QUOTES MANAGEMENT ===
router.get('/quotes', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];
        quotesSnapshot.forEach(doc => {
            quotes.push({ _id: doc.id, ...doc.data() });
        });
        res.json({ success: true, quotes: quotes }); // CORRECTED: from 'data' to 'quotes'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
});

router.get('/quotes/:quoteId', async (req, res) => {
    try {
        const doc = await adminDb.collection('quotes').doc(req.params.quoteId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Quote not found' });
        res.json({ success: true, quote: { _id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching quote' });
    }
});

router.patch('/quotes/:quoteId/status', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.quoteId).update({ status: req.body.status });
        res.json({ success: true, message: 'Quote status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating quote status' });
    }
});

router.patch('/quotes/:quoteId/amount', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.quoteId).update({ amount: req.body.amount });
        res.json({ success: true, message: 'Quote amount updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating quote amount' });
    }
});

router.delete('/quotes/:quoteId', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.quoteId).delete();
        res.json({ success: true, message: 'Quote deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting quote' });
    }
});


// === JOBS MANAGEMENT ===
router.get('/jobs', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = [];
        jobsSnapshot.forEach(doc => {
            jobs.push({ _id: doc.id, ...doc.data() });
        });
        res.json({ success: true, jobs: jobs }); // CORRECTED: from 'data' to 'jobs'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching jobs' });
    }
});

router.get('/jobs/:jobId', async (req, res) => {
    try {
        const doc = await adminDb.collection('jobs').doc(req.params.jobId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Job not found' });
        res.json({ success: true, job: { _id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching job' });
    }
});

router.patch('/jobs/:jobId/status', async (req, res) => {
    try {
        await adminDb.collection('jobs').doc(req.params.jobId).update({ status: req.body.status });
        res.json({ success: true, message: 'Job status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating job status' });
    }
});

router.patch('/jobs/:jobId/progress', async (req, res) => {
    try {
        await adminDb.collection('jobs').doc(req.params.jobId).update({ progress: req.body.progress });
        res.json({ success: true, message: 'Job progress updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating job progress' });
    }
});

router.delete('/jobs/:jobId', async (req, res) => {
    try {
        await adminDb.collection('jobs').doc(req.params.jobId).delete();
        res.json({ success: true, message: 'Job deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting job' });
    }
});


// === ESTIMATIONS MANAGEMENT ===
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations: estimations }); // CORRECTED: from 'data' to 'estimations'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
});

router.get('/estimations/:estimationId', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, estimation: { _id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching estimation' });
    }
});

router.patch('/estimations/:estimationId/status', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.estimationId).update({ status: req.body.status });
        res.json({ success: true, message: 'Estimation status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating estimation status' });
    }
});

router.patch('/estimations/:estimationId/due-date', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.estimationId).update({ dueDate: req.body.dueDate });
        res.json({ success: true, message: 'Due date updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating due date' });
    }
});

router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, files: doc.data().uploadedFiles || [] }); // CORRECTED: unwrapped from 'data'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching files' });
    }
});

router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { estimatedAmount } = req.body;
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });

        const filePath = `estimations/results/${estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);
        
        await adminDb.collection('estimations').doc(estimationId).update({
            resultFile: { url: fileUrl, name: req.file.originalname },
            estimatedAmount: parseFloat(estimatedAmount),
            status: 'completed',
            completedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Estimation result uploaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error uploading result', error: error.message });
    }
});

router.get('/estimations/:estimationId/result/download', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        const data = doc.data();
        if (!data.resultFile || !data.resultFile.url) return res.status(404).json({ message: 'Result file not found.' });

        res.setHeader('Content-Disposition', `attachment; filename="${data.resultFile.name}"`);
        res.redirect(data.resultFile.url);
    } catch (error) {
        res.status(500).json({ message: 'Failed to download file.', error: error.message });
    }
});

router.delete('/estimations/:estimationId', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.estimationId).delete();
        res.json({ success: true, message: 'Estimation deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting estimation' });
    }
});


// === MESSAGES MANAGEMENT ===
router.get('/messages', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.json({ success: true, messages: messages }); // CORRECTED: from 'data.messages' to 'messages'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const docRef = adminDb.collection('messages').doc(req.params.messageId);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Message not found' });
        
        await docRef.update({ isRead: true }); // Mark as read on view
        
        res.json({ success: true, message: { _id: doc.id, ...doc.data(), isRead: true } }); // CORRECTED: unwrapped from 'data'
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching message' });
    }
});

router.patch('/messages/:messageId/status', async (req, res) => {
    try {
        await adminDb.collection('messages').doc(req.params.messageId).update({ isRead: req.body.isRead });
        res.json({ success: true, message: 'Message status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating message status' });
    }
});

router.delete('/messages/:messageId', async (req, res) => {
    try {
        await adminDb.collection('messages').doc(req.params.messageId).delete();
        res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting message' });
    }
});


// === EXPORT ENDPOINTS ===
// A simple helper for CSV conversion
const jsonToCsv = (items) => {
    if (!items || items.length === 0) return '';
    const header = Object.keys(items[0]);
    const csv = [
        header.join(','),
        ...items.map(row => header.map(fieldName => JSON.stringify(row[fieldName])).join(','))
    ].join('\r\n');
    return csv;
};

router.get('/export/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['users', 'quotes', 'estimations', 'jobs', 'messages'];
        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid export type' });
        
        const snapshot = await adminDb.collection(type).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const csvData = jsonToCsv(data);
        res.header('Content-Type', 'text/csv');
        res.attachment(`${type}-export.csv`);
        res.send(csvData);
        
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to export ${req.params.type}` });
    }
});

export default router;






