import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Enhanced admin middleware with better error handling
export const isAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access denied. No token provided.'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('FATAL: JWT_SECRET is not configured');
            return res.status(500).json({ success: false, error: 'Server configuration error.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if it's an environment admin
        if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
            req.user = decoded;
            return next();
        }

        // Check if it's a database admin or operations user
        const allowedTypes = ['admin', 'operations'];
        if (allowedTypes.includes(decoded.type) && decoded.role === 'admin') {
            // Verify the user still exists and is admin/operations in database
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();

                if (userDoc.exists) {
                    const userData = userDoc.data();

                    if (allowedTypes.includes(userData.type)) {
                        req.user = decoded;
                        return next();
                    }
                }
            } catch (dbError) {
                console.error('Admin auth: Database verification failed:', dbError.message);
                return res.status(500).json({
                    success: false,
                    error: 'Database verification failed. Please try again.'
                });
            }
        }

        return res.status(403).json({
            success: false,
            error: 'Access denied. Admin privileges required.'
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Admin token has expired. Please login again.'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid admin token format.'
            });
        }

        res.status(401).json({
            success: false,
            error: 'Admin token verification failed.'
        });
    }
};

// Alternative simple admin check
export const isAdminSimple = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authorization token is required.'
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ success: false, error: 'Server configuration error.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if the user has the 'admin' role OR is environment admin OR is operations user
        if (decoded.role === 'admin' || (decoded.userId === 'env_admin' && decoded.type === 'admin') || decoded.type === 'operations') {
            req.user = decoded;
            next();
        } else {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.'
            });
        }
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.'
        });
    }
};
