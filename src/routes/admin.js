import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
// --- FIX: Import the Firebase admin database instance ---
import { adminDb } from '../config/firebase.js';

// Mongoose models are no longer needed for these routes
// import User from '../models/User.js';
// import Quote from '../models/Quote.js';
// ...etc

const router = express.Router();

// This middleware remains the same and ensures only admins can access these routes
router.use(isAdmin);

// --- Admin Dashboard Stats Route (Firestore Version) ---
router.get('/dashboard', async (req, res) => {
    try {
        // Firestore: Get the size of each collection
        const usersSnapshot = await adminDb.collection('users').get();
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const messagesSnapshot = await adminDb.collection('messages').get();
        const jobsSnapshot = await adminDb.collection('jobs').get();

        // Filter out admin users from the count
        const nonAdminUsers = usersSnapshot.docs.filter(doc => doc.data().type !== 'admin');

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: nonAdminUsers.length,
                totalQuotes: quotesSnapshot.size || 0,
                totalMessages: messagesSnapshot.size || 0,
                totalJobs: jobsSnapshot.size || 0,
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats from Firestore:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics.' });
    }
});

// --- User Management Routes (Firestore Version) ---
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            // Ensure we don't send the password to the frontend
            const { password, ...userToReturn } = userData;
            
            // Only add non-admin users to the list
            if (userToReturn.type !== 'admin') {
                 users.push({
                    _id: doc.id, // Use the Firestore document ID
                    ...userToReturn
                });
            }
        });
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users from Firestore:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users.' });
    }
});

router.put('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        // Firestore: Update a document in the 'users' collection
        await adminDb.collection('users').doc(id).update({ status });
        res.status(200).json({ success: true, message: 'User status updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status.' });
    }
});

router.put('/users/:id/subscription', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        // Firestore: Update a nested object field
        await adminDb.collection('users').doc(id).update({ 'subscription.status': status });
        res.status(200).json({ success: true, message: 'User subscription updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user subscription.' });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Firestore: Delete a document
        await adminDb.collection('users').doc(id).delete();
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete user.' });
    }
});

// --- Management routes for Quotes, Messages, Jobs (Firestore Version) ---
// Note: This assumes your other data is also in Firestore.
// If quotes, messages, or jobs are in MongoDB, those specific routes would need to use Mongoose.

router.get('/quotes', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch quotes.' });
    }
});

router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').get();
        const messages = messagesSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch messages.' });
    }
});

router.get('/jobs', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch jobs.' });
    }
});


export default router;
