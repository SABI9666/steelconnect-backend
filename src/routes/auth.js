// src/routes/auth.js - Enhanced with profile system, login notifications, and admin login
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Email Service Class - Updated for Resend with domain verification
class EmailService {
    constructor() {
        // Import Resend dynamically to handle potential import errors
        this.resend = null;
        this.initializeResend();
    }

    async initializeResend() {
        try {
            const { Resend } = await import('resend');
            this.resend = new Resend(process.env.RESEND_API_KEY);
        } catch (error) {
            console.error('Failed to initialize Resend:', error);
        }
    }

    async sendEmail(to, subject, htmlContent, textContent = '') {
        try {
            if (!this.resend) {
                await this.initializeResend();
            }

            if (!this.resend) {
                throw new Error('Resend not initialized');
            }

            // Use verified domain email or fallback for testing
            const fromAddress = process.env.NODE_ENV === 'production' 
                ? `noreply@${process.env.VERIFIED_DOMAIN || 'steelconnect.com'}`
                : 'sabincn676@gmail.com';

            console.log(`Sending email to: ${to}, Subject: ${subject}`);

            const emailData = {
                from: fromAddress,
                to: Array.isArray(to) ? to : [to],
                subject,
                html: htmlContent,
            };

            if (textContent) {
                emailData.text = textContent;
            }

            const response = await this.resend.emails.send(emailData);
            return { success: true, messageId: response.id };

        } catch (error) {
            console.error('Resend API error:', error);
            
            // If domain not verified, try with fallback
            if (error.message && error.message.includes('testing emails')) {
                return await this.sendFallbackEmail(to, subject, htmlContent);
            }
            
            return { success: false, error: error.message };
        }
    }

    async sendFallbackEmail(originalTo, subject, htmlContent) {
        try {
            const fallbackResponse = await this.resend.emails.send({
                from: 'sabincn676@gmail.com',
                to: ['sabincn676@gmail.com'],
                subject: `[TEST] ${subject} - Original recipient: ${originalTo}`,
                html: `
                    <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <strong>⚠️ Test Mode:</strong> This email was originally intended for: <strong>${originalTo}</strong>
                    </div>
                    ${htmlContent}
                `,
            });
            
            console.log('Fallback email sent successfully');
            return { success: true, messageId: fallbackResponse.id, note: 'Sent to fallback email' };
            
        } catch (fallbackError) {
            console.error('Fallback email failed:', fallbackError);
            return { success: false, error: fallbackError.message };
        }
    }

