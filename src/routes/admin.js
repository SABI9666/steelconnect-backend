import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();
router.use(isAdmin);

// --- DASHBOARD & DATA FETCHING ROUTES ---

router.get('/dashboard', async (req, res) => {
    try {
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
            stats: { totalUsers: userCount, totalQuotes: quoteCount, totalMessages: messageCount, totalJobs: jobsCount }
        });
    } catch (error) {
        console.error('🔴 ERROR fetching dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics.' });
    }
});

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

router.get('/subscriptions', async (req, res) => {
    try {
        if (!adminDb) return res.json({ success: true, subscriptions: [] });
        const subsSnapshot = await adminDb.collection('subscriptions').get();
        const subscriptions = subsSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, subscriptions });
    } catch (error) {
        console.error('🔴 ERROR fetching subscriptions:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch subscriptions.' });
    }
});


// --- USER ACTION ROUTES (Updates) ---

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

router.put('/users/:id/subscription-required', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.id).update({ subscriptionRequired: req.body.required });
        res.status(200).json({ success: true, message: 'Subscription requirement updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update subscription requirement.' });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        await adminDb.collection('users').doc(req.params.id).delete();
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete user.' });
    }
});

// --- QUOTE ACTION ROUTES (Updates) ---

router.put('/quotes/:id/status', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.id).update({ status: req.body.status });
        res.status(200).json({ success: true, message: 'Quote status updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update quote status.' });
    }
});

router.put('/quotes/:id/amount', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.id).update({ amount: req.body.amount });
        res.status(200).json({ success: true, message: 'Quote amount updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update quote amount.' });
    }
});

router.put('/quotes/:id/subscription-required', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.id).update({ subscriptionRequired: req.body.required });
        res.status(200).json({ success: true, message: 'Quote subscription requirement updated.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update quote subscription requirement.' });
    }
});

// Add other specific update routes for jobs, messages, and subscriptions as needed...

export default router;
