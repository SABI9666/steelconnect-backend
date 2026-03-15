// src/routes/auth.js - Updated with verified steelconnectapp.com domain
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import crypto from 'crypto';
import { sendLoginNotification, sendPasswordResetEmail, sendOTPVerificationEmail, sendGenericEmail } from '../utils/emailService.js';
import { logUserActivity } from '../services/userActivityLogger.js';
import { otpLimiter } from '../middleware/rateLimiter.js';

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
        const { name, email, password, type, termsAccepted } = req.body;

        // Validation
        if (!name || !email || !password || !type) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Terms & Conditions must be accepted
        if (!termsAccepted) {
            return res.status(400).json({
                success: false,
                message: 'You must accept the Terms & Conditions and Privacy Policy to register'
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
            // Terms & Conditions acceptance
            termsAccepted: true,
            termsAcceptedAt: new Date().toISOString(),
            termsVersion: '1.0',
            // Profile completion status
            profileCompleted: false,
            profileStatus: 'incomplete', // incomplete, pending, approved, rejected
            canAccess: true, // Allow initial access for profile completion
            // Profile fields will be added when completing profile
            profileData: {}
        };

        const userRef = await adminDb.collection('users').add(userData);

        console.log(`New ${type} registered: ${email} (ID: ${userRef.id})`);

        // Log user registration activity (fire-and-forget)
        logUserActivity({
            userEmail: email.toLowerCase().trim(),
            userName: name.trim(),
            userId: userRef.id,
            userType: type,
            category: 'User Registration',
            action: 'New User Registered',
            description: `New ${type} registered: ${name.trim()} (${email.toLowerCase().trim()})`,
            metadata: { userId: userRef.id, type },
            ip: getClientIP(req)
        }).catch(() => {});

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
router.post('/login', otpLimiter, async (req, res) => {
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

        // Check if this is an operations user trying to use regular login
        if (userData.type === 'operations') {
            return res.status(401).json({
                success: false,
                message: 'Operations users must use the operations login portal',
                redirectToOperations: true
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

        // Send OTP email - await result so we can report delivery status
        let emailSent = false;
        if (process.env.RESEND_API_KEY) {
            try {
                const result = await sendOTPVerificationEmail(
                    { name: userData.name, email: userData.email },
                    otpCode, clientIP, userAgent
                );
                if (result && result.success) {
                    emailSent = true;
                    console.log(`✅ 2FA OTP sent to ${email} (ID: ${result.messageId})`);
                } else {
                    console.error(`❌ Failed to send OTP to ${email}:`, result?.error);
                }
            } catch (error) {
                console.error(`❌ OTP email error for ${email}:`, error?.message || error);
            }
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - OTP email not sent');
        }

        // Return requires2FA flag - do NOT send token yet
        res.json({
            success: true,
            requires2FA: true,
            emailSent,
            message: emailSent
                ? 'Verification code sent to your email. Please check your inbox.'
                : 'Verification code generated but email delivery could not be confirmed. Please try resending.',
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
router.post('/login/admin', otpLimiter, async (req, res) => {
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

        // Send OTP email to designated admin verification email
        const adminOtpEmail = 'sabincn676@gmail.com';
        let emailSent = false;
        if (process.env.RESEND_API_KEY) {
            try {
                const result = await sendOTPVerificationEmail(
                    { name: userData.name, email: adminOtpEmail },
                    otpCode, clientIP, userAgent
                );
                if (result && result.success) {
                    emailSent = true;
                    console.log(`✅ Admin 2FA OTP sent to ${adminOtpEmail} (ID: ${result.messageId})`);
                } else {
                    console.error(`❌ Failed to send admin OTP to ${adminOtpEmail}:`, result?.error);
                }
            } catch (error) {
                console.error(`❌ Admin OTP email error for ${adminOtpEmail}:`, error?.message || error);
            }
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - Admin OTP email not sent');
        }

        // Return requires2FA flag with email delivery status
        res.json({
            success: true,
            requires2FA: true,
            emailSent,
            message: emailSent
                ? 'Verification code sent to your email. Please check your inbox.'
                : 'Verification code generated but email delivery could not be confirmed. Please try resending.',
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
        const isOperations = loginType === 'operations';

        // Find user
        let userQuery;
        if (isAdmin) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'admin')
                .get();
        } else if (isOperations) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'operations')
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
        let tokenPayload;
        let tokenExpiry;
        if (isAdmin) {
            tokenPayload = { userId, email: userData.email, type: 'admin', role: 'admin' };
            tokenExpiry = '24h';
        } else if (isOperations) {
            tokenPayload = { userId, email: userData.email, type: 'operations', role: 'admin' };
            tokenExpiry = '24h';
        } else {
            tokenPayload = { userId, email: userData.email, type: userData.type };
            tokenExpiry = '7d';
        }

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
        if (isAdmin || isOperations) {
            updateData.lastAdminLogin = new Date().toISOString();
        }
        await adminDb.collection('users').doc(userId).update(updateData);

        // Prepare response (exclude password and OTP fields)
        const { password: _, loginOtp: _o, loginOtpExpiry: _e, loginOtpAttempts: _a, ...safeUserData } = userData;
        const responseUser = (isAdmin || isOperations)
            ? { ...safeUserData, id: userId, role: 'admin' }
            : { ...safeUserData, id: userId };

        const loginLabel = isAdmin ? 'Admin' : isOperations ? 'Operations' : 'User';
        console.log(`2FA verified - ${loginLabel} login complete for: ${normalizedEmail}`);

        // Log user login activity (fire-and-forget)
        logUserActivity({
            userEmail: normalizedEmail,
            userName: userData.name || '',
            userId,
            userType: userData.type || 'user',
            category: 'User Login',
            action: `${loginLabel} Login`,
            description: `${loginLabel} login completed: ${userData.name || normalizedEmail} (${userData.type || 'user'})`,
            metadata: { userId, loginType: loginLabel, userAgent },
            ip: clientIP
        }).catch(() => {});

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
            message: isAdmin ? 'Admin login successful' : isOperations ? 'Operations login successful' : 'Login successful',
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
router.post('/resend-otp', otpLimiter, async (req, res) => {
    try {
        const { email, loginType } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const isAdmin = loginType === 'admin';
        const isOperations = loginType === 'operations';

        let userQuery;
        if (isAdmin) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'admin')
                .get();
        } else if (isOperations) {
            userQuery = await adminDb.collection('users')
                .where('email', '==', normalizedEmail)
                .where('type', '==', 'operations')
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

        // Determine recipient email - operations and admin OTP goes to designated admin email
        const recipientEmail = (isAdmin || isOperations) ? 'sabincn676@gmail.com' : userData.email;

        // Send OTP email and wait for result
        let emailSent = false;
        if (process.env.RESEND_API_KEY) {
            try {
                const result = await sendOTPVerificationEmail(
                    { name: userData.name, email: recipientEmail },
                    otpCode, clientIP, userAgent
                );
                if (result && result.success) {
                    emailSent = true;
                    console.log(`✅ OTP resent to ${recipientEmail} (ID: ${result.messageId})`);
                } else {
                    console.error(`❌ Resend OTP email failed for ${recipientEmail}:`, result?.error);
                }
            } catch (error) {
                console.error(`Resend OTP email error:`, error?.message || error);
            }
        }

        console.log(`OTP resent for: ${normalizedEmail} (sent to ${recipientEmail}, delivered: ${emailSent})`);

        res.json({
            success: true,
            emailSent,
            message: emailSent
                ? 'A new verification code has been sent to your email.'
                : 'Code generated but email delivery could not be confirmed. Please try again.'
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
            console.log('⚠️ RESEND_API_KEY not configured - password reset email not sent');
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

        if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters with uppercase, lowercase, and a number'
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

// Operations portal login - Step 1: Verify credentials and send OTP to admin email
router.post('/login/operations', otpLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        console.log(`Operations login attempt for: ${email} from IP: ${clientIP}`);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find operations user
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('type', '==', 'operations')
            .get();

        if (userQuery.empty) {
            console.log(`Operations login failed: User not found for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid operations credentials'
            });
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Verify password
        const isValidPassword = await bcrypt.compare(password, userData.password);

        if (!isValidPassword) {
            console.log(`Operations login failed: Invalid password for email ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid operations credentials'
            });
        }

        // Check if account is active
        if (userData.canAccess === false) {
            return res.status(403).json({
                success: false,
                message: 'Operations account has been suspended'
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

        console.log(`Operations 2FA OTP generated for: ${email}`);

        // Send OTP email to designated operations verification email - await for delivery status
        const opsOtpEmail = 'sabincn676@gmail.com';
        let emailSent = false;
        if (process.env.RESEND_API_KEY) {
            try {
                const result = await sendOTPVerificationEmail(
                    { name: userData.name, email: opsOtpEmail },
                    otpCode, clientIP, userAgent
                );
                if (result && result.success) {
                    emailSent = true;
                    console.log(`✅ Operations 2FA OTP sent to ${opsOtpEmail} (ID: ${result.messageId})`);
                } else {
                    console.error(`❌ Failed to send operations OTP to ${opsOtpEmail}:`, result?.error);
                }
            } catch (error) {
                console.error(`❌ Operations OTP email error for ${opsOtpEmail}:`, error?.message || error);
            }
        } else {
            console.log('⚠️ RESEND_API_KEY not configured - Operations OTP email not sent');
        }

        // Return requires2FA flag with email delivery status
        res.json({
            success: true,
            requires2FA: true,
            emailSent,
            message: emailSent
                ? 'Verification code sent to your email. Please check your inbox.'
                : 'Verification code generated but email delivery could not be confirmed. Please try resending.',
            email: opsOtpEmail
        });

    } catch (error) {
        console.error('Operations login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during operations login'
        });
    }
});

// Google Sign-In - verify Google ID token and login/register
router.post('/google', async (req, res) => {
    try {
        const { credential, type, termsAccepted } = req.body;
        const clientIP = getClientIP(req);
        const userAgent = req.headers['user-agent'] || 'Unknown';

        if (!credential) {
            return res.status(400).json({
                success: false,
                message: 'Google credential is required'
            });
        }

        // Decode and verify Google ID token
        let googleUser;
        try {
            // Decode the JWT payload (Google ID tokens are JWTs)
            const parts = credential.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid token format');
            }
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

            // Verify token expiry
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                throw new Error('Token has expired');
            }

            // Verify issuer
            if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
                throw new Error('Invalid token issuer');
            }

            // Verify audience matches our client ID
            const googleClientId = process.env.GOOGLE_CLIENT_ID;
            if (googleClientId && payload.aud !== googleClientId) {
                throw new Error('Token audience mismatch');
            }

            if (!payload.email || !payload.email_verified) {
                throw new Error('Email not verified by Google');
            }

            googleUser = {
                email: payload.email.toLowerCase().trim(),
                name: payload.name || payload.email.split('@')[0],
                picture: payload.picture || null,
                googleId: payload.sub
            };
        } catch (tokenError) {
            console.error('Google token verification failed:', tokenError.message);
            return res.status(401).json({
                success: false,
                message: 'Invalid Google credential. Please try again.'
            });
        }

        console.log(`Google login attempt for: ${googleUser.email} from IP: ${clientIP}`);

        // Check if user already exists
        const existingUserQuery = await adminDb.collection('users')
            .where('email', '==', googleUser.email)
            .get();

        let userId;
        let userData;

        if (!existingUserQuery.empty) {
            // Existing user - log them in directly
            const userDoc = existingUserQuery.docs[0];
            userId = userDoc.id;
            userData = userDoc.data();

            // Check if account is admin or operations (not allowed via Google login on frontend)
            if (userData.type === 'admin' || userData.type === 'operations') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin and operations users cannot use Google Sign-In'
                });
            }

            // Check if user can access
            if (userData.canAccess === false && userData.profileStatus === 'rejected') {
                return res.status(403).json({
                    success: false,
                    message: 'Your account access has been restricted. Please contact support.',
                    profileStatus: userData.profileStatus
                });
            }

            // Update last login and Google profile picture (fire-and-forget — don't block login response)
            const updateData = {
                lastLogin: new Date().toISOString(),
                lastLoginIP: clientIP,
                googleId: googleUser.googleId
            };
            if (googleUser.picture && !userData.profilePicture) {
                updateData.profilePicture = googleUser.picture;
            }
            adminDb.collection('users').doc(userId).update(updateData).catch(err => {
                console.error('Failed to update last login for Google user:', err.message);
            });

            console.log(`Google login successful for existing user: ${googleUser.email}`);
        } else {
            // New user - register them via Google
            if (!type || !['designer', 'contractor'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select your role (Designer or Contractor) to continue',
                    requiresRegistration: true
                });
            }

            if (!termsAccepted) {
                return res.status(400).json({
                    success: false,
                    message: 'You must accept the Terms & Conditions and Privacy Policy to register',
                    requiresRegistration: true
                });
            }

            // Create new user from Google profile
            const newUserData = {
                name: googleUser.name,
                email: googleUser.email,
                password: null, // No password for Google-only users
                type: type,
                authProvider: 'google',
                googleId: googleUser.googleId,
                profilePicture: googleUser.picture,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                termsAccepted: true,
                termsAcceptedAt: new Date().toISOString(),
                termsVersion: '1.0',
                profileCompleted: false,
                profileStatus: 'incomplete',
                canAccess: true,
                profileData: {},
                lastLogin: new Date().toISOString(),
                lastLoginIP: clientIP
            };

            const userRef = await adminDb.collection('users').add(newUserData);
            userId = userRef.id;
            userData = newUserData;

            console.log(`New ${type} registered via Google: ${googleUser.email} (ID: ${userId})`);

            // Send notification email to admin about new Google sign-up (fire-and-forget to avoid blocking response)
            const ADMIN_EMAIL = process.env.ADMIN_REPORT_EMAIL || 'admin@steelconnect.com';
            sendGenericEmail({
                to: ADMIN_EMAIL,
                subject: `New Google Sign-Up: ${googleUser.email} (${type.charAt(0).toUpperCase() + type.slice(1)})`,
                html: `
                    <h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">New Google Sign-Up Registration</h2>
                    <p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">A new user has registered on SteelConnect via Google Sign-In.</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0;">
                        <tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Name</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${googleUser.name}</td></tr>
                        <tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Email</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${googleUser.email}</td></tr>
                        <tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Role</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${type.charAt(0).toUpperCase() + type.slice(1)}</td></tr>
                        <tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Auth Method</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">Google Sign-In</td></tr>
                        <tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Registered At</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${new Date().toLocaleString()}</td></tr>
                    </table>
                    <p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">The user will be directed to complete their profile. You will receive another notification when they submit their profile for review.</p>
                    <p style="margin:20px 0;"><a href="https://steelconnectapp.com/admin" style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">View in Admin Panel</a></p>
                `
            }).then(() => {
                console.log(`Admin notification sent for new Google user: ${googleUser.email}`);
            }).catch((emailError) => {
                console.error('Failed to send admin notification for Google signup:', emailError.message);
            });
        }

        // Generate JWT token (skip OTP for Google sign-in since Google already verified identity)
        const tokenPayload = { userId, email: userData.email || googleUser.email, type: userData.type };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Prepare safe user response
        const { password: _, loginOtp: _o, loginOtpExpiry: _e, loginOtpAttempts: _a, resetCode: _r, resetCodeExpiry: _re, ...safeUserData } = userData;

        res.json({
            success: true,
            message: existingUserQuery && !existingUserQuery.empty ? 'Google login successful' : 'Account created successfully via Google',
            token: token,
            user: { ...safeUserData, id: userId },
            isNewUser: existingUserQuery ? existingUserQuery.empty : true
        });

    } catch (error) {
        console.error('Google auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during Google authentication'
        });
    }
});

export default router;

