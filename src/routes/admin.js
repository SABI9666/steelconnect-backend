// src/routes/admin.js - Complete, working admin routes that fulfill all requirements
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Protect all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD ---
router.get('/dashboard', async (req, res) => {
    try {
        const users = await adminDb.collection('users').get();
        const pendingReviews = await adminDb.collection('users').where('profileCompleted', '==', true).where('profileStatus', '==', 'pending').get();
        const jobs = await adminDb.collection('jobs').get();
        const quotes = await adminDb.collection('quotes').get();
        res.json({ success: true, stats: { totalUsers: users.size, totalJobs: jobs.size, totalQuotes: quotes.size, pendingProfileReviews: pendingReviews.size } });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data' });
    }
});

// --- USER MANAGEMENT ---
// Requirement: Admin can view all users.
router.get('/users', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { _id: doc.id, name: data.name, email: data.email, role: data.type, isActive: data.isActive !== false };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

// Requirement: Admin can activate/deactivate. Deactivated users cannot log in.
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        // The 'canAccess' flag is checked by the login system to block login.
        await adminDb.collection('users').doc(req.params.userId).update({ isActive: isActive, canAccess: isActive });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error("Update User Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// --- PROFILE REVIEW & REJECTION FLOW ---
router.get('/profile-reviews', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').where('profileCompleted', '==', true).orderBy('submittedAt', 'desc').get();
        const reviews = snapshot.docs.map(doc => {
            const userData = doc.data();
            return { _id: doc.id, status: userData.profileStatus || 'pending', user: { name: userData.name, email: userData.email, type: userData.type }, reviewNotes: userData.rejectionReason };
        });
        res.json({ success: true, reviews });
    } catch (error) {
        console.error("Fetch Profile Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews' });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.reviewId).update({ profileStatus: 'approved', canAccess: true, isActive: true, rejectionReason: null });
        res.json({ success: true, message: 'Profile approved successfully' });
    } catch (error) {
        console.error("Approve Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

// Requirement: Admin adds rejection comment; user can still log in to see it.
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        // IMPORTANT: We DO NOT set `canAccess: false` so the user can still log in.
        await adminDb.collection('users').doc(req.params.reviewId).update({ profileStatus: 'rejected', rejectionReason: reason });
        res.json({ success: true, message: 'Profile rejected. The user can still log in to make corrections.' });
    } catch (error) {
        console.error("Reject Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// --- ESTIMATION MODULE (Admin Controls) ---
// Requirement: Admin can download estimation file uploaded by contractor.
router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, files: estDoc.data().uploadedFiles || [] });
    } catch (error) {
        console.error("Fetch Estimation Files Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimation files' });
    }
});

// Requirement: Admin can upload/edit the estimation result.
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });
        const filePath = `estimations/results/${req.params.estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);
        await adminDb.collection('estimations').doc(req.params.estimationId).update({ resultFile: { url: fileUrl, name: req.file.originalname }, status: 'completed' });
        res.json({ success: true, message: 'Estimation result uploaded successfully' });
    } catch (error) {
        console.error("Upload Estimation Result Error:", error);
        res.status(500).json({ success: false, message: 'Error uploading result' });
    }
});

// --- ADMIN CONTROL FOR JOBS, QUOTES, MESSAGES, ESTIMATIONS ---
// Requirement: Admin can view and delete these items.
const createAdminCrudEndpoints = (collectionName) => {
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            res.json({ success: true, [collectionName]: items });
        } catch (e) { res.status(500).json({ success: false, message: `Error fetching ${collectionName}` }); }
    });
    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: `${collectionName.slice(0, -1)} deleted successfully.` });
        } catch (e) { res.status(500).json({ success: false, message: `Error deleting item` }); }
    });
};

createAdminCrudEndpoints('jobs');
createAdminCrudEndpoints('quotes');
createAdminCrudEndpoints('messages');
createAdminCrudEndpoints('estimations');

export default router;