    async sendLoginNotification(user, loginTime, clientIP, userAgent) {
        const subject = 'Security Alert: Login to Your SteelConnect Account';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        max-width: 600px; 
                        margin: 0 auto; 
                        background: #f8fafc;
                        padding: 20px;
                    }
                    .container { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .header { 
                        background: linear-gradient(135deg, #1f2937 0%, #374151 100%); 
                        color: white; 
                        padding: 30px 20px; 
                        text-align: center; 
                    }
                    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
                    .content { padding: 30px; }
                    .alert { 
                        background: #fef2f2; 
                        border-left: 4px solid #ef4444; 
                        padding: 20px; 
                        border-radius: 0 8px 8px 0; 
                        margin-bottom: 25px;
                    }
                    .alert h2 { margin: 0 0 10px 0; color: #dc2626; font-size: 18px; }
                    .info-box { 
                        background: #f0f9ff; 
                        border: 1px solid #bae6fd; 
                        padding: 20px; 
                        border-radius: 8px; 
                        margin: 20px 0; 
                    }
                    .info-row { 
                        display: flex; 
                        justify-content: space-between; 
                        margin: 8px 0; 
                        padding: 5px 0; 
                        border-bottom: 1px solid #e5e7eb;
                    }
                    .info-row:last-child { border-bottom: none; }
                    .info-label { font-weight: 600; color: #374151; }
                    .info-value { color: #6b7280; }
                    .footer { 
                        background: #f9fafb; 
                        padding: 20px; 
                        text-align: center; 
                        color: #6b7280; 
                        font-size: 14px;
                    }
                    .admin-badge {
                        background: #dc2626;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                    .user-badge {
                        background: #059669;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 SteelConnect Security Alert</h1>
                        ${user.type === 'admin' ? '<span class="admin-badge">Admin Access</span>' : '<span class="user-badge">User Access</span>'}
                    </div>
                    
                    <div class="content">
                        <div class="alert">
                            <h2>New Login Detected</h2>
                            <p>We detected a new login to your SteelConnect account. If this was not you, please secure your account immediately.</p>
                        </div>
                        
                        <div class="info-box">
                            <h3 style="margin-top: 0; color: #1f2937;">Login Details:</h3>
                            <div class="info-row">
                                <span class="info-label">Account:</span>
                                <span class="info-value">${user.email}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Name:</span>
                                <span class="info-value">${user.name}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Account Type:</span>
                                <span class="info-value">${user.type.charAt(0).toUpperCase() + user.type.slice(1)}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Login Time:</span>
                                <span class="info-value">${new Date(loginTime).toLocaleString()}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">IP Address:</span>
                                <span class="info-value">${clientIP}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Device:</span>
                                <span class="info-value">${this.parseUserAgent(userAgent)}</span>
                            </div>
                        </div>
                        
                        <p style="color: #374151; line-height: 1.6;">
                            If this login was authorized by you, no further action is required. 
                            If you do not recognize this activity, please:
                        </p>
                        
                        <ul style="color: #6b7280; line-height: 1.8;">
                            <li>Change your password immediately</li>
                            <li>Review your account activity</li>
                            <li>Contact our support team if you need assistance</li>
                        </ul>
                        
                        <p style="color: #374151; margin-top: 25px;">
                            <strong>Best regards,</strong><br>
                            SteelConnect Security Team
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p>This is an automated security notification from SteelConnect.</p>
                        <p>Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const textContent = `
SteelConnect Security Alert - New Login Detected

Account: ${user.email}
Name: ${user.name}
Account Type: ${user.type.charAt(0).toUpperCase() + user.type.slice(1)}
Login Time: ${new Date(loginTime).toLocaleString()}
IP Address: ${clientIP}
Device: ${this.parseUserAgent(userAgent)}

If this login was authorized by you, no further action is required.
If you do not recognize this activity, please change your password immediately and contact support.

Best regards,
SteelConnect Security Team
        `;

        return await this.sendEmail(user.email, subject, htmlContent, textContent);
    }

    parseUserAgent(userAgent) {
        if (!userAgent || userAgent === 'Unknown') return 'Unknown Device';
        
        // Simple user agent parsing
        if (userAgent.includes('Chrome')) return 'Chrome Browser';
        if (userAgent.includes('Firefox')) return 'Firefox Browser';
        if (userAgent.includes('Safari')) return 'Safari Browser';
        if (userAgent.includes('Edge')) return 'Edge Browser';
        if (userAgent.includes('Mobile')) return 'Mobile Device';
        
        return 'Unknown Device';
    }
}

// Initialize email service
const emailService = new EmailService();

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

        // Send login notification email asynchronously
        emailService.sendLoginNotification(responseUser, new Date().toISOString(), clientIP, userAgent)
            .then(result => {
                if (result.success) {
                    console.log('Login notification sent successfully');
                } else {
                    console.error(`Failed to send login notification to: ${email} - ${result.error}`);
                }
            })
            .catch(error => {
                console.error('Error sending login notification:', error);
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

        // Send admin login notification
        emailService.sendLoginNotification(responseAdmin, new Date().toISOString(), clientIP, userAgent)
            .then(result => {
                if (result.success) {
                    console.log('Admin login notification sent successfully');
                } else {
                    console.error(`Failed to send login notification to: ${email} - ${result.error}`);
                }
            })
            .catch(error => {
                console.error('Error sending admin login notification:', error);
            });

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
