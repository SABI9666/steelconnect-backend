// src/middleware/auth.js
// Authentication and authorization middleware

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware to authenticate JWT token
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find the user
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. User not found.'
      });
    }

    // Add user to request object
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Authentication error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Access denied. Token expired.'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.'
    });
  }
};

// Middleware to check if user is a contractor
export const isContractor = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. User not authenticated.'
      });
    }

    if (req.user.role !== 'contractor' && req.user.type !== 'contractor') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Contractor privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Contractor authorization error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authorization failed.'
    });
  }
};

// Middleware to check if user is a designer
export const isDesigner = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. User not authenticated.'
      });
    }

    if (req.user.role !== 'designer' && req.user.type !== 'designer') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Designer privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Designer authorization error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authorization failed.'
    });
  }
};

// Middleware to check if user is an admin
export const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. User not authenticated.'
      });
    }

    if (req.user.role !== 'admin' && req.user.type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin authorization error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authorization failed.'
    });
  }
};

// Middleware to check if user is a client
export const isClient = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. User not authenticated.'
      });
    }

    if (req.user.role !== 'client' && req.user.type !== 'client') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Client privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Client authorization error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authorization failed.'
    });
  }
};

// Middleware to check multiple roles
export const hasRole = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Access denied. User not authenticated.'
        });
      }

      const userRole = req.user.role || req.user.type;
      
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: `Access denied. Required roles: ${roles.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Role authorization error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Authorization failed.'
      });
    }
  };
};

// Middleware to check if user owns the resource or is admin
export const isOwnerOrAdmin = (userIdField = 'userId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Access denied. User not authenticated.'
        });
      }

      const userRole = req.user.role || req.user.type;
      const userId = req.user._id.toString();
      const resourceUserId = req.params[userIdField] || req.body[userIdField];

      // Allow if user is admin or owns the resource
      if (userRole === 'admin' || userId === resourceUserId) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own resources.'
      });

    } catch (error) {
      console.error('Ownership authorization error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Authorization failed.'
      });
    }
  };
};

export default {
  authenticateToken,
  isContractor,
  isDesigner,
  isAdmin,
  isClient,
  hasRole,
  isOwnerOrAdmin
};
