// src/routes/admin.js - Complete, working admin routes
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.use(authenticateToken);
router.use(isAdmin);

// --- USER MANAGEMENT ---
router.get('/users', async (req, res) => { /* ... existing correct code ... */ });
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        await adminDb.collection('users').doc(req.params.userId).update({ isActive: isActive, canAccess: isActive });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) { res.status(500).json({ success: false, message: 'Error updating user status' }); }
});

// --- PROFILE REVIEW & REJECTION FLOW ---
router.get('/profile-reviews', async (req, res) => { /* ... existing correct code ... */ });
router.post('/profile-reviews/:reviewId/approve', async (req, res) => { /* ... existing correct code ... */ });
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        await adminDb.collection('users').doc(req.params.reviewId).update({ profileStatus: 'rejected', rejectionReason: reason });
        res.json({ success: true, message: 'Profile rejected. The user can still log in to make corrections.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error rejecting profile' }); }
});

// --- ESTIMATION MODULE (Admin Controls) ---
// Requirement: Admin can download estimation file uploaded by contractor.
router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, files: estDoc.data().uploadedFiles || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching estimation files' });
    }
});

// Requirement: Admin can upload/edit the estimation result.
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => { /* ... existing correct code ... */ });
router.delete('/estimations/:estimationId', async (req, res) => { /* ... existing correct code ... */ });

// --- ADMIN CONTROL FOR JOBS, QUOTES, MESSAGES, ESTIMATIONS ---
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
