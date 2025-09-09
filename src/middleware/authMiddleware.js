// src/middleware/authMiddleware.js - Authentication middleware
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

/**
 * Authenticate JWT token middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
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
        if (userData.canAccess === false && userData.profileStatus === 'rejected') {
            return res.status(403).json({
                success: false,
                message: 'Account access has been restricted',
                profileStatus: userData.profileStatus
            });
        }

        // Attach user info to request
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            type: decoded.type,
            role: decoded.role || decoded.type,
            profileStatus: userData.profileStatus,
            profileCompleted: userData.profileCompleted,
            canAccess: userData.canAccess
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
        }

        console.error('Authentication middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
}

/**
 * Check if user is admin middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function isAdmin(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (req.user.type !== 'admin' && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        // Optionally, double-check admin status in database
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();
        
        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        
        if (userData.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        if (userData.canAccess === false) {
            return res.status(403).json({
                success: false,
                message: 'Admin account has been suspended'
            });
        }

        next();
    } catch (error) {
        console.error('Admin check middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authorization check failed'
        });
    }
}

/**
 * Check if user has completed profile middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireCompleteProfile(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Skip profile requirement for admins
        if (req.user.type === 'admin') {
            return next();
        }

        if (!req.user.profileCompleted || req.user.profileStatus !== 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Profile must be completed and approved to access this resource',
                profileStatus: req.user.profileStatus,
                profileCompleted: req.user.profileCompleted,
                requiresProfileCompletion: true
            });
        }

        next();
    } catch (error) {
        console.error('Profile check middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Profile verification failed'
        });
    }
}

/**
 * Check if user type matches required type
 * @param {string|Array} allowedTypes - Allowed user types (string or array)
 * @returns {Function} Express middleware function
 */
export function requireUserType(allowedTypes) {
    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            if (!types.includes(req.user.type)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required user type: ${types.join(' or ')}`,
                    userType: req.user.type,
                    allowedTypes: types
                });
            }

            next();
        } catch (error) {
            console.error('User type check middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'User type verification failed'
            });
        }
    };
}

/**
 * Check if user is contractor middleware
 */
export function isContractor(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.type !== 'contractor') {
        return res.status(403).json({
            success: false,
            message: 'Contractor access required'
        });
    }

    next();
}

/**
 * Check if user is designer middleware
 */
export function isDesigner(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.type !== 'designer') {
        return res.status(403).json({
            success: false,
            message: 'Designer access required'
        });
    }

    next();
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            // No token provided, continue without authentication
            req.user = null;
            return next();
        }

        try {
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user data from database
            const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                req.user = {
                    userId: decoded.userId,
                    email: decoded.email,
                    type: decoded.type,
                    role: decoded.role || decoded.type,
                    profileStatus: userData.profileStatus,
                    profileCompleted: userData.profileCompleted,
                    canAccess: userData.canAccess
                };
            } else {
                req.user = null;
            }
        } catch (tokenError) {
            // Invalid token, continue without authentication
            req.user = null;
        }

        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        req.user = null;
        next();
    }
}

/**
 * Rate limiting middleware (simple implementation)
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware function
 */
export function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();

    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        // Clean old entries
        const cutoff = now - windowMs;
        for (const [id, timestamps] of requests.entries()) {
            requests.set(id, timestamps.filter(time => time > cutoff));
            if (requests.get(id).length === 0) {
                requests.delete(id);
            }
        }
        
        // Check current client
        const clientRequests = requests.get(clientId) || [];
        
        if (clientRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
        
        // Add current request
        clientRequests.push(now);
        requests.set(clientId, clientRequests);
        
        next();
    };
}
