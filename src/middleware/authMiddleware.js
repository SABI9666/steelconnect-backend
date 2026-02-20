// src/middleware/authMiddleware.js - Fixed Authentication middleware
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
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError.message);
            
            if (jwtError.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }
            
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Token has expired'
                });
            }

            return res.status(401).json({
                success: false,
                message: 'Token verification failed'
            });
        }
        
        // Get fresh user data from database
        const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
        
        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        
        // FIXED: Check if user account is active - simplified logic
        if (userData.canAccess === false) {
            return res.status(403).json({
                success: false,
                message: 'Account access has been restricted. Please contact support.',
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
            canAccess: userData.canAccess,
            name: userData.name,
            isActive: userData.isActive !== false // Add isActive field
        };

        console.log(`Authenticated user: ${req.user.email} (${req.user.type})`);
        next();
        
    } catch (error) {
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

        // Check if user has admin privileges (admin or operations users)
        const allowedTypes = ['admin', 'operations'];
        if (!allowedTypes.includes(req.user.type) && req.user.role !== 'admin') {
            console.log(`Access denied for non-admin user: ${req.user.email} (${req.user.type})`);
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        // Double-check admin status in database
        const userDoc = await adminDb.collection('users').doc(req.user.userId).get();

        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        if (!allowedTypes.includes(userData.type)) {
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

        console.log(`Admin access granted to: ${req.user.email}`);
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

        // Check if user account is deactivated
        if (req.user.canAccess === false) {
            return res.status(403).json({
                success: false,
                message: 'Account access has been restricted. Please contact support.',
                profileStatus: req.user.profileStatus,
                requiresProfileCompletion: false
            });
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

            // Check if user account is deactivated
            if (req.user.canAccess === false) {
                return res.status(403).json({
                    success: false,
                    message: 'Account access has been restricted. Please contact support.'
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

    // Check if user account is deactivated
    if (req.user.canAccess === false) {
        return res.status(403).json({
            success: false,
            message: 'Account access has been restricted. Please contact support.'
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

    // Check if user account is deactivated
    if (req.user.canAccess === false) {
        return res.status(403).json({
            success: false,
            message: 'Account access has been restricted. Please contact support.'
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
                
                // Only attach user if account is active
                if (userData.canAccess !== false) {
                    req.user = {
                        userId: decoded.userId,
                        email: decoded.email,
                        type: decoded.type,
                        role: decoded.role || decoded.type,
                        profileStatus: userData.profileStatus,
                        profileCompleted: userData.profileCompleted,
                        canAccess: userData.canAccess,
                        name: userData.name,
                        isActive: userData.isActive !== false
                    };
                } else {
                    req.user = null; // User is deactivated
                }
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
