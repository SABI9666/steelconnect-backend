import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();
router.use(isAdmin);

// --- DASHBOARD ROUTE (TEMPORARILY MODIFIED FOR TESTING) ---
router.get('/dashboard', async (req, res) => {
    try {
        const getCollectionCount = async (collectionName) => {
            if (!adminDb) return 0;
            const snapshot = await adminDb.collection(collectionName).get();
            return snapshot.size || 0;
        };

        // --- TEMPORARY CHANGE: The "messages" collection query has been removed for this test ---
        const [userCount, quoteCount, jobsCount] = await Promise.all([
            getCollectionCount('users'),
            getCollectionCount('quotes'),
            getCollectionCount('jobs')
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quoteCount,
                totalMessages: 0, // Sending 0 as a placeholder for the test
                totalJobs: jobsCount,
            }
        });
    } catch (error) {
        console.error('🔴 ERROR fetching dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics.' });
    }
});


// --- DATA FETCHING ROUTES ---

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

router.get('/quotes', async (req, res) => {
    try {
        if (!adminDb) return res.json({ success: true, quotes: [] });
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, quotes });
    } catch (error) {
        console.error('🔴 ERROR fetching quotes:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch quotes.' });
    }
});

router.get('/jobs', async (req, res) => {
    try {
        if (!adminDb) return res.json({ success: true, jobs: [] });
        const jobsSnapshot = await adminDb.collection('jobs').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, jobs });
    } catch (error) {
        console.error('🔴 ERROR fetching jobs:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch jobs.' });
    }
});

// This route still exists but will not be called by the dashboard for now.
router.get('/messages', async (req, res) => {
    try {
        if (!adminDb) return res.json({ success: true, messages: [] });
        const messagesSnapshot = await adminDb.collection('messages').get();
        const messages = messagesSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, messages });
    } catch (error) {
        console.error('🔴 ERROR fetching messages:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch messages.' });
    }
});


// --- ACTION & UPDATE ROUTES ---

router.put('/users/:id/status', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.id).update({ status: req.body.status });
        res.status(200).json({ success: true, message: 'User status updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status.' });
    }
});

router.put('/users/:id/subscription', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.id).update({ 'subscription.status': req.body.status });
        res.status(200).json({ success: true, message: 'User subscription updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user subscription.' });
    }
});

// Add any other update/delete routes here if you have them...


export default router;
