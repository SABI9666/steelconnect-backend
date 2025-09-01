// src/middleware/authMiddleware.js - FIXED VERSION
import jwt from 'jsonwebtoken';

// General authentication middleware
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            error: 'Authorization token is required.' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token.' 
        });
    }
};

// FIXED: Admin middleware that checks both 'role' and 'type'
export const isAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false,
            error: 'Authorization token is required.' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        // FIXED: Check both 'role' and 'type' for admin access
        // This matches your auth controller that sets 'type: admin'
        if (decoded.role !== 'admin' && decoded.type !== 'admin') {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied. Admin privileges required.' 
            });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token.' 
        });
    }
};

// Contractor-only middleware
export const isContractor = (req, res, next) => {
    if (req.user.type !== 'contractor') {
        return res.status(403).json({ 
            success: false,
            error: 'Contractor access required.' 
        });
    }
    next();
};

// Designer-only middleware
export const isDesigner = (req, res, next) => {
    if (req.user.type !== 'designer') {
        return res.status(403).json({ 
            success: false,
            error: 'Designer access required.' 
        });
    }
    next();
};

// Optional authentication (doesn't require token)
export const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded;
    } catch (error) {
        req.user = null;
    }
    
    next();
};
