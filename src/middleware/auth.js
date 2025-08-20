// src/middleware/auth.js
// Authentication and authorization middleware for your Firebase setup

import jwt from 'jsonwebtoken';
import { admin } from '../config/firebase.js';

// Get Firebase Auth instance
const auth = admin.auth();

// Middleware to authenticate JWT token with Firebase users
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
    
    // Get user from Firebase using the userId from token
    let user;
    try {
      user = await auth.getUser(decoded.userId);
    } catch (firebaseError) {
      console.error('Firebase user lookup error:', firebaseError.message);
      
      // Auto-create env_admin user if it doesn't exist
      if (decoded.userId === 'env_admin') {
        try {
          console.log('🔧 Auto-creating env_admin user in Firebase...');
          
          user = await auth.createUser({
            uid: 'env_admin',
            email: 'admin@steelconnect.com',
            displayName: 'Environment Admin',
            emailVerified: true
          });
          
          // Set admin role
          await auth.setCustomUserClaims('env_admin', { 
            role: 'admin',
            type: 'admin',
            autoCreated: true,
            createdAt: new Date().toISOString()
          });
          
          console.log('✅ Auto-created env_admin user successfully');
          
          // Get the user again to ensure it has the claims
          user = await auth.getUser('env_admin');
          
        } catch (createError) {
          console.error('❌ Failed to auto-create env_admin user:', createError.message);
          return res.status(401).json({
            success: false,
            error: 'Access denied. Failed to create admin user.',
            details: createError.message
          });
        }
      } else {
        return res.status(401).json({
          success: false,
          error: 'Access denied. User not found in Firebase.',
          userId: decoded.userId
        });
      }
    }

    // Convert Firebase user to our expected format
    const userData = {
      _id: user.uid,
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'Unknown',
      email: user.email,
      role: user.customClaims?.role || 'client', // Default to client if no role set
      type: user.customClaims?.type || user.customClaims?.role || 'client',
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime
      }
    };

    // Add user to request object
    req.user = userData;
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

// Alternative: Authenticate using Firebase ID token directly
export const authenticateFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify Firebase ID token directly
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Get full user data from Firebase
    const user = await auth.getUser(decodedToken.uid);

    // Convert Firebase user to our expected format
    const userData = {
      _id: user.uid,
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'Unknown',
      email: user.email,
      role: user.customClaims?.role || 'client',
      type: user.customClaims?.type || user.customClaims?.role || 'client',
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime
      }
    };

    // Add user to request object
    req.user = userData;
    next();
    
  } catch (error) {
    console.error('Firebase authentication error:', error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Access denied. Invalid Firebase token.'
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
      const userId = req.user.uid || req.user._id; // Use Firebase UID
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

// Alias for isAdmin (some routes might use requireAdmin instead)
export const requireAdmin = isAdmin;

export default {
  authenticateToken,
  authenticateFirebaseToken,
  isContractor,
  isDesigner,
  isAdmin,
  isClient,
  hasRole,
  isOwnerOrAdmin,
  requireAdmin
};
