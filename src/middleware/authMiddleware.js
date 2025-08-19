import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Middleware to verify JWT token and attach user to request
export const authenticateToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded; // Attaches the decoded user payload (e.g., userId, type) to the request object
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

// Middleware to check if the authenticated user is an admin
export const isAdmin = async (req, res, next) => {
    try {
        const userType = req.user?.type;
        const userId = req.user?.userId;

        if (!userType || !userId) {
             return res.status(401).json({ success: false, error: 'Authentication details not found. Please log in again.' });
        }
        
        // Simple check based on the token's 'type' field
        if (userType === 'admin') {
            // Optional: For extra security, you could re-verify against the database here
            // const userDoc = await adminDb.collection('users').doc(userId).get();
            // if (userDoc.exists && userDoc.data().type === 'admin') {
            //     return next();
            // }
            return next(); // If token says admin, proceed
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.' 
        });
        
    } catch (error) {
        console.error('Admin verification failed:', error);
        res.status(500).json({ 
            success: false, 
            error: 'An internal error occurred during admin verification.' 
        });
    }
};

// Middleware to check if the user owns the resource or is an admin
export const isOwnerOrAdmin = async (req, res, next) => {
    try {
        const { userId, type } = req.user;
        
        // If the user is an admin, they have access
        if (type === 'admin') {
            return next();
        }
        
        // Check if the user ID from the token matches the user ID in the request parameters (e.g., /api/users/:userId)
        const resourceUserId = req.params.userId;
        if (userId === resourceUserId) {
            return next();
        }
        
        return res.status(403).json({ 
            success: false,
            error: 'Access denied. You do not have permission to access this resource.' 
        });
        
    } catch (error) {
        console.error('Ownership verification failed:', error);
        res.status(500).json({ 
            success: false, 
            error: 'An internal error occurred during ownership verification.' 
        });
    }
};
