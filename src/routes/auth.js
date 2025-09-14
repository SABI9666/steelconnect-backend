// src/routes/auth.js - Updated with verified steelconnectapp.com domain
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import { sendLoginNotification } from '../utils/emailService.js';

const router = express.Router();

// Helper function to get client IP
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'Unknown';
}

// Register user
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, type } = req.body;

        // Validation
        if (!name || !email || !password || !type) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (!['designer', 'contractor'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'User type must be either designer or contractor'
            });
        }

        // Check if user exists
        const existingUserQuery = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase())
            .get();

        if (!existingUserQuery.empty) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user document
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            type: type,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            // Profile completion status
            profileCompleted: false,
            profileStatus: 'incomplete', // incomplete, pending, approved, rejected
            canAccess: true, // Allow initial access for profile completion
            // Profile fields will be added when completing profile
            profileData: {}
        };

        const userRef = await adminDb.collection('users').add(userData);

        console.log(`New ${type} registered: ${email} (ID: ${userRef.id})`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please complete your profile after login.',
            userId: userRef.id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during registration'
        });
    }
});

// Regular user login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        console.log(`Login attempt for: ${email} from IP: ${clientIP}`);

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .get();

        if (userQuery.empty) {
            console.log(`Login failed: User not found for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Check if this is an admin trying to use regular login
        if (userData.type === 'admin') {
            return res.status(401).json({
                success: false,
                message: 'Admin users must use the admin login portal',
                redirectToAdmin: true
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, userData.password);
        
        if (!isValidPassword) {
            console.log(`Login failed: Invalid password for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user can access (not suspended)
        if (userData.canAccess === false && userData.profileStatus === 'rejected') {
            return res.status(403).json({
                success: false,
                message: 'Your account access has been restricted. Please contact support.',
                profileStatus: userData.profileStatus
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: userId, 
                email: userData.email, 
                type: userData.type 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Update last login
        await adminDb.collection('users').doc(userId).update({
            lastLogin: new Date().toISOString(),
            lastLoginIP: clientIP
        });

        // Prepare user response (exclude password)
        const { password: _, ...userResponse } = userData;
        const responseUser = {
            ...userResponse,
            id: userId
        };

        console.log(`Login successful for: ${email} (${userData.type})`);

        // Send login notification email with verified domain
        if (process.env.RESEND_API_KEY) {
            console.log(`Attempting to send email to: ${email}`);
            console.log(`Subject: Login Notification - SteelConnect`);
            
            // Send notification asynchronously - don't wait for it
            sendLoginNotification(responseUser, new Date().toISOString(), clientIP, userAgent)
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Login notification sent successfully to ${email}`);
                        console.log(`📧 Email sent from verified domain: steelconnectapp.com`);
                    } else {
                        console.error(`❌ Failed to send login notification to ${email}:`, result?.error || 'Unknown error');
                    }
                })
                .catch(error => {
                    console.error(`❌ Failed to send login notification email to ${email}:`, error?.message || error);
                });
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - skipping login notification email');
        }

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: responseUser
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

// Admin login route
router.post('/login/admin', async (req, res) => {
    try {
        const { email, password } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        console.log(`Admin login attempt for: ${email} from IP: ${clientIP}`);

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find admin user
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('type', '==', 'admin')
            .get();

        if (userQuery.empty) {
            console.log(`Admin login failed: Admin not found for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Verify password
        const isValidPassword = await bcrypt.compare(password, userData.password);
        
        if (!isValidPassword) {
            console.log(`Admin login failed: Invalid password for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }

        // Check if admin account is active
        if (userData.canAccess === false) {
            return res.status(403).json({
                success: false,
                message: 'Admin account has been suspended'
            });
        }

        // Generate JWT token with admin role
        const token = jwt.sign(
            { 
                userId: userId, 
                email: userData.email, 
                type: 'admin',
                role: 'admin'
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } // Shorter expiry for admin tokens
        );

        // Update last login
        await adminDb.collection('users').doc(userId).update({
            lastLogin: new Date().toISOString(),
            lastLoginIP: clientIP,
            lastAdminLogin: new Date().toISOString()
        });

        // Prepare admin response (exclude password)
        const { password: _, ...adminResponse } = userData;
        const responseAdmin = {
            ...adminResponse,
            id: userId
        };

        console.log(`Admin login successful for: ${email}`);

        // Send admin login notification with verified domain
        if (process.env.RESEND_API_KEY) {
            console.log(`Attempting to send admin email to: ${email}`);
            console.log(`Subject: Admin Login Notification - SteelConnect`);
            
            sendLoginNotification(responseAdmin, new Date().toISOString(), clientIP, userAgent)
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Admin login notification sent successfully to ${email}`);
                        console.log(`📧 Email sent from verified domain: steelconnectapp.com`);
                    } else {
                        console.error(`❌ Failed to send admin login notification to ${email}:`, result?.error || 'Unknown error');
                    }
                })
                .catch(error => {
                    console.error(`❌ Failed to send admin login notification email to ${email}:`, error?.message || error);
                });
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - skipping admin login notification email');
        }

        res.json({
            success: true,
            message: 'Admin login successful',
            token: token,
            user: responseAdmin
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during admin login'
        });
    }
});

// Verify token (for frontend auth checks)
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get fresh user data
        const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
        
        if (!userDoc.exists) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const { password, ...userResponse } = userData;

        res.json({
            success: true,
            user: {
                ...userResponse,
                id: userDoc.id
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

// Create initial admin user (run once)
router.post('/create-admin', async (req, res) => {
    try {
        const { email, password, name, secretKey } = req.body;

        // Check secret key for security
        if (secretKey !== process.env.ADMIN_CREATION_SECRET) {
            return res.status(403).json({
                success: false,
                message: 'Invalid secret key'
            });
        }

        // Check if admin already exists
        const existingAdmin = await adminDb.collection('users')
            .where('type', '==', 'admin')
            .get();

        if (!existingAdmin.empty) {
            return res.status(400).json({
                success: false,
                message: 'Admin user already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create admin user
        const adminData = {
            name: name || 'Admin',
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            type: 'admin',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            profileCompleted: true,
            profileStatus: 'approved',
            canAccess: true,
            isSuper: true
        };

        const adminRef = await adminDb.collection('users').add(adminData);

        console.log(`Admin user created: ${email} (ID: ${adminRef.id})`);

        res.json({
            success: true,
            message: 'Admin user created successfully',
            adminId: adminRef.id
        });

    } catch (error) {
        console.error('Admin creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating admin user'
        });
    }
});

export default router;
        
