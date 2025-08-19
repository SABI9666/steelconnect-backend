// src/controllers/adminController.js

// Mongoose Models
import Estimation from '../models/Estimation.js'; // Only Estimation is from MongoDB

// Firebase Admin DB
import { adminDb } from '../config/firebase.js';

/**
 * Fetches statistics for the admin dashboard from both databases.
 */
export const getDashboardStats = async (req, res, next) => {
    try {
        const [usersSnapshot, quotesSnapshot, messagesSnapshot, jobsSnapshot, estimationCount] = await Promise.all([
            adminDb.collection('users').get(),      // From Firestore
            adminDb.collection('quotes').get(),     // From Firestore
            adminDb.collection('messages').get(),   // From Firestore
            adminDb.collection('jobs').get(),       // From Firestore
            Estimation.countDocuments()             // From MongoDB
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: usersSnapshot.size,
                totalQuotes: quotesSnapshot.size,
                totalMessages: messagesSnapshot.size,
                totalJobs: jobsSnapshot.size,
                totalEstimations: estimationCount
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all users from Firestore.
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            delete data.password; // IMPORTANT: Never send password hashes to the frontend
            return { id: doc.id, ...data };
        });
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching all users from Firestore:', error);
        next(error);
    }
};

/**
 * Deletes a user from Firestore.
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const userRef = adminDb.collection('users').doc(userId);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        await userRef.delete();
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        console.error('Error deleting user from Firestore:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all quotes from Firestore.
 */
export const getAllQuotes = async (req, res, next) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, quotes });
    } catch (error) {
        console.error('Error fetching all quotes from Firestore:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all jobs from Firestore.
 */
export const getAllJobs = async (req, res, next) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, jobs });
    } catch (error) {
        console.error('Error fetching all jobs from Firestore:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all messages from Firestore.
 */
export const getAllMessages = async (req, res, next) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, messages });
    } catch (error) {
        console.error('Error fetching all messages from Firestore:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all subscriptions from Firestore.
 */
export const getAllSubscriptions = async (req, res, next) => {
    try {
        const subscriptionsSnapshot = await adminDb.collection('subscriptions').orderBy('createdAt', 'desc').get();
        const subscriptions = subscriptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, subscriptions });
    } catch (error) {
        console.error('Error fetching all subscriptions from Firestore:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all estimations from MongoDB.
 */
export const getAllEstimations = async (req, res, next) => {
    try {
        const estimations = await Estimation.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching all estimations from MongoDB:', error);
        next(error);
    }
};

/**
 * Retrieves system statistics.
 */
export const getSystemStats = (req, res) => {
    res.status(200).json({
        success: true,
        stats: {
            nodeVersion: process.version,
            platform: process.platform,
            serverUptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
        }
    });
};
