import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();
router.use(isAdmin);

// --- Admin Dashboard Stats Route (More Robust Version) ---
router.get('/dashboard', async (req, res) => {
    try {
        // Helper function to safely get collection size
        const getCollectionCount = async (collectionName) => {
            if (!adminDb) return 0;
            const snapshot = await adminDb.collection(collectionName).get();
            return snapshot.size || 0;
        };

        const [userCount, quoteCount, messageCount, jobsCount] = await Promise.all([
            getCollectionCount('users'),
            getCollectionCount('quotes'),
            getCollectionCount('messages'),
            getCollectionCount('jobs')
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quoteCount,
                totalMessages: messageCount,
                totalJobs: jobsCount,
                activeSubscriptions: 0, // Placeholder
                totalRevenue: 0       // Placeholder
            }
        });
    } catch (error) {
        console.error('🔴 ERROR fetching dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics.' });
    }
});

// --- User Management Routes ---
router.get('/users', async (req, res) => {
    try {
        if (!adminDb) return res.json({ success: true, users: [] });
        
        const usersSnapshot = await adminDb.collection('users').get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userToReturn } = userData;
            if (userToReturn.type !== 'admin') {
                 users.push({ _id: doc.id, ...userToReturn });
            }
        });
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('🔴 ERROR fetching users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users.' });
    }
});

// Other admin routes like quotes, jobs, etc. would go here...

export default router;
