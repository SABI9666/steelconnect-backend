// src/middleware/authMiddleware.js - Authentication middleware
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

/**
 * Middleware to authenticate JWT tokens
 * Adds user information to req.user
 */
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false,
                message: 'Authorization token required.',
                error: 'Missing or invalid authorization header'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
            
            // Handle admin users (environment variable or database admin)
            if (decoded.userId === 'admin' || decoded.type === 'admin') {
                req.user = {
                    userId: decoded.userId,
                    id: decoded.userId,
                    email: decoded.email,
                    type: 'admin',
                    name: decoded.name || 'Administrator',
                    role: 'admin'
                };
                return next();
            }

            // For regular users, get fresh data from database
            const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
            
            if (!userDoc.exists) {
                return res.status(404).json({ 
                    success: false,
                    message: 'User not found.',
                    error: 'User account does not exist'
                });
            }

            const userData = userDoc.data();
            
            // Check if user account is active
            if (userData.isActive === false) {
                return res.status(403).json({ 
                    success: false,
                    message: 'Account is deactivated.',
                    error: 'User account has been deactivated'
                });
            }

            // Add user data to request object (compatible with your profile routes)
            req.user = {
                userId: userDoc.id,  // Required by your profile routes
                id: userDoc.id,      // Alternative reference
                email: userData.email,
                type: userData.type,
                name: userData.name,
                profileCompleted: userData.profileCompleted || false,
                profileStatus: userData.profileStatus || 'incomplete',
                canAccess: userData.canAccess !== false, // Default to true for backward compatibility
                ...userData // Include all other user data
            };
            
            next();
            
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return res.status(401).json({ 
                success: false,
                message: 'Invalid or expired token.',
                error: 'Token verification failed'
            });
        }
        
    } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Authentication failed.',
            error: 'Internal authentication error'
        });
    }
};

/**
 * Middleware to check if user has completed profile
 * Should be used after authenticateToken
 */
export const requireProfileCompletion = (req, res, next) => {
    try {
        // Skip profile check for admin users
        if (req.user.type === 'admin') {
            return next();
        }

        // Check if profile is completed and approved
        if (!req.user.profileCompleted) {
            return res.status(403).json({
                success: false,
                message: 'Profile completion required',
                error: 'Please complete your profile to access this feature',
                redirect: '/profile/complete'
            });
        }

        if (req.user.profileStatus !== 'approved') {
            return res.status(403).json({
                success: false,
                message: 'Profile approval pending',
                error: 'Your profile is pending admin approval',
                profileStatus: req.user.profileStatus
            });
        }

        if (!req.user.canAccess) {
            return res.status(403).json({
                success: false,
                message: 'Account access restricted',
                error: 'Your account access has been restricted',
                profileStatus: req.user.profileStatus
            });
        }

        next();
    } catch (error) {
        console.error('Profile completion check error:', error);
        res.status(500).json({
            success: false,
            message: 'Profile verification failed',
            error: 'Internal server error'
        });
    }
};

/**
 * Middleware to check user role/type
 * @param {string|string[]} allowedTypes - Allowed user types
 */
export const requireUserType = (allowedTypes) => {
    return (req, res, next) => {
        try {
            const userType = req.user.type;
            const typesArray = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
            
            if (!typesArray.includes(userType)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied',
                    error: `This feature requires ${typesArray.join(' or ')} account type`,
                    userType: userType,
                    requiredTypes: typesArray
                });
            }
            
            next();
        } catch (error) {
            console.error('User type check error:', error);
            res.status(500).json({
                success: false,
                message: 'Authorization check failed',
                error: 'Internal server error'
            });
        }
    };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = (req, res, next) => {
    try {
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required',
                error: 'This feature requires administrator privileges'
            });
        }
        
        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({
            success: false,
            message: 'Authorization check failed',
            error: 'Internal server error'
        });
    }
};

/**
 * Optional authentication middleware
 * Sets req.user if token is valid, but doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without user
            req.user = null;
            return next();
        }

        const token = authHeader.substring(7);
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
            
            // Handle admin users
            if (decoded.userId === 'admin' || decoded.type === 'admin') {
                req.user = {
                    userId: decoded.userId,
                    id: decoded.userId,
                    email: decoded.email,
                    type: 'admin',
                    name: decoded.name || 'Administrator',
                    role: 'admin'
                };
                return next();
            }

            // Get user data from database
            const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                req.user = {
                    userId: userDoc.id,
                    id: userDoc.id,
                    ...userData
                };
            } else {
                req.user = null;
            }
            
        } catch (jwtError) {
            // Invalid token, continue without user
            req.user = null;
        }
        
        next();
        
    } catch (error) {
        console.error('Optional auth error:', error);
        // Don't fail the request, just continue without user
        req.user = null;
        next();
    }
};

export default {
    authenticateToken,
    requireProfileCompletion,
    requireUserType,
    requireAdmin,
    optionalAuth
};
