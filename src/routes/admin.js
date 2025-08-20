// src/routes/admin.js
// Admin routes for Firebase setup

import express from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import {
  getDashboardStats,
  getAllUsers,
  getAllJobs,
  getAllQuotes,
  getAllMessages,
  getSubscriptionPlans,
  getSubscriptions
} from '../controllers/adminController.js';

const router = express.Router();

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard route
router.get('/dashboard', getDashboardStats);

// User management routes
router.get('/users', getAllUsers);

// Job management routes  
router.get('/jobs', getAllJobs);

// Quote management routes
router.get('/quotes', getAllQuotes);

// Message management routes
router.get('/messages', getAllMessages);

// Subscription management routes
router.get('/subscription-plans', getSubscriptionPlans);
router.get('/subscriptions', getSubscriptions);

// Health check for admin routes
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin routes are working',
    user: {
      id: req.user.uid,
      email: req.user.email,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

// Simple test endpoint that returns minimal data
router.get('/test-data', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint working',
    data: {
      test: 'Hello from backend!',
      timestamp: new Date().toISOString(),
      user: req.user.email
    }
  });
});

// Analytics endpoint (since your frontend is requesting it)
router.get('/analytics', (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 150000,
      monthlyGrowth: 12.5,
      activeProjects: 8,
      completedProjects: 15,
      chartData: [
        { month: 'Jan', value: 10000 },
        { month: 'Feb', value: 15000 },
        { month: 'Mar', value: 20000 },
        { month: 'Apr', value: 18000 },
        { month: 'May', value: 25000 },
        { month: 'Jun', value: 30000 }
      ]
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
