// src/middleware/authMiddleware.js - Complete authentication and authorization middleware
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Authenticate JWT token
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get fresh user data from database
        const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
        
        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        
        // Check if user account is active
        if (userData.canAccess === false && userData.profileStatus !== 'pending') {
            return res.status(403).json({
                success: false,
                message: 'Account access restricted',
                profileStatus: userData.profileStatus
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded.userId,
            email: userData.email,
            type: userData.type,
            profileStatus: userData.profileStatus || 'incomplete',
            canAccess: userData.canAccess !== false
        };

        next();
    } catch (error) {
        console.error('Token authentication error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Authentication error'
            });
        }
    }
};

// Check if user is admin
export const isAdmin = (req, res, next) => {
    if (req.user.type !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

// Check if user is contractor
export const isContractor = (req, res, next) => {
    if (req.user.type !== 'contractor') {
        return res.status(403).json({
            success: false,
            message: 'Contractor access required'
        });
    }
    next();
};

// Check if user is designer
export const isDesigner = (req, res, next) => {
    if (req.user.type !== 'designer') {
        return res.status(403).json({
            success: false,
            message: 'Designer access required'
        });
    }
    next();
};

// Check if user has completed and approved profile (for restricted features)
export const requireApprovedProfile = (req, res, next) => {
    if (req.user.profileStatus !== 'approved') {
        return res.status(403).json({
            success: false,
            message: 'Approved profile required for this action',
            profileStatus: req.user.profileStatus,
            requiresProfileCompletion: true
        });
    }
    next();
};

// Optional profile check - allows access but provides profile status
export const checkProfileStatus = (req, res, next) => {
    // Just attach profile info, don't restrict access
    req.profileInfo = {
        completed: req.user.profileStatus === 'approved',
        status: req.user.profileStatus,
        needsCompletion: !req.user.profileStatus || req.user.profileStatus === 'incomplete'
    };
    next();
};

// Validate user type for specific routes
export const validateUserType = (allowedTypes) => {
    return (req, res, next) => {
        if (!allowedTypes.includes(req.user.type)) {
            return res.status(403).json({
                success: false,
                message: `Access restricted to: ${allowedTypes.join(', ')}`
            });
        }
        next();
    };
};
