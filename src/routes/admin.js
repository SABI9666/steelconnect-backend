import express from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
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
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg', 'image/png', 'image/gif', 'text/plain',
            'application/zip', 'application/x-rar-compressed'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Apply authentication and admin check to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD ---
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);
        const stats = {
            totalUsers: 0, contractors: 0, designers: 0,
            totalJobs: 0, totalQuotes: 0, totalEstimations: 0,
            totalMessages: 0, activeSubscriptions: 0, pendingReviews: 0
        };

        // User statistics
        const usersSnapshot = await adminDb.collection('users').get();
        stats.totalUsers = usersSnapshot.size;
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') stats.contractors++;
            if (userData.type === 'designer') stats.designers++;
            if (userData.profileCompleted && userData.profileStatus === 'pending') {
                stats.pendingReviews++;
            }
        });

        // Other collection statistics with robust counting
        const collections = ['jobs', 'quotes', 'estimations', 'messages', 'subscriptions'];
        const promises = collections.map(async (colName) => {
            try {
                const snapshot = await adminDb.collection(colName).get();
                return { name: colName, size: snapshot.size };
            } catch (e) {
                console.warn(`Collection '${colName}' not found or error reading.`);
                return { name: colName, size: 0 };
            }
        });
        
        const results = await Promise.all(promises);
        stats.totalJobs = results.find(r => r.name === 'jobs').size;
        stats.totalQuotes = results.find(r => r.name === 'quotes').size;
        stats.totalEstimations = results.find(r => r.name === 'estimations').size;
        stats.totalMessages = results.find(r => r.name === 'messages').size;
        stats.activeSubscriptions = results.find(r => r.name === 'subscriptions').size;

        // CHANGED: Simplified and corrected response structure
        res.json({
            success: true,
            stats,
            adminUser: req.user.email
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
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return {
                _id: doc.id,
                id: doc.id,
                ...userData,
                isActive: userData.canAccess !== false, // Ensure consistent boolean
            };
        });

        // CHANGED: Standardized response structure
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

router.get('/users/:userId', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const { password, ...userData } = userDoc.data();
        res.json({ success: true, user: { _id: userDoc.id, id: userDoc.id, ...userData } });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Error fetching user details', error: error.message });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.userId).update({
            canAccess: req.body.isActive,
            statusUpdatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email
        });
        res.json({ success: true, message: `User status updated successfully` });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Failed to update user status', error: error.message });
    }
});

// --- JOBS, QUOTES, ESTIMATIONS (Standardized Responses) ---
const createGenericGetAllEndpoint = (collectionName) => async (req, res) => {
    try {
        const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
        const items = snapshot.docs.map(doc => ({ _id: doc.id, id: doc.id, ...doc.data() }));
        
        // CHANGED: Standardized response for all list endpoints
        res.json({ success: true, [collectionName]: items });
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        res.status(500).json({ success: false, message: `Error fetching ${collectionName}`, error: error.message });
    }
};

router.get('/jobs', createGenericGetAllEndpoint('jobs'));
router.get('/quotes', createGenericGetAllEndpoint('quotes'));
router.get('/estimations', createGenericGetAllEndpoint('estimations'));

