/ src/routes/admin.js - Updated to work with your existing models
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
        console.log('Admin dashboard requested');
        
        // Get real counts from database
        const [totalUsers, totalQuotes, totalMessages, totalJobs] = await Promise.all([
            User.countDocuments(),
            Quote.countDocuments(), 
            Message.countDocuments(),
            Job.countDocuments()
        ]);

        // Get recent activity
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(3)
            .select('name email createdAt');

        const recentActivity = recentUsers.map(user => ({
            type: 'user',
            description: `New user registration: ${user.email}`,
            timestamp: user.createdAt
        }));

        const stats = {
            totalUsers,
            totalQuotes,
            totalMessages,
            totalJobs,
            totalEstimations: 8, // From estimation routes
            activeSubscriptions: 0,
            pendingEstimations: 3,
            unreadMessages: await Message.countDocuments({ status: 'unread' }) || 0
        };

        res.status(200).json({
            success: true,
            stats,
            recentActivity
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch dashboard statistics.' 
        });
    }
});

// --- User Management Routes ---
router.get('/users', async (req, res) => {
    try {
        console.log('Admin requesting users list');
        
        const users = await User.find({ role: { $ne: 'admin' } })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();
            
        res.status(200).json({ 
            success: true, 
            users 
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch users.' 
        });
    }
});

// Get specific user details
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .lean();
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Add activity stats
        const stats = {
            quotesRequested: await Quote.countDocuments({ userId: user._id }),
            jobsCompleted: await Job.countDocuments({ 
                $or: [{ clientId: user._id }, { contractorId: user._id }],
                status: 'completed' 
            }),
            messagesSent: await Message.countDocuments({ senderId: user._id })
        };
        
        res.json({
            success: true,
            user: { ...user, stats }
        });
        
    } catch (error) {
        console.error('User details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load user details'
        });
    }
});

// Update user status
router.patch('/users/:id/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive, status: isActive ? 'active' : 'inactive' },
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user
        });
        
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

// --- Quotes Management Routes ---
router.get('/quotes', async (req, res) => {
    try {
        console.log('Admin requesting quotes list');
        
        const quotes = await Quote.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .lean();
            
        // Transform data to match frontend expectations
        const transformedQuotes = quotes.map(quote => ({
            _id: quote._id,
            clientName: quote.userId?.name || 'Unknown Client',
            clientEmail: quote.userId?.email || 'Unknown Email',
            projectTitle: quote.projectTitle || quote.title || 'Untitled Project',
            projectType: quote.projectType || quote.category || 'General',
            amount: quote.estimatedCost || quote.amount || 0,
            status: quote.status || 'pending',
            createdAt: quote.createdAt,
            updatedAt: quote.updatedAt
        }));
        
        res.status(200).json({ 
            success: true, 
            quotes: transformedQuotes 
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch quotes.' 
        });
    }
});

// Get specific quote details
router.get('/quotes/:id', async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id)
            .populate('userId', 'name email phone')
            .lean();
        
        if (!quote) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found'
            });
        }
        
        // Transform data
        const transformedQuote = {
            _id: quote._id,
            quoteNumber: quote.quoteNumber || quote._id.toString().slice(-6),
            clientName: quote.userId?.name || 'Unknown Client',
            clientEmail: quote.userId?.email || 'Unknown Email',
            clientPhone: quote.userId?.phone || 'Not provided',
            projectTitle: quote.projectTitle || quote.title || 'Untitled Project',
            projectType: quote.projectType || quote.category || 'General',
            amount: quote.estimatedCost || quote.amount || 0,
            status: quote.status || 'pending',
            description: quote.description || 'No description provided',
            createdAt: quote.createdAt,
            updatedAt: quote.updatedAt
        };
        
        res.json({
            success: true,
            quote: transformedQuote
        });
        
    } catch (error) {
        console.error('Quote details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load quote details'
        });
    }
});

// Update quote status
router.patch('/quotes/:id/status', async (req, res) => {
    try {
        const { status } = req
