// src/routes/admin.js - Complete, working admin routes
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
});

// Apply authentication and admin check to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD ---
router.get('/dashboard', async (req, res) => {
    try {
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
            pendingProfileReviews: pendingReviewsSnapshot.size,
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
            stats,
            recentActivity,
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data', error: error.message });
    }
});


// --- USERS MANAGEMENT ---
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                _id: doc.id,
                name: userData.name,
                email: userData.email,
                role: userData.type, // Frontend expects 'role'
                isActive: userData.isActive !== false,
                createdAt: userData.createdAt,
                company: userData.companyName || userData.company,
            });
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

router.get('/users/:userId', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.userId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });
        
        const userData = userDoc.data();
        const { password, ...userWithoutPassword } = userData;
        
        res.json({
            success: true,
            user: {
                _id: userDoc.id,
                role: userData.type,
                ...userWithoutPassword,
                stats: { /* Placeholder for stats if needed */ }
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.userId).update({ isActive: req.body.isActive });
        res.json({ success: true, message: 'User status updated successfully' });
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


// --- PROFILE REVIEWS MANAGEMENT ---
router.get('/profile-reviews', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users')
            .where('profileCompleted', '==', true)
            .orderBy('submittedAt', 'desc').get();
        const reviews = snapshot.docs.map(doc => {
            const userData = doc.data();
            return {
                _id: doc.id,
                status: userData.profileStatus || 'pending',
                createdAt: userData.submittedAt,
                reviewedAt: userData.reviewedAt,
                reviewNotes: userData.reviewNotes || userData.rejectionReason,
                user: { name: userData.name, email: userData.email, type: userData.type }
            };
        });
        res.json({ success: true, reviews });
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
        res.json({
            success: true,
            review: {
                _id: userDoc.id,
                status: userData.profileStatus,
                reviewNotes: userData.reviewNotes || userData.rejectionReason,
                user: userData,
                profileData: userData.profileData
            }
        });
    } catch (error) {
        console.error('Error fetching profile review:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile review details', error: error.message });
    }
});

router.get('/profile-reviews/:reviewId/files', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.reviewId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: { files: userDoc.data().uploadedFiles || [] } });
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

router.patch('/profile-reviews/:reviewId/status', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { status, reason, notes } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status provided.' });
        }
        const updateData = {
            profileStatus: status,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
        };
        if (status === 'approved') {
            updateData.canAccess = true;
            updateData.isActive = true;
            updateData.reviewNotes = notes || 'Profile approved by admin.';
        } else if (status === 'rejected') {
            if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
            updateData.canAccess = false;
            updateData.isActive = false;
            updateData.rejectionReason = reason;
            updateData.reviewNotes = reason;
        }
        await adminDb.collection('users').doc(reviewId).update(updateData);
        res.json({ success: true, message: `Profile status successfully updated to ${status}.` });
    } catch (error) {
        console.error('Error updating profile review status:', error);
        res.status(500).json({ success: false, message: 'Error updating profile review status', error: error.message });
    }
});


// --- QUOTES, JOBS, MESSAGES (CRUD) ---
const createCrudEndpoints = (collectionName) => {
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            res.json({ success: true, [collectionName]: items });
        } catch (e) {
            res.status(500).json({ success: false, message: `Error fetching ${collectionName}` });
        }
    });

    router.get(`/${collectionName}/:id`, async (req, res) => {
        try {
            const doc = await adminDb.collection(collectionName).doc(req.params.id).get();
            if (!doc.exists) return res.status(404).json({ success: false, message: 'Item not found' });
            if (collectionName === 'messages') await doc.ref.update({ isRead: true });
            res.json({ success: true, [collectionName.slice(0, -1)]: { _id: doc.id, ...doc.data(), isRead: true } });
        } catch (e) {
            res.status(500).json({ success: false, message: `Error fetching item` });
        }
    });

    router.patch(`/${collectionName}/:id/status`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).update({ status: req.body.status });
            res.json({ success: true, message: 'Status updated' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error updating status' });
        }
    });
    
    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: 'Item deleted' });
        } catch (e) {
            res.status(500).json({ success: false, message: 'Error deleting item' });
        }
    });
};

createCrudEndpoints('quotes');
createCrudEndpoints('jobs');
createCrudEndpoints('messages');


// --- ESTIMATIONS MANAGEMENT ---
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });
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
        res.json({ success: true, files: doc.data().uploadedFiles || [] });
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
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found.' });

        const resultFile = estimationDoc.data().resultFile;
        if (!resultFile || !resultFile.url) return res.status(404).json({ success: false, message: 'No result file found.' });
        
        res.redirect(resultFile.url);
    } catch (error) {
        console.error('Error downloading estimation result file:', error);
        res.status(500).json({ success: false, message: 'Error downloading estimation file', error: error.message });
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


// --- EXPORT ---
router.get('/export/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const snapshot = await adminDb.collection(type).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (data.length === 0) return res.status(404).send('No data to export.');

        const header = Object.keys(data[0]).join(',');
        const csvRows = data.map(row => Object.values(row).map(val => JSON.stringify(val)).join(','));
        const csv = [header, ...csvRows].join('\r\n');

        res.header('Content-Type', 'text/csv');
        res.attachment(`${type}-export.csv`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to export ${req.params.type}` });
    }
});

export default router;
