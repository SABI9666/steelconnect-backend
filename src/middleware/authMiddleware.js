import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Middleware to verify JWT token
export const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ error: 'Invalid token.' });
    }
};

// Middleware to check if user is admin
export const isAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        // Check if it's an environment admin
        if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
            req.user = decoded;
            return next();
        }
        
        // Check if it's a database admin
        if (decoded.type === 'admin' && decoded.role === 'admin') {
            // Verify the user still exists and is admin in database
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
                if (userDoc.exists && userDoc.data().type === 'admin') {
                    req.user = decoded;
                    return next();
                }
            } catch (dbError) {
                console.error('Database verification failed:', dbError);
            }
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.' 
        });
        
    } catch (error) {
        console.error('Admin verification failed:', error);
        res.status(401).json({ 
            success: false, 
            error: 'Invalid token.' 
        });
    }
};

// Middleware to check if user owns resource or is admin
export const isOwnerOrAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        // Check if user is admin
        if (decoded.type === 'admin' || decoded.role === 'admin') {
            req.user = decoded;
            return next();
        }
        
        // Check if user owns the resource
        const resourceUserId = req.params.userId || req.body.userId || req.query.userId;
        if (decoded.userId === resourceUserId) {
            req.user = decoded;
            return next();
        }
        
        return res.status(403).json({ 
            error: 'Access denied. You can only access your own resources.' 
        });
        
    } catch (error) {
        console.error('Authorization failed:', error);
        res.status(401).json({ error: 'Invalid token.' });
    }
};
