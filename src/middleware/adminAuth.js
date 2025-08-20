import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

// Enhanced admin middleware with better error handling and logging
export const isAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            console.log('❌ Admin access denied: No token provided');
            return res.status(401).json({ 
                success: false, 
                error: 'Access denied. No token provided.' 
            });
        }

        console.log('🔍 Admin auth: Verifying token...');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        console.log('🔍 Admin auth: Token decoded', {
            userId: decoded.userId,
            email: decoded.email,
            type: decoded.type,
            role: decoded.role
        });
        
        // Check if it's an environment admin
        if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
            console.log('✅ Environment admin access granted:', decoded.email);
            req.user = decoded;
            return next();
        }
        
        // Check if it's a database admin
        if (decoded.type === 'admin' && decoded.role === 'admin') {
            console.log('🔍 Admin auth: Checking database admin...');
            
            // Verify the user still exists and is admin in database
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
                
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    console.log('🔍 Admin auth: Database user found', {
                        userId: decoded.userId,
                        userType: userData.type,
                        userEmail: userData.email
                    });
                    
                    if (userData.type === 'admin') {
                        console.log('✅ Database admin access granted:', userData.email);
                        req.user = decoded;
                        return next();
                    } else {
                        console.log('❌ Admin auth: User exists but not admin type:', userData.type);
                    }
                } else {
                    console.log('❌ Admin auth: User document not found in database:', decoded.userId);
                }
            } catch (dbError) {
                console.error('❌ Admin auth: Database verification failed:', dbError.message);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Database verification failed. Please try again.' 
                });
            }
        } else {
            console.log('❌ Admin auth: Insufficient token privileges', {
                type: decoded.type,
                role: decoded.role,
                userId: decoded.userId
            });
        }
        
        console.log('❌ Admin access denied: Insufficient privileges');
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.' 
        });
        
    } catch (error) {
        console.error('❌ Admin auth: Token verification failed:', error.message);
        
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

// Alternative simple admin check for testing
export const isAdminSimple = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Authorization token is required.' 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        console.log('🔍 Simple admin check:', {
            userId: decoded.userId,
            email: decoded.email,
            type: decoded.type,
            role: decoded.role
        });
        
        // Check if the user has the 'admin' role OR is environment admin
        if (decoded.role === 'admin' || (decoded.userId === 'env_admin' && decoded.type === 'admin')) {
            console.log('✅ Simple admin access granted:', decoded.email);
            req.user = decoded;
            next();
        } else {
            console.log('❌ Simple admin access denied:', decoded.email, 'Role:', decoded.role);
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Admin privileges required.' 
            });
        }
    } catch (error) {
        console.error('❌ Simple admin auth failed:', error.message);
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token.' 
        });
    }
};
