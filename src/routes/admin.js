/ src/routes/admin.js
// ✅ CLEAN ADMIN ROUTES - IMPORTS AT TOP ONLY

import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Test endpoint for debugging
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

// Dashboard endpoint
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Dashboard access granted to:', req.user.email);
    
    // Mock data for now - replace with real database queries
    const dashboardData = {
      stats: {
        totalUsers: 150,
        totalQuotes: 45,
        totalJobs: 23,
        totalMessages: 89,
        totalEstimations: 34,
        activeSubscriptions: 12,
        pendingEstimations: 8,
        unreadMessages: 15
      },
      recentActivity: [
        {
          type: 'user',
          description: 'New user registration: john@example.com',
          timestamp: new Date().toISOString()
        },
        {
          type: 'quote',
          description: 'Quote request submitted for steel fabrication',
          timestamp: new Date(Date.now() - 86400000).toISOString()
        }
      ]
    };
    
    res.json({
      success: true,
      ...dashboardData // Spread the data directly
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }
});

// Users endpoint
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Users access granted to:', req.user.email);
    
    // Mock data for now - replace with real User.find() query
    const users = [
      {
        _id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'client',
        isActive: true,
        createdAt: new Date().toISOString(),
        company: 'ABC Construction'
      },
      {
        _id: '2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'contractor',
        isActive: true,
        createdAt: new Date().toISOString(),
        company: 'Steel Works Inc'
      }
    ];
    
    res.json({
      success: true,
      users: users
    });
    
  } catch (error) {
    console.error('❌ Users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load users'
    });
  }
});

// Quotes endpoint
router.get('/quotes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Quotes access granted to:', req.user.email);
    
    // Mock data for now
    const quotes = [
      {
        _id: '1',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        projectTitle: 'Steel Framework',
        projectType: 'Construction',
        amount: 15000,
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      quotes: quotes
    });
    
  } catch (error) {
    console.error('❌ Quotes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load quotes'
    });
  }
});

// Subscriptions endpoint
router.get('/subscriptions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Subscriptions access granted to:', req.user.email);
    
    res.json({ 
      success: true, 
      subscriptions: [] // Empty for now
    });
    
  } catch (error) {
    console.error('❌ Subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load subscriptions'
    });
  }
});

// Subscription plans endpoint
router.get('/subscription-plans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Subscription plans access granted to:', req.user.email);
    
    res.json({ 
      success: true, 
      plans: [] // Empty for now
    });
    
  } catch (error) {
    console.error('❌ Subscription plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load subscription plans'
    });
  }
});

// Messages endpoint
router.get('/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Messages access granted to:', req.user.email);
    
    res.json({ 
      success: true, 
      messages: [] // Empty for now
    });
    
  } catch (error) {
    console.error('❌ Messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load messages'
    });
  }
});

// Estimations endpoint
router.get('/estimations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Estimations access granted to:', req.user.email);
    
    res.json({ 
      success: true, 
      estimations: [] // Empty for now
    });
    
  } catch (error) {
    console.error('❌ Estimations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load estimations'
    });
  }
});

// Jobs endpoint
router.get('/jobs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('✅ Jobs access granted to:', req.user.email);
    
    res.json({ 
      success: true, 
      jobs: [] // Empty for now
    });
    
  } catch (error) {
    console.error('❌ Jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load jobs'
    });
  }
});

export default router;
