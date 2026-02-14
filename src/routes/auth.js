// src/routes/auth.js - Updated with verified steelconnectapp.com domain
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import crypto from 'crypto';
import { sendLoginNotification, sendPasswordResetEmail, sendOTPVerificationEmail } from '../utils/emailService.js';

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

// Regular user login - Step 1: Verify credentials and send OTP
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

        // Generate 6-digit OTP for 2FA
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

        // Store OTP in Firestore
        await adminDb.collection('users').doc(userId).update({
            loginOtp: otpCode,
            loginOtpExpiry: otpExpiry,
            loginOtpAttempts: 0,
            pendingLoginIP: clientIP,
            pendingLoginAgent: userAgent
        });

        console.log(`2FA OTP generated for: ${email}`);

        // Send OTP email
        if (process.env.RESEND_API_KEY) {
            sendOTPVerificationEmail(
                { name: userData.name, email: userData.email },
                otpCode, clientIP, userAgent
            ).then((result) => {
                if (result && result.success) {
                    console.log(`✅ 2FA OTP sent to ${email}`);
                } else {
                    console.error(`❌ Failed to send OTP to ${email}:`, result?.error);
                }
            }).catch(error => {
                console.error(`❌ OTP email error for ${email}:`, error?.message || error);
            });
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - OTP code:', otpCode);
        }

        // Return requires2FA flag - do NOT send token yet
        res.json({
            success: true,
            requires2FA: true,
            message: 'Verification code sent to your email. Please check your inbox.',
            email: userData.email
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
});

// Admin login route - Step 1: Verify credentials and send OTP
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

        // Generate 6-digit OTP for 2FA
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

        // Store OTP in Firestore
        await adminDb.collection('users').doc(userId).update({
            loginOtp: otpCode,
            loginOtpExpiry: otpExpiry,
            loginOtpAttempts: 0,
            pendingLoginIP: clientIP,
            pendingLoginAgent: userAgent
        });

        console.log(`Admin 2FA OTP generated for: ${email}`);

        // Send OTP email to designated admin notification email
        const adminOtpEmail = 'sabincn676@gmail.com';
        if (process.env.RESEND_API_KEY) {
            sendOTPVerificationEmail(
                { name: userData.name, email: adminOtpEmail },
                otpCode, clientIP, userAgent
            ).then((result) => {
                if (result && result.success) {
                    console.log(`✅ Admin 2FA OTP sent to ${adminOtpEmail}`);
                } else {
                    console.error(`❌ Failed to send admin OTP to ${adminOtpEmail}:`, result?.error);
                }
            }).catch(error => {
                console.error(`❌ Admin OTP email error for ${adminOtpEmail}:`, error?.message || error);
            });
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - Admin OTP code:', otpCode);
        }

        // Return requires2FA flag
        res.json({
            success: true,
            requires2FA: true,
            message: 'Verification code sent to your email. Please check your inbox.',
            email: adminOtpEmail
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during admin login'
        });
    }
});

