// src/controllers/adminController.js

// Mongoose Models
import User from '../models/User.js';
import Estimation from '../models/Estimation.js'; // Added this line

// Firebase Admin DB
import { adminDb } from '../config/firebase.js';

/**
 * Fetches statistics for the admin dashboard.
 */
export const getDashboardStats = async (req, res, next) => {
    try {
        const [userCount, quotesSnapshot, messagesSnapshot, jobsSnapshot] = await Promise.all([
            User.countDocuments(), // From MongoDB
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get()
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quotesSnapshot.size,
                totalMessages: messagesSnapshot.size,
                totalJobs: jobsSnapshot.size
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        next(error);
    }
};

/**
 * Retrieves a list of all users from MongoDB.
 */
export const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching all users:', error);
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
 * (NEW) Retrieves a list of all estimations from MongoDB.
 */
export const getAllEstimations = async (req, res, next) => {
    try {
        const estimations = await Estimation.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching all estimations:', error);
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
