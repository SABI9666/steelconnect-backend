// src/routes/admin.js - CORRECTED
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, adminStorage } from '../config/firebase.js';
import { sendEmail } from '../utils/emailService.js';

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

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Helper function to upload file to Firebase Storage
async function uploadToFirebaseStorage(file, path) {
    try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(path);
        
        const stream = fileRef.createWriteStream({
            metadata: { contentType: file.mimetype },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', async () => {
                try {
                    await fileRef.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
            stream.end(file.buffer);
        });
    } catch (error) {
        throw error;
    }
}

// === DASHBOARD ===
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);
        
        const [usersSnapshot, jobsSnapshot, quotesSnapshot, estimationsSnapshot, messagesSnapshot, reviewsSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('estimations').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('profile_reviews').where('status', '==', 'pending').get()
        ]);

        let contractors = 0, designers = 0;
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') contractors++;
            if (userData.type === 'designer') designers++;
        });

        const stats = {
            totalUsers: usersSnapshot.size,
            totalContractors: contractors,
            totalDesigners: designers,
            totalJobs: jobsSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            totalMessages: messagesSnapshot.size,
            pendingReviews: reviewsSnapshot.size,
            activeSubscriptions: 0 // Placeholder
        };

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

// === USER MANAGEMENT ===
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return { _id: doc.id, id: doc.id, ...userData, isActive: userData.canAccess !== false };
        });
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
    }
});

router.post('/users/:userId/toggle-status', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const newStatus = !(userDoc.data().canAccess !== false);
        await adminDb.collection('users').doc(req.params.userId).update({ canAccess: newStatus });
        res.json({ success: true, message: `User ${newStatus ? 'activated' : 'deactivated'}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to toggle user status' });
    }
});


// === JOBS, QUOTES, MESSAGES, PROFILE REVIEWS, and EXPORT routes should remain here as they are ===
// They are correctly defined and belong under the /api/admin/ path.

// === MESSAGES MANAGEMENT ===
router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = messagesSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));
        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// ... other message routes ...

// === PROFILE REVIEWS MANAGEMENT ===
router.get('/profile-reviews', async (req, res) => {
     try {
        const snapshot = await adminDb.collection('profile_reviews').orderBy('createdAt', 'desc').get();
        const reviews = [];
        for (const doc of snapshot.docs) {
            const reviewData = doc.data();
            let userData = null;
            const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
            if (userDoc.exists) {
                const { password, ...userInfo } = userDoc.data();
                userData = { id: userDoc.id, ...userInfo };
            }
            reviews.push({ _id: doc.id, id: doc.id, ...reviewData, user: userData });
        }
        res.json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching reviews' });
    }
});

// ... other profile review routes ...

// =========================================================================================
// The conflicting "Estimations Management" section has been removed from this file.
// All estimation logic is now handled exclusively by `estimation.js` via `/api/estimation`.
// =========================================================================================

export default router;
