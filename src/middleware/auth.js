// src/middleware/auth.js
// ✅ CLEAN AUTHENTICATION MIDDLEWARE - NO IMPORTS INSIDE

import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Adjust path to your User model

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
