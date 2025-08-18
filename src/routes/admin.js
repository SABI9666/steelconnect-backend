import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import Quote from '../models/Quote.js';
import Message from '../models/Message.js';
import Job from '../models/Job.js';

const router = express.Router();

// Middleware to use on all admin routes
router.use(isAdmin);

// --- Admin Dashboard Stats Route ---
router.get('/dashboard', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
        const totalQuotes = await Quote.countDocuments();
        const totalMessages = await Message.countDocuments();
        const totalJobs = await Job.countDocuments();

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalQuotes,
                totalMessages,
                totalJobs,
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard statistics.' });
    }
});

// --- User Management Routes ---
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }, '-password').lean();
        res.status(200).json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users.' });
    }
});

router.put('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await User.findByIdAndUpdate(id, { status });
        res.status(200).json({ success: true, message: 'User status updated successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status.' });
    }
});

// --- NEW FEATURE START: Update User Subscription ---
router.put('/users/:id/subscription', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting status: 'active' or 'inactive'

        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid subscription status provided.' });
        }

        const updateData = {
            'subscription.status': status,
            // You could add logic here to set an endDate, e.g., if status is 'active', set endDate to 1 year from now
        };

        await User.findByIdAndUpdate(id, updateData);
        res.status(200).json({ success: true, message: 'User subscription updated successfully.' });
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to update user subscription.' });
    }
});
// --- NEW FEATURE END ---


router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await User.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete user.' });
    }
});

// --- Quotes Management Routes ---
router.get('/quotes', async (req, res) => {
    try {
        const quotes = await Quote.find().populate('userId', 'name email').lean();
        res.status(200).json({ success: true, quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch quotes.' });
    }
});

// --- Messages Management Routes ---
router.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().populate('senderId', 'name email').lean();
        res.status(200).json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch messages.' });
    }
});

// --- Jobs Management Routes ---
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().lean();
        res.status(200).json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch jobs.' });
    }
});

export default router;
