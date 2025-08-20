// CHECK YOUR AUTHENTICATION MIDDLEWARE
// Make sure you have this file: src/middleware/auth.js

import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Adjust path as needed

// ✅ AUTHENTICATION MIDDLEWARE
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header received:', authHeader ? 'Bearer ***' : 'None');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No valid authorization header');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      console.log('❌ No token found after Bearer');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. Invalid token format.' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded successfully, user ID:', decoded.userId);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. User not found.' 
      });
    }

    console.log('✅ User authenticated:', user.email, 'Role:', user.role);
    req.user = user;
    next();
    
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. Token expired.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. Invalid token.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authentication.' 
    });
  }
};

// ✅ ADMIN AUTHORIZATION MIDDLEWARE
export const requireAdmin = (req, res, next) => {
  try {
    console.log('Checking admin privileges for user:', req.user?.email);
    console.log('User role:', req.user?.role);
    
    if (!req.user) {
      console.log('❌ No user in request (auth middleware not called?)');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';
    
    if (!isAdmin) {
      console.log('❌ User is not admin:', req.user.role);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Admin privileges required.' 
      });
    }

    console.log('✅ Admin access granted');
    next();
    
  } catch (error) {
    console.error('❌ Admin middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// ✅ EXAMPLE ADMIN ROUTES FILE
// Make sure your src/routes/admin.js looks like this:

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
      data: dashboardData
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
    
    // Mock data for now
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

// Add similar patterns for other endpoints
router.get('/quotes', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, quotes: [] });
});

router.get('/subscriptions', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, subscriptions: [] });
});

router.get('/subscription-plans', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, plans: [] });
});

export default router;

// ✅ EXAMPLE AUTH ROUTES FILE
// Make sure your src/routes/auth.js has proper login:

/*
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

router.post('/login/admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Admin login attempt:', email);
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Check if user is admin
    if (user.role !== 'admin' && user.type !== 'admin') {
      console.log('❌ User is not admin:', email, 'Role:', user.role);
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ Admin login successful:', email);
    
    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

export default router;
*/
