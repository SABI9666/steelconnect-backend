import admin from 'firebase-admin';

const db = admin.firestore();

// 📊 GET DASHBOARD STATS (FINAL, SEQUENTIAL VERSION)
export const getDashboardStats = async (req, res) => {
    try {
        const getCollectionCount = async (collectionName) => {
            try {
                const snapshot = await db.collection(collectionName).get();
                return snapshot.size || 0;
            } catch (error) {
                console.warn(`⚠️ Could not get count for collection: ${collectionName}`);
                return 0; // Return 0 if collection doesn't exist or fails
            }
        };

        // Fetched counts one-by-one to prevent timeouts
        const userCount = await getCollectionCount('users');
        const quoteCount = await getCollectionCount('quotes');
        const messageCount = await getCollectionCount('messages');
        const jobsCount = await getCollectionCount('jobs');
        const subsCount = await getCollectionCount('subscriptions');

        res.json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quoteCount,
                totalMessages: messageCount,
                totalJobs: jobsCount,
                activeSubscriptions: subsCount
            }
        });
    } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard statistics' });
    }
};

// 📈 GET SYSTEM STATS
export const getSystemStats = async (req, res) => {
    try {
        res.json({
            success: true,
            stats: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('❌ Error fetching system stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching system statistics' });
    }
};

// 👥 GET ALL USERS
export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await db.collection('users').where('type', '!=', 'admin').get();
        const users = snapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return { id: doc.id, ...userData };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
};

// 🗑️ DELETE USER
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        await db.collection('users').doc(userId).delete();
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
};

// 🗂️ GET ALL QUOTES
export const getAllQuotes = async (req, res) => {
    try {
        const snapshot = await db.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, quotes });
    } catch (error) {
        console.error('❌ Error fetching quotes:', error);
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
};

// 💼 GET ALL JOBS
export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await db.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, jobs });
    } catch (error) {
        console.error('❌ Error fetching jobs:', error);
        res.status(500).json({ success: false, message: 'Error fetching jobs' });
    }
};

// 💬 GET ALL MESSAGES
export const getAllMessages = async (req, res) => {
    try {
        const snapshot = await db.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, messages });
    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
};

// 👑 GET ALL SUBSCRIPTIONS
export const getAllSubscriptions = async (req, res) => {
    try {
        const snapshot = await db.collection('subscriptions').orderBy('startDate', 'desc').get();
        const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error('❌ Error fetching subscriptions:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
    }
};
## 2. Correct admin.js Router
This file should only contain the router code.

JavaScript

import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';

// Import all the controller functions
import {
    getDashboardStats,
    getAllUsers,
    deleteUser,
    getSystemStats,
    getAllQuotes,
    getAllJobs,
    getAllMessages,
    getAllSubscriptions
} from '../controllers/adminController.js';

const router = express.Router();

// Apply the 'isAdmin' security check to ALL routes in this file
router.use(isAdmin);


// --- DEFINE THE API ROUTES ---

// Dashboard & System
router.get('/dashboard', getDashboardStats);
router.get('/system-stats', getSystemStats);

// Users
router.get('/users', getAllUsers);
router.delete('/users/:userId', deleteUser);

// Quotes, Jobs, Messages, Subscriptions
router.get('/quotes', getAllQuotes);
router.get('/jobs', getAllJobs);
router.get('/messages', getAllMessages);
router.get('/subscriptions', getAllSubscriptions);


export default router;
