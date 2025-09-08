// Enhanced authMiddleware.js with profile completion checks
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import { sendLoginNotification } from '../utils/emailService.js';

/**
 * Enhanced authentication middleware that checks profile completion status
 */
export const authenticateToken = async (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authorization token is required.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        
        // Get fresh user data from database
        const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
        
        if (!userDoc.exists) {
            return res.status(401).json({ 
                success: false, 
                error: 'User not found.' 
            });
        }

        const userData = userDoc.data();
        
        // Check if user is active
        if (userData.isActive === false) {
            return res.status(401).json({ 
                success: false, 
                error: 'Account is deactivated.' 
            });
        }

        // Attach fresh user data to request
        req.user = {
            userId: userDoc.id,
            email: userData.email,
            name: userData.name,
            type: userData.type,
            role: userData.role || userData.type,
            profileCompleted: userData.profileCompleted || false,
            profileStatus: userData.profileStatus || 'incomplete',
            canAccess: userData.canAccess !== false
        };

        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token.' 
        });
    }
};

/**
 * Middleware to check if user has completed and approved profile
 * Use this for routes that require full profile completion
 */
export const requireApprovedProfile = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authentication required.' 
        });
    }

    // Allow admin users to bypass profile check
    if (req.user.role === 'admin' || req.user.type === 'admin') {
        return next();
    }

    // Check profile completion and approval status
    if (!req.user.profileCompleted) {
        return res.status(403).json({ 
            success: false, 
            error: 'Profile completion required.',
            code: 'PROFILE_INCOMPLETE',
            redirect: '/profile/complete'
        });
    }

    if (req.user.profileStatus !== 'approved' || !req.user.canAccess) {
        return res.status(403).json({ 
            success: false, 
            error: 'Profile approval required.',
            code: 'PROFILE_PENDING',
            profileStatus: req.user.profileStatus
        });
    }

    next();
};

/**
 * Enhanced login handler with notification system
 */
export const enhancedLogin = async (req, res, loginFunction) => {
    try {
        // Get client information
        const clientIP = req.ip || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress || 
                        req.headers['x-forwarded-for']?.split(',')[0] || 
                        'Unknown';
                        
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Call the original login function
        const loginResult = await loginFunction(req, res);
        
        // If login was successful, send notification
        if (loginResult && loginResult.success && loginResult.user) {
            try {
                await sendLoginNotification(
                    loginResult.user,
                    new Date().toISOString(),
                    clientIP,
                    userAgent
                );
                console.log(`Login notification sent to: ${loginResult.user.email}`);
            } catch (emailError) {
                console.error('Failed to send login notification:', emailError);
                // Don't fail the login if email notification fails
            }
        }
        
        return loginResult;
    } catch (error) {
        console.error('Enhanced login error:', error);
        throw error;
    }
};

/**
 * Check if route requires profile approval
 * Returns middleware based on route requirements
 */
export const checkProfileRequirement = (requireProfile = true) => {
    return (req, res, next) => {
        if (requireProfile) {
            return requireApprovedProfile(req, res, next);
        } else {
            return next();
        }
    };
};
