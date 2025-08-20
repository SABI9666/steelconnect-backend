// src/middleware/auth.js
// Complete authentication middleware with all role checks

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Main authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header received:', authHeader ? 'Bearer ***' : 'None');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid authorization header');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      console.log('No token found after Bearer');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. Invalid token format.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decoded successfully, user ID:', decoded.userId);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. User not found.' 
      });
    }

    console.log('User authenticated:', user.email, 'Role:', user.role);
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
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

// Admin authorization middleware
export const requireAdmin = (req, res, next) => {
  try {
    console.log('Checking admin privileges for user:', req.user?.email);
    console.log('User role:', req.user?.role);
    
    if (!req.user) {
      console.log('No user in request');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';
    
    if (!isAdmin) {
      console.log('User is not admin:', req.user.role);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Admin privileges required.' 
      });
    }

    console.log('Admin access granted');
    next();
    
  } catch (error) {
    console.error('Admin middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// Contractor authorization middleware
export const requireContractor = (req, res, next) => {
  try {
    console.log('Checking contractor privileges for user:', req.user?.email);
    console.log('User role:', req.user?.role);
    
    if (!req.user) {
      console.log('No user in request');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const isContractor = req.user.role === 'contractor' || req.user.type === 'contractor';
    
    if (!isContractor) {
      console.log('User is not contractor:', req.user.role);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Contractor privileges required.' 
      });
    }

    console.log('Contractor access granted');
    next();
    
  } catch (error) {
    console.error('Contractor middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// Client authorization middleware
export const requireClient = (req, res, next) => {
  try {
    console.log('Checking client privileges for user:', req.user?.email);
    console.log('User role:', req.user?.role);
    
    if (!req.user) {
      console.log('No user in request');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const isClient = req.user.role === 'client' || req.user.type === 'client';
    
    if (!isClient) {
      console.log('User is not client:', req.user.role);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Client privileges required.' 
      });
    }

    console.log('Client access granted');
    next();
    
  } catch (error) {
    console.error('Client middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// Check if user is contractor (function, not middleware)
export const isContractor = (user) => {
  return user && (user.role === 'contractor' || user.type === 'contractor');
};

// Check if user is admin (function, not middleware)
export const isAdmin = (user) => {
  return user && (user.role === 'admin' || user.type === 'admin');
};

// Check if user is client (function, not middleware)
export const isClient = (user) => {
  return user && (user.role === 'client' || user.type === 'client');
};

// Allow admin OR contractor
export const requireAdminOrContractor = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const hasAccess = isAdmin(req.user) || isContractor(req.user);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Admin or Contractor privileges required.' 
      });
    }

    console.log('Admin or Contractor access granted');
    next();
    
  } catch (error) {
    console.error('Admin/Contractor middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// Allow admin OR client
export const requireAdminOrClient = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required.' 
      });
    }

    const hasAccess = isAdmin(req.user) || isClient(req.user);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. Admin or Client privileges required.' 
      });
    }

    console.log('Admin or Client access granted');
    next();
    
  } catch (error) {
    console.error('Admin/Client middleware error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during authorization.' 
    });
  }
};

// Check if user owns resource or is admin
export const requireOwnershipOrAdmin = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required.' 
        });
      }

      // Admin can access anything
      if (isAdmin(req.user)) {
        console.log('Admin access granted');
        return next();
      }

      // Check ownership
      const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
      
      if (!resourceUserId) {
        return res.status(400).json({
          success: false,
          error: 'Resource owner ID not provided'
        });
      }

      if (req.user._id.toString() !== resourceUserId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only access your own resources.'
        });
      }

      console.log('Resource ownership verified');
      next();
      
    } catch (error) {
      console.error('Ownership middleware error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error during authorization.' 
      });
    }
  };
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    req.user = user || null;
    next();
    
  } catch (error) {
    console.log('Optional auth failed:', error.message);
    req.user = null;
    next();
  }
};