// --- ESTIMATION FILE HANDLING ---
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { notes } = req.body;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Result file is required' });
        }

        const filePath = `estimations/results/${estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);

        const resultData = {
            resultFile: {
                name: req.file.originalname,
                url: fileUrl,
                size: req.file.size,
                mimetype: req.file.mimetype,
                uploadedAt: new Date().toISOString(),
            },
            status: 'completed', // CHANGED: Automatically update status
            completedAt: new Date().toISOString(),
            adminNotes: notes || ''
        };

        await adminDb.collection('estimations').doc(estimationId).update(resultData);
        res.json({ success: true, message: 'Estimation result uploaded successfully', data: resultData });
    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({ success: false, message: 'Failed to upload result', error: error.message });
    }
});

router.get('/estimations/:estimationId/result/download', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estimationDoc.exists || !estimationDoc.data().resultFile?.url) {
            return res.status(404).json({ success: false, message: 'Result file not found' });
        }
        // This relies on your Firebase Storage files being publicly readable.
        res.redirect(estimationDoc.data().resultFile.url);
    } catch (error) {
        console.error('Error downloading estimation result:', error);
        res.status(500).json({ success: false, message: 'Could not process download', error: error.message });
    }
});


// --- MESSAGES MANAGEMENT ---
router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = messagesSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        // CHANGED: Standardized response for messages
        res.json({ success: true, messages: messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages', error: error.message });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        // Mark as read when admin views it
        if (!messageDoc.data().isRead) {
            await messageDoc.ref.update({ isRead: true, status: 'read' });
        }

        res.json({ success: true, message: { _id: messageDoc.id, id: messageDoc.id, ...messageDoc.data() } });
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({ success: false, message: 'Error fetching message', error: error.message });
    }
});

router.patch('/messages/:messageId/block', async (req, res) => {
    try {
        const { block, reason } = req.body;
        const updateData = {
            isBlocked: !!block,
            blockReason: block ? reason : null,
            blockedAt: block ? new Date().toISOString() : null
        };
        await adminDb.collection('messages').doc(req.params.messageId).update(updateData);
        res.json({ success: true, message: `Message ${block ? 'blocked' : 'unblocked'}` });
    } catch (error) {
        console.error('Error updating message block status:', error);
        res.status(500).json({ success: false, message: 'Failed to update block status', error: error.message });
    }
});

router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: 'Reply content cannot be empty' });
        }
        const reply = {
            content,
            sentBy: 'admin',
            senderEmail: req.user.email,
            sentAt: new Date().toISOString()
        };
        // Using FieldValue.arrayUnion to append to the thread array
        const { FieldValue } = await import('firebase-admin/firestore');
        await adminDb.collection('messages').doc(req.params.messageId).update({
            thread: FieldValue.arrayUnion(reply),
            status: 'replied',
            isRead: true, // Mark as read since admin replied
        });
        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, message: 'Failed to send reply', error: error.message });
    }
});

// --- PROFILE REVIEWS ---
router.get('/profile-reviews', createGenericGetAllEndpoint('profile_reviews'));

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { reviewId } = req.params; // This ID is actually the USER ID
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'approved',
            canAccess: true, // Grant access
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: req.body.notes || 'Approved by admin'
        });
        await adminDb.collection('profile_reviews').doc(reviewId).set({
             status: 'approved'
        }, { merge: true });

        res.json({ success: true, message: 'Profile approved and user activated' });
    } catch (error) {
        console.error('Error approving profile:', error);
        res.status(500).json({ success: false, message: 'Failed to approve profile', error: error.message });
    }
});

router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reviewId } = req.params; // User ID
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'rejected',
            canAccess: false, // Deny access
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason
        });
        await adminDb.collection('profile_reviews').doc(reviewId).set({
             status: 'rejected'
        }, { merge: true });

        res.json({ success: true, message: 'Profile rejected successfully' });
    } catch (error) {
        console.error('Error rejecting profile:', error);
        res.status(500).json({ success: false, message: 'Failed to reject profile', error: error.message });
    }
});

// --- FULL SUBSCRIPTION MANAGEMENT ---
// ADDED: Full implementation for subscription plans
router.post('/subscription-plans', async (req, res) => {
    try {
        const { name, price, interval, features, description } = req.body;
        if (!name || !price || !interval) {
            return res.status(400).json({ success: false, message: 'Name, price, and interval are required.' });
        }
        const planRef = await adminDb.collection('subscription_plans').add({
            name, price: Number(price), interval, features: features || [], description: description || '',
            createdAt: new Date().toISOString(),
        });
        res.status(201).json({ success: true, message: 'Plan created successfully', id: planRef.id });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create plan', error: error.message });
    }
});

router.get('/subscription-plans', createGenericGetAllEndpoint('subscription_plans'));

router.patch('/subscription-plans/:planId', async (req, res) => {
    try {
        await adminDb.collection('subscription_plans').doc(req.params.planId).update({
            ...req.body,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: 'Plan updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update plan', error: error.message });
    }
});

router.delete('/subscription-plans/:planId', async (req, res) => {
    try {
        await adminDb.collection('subscription_plans').doc(req.params.planId).delete();
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete plan', error: error.message });
    }
});

router.get('/subscriptions', createGenericGetAllEndpoint('subscriptions'));

router.patch('/subscriptions/:subId/cancel', async (req, res) => {
    try {
        await adminDb.collection('subscriptions').doc(req.params.subId).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
        });
        res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to cancel subscription', error: error.message });
    }
});


// All other routes remain the same... (delete, export, system stats, etc.)

export default router;
