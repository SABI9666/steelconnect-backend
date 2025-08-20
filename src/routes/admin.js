import express from 'express';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Debug admin token
router.get('/admin-token-debug', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({
                success: false,
                message: 'No valid authorization header',
                hasHeader: !!authHeader,
                headerStart: authHeader?.substring(0, 20)
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');

        // Check if it's an environment admin
        const isEnvAdmin = decoded.userId === 'env_admin' && decoded.type === 'admin';
        
        // Check if it's a database admin
        let isDbAdmin = false;
        let dbUserData = null;
        let dbError = null;
        
        if (decoded.type === 'admin' && decoded.role === 'admin' && !isEnvAdmin) {
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
                if (userDoc.exists) {
                    dbUserData = userDoc.data();
                    isDbAdmin = dbUserData.type === 'admin';
                } else {
                    dbError = 'User document not found in database';
                }
            } catch (error) {
                dbError = error.message;
            }
        }

        return res.json({
            success: true,
            tokenData: {
                userId: decoded.userId,
                email: decoded.email,
                type: decoded.type,
                role: decoded.role,
                iat: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : 'missing',
                exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'missing'
            },
            adminChecks: {
                isEnvAdmin: isEnvAdmin,
                isDbAdmin: isDbAdmin,
                hasAdminType: decoded.type === 'admin',
                hasAdminRole: decoded.role === 'admin',
                dbUserExists: !!dbUserData,
                dbUserData: dbUserData,
                dbError: dbError
            },
            finalAuthorization: isEnvAdmin || isDbAdmin,
            recommendations: [
                !isEnvAdmin && !isDbAdmin ? 'User is not authorized as admin' : null,
                decoded.type !== 'admin' ? 'Token missing admin type' : null,
                decoded.role !== 'admin' ? 'Token missing admin role' : null,
                dbError ? `Database issue: ${dbError}` : null
            ].filter(Boolean)
        });

    } catch (error) {
        return res.json({
            success: false,
            error: error.message,
            type: error.name
        });
    }
});

// Test admin middleware logic
router.get('/admin-auth-test', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Access denied. No token provided.',
                step: 'token_missing'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        // Check if it's an environment admin
        if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
            return res.json({
                success: true,
                message: 'Environment admin access granted',
                adminType: 'environment',
                user: decoded
            });
        }
        
        // Check if it's a database admin
        if (decoded.type === 'admin' && decoded.role === 'admin') {
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
                if (userDoc.exists && userDoc.data().type === 'admin') {
                    return res.json({
                        success: true,
                        message: 'Database admin access granted',
                        adminType: 'database',
                        user: decoded,
                        dbUser: userDoc.data()
                    });
                } else {
                    return res.status(403).json({
                        success: false,
                        error: 'User not found in database or not admin',
                        step: 'db_verification_failed',
                        userExists: userDoc.exists,
                        userData: userDoc.exists ? userDoc.data() : null
                    });
                }
            } catch (dbError) {
                return res.status(500).json({
                    success: false,
                    error: 'Database verification failed',
                    step: 'db_error',
                    details: dbError.message
                });
            }
        }
        
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.',
            step: 'insufficient_privileges',
            userType: decoded.type,
            userRole: decoded.role,
            userId: decoded.userId
        });
        
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token verification failed',
            step: 'token_verification',
            details: error.message
        });
    }
});

// Check Firebase connection and admin collection
router.get('/firebase-admin-test', async (req, res) => {
    try {
        // Test Firebase connection
        const testCollection = await adminDb.collection('users').limit(1).get();
        
        // Try to find admin users
        const adminUsers = await adminDb.collection('users').where('type', '==', 'admin').get();
        
        return res.json({
            success: true,
            firebase: {
                connected: true,
                canReadUsers: true,
                totalAdminUsers: adminUsers.size,
                adminUsers: adminUsers.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
            },
            environment: {
                hasJwtSecret: !!process.env.JWT_SECRET,
                nodeEnv: process.env.NODE_ENV
            }
        });
        
    } catch (error) {
        return res.json({
            success: false,
            firebase: {
                connected: false,
                error: error.message
            }
        });
    }
});

// Test creating an environment admin token
router.post('/create-env-admin-token', (req, res) => {
    try {
        const { email = 'admin@steelconnect.com' } = req.body;
        
        const adminToken = jwt.sign({
            userId: 'env_admin',
            email: email,
            name: 'Environment Admin',
            type: 'admin',
            role: 'admin'
        }, process.env.JWT_SECRET || 'your_secret', { expiresIn: '24h' });

        return res.json({
            success: true,
            message: 'Environment admin token created',
            token: adminToken,
            decodedToken: jwt.decode(adminToken),
            usage: 'Use this token in Authorization: Bearer <token> header'
        });
        
    } catch (error) {
        return res.json({
            success: false,
            error: error.message
        });
    }
});

export default router;
