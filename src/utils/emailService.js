// src/utils/emailService.js - Email service with fallback when Resend is not available
let Resend;
let resend;

// Try to import Resend, fallback if not available
try {
    const ResendModule = await import('resend');
    Resend = ResendModule.Resend;
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend email service initialized');
} catch (error) {
    console.warn('⚠️ Resend package not found. Email functionality will be disabled.');
    console.warn('🔍 Install resend package: npm install resend');
    Resend = null;
    resend = null;
}

// Default sender email (should be verified in Resend)
const DEFAULT_FROM = process.env.DEFAULT_FROM_EMAIL || 'noreply@steelconnect.com';

/**
 * Send email using Resend API (with fallback)
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {string} options.from - Sender email (optional)
 */
export async function sendEmail(options) {
    try {
        const { to, subject, html, text, from = DEFAULT_FROM } = options;
        
        if (!resend || !process.env.RESEND_API_KEY) {
            console.warn('📧 Email service not configured. Would send email to:', to);
            console.warn('📧 Subject:', subject);
            if (process.env.NODE_ENV === 'development') {
                console.log('📧 Email content:', html.substring(0, 200) + '...');
            }
            return { 
                success: false, 
                error: 'Email service not configured',
                mock: true,
                details: { to, subject, from }
            };
        }
        
        console.log(`📧 Sending email to: ${to}, Subject: ${subject}`);
        
        const emailData = {
            from,
            to: [to],
            subject,
            html
        };
        
        // Add plain text if provided
        if (text) {
            emailData.text = text;
        }
        
        const response = await resend.emails.send(emailData);
        
        if (response.error) {
            console.error('❌ Resend API error:', response.error);
            throw new Error(response.error.message || 'Failed to send email');
        }
        
        console.log('✅ Email sent successfully:', response.data.id);
        return { 
            success: true, 
            messageId: response.data.id,
            data: response.data 
        };
        
    } catch (error) {
        console.error('❌ Email sending error:', error);
        // Return mock success in development to not break the flow
        if (process.env.NODE_ENV === 'development') {
            console.warn('🔧 Development mode: Returning mock email success');
            return {
                success: true,
                mock: true,
                error: error.message
            };
        }
        throw error;
    }
}

/**
 * Send login notification email
 * @param {Object} user - User object
 * @param {string} loginTime - Login timestamp
 * @param {string} ipAddress - User's IP address
 * @param {string} userAgent - User's browser/device info
 */
export async function sendLoginNotification(user, loginTime, ipAddress = 'Unknown', userAgent = 'Unknown') {
    try {
        if (!resend) {
            console.log('📧 Mock: Would send login notification to:', user.email);
            return { success: true, mock: true };
        }

        const formattedTime = new Date(loginTime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        
        // Extract browser info from user agent
        const browserInfo = extractBrowserInfo(userAgent);
        
        const subject = 'Security Alert: Login to Your SteelConnect Account';
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login Notification</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f7fa; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .content { padding: 30px; }
                    .login-details { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
                    .detail-label { font-weight: 600; color: #666; }
                    .detail-value { color: #333; }
                    .security-notice { background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; }
                    .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }
                    .btn { display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 Login Notification</h1>
                        <p>SteelConnect Security Alert</p>
                    </div>
                    
                    <div class="content">
                        <h2>Hello ${user.name},</h2>
                        
                        <p>We detected a login to your SteelConnect account. Here are the details:</p>
                        
                        <div class="login-details">
                            <div class="detail-row">
                                <span class="detail-label">Time:</span>
                                <span class="detail-value">${formattedTime}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Account Type:</span>
                                <span class="detail-value">${user.type.charAt(0).toUpperCase() + user.type.slice(1)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${ipAddress}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Browser:</span>
                                <span class="detail-value">${browserInfo}</span>
                            </div>
                        </div>
                        
                        <div class="security-notice">
                            <strong>Was this you?</strong><br>
                            If you recognize this login, no action is needed. If you don't recognize this activity, please secure your account immediately.
                        </div>
                        
                        <p>If this wasn't you, please:</p>
                        <ul>
                            <li>Change your password immediately</li>
                            <li>Review your account activity</li>
                            <li>Contact our support team</li>
                        </ul>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://steelconnect.com/account/security" class="btn">Review Account Security</a>
                        </div>
                        
                        <p>Thank you for using SteelConnect!</p>
                    </div>
                    
                    <div class="footer">
                        <p>This is an automated security notification from SteelConnect.</p>
                        <p>If you have questions, contact us at support@steelconnect.com</p>
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail({
            to: user.email,
            subject,
            html
        });
        
        console.log(`📧 Login notification sent to: ${user.email}`);
        
    } catch (error) {
        console.error('❌ Failed to send login notification:', error);
        // Don't throw error - login should succeed even if notification fails
    }
}

/**
 * Extract browser information from User-Agent string
 * @param {string} userAgent - User agent string
 * @returns {string} Formatted browser info
 */
function extractBrowserInfo(userAgent) {
    if (!userAgent || userAgent === 'Unknown') {
        return 'Unknown Browser';
    }
    
    try {
        // Simple browser detection
        if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
            return 'Google Chrome';
        } else if (userAgent.includes('Firefox')) {
            return 'Mozilla Firefox';
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            return 'Apple Safari';
        } else if (userAgent.includes('Edg')) {
            return 'Microsoft Edge';
        } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
            return 'Opera';
        } else {
            return 'Unknown Browser';
        }
    } catch (error) {
        return 'Unknown Browser';
    }
}

/**
 * Send profile approval notification
 * @param {Object} user - User object
 * @param {string} userType - User type (designer/contractor)
 * @param {string} notes - Admin notes (optional)
 */
export async function sendProfileApprovalEmail(user, userType, notes = '') {
    try {
        const emailTransporter = initializeEmailService();
        
        if (!emailTransporter) {
            console.log('📧 Mock: Would send profile approval to:', user.email);
            return { success: true, mock: true };
        }

        const capabilities = userType === 'designer' 
            ? [
                'Browse and quote on available projects',
                'Manage your submitted quotes',
                'Communicate with clients through our messaging system',
                'Access project files and specifications'
            ]
            : [
                'Post new construction and engineering projects',
                'Review and approve quotes from qualified professionals',
                'Use our AI-powered cost estimation tools',
                'Manage approved projects and track progress'
            ];
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Profile Approved</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f7fa;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
                    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px;">Profile Approved!</h1>
                        <p style="margin: 10px 0 0 0; font-size: 16px;">Welcome to SteelConnect</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <h2>Congratulations, ${user.name}!</h2>
                        
                        <p>Your ${userType} profile has been approved by our admin team. You now have full access to your SteelConnect portal.</p>
                        
                        <div style="background-color: #e8f5e8; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #155724;">What you can do now:</h3>
                            <ul style="margin-bottom: 0;">
                                ${capabilities.map(capability => `<li>${capability}</li>`).join('')}
                            </ul>
                        </div>
                        
                        ${notes ? `
                            <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0;">
                                <strong>Message from our team:</strong><br>
                                ${notes}
                            </div>
                        ` : ''}
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://steelconnect.com/login" style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                                Access Your Portal
                            </a>
                        </div>
                        
                        <p>Welcome to the SteelConnect community! We're excited to have you on board.</p>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
                        <p>Need help getting started? Contact us at support@steelconnect.com</p>
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail({
            to: user.email,
            subject: 'Profile Approved - Welcome to SteelConnect!',
            html
        });
    } catch (error) {
        console.error('❌ Failed to send profile approval email:', error);
    }
}

