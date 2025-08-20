import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import User from '../models/User.js';
import Quote from '../models/Quote.js'; // Adjust path to your models
import Job from '../models/Job.js';
import Message from '../models/Message.js';
import Estimation from '../models/Estimation.js';

const router = express.Router();

router.get('/test', authenticateToken, requireAdmin, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin access working!',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// REAL DASHBOARD with database queries
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Dashboard access granted to:', req.user.email);
    
    // Get real counts from database
    const [
      totalUsers,
      totalQuotes,
      totalJobs,
      totalMessages,
      totalEstimations,
      unreadMessages,
      pendingEstimations
    ] = await Promise.all([
      User.countDocuments(),
      Quote.countDocuments(),
      Job.countDocuments(),
      Message.countDocuments(),
      Estimation.countDocuments(),
      Message.countDocuments({ status: 'unread' }),
      Estimation.countDocuments({ status: 'pending' })
    ]);

    // Get recent activity from database
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(3)
      .select('name email createdAt');

    const recentQuotes = await Quote.find()
      .sort({ createdAt: -1 })
      .limit(2)
      .select('clientName projectTitle createdAt');

    const recentActivity = [
      ...recentUsers.map(user => ({
        type: 'user',
        description: `New user registration: ${user.email}`,
        timestamp: user.createdAt
      })),
      ...recentQuotes.map(quote => ({
        type: 'quote',
        description: `Quote request: ${quote.projectTitle}`,
        timestamp: quote.createdAt
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
    
    const dashboardData = {
      stats: {
        totalUsers,
        totalQuotes,
        totalJobs,
        totalMessages,
        totalEstimations,
        activeSubscriptions: 0, // Add when you have subscription model
        pendingEstimations,
        unreadMessages
      },
      recentActivity
    };
    
    res.json({
      success: true,
      ...dashboardData
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }
});

// REAL USERS from database
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Users access granted to:', req.user.email);
    
    const users = await User.find()
      .select('-password') // Don't send passwords
      .sort({ createdAt: -1 })
      .lean(); // Convert to plain objects for better performance
    
    res.json({
      success: true,
      users: users
    });
    
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load users'
    });
  }
});

// REAL QUOTES from database
router.get('/quotes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Quotes access granted to:', req.user.email);
    
    const quotes = await Quote.find()
      .populate('clientId', 'name email') // If you have user references
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      quotes: quotes
    });
    
  } catch (error) {
    console.error('Quotes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load quotes'
    });
  }
});

// REAL JOBS from database
router.get('/jobs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Jobs access granted to:', req.user.email);
    
    const jobs = await Job.find()
      .populate('clientId', 'name email')
      .populate('contractorId', 'name email company')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      jobs: jobs
    });
    
  } catch (error) {
    console.error('Jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load jobs'
    });
  }
});

// REAL MESSAGES from database
router.get('/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Messages access granted to:', req.user.email);
    
    const messages = await Message.find()
      .populate('senderId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      messages: messages
    });
    
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load messages'
    });
  }
});

// REAL ESTIMATIONS from database
router.get('/estimations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Estimations access granted to:', req.user.email);
    
    const estimations = await Estimation.find()
      .populate('contractorId', 'name email company')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      estimations: estimations
    });
    
  } catch (error) {
    console.error('Estimations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load estimations'
    });
  }
});

// PLACEHOLDER for subscriptions (when you implement them)
router.get('/subscriptions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Subscriptions access granted to:', req.user.email);
    
    // When you create Subscription model, replace with:
    // const subscriptions = await Subscription.find().populate('userId', 'name email');
    
    res.json({ 
      success: true, 
      subscriptions: [] // Empty until you implement subscriptions
    });
    
  } catch (error) {
    console.error('Subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load subscriptions'
    });
  }
});

// PLACEHOLDER for subscription plans
router.get('/subscription-plans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('Subscription plans access granted to:', req.user.email);
    
    // When you create SubscriptionPlan model, replace with:
    // const plans = await SubscriptionPlan.find();
    
    res.json({ 
      success: true, 
      plans: [] // Empty until you implement subscription plans
    });
    
  } catch (error) {
    console.error('Subscription plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load subscription plans'
    });
  }
});

// USER MANAGEMENT ENDPOINTS

// Get specific user details
router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
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
    
    // Add activity stats (customize based on your models)
    const stats = {
      quotesRequested: await Quote.countDocuments({ clientId: user._id }),
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
router.patch('/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
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
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
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

export default router;
