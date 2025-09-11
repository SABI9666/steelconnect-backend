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

        const stats = {
            totalUsers: usersSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            pendingProfileReviews: pendingReviewsSnapshot.size,
        };
        res.json({ success: true, stats });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data', error: error.message });
    }
});


// --- USER MANAGEMENT ---
// Requirement: Admin can view all users.
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                name: data.name,
                email: data.email,
                role: data.type,
                // The 'isActive' flag determines login status.
                isActive: data.isActive !== false,
                createdAt: data.createdAt,
            };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

// Requirement: Admin can activate/deactivate. Deactivated users cannot log in.
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        // The `canAccess` flag should be checked by your login system to block login.
        await adminDb.collection('users').doc(userId).update({ 
            isActive: isActive,
            canAccess: isActive 
        });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status', error: error.message });
    }
});


// --- PROFILE REVIEW & REJECTION FLOW ---
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
                user: { name: userData.name, email: userData.email, type: userData.type },
                reviewNotes: userData.rejectionReason, // Show previous rejection comment if any
            };
        });
        res.json({ success: true, reviews });
    } catch (error) {
        console.error('Error fetching profile reviews:', error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews', error: error.message });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.reviewId).update({
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            rejectionReason: null, // Clear any previous rejection reason
        });
        res.json({ success: true, message: 'Profile approved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error approving profile', error: error.message });
    }
});

// Requirement: Admin adds rejection comment; user can still log in to see it.
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        
        // IMPORTANT: Per requirements, we ONLY update the profile status and add the
        // rejection reason. We DO NOT set `canAccess` or `isActive` to false,
        // so the user can log back in, see the comment, and resubmit their profile.
        await adminDb.collection('users').doc(req.params.reviewId).update({
            profileStatus: 'rejected',
            rejectionReason: reason,
        });
        res.json({ success: true, message: 'Profile rejected successfully. The user can still log in to make corrections.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error rejecting profile', error: error.message });
    }
});


// --- ESTIMATION MODULE (Admin Controls) ---
// Requirement: Admin can download estimation file uploaded by contractor.
router.get('/estimations/:estimationId/files/:fileName/download', async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        const estDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        const file = (estDoc.data().uploadedFiles || []).find(f => f.name === fileName);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        res.redirect(file.url);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error downloading file', error: error.message });
    }
});

// Requirement: Admin can upload/edit the estimation result.
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });

        const filePath = `estimations/results/${estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);
        
        // Uploading a new file effectively "edits" the previous result.
        await adminDb.collection('estimations').doc(estimationId).update({
            resultFile: { url: fileUrl, name: req.file.originalname, uploadedAt: new Date().toISOString() },
            status: 'completed',
        });
        res.json({ success: true, message: 'Estimation result uploaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error uploading result', error: error.message });
    }
});

// Requirement: Admin can delete the uploaded result (by deleting the whole estimation).
router.delete('/estimations/:estimationId', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.estimationId).delete();
        res.json({ success: true, message: 'Estimation deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting estimation' });
    }
});


// --- ADMIN CONTROL FOR JOBS, QUOTES, & MESSAGES ---
// Requirements: Admin can view and delete jobs, quotes, and messages.
const createAdminCrudEndpoints = (collectionName) => {
    // Get all items
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            const payload = {};
            payload[collectionName] = items;
            res.json({ success: true, ...payload });
        } catch (e) {
            res.status(500).json({ success: false, message: `Error fetching ${collectionName}` });
        }
    });

    // Delete an item
    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: `${collectionName.slice(0, -1)} deleted successfully.` });
        } catch (e) {
            res.status(500).json({ success: false, message: `Error deleting item from ${collectionName}` });
        }
    });
};

createAdminCrudEndpoints('jobs');
createAdminCrudEndpoints('quotes');
createAdminCrudEndpoints('messages');
// Also add estimations to this simple GET view for consistency.
createAdminCrudEndpoints('estimations');


export default router;
