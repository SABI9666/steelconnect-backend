// src/routes/auth.js - Enhanced with profile system and login notifications
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

// Login user with email notification
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

        // Send login notification email asynchronously (don't wait for it)
        sendLoginNotification(responseUser, new Date().toISOString(), clientIP, userAgent)
            .catch(error => {
                console.error('Failed to send login notification email:', error);
                // Don't fail the login if email fails
            });

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

export default router;