// Step 2: Verify OTP and complete login (for both user and admin)
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp, loginType } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and verification code are required'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const isAdmin = loginType === 'admin';

        // Find user
        let userQuery;
        if (isAdmin) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'admin')
                .get();
        } else {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .get();
        }

        if (userQuery.empty) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Check OTP attempts (max 5)
        if (userData.loginOtpAttempts >= 5) {
            await adminDb.collection('users').doc(userId).update({
                loginOtp: null,
                loginOtpExpiry: null,
                loginOtpAttempts: 0
            });
            return res.status(429).json({
                success: false,
                message: 'Too many failed attempts. Please login again to get a new code.'
            });
        }

        // Verify OTP code
        if (!userData.loginOtp || userData.loginOtp !== otp.trim()) {
            // Increment attempts
            await adminDb.collection('users').doc(userId).update({
                loginOtpAttempts: (userData.loginOtpAttempts || 0) + 1
            });
            const remaining = 5 - ((userData.loginOtpAttempts || 0) + 1);
            return res.status(400).json({
                success: false,
                message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
            });
        }

        // Check OTP expiry
        if (!userData.loginOtpExpiry || new Date(userData.loginOtpExpiry) < new Date()) {
            await adminDb.collection('users').doc(userId).update({
                loginOtp: null,
                loginOtpExpiry: null,
                loginOtpAttempts: 0
            });
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please login again to get a new code.'
            });
        }

        // OTP verified - clear OTP data and generate JWT
        const tokenPayload = isAdmin
            ? { userId, email: userData.email, type: 'admin', role: 'admin' }
            : { userId, email: userData.email, type: userData.type };
        const tokenExpiry = isAdmin ? '24h' : '7d';

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: tokenExpiry });

        // Update user document
        const updateData = {
            loginOtp: null,
            loginOtpExpiry: null,
            loginOtpAttempts: 0,
            pendingLoginIP: null,
            pendingLoginAgent: null,
            lastLogin: new Date().toISOString(),
            lastLoginIP: clientIP
        };
        if (isAdmin) {
            updateData.lastAdminLogin = new Date().toISOString();
        }
        await adminDb.collection('users').doc(userId).update(updateData);

        // Prepare response (exclude password and OTP fields)
        const { password: _, loginOtp: _o, loginOtpExpiry: _e, loginOtpAttempts: _a, ...safeUserData } = userData;
        const responseUser = { ...safeUserData, id: userId };

        console.log(`2FA verified - ${isAdmin ? 'Admin' : 'User'} login complete for: ${normalizedEmail}`);

        // Send login notification
        if (process.env.RESEND_API_KEY) {
            sendLoginNotification(responseUser, new Date().toISOString(), clientIP, userAgent)
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Login notification sent to ${normalizedEmail}`);
                    }
                })
                .catch(error => {
                    console.error(`❌ Login notification error:`, error?.message || error);
                });
        }

        res.json({
            success: true,
            message: isAdmin ? 'Admin login successful' : 'Login successful',
            token: token,
            user: responseUser
        });

    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during verification'
        });
    }
});

// Resend OTP code
router.post('/resend-otp', async (req, res) => {
    try {
        const { email, loginType } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const isAdmin = loginType === 'admin';

        let userQuery;
        if (isAdmin) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'admin')
                .get();
        } else {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .get();
        }

        if (userQuery.empty) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Generate new OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        await adminDb.collection('users').doc(userId).update({
            loginOtp: otpCode,
            loginOtpExpiry: otpExpiry,
            loginOtpAttempts: 0
        });

        // Send OTP email
        if (process.env.RESEND_API_KEY) {
            sendOTPVerificationEmail(
                { name: userData.name, email: userData.email },
                otpCode, clientIP, userAgent
            ).catch(error => {
                console.error(`Resend OTP email error:`, error?.message || error);
            });
        }

        console.log(`OTP resent for: ${normalizedEmail}`);

        res.json({
            success: true,
            message: 'A new verification code has been sent to your email.'
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
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

// Forgot password - send reset code via email
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Find user by email
        const userQuery = await adminDb.collection('users')
            .where('email', '==', normalizedEmail)
            .get();

        // Always return success to prevent email enumeration
        if (userQuery.empty) {
            console.log(`Forgot password: No user found for ${normalizedEmail}`);
            return res.json({
                success: true,
                message: 'If an account with that email exists, a reset code has been sent.'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Generate 6-digit reset code
        const resetCode = crypto.randomInt(100000, 999999).toString();
        const resetExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

        // Store reset code in Firestore
        await adminDb.collection('users').doc(userId).update({
            resetCode: resetCode,
            resetCodeExpiry: resetExpiry,
            updatedAt: new Date().toISOString()
        });

        console.log(`Password reset code generated for: ${normalizedEmail}`);

        // Send reset email
        if (process.env.RESEND_API_KEY) {
            sendPasswordResetEmail(
                { name: userData.name, email: userData.email },
                resetCode
            ).then((result) => {
                if (result && result.success) {
                    console.log(`✅ Password reset email sent to ${normalizedEmail}`);
                } else {
                    console.error(`❌ Failed to send reset email to ${normalizedEmail}:`, result?.error);
                }
            }).catch(error => {
                console.error(`❌ Reset email error for ${normalizedEmail}:`, error?.message || error);
            });
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - reset code:', resetCode);
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a reset code has been sent.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Reset password - verify code and set new password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, verification code, and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Find user
        const userQuery = await adminDb.collection('users')
            .where('email', '==', normalizedEmail)
            .get();

        if (userQuery.empty) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or verification code'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Verify reset code
        if (!userData.resetCode || userData.resetCode !== code.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // Check expiry
        if (!userData.resetCodeExpiry || new Date(userData.resetCodeExpiry) < new Date()) {
            // Clear expired code
            await adminDb.collection('users').doc(userId).update({
                resetCode: null,
                resetCodeExpiry: null
            });
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please request a new one.'
            });
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await adminDb.collection('users').doc(userId).update({
            password: hashedPassword,
            resetCode: null,
            resetCodeExpiry: null,
            updatedAt: new Date().toISOString()
        });

        console.log(`Password reset successful for: ${normalizedEmail}`);

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;

