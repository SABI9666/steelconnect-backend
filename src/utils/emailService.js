
// src/utils/emailService.js - Enhanced with professional SC logo
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified steelconnectapp.com domain
const FROM_EMAIL = 'noreply@steelconnectapp.com';
const COMPANY_NAME = 'SteelConnect';

// Professional email template with SC logo
const getEmailTemplate = (title, content) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
                line-height: 1.6; 
                color: #333; 
                margin: 0; 
                padding: 0; 
                background-color: #f7f9fc;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            .wrapper {
                background-color: #f7f9fc;
                padding: 40px 20px;
            }
            .container { 
                max-width: 600px; 
                margin: 0 auto; 
                background: #ffffff; 
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
                overflow: hidden;
            }
            .header { 
                background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
                padding: 30px 20px;
                text-align: center;
            }
            .logo-container {
                display: inline-block;
                background: #ffffff;
                border-radius: 12px;
                padding: 15px 25px;
                margin-bottom: 15px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            .logo-text {
                font-size: 32px;
                font-weight: 700;
                color: #1e3a8a;
                letter-spacing: -1px;
                margin: 0;
            }
            .logo-sc {
                display: inline-block;
                background: linear-gradient(135deg, #1e3a8a, #2563eb);
                color: white;
                padding: 8px 12px;
                border-radius: 8px;
                margin-right: 8px;
                font-weight: 800;
            }
            .tagline {
                color: #ffffff;
                font-size: 14px;
                margin-top: 10px;
                opacity: 0.95;
            }
            .content {
                padding: 30px;
            }
            .alert-box { 
                background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
                border-left: 4px solid #2563eb; 
                padding: 20px; 
                margin: 20px 0; 
                border-radius: 8px;
            }
            .info-box { 
                background: #f8fafc; 
                padding: 20px; 
                border-radius: 8px; 
                margin: 20px 0;
                border: 1px solid #e2e8f0;
            }
            .detail-row { 
                display: flex; 
                justify-content: space-between; 
                margin: 12px 0; 
                padding: 8px 0;
                border-bottom: 1px solid #e2e8f0;
            }
            .detail-row:last-child {
                border-bottom: none;
            }
            .detail-label { 
                font-weight: 600; 
                color: #475569;
                font-size: 14px;
            }
            .detail-value { 
                color: #1e293b;
                font-size: 14px;
            }
            .button {
                display: inline-block;
                background: linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%);
                color: white;
                padding: 12px 30px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
                box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
                transition: transform 0.2s;
            }
            .button:hover {
                transform: translateY(-1px);
            }
            .security-notice {
                background: #fef3c7;
                border: 1px solid #fbbf24;
                color: #92400e;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                font-size: 14px;
            }
            .footer { 
                background: #f8fafc;
                text-align: center; 
                color: #64748b; 
                font-size: 13px; 
                padding: 20px;
                border-top: 1px solid #e2e8f0;
            }
            .footer-links {
                margin: 10px 0;
            }
            .footer-links a {
                color: #2563eb;
                text-decoration: none;
                margin: 0 10px;
            }
            @media only screen and (max-width: 600px) {
                .container {
                    border-radius: 0;
                }
                .content {
                    padding: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                <div class="header">
                    <div class="logo-container">
                        <div class="logo-text">
                            <span class="logo-sc">SC</span>SteelConnect
                        </div>
                    </div>
                    <div class="tagline">Professional Steel Construction Platform</div>
                </div>
                <div class="content">
                    ${content}
                </div>
                <div class="footer">
                    <div class="footer-links">
                        <a href="https://steelconnectapp.com">Visit Website</a>
                        <a href="https://steelconnectapp.com/support">Support</a>
                        <a href="https://steelconnectapp.com/privacy">Privacy Policy</a>
                    </div>
                    <p style="margin: 10px 0 0 0;">
                        © ${new Date().getFullYear()} SteelConnect - All rights reserved.
                    </p>
                    <p style="margin: 5px 0 0 0; font-size: 12px; color: #94a3b8;">
                        This is an automated message from SteelConnect.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
};

// Send login notification email
export async function sendLoginNotification(user, loginTime, clientIP, userAgent) {
    try {
        console.log(`Attempting to send email to: ${user.email}`);
        console.log(`Subject: Login Notification - ${COMPANY_NAME}`);

        const emailContent = `
            <h2 style="color: #1e293b; margin-top: 0;">Login Notification</h2>
            
            <div class="alert-box">
                <h3 style="margin: 0 0 10px 0; color: #1e3a8a;">Account Access Detected</h3>
                <p style="margin: 0;">Hello <strong>${user.name}</strong>, we detected a login to your SteelConnect account.</p>
            </div>

            <div class="info-box">
                <h4 style="margin-top: 0; color: #1e293b;">Login Details</h4>
                <div class="detail-row">
                    <span class="detail-label">Account:</span>
                    <span class="detail-value">${user.email}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">User Type:</span>
                    <span class="detail-value">${user.type.charAt(0).toUpperCase() + user.type.slice(1)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Login Time:</span>
                    <span class="detail-value">${new Date(loginTime).toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">IP Address:</span>
                    <span class="detail-value">${clientIP}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Device:</span>
                    <span class="detail-value">${userAgent.substring(0, 50)}...</span>
                </div>
            </div>

            <div class="security-notice">
                <strong>⚠️ Security Notice:</strong> If this login wasn't you, please contact our support team immediately and change your password.
            </div>

            <center>
                <a href="https://steelconnectapp.com/dashboard" class="button">Go to Dashboard</a>
            </center>
        `;

        const emailHTML = getEmailTemplate('Login Notification - SteelConnect', emailContent);

        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: user.email,
            subject: `🔐 Login Notification - ${COMPANY_NAME}`,
            html: emailHTML
        };

        console.log(`Sending email from: ${FROM_EMAIL} to: ${user.email}`);
        
        const response = await resend.emails.send(emailData);
        
        if (response.error) {
            console.error('Resend API error:', response.error);
            return {
                success: false,
                error: response.error
            };
        }

        console.log(`✅ Email sent successfully. Message ID: ${response.data?.id || 'N/A'}`);
        
        return {
            success: true,
            messageId: response.data?.id,
            message: 'Login notification sent successfully'
        };

    } catch (error) {
        console.error('Email service error:', error);
        return {
            success: false,
            error: error.message || 'Failed to send email'
        };
    }
}

// Send estimation result notification
export async function sendEstimationResultNotification(contractor, estimation, resultFile) {
    try {
        console.log(`Attempting to send estimation result email to: ${contractor.email}`);

        const emailContent = `
            <h2 style="color: #1e293b; margin-top: 0;">Your Estimation Result is Ready!</h2>
            
            <p style="color: #475569; font-size: 16px;">
                Hello <strong>${contractor.name}</strong>,
            </p>
            
            <p style="color: #475569;">
                Great news! The estimation result for your project has been completed and is now available for download.
            </p>
            
            <div class="info-box">
                <h4 style="margin-top: 0; color: #1e293b;">Project Details</h4>
                <div class="detail-row">
                    <span class="detail-label">Project Title:</span>
                    <span class="detail-value">${estimation.projectName || estimation.projectTitle}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estimation ID:</span>
                    <span class="detail-value">#${estimation._id.substring(0, 8).toUpperCase()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Submitted Date:</span>
                    <span class="detail-value">${new Date(estimation.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Completed Date:</span>
                    <span class="detail-value">${new Date().toLocaleDateString()}</span>
                </div>
                ${resultFile ? `
                <div class="detail-row">
                    <span class="detail-label">Result File:</span>
                    <span class="detail-value">${resultFile.name || 'Estimation_Result.pdf'}</span>
                </div>
                ` : ''}
            </div>

            <div style="background: #f0fdf4; border: 1px solid #86efac; color: #14532d; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <strong>✓ Ready for Download:</strong> Your estimation result document is now available in your dashboard. You can download it anytime.
            </div>

            <center>
                <a href="https://steelconnectapp.com/dashboard/estimations" class="button">View Estimation Result</a>
            </center>

            <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                If you have any questions about your estimation result, please don't hesitate to contact our support team.
            </p>
        `;

        const emailHTML = getEmailTemplate('Estimation Result Ready - SteelConnect', emailContent);

        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: contractor.email,
            subject: `📊 Your Estimation Result is Ready - "${estimation.projectName || estimation.projectTitle}"`,
            html: emailHTML
        };

        const response = await resend.emails.send(emailData);

        if (response.error) {
            console.error('Resend API error:', response.error);
            throw new Error(response.error.message);
        }

        console.log(`✅ Estimation result email sent successfully to ${contractor.email}. Message ID: ${response.data?.id}`);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Error sending estimation result email:', error);
        throw error;
    }
}

// Send profile review notification
export async function sendProfileReviewNotification(user, status, reason = null) {
    try {
        const isApproved = status === 'approved';
        const emailContent = `
            <h2 style="color: #1e293b; margin-top: 0;">Profile Review ${isApproved ? 'Approved' : 'Update Required'}</h2>
            
            <div class="${isApproved ? 'alert-box' : 'security-notice'}">
                <h3 style="margin: 0 0 10px 0; color: ${isApproved ? '#1e3a8a' : '#92400e'};">
                    ${isApproved ? '✅ Your profile has been approved!' : '⚠️ Your profile needs updates'}
                </h3>
                <p style="margin: 0;">
                    Hello <strong>${user.name}</strong>,
                </p>
                <p>
                    ${isApproved 
                        ? 'Congratulations! Your profile has been reviewed and approved. You now have full access to all SteelConnect features.'
                        : `We've reviewed your profile and need some updates before approval. ${reason ? `<br><br><strong>Reason:</strong> ${reason}` : ''}`
                    }
                </p>
            </div>

            <center>
                <a href="https://steelconnectapp.com/dashboard/profile" class="button">
                    ${isApproved ? 'Go to Dashboard' : 'Update Profile'}
                </a>
            </center>
        `;

        const emailHTML = getEmailTemplate('Profile Review Update - SteelConnect', emailContent);

        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: user.email,
            subject: `${isApproved ? '✅' : '📝'} Profile Review ${isApproved ? 'Approved' : 'Update'} - SteelConnect`,
            html: emailHTML
        };

        const response = await resend.emails.send(emailData);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Error sending profile review email:', error);
        throw error;
    }
}

// Send password reset email
export async function sendPasswordResetEmail(user, resetToken, resetUrl) {
    try {
        console.log(`Attempting to send password reset email to: ${user.email}`);

        const emailContent = `
            <h2 style="color: #1e293b; margin-top: 0;">Password Reset Request</h2>

            <div class="alert-box">
                <h3 style="margin: 0 0 10px 0; color: #1e3a8a;">Reset Your Password</h3>
                <p style="margin: 0;">Hello <strong>${user.name}</strong>, we received a request to reset your SteelConnect account password.</p>
            </div>

            <p style="color: #475569; font-size: 16px;">
                Use the verification code below to reset your password. This code will expire in <strong>15 minutes</strong>.
            </p>

            <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border: 2px dashed #2563eb; border-radius: 12px; padding: 20px 40px;">
                    <p style="margin: 0 0 5px 0; font-size: 13px; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
                    <p style="margin: 0; font-size: 36px; font-weight: 700; color: #1e3a8a; letter-spacing: 8px;">${resetToken}</p>
                </div>
            </div>

            <div class="info-box">
                <h4 style="margin-top: 0; color: #1e293b;">Request Details</h4>
                <div class="detail-row">
                    <span class="detail-label">Account:</span>
                    <span class="detail-value">${user.email}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Requested At:</span>
                    <span class="detail-value">${new Date().toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Expires In:</span>
                    <span class="detail-value">15 minutes</span>
                </div>
            </div>

            <div class="security-notice">
                <strong>⚠️ Security Notice:</strong> If you did not request a password reset, please ignore this email. Your account remains secure and no changes have been made.
            </div>
        `;

        const emailHTML = getEmailTemplate('Password Reset - SteelConnect', emailContent);

        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: user.email,
            subject: `🔑 Password Reset Code - ${COMPANY_NAME}`,
            html: emailHTML
        };

        console.log(`Sending password reset email from: ${FROM_EMAIL} to: ${user.email}`);

        const response = await resend.emails.send(emailData);

        if (response.error) {
            console.error('Resend API error:', response.error);
            return {
                success: false,
                error: response.error
            };
        }

        console.log(`✅ Password reset email sent successfully. Message ID: ${response.data?.id || 'N/A'}`);

        return {
            success: true,
            messageId: response.data?.id,
            message: 'Password reset email sent successfully'
        };

    } catch (error) {
        console.error('Password reset email error:', error);
        return {
            success: false,
            error: error.message || 'Failed to send password reset email'
        };
    }
}

// Send 2FA OTP verification email
export async function sendOTPVerificationEmail(user, otpCode, clientIP, userAgent) {
    try {
        console.log(`Attempting to send 2FA OTP email to: ${user.email}`);

        const emailContent = `
            <h2 style="color: #1e293b; margin-top: 0;">Login Verification Code</h2>

            <div class="alert-box">
                <h3 style="margin: 0 0 10px 0; color: #1e3a8a;">Verify Your Identity</h3>
                <p style="margin: 0;">Hello <strong>${user.name}</strong>, a login attempt was made on your SteelConnect account. Enter the code below to complete sign-in.</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); border-radius: 16px; padding: 25px 50px; box-shadow: 0 8px 25px rgba(37, 99, 235, 0.3);">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 2px;">Your Verification Code</p>
                    <p style="margin: 0; font-size: 42px; font-weight: 800; color: #ffffff; letter-spacing: 12px;">${otpCode}</p>
                </div>
            </div>

            <p style="color: #475569; font-size: 14px; text-align: center;">
                This code expires in <strong>5 minutes</strong>. Do not share this code with anyone.
            </p>

            <div class="info-box">
                <h4 style="margin-top: 0; color: #1e293b;">Login Attempt Details</h4>
                <div class="detail-row">
                    <span class="detail-label">Account:</span>
                    <span class="detail-value">${user.email}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time:</span>
                    <span class="detail-value">${new Date().toLocaleString()}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">IP Address:</span>
                    <span class="detail-value">${clientIP || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Device:</span>
                    <span class="detail-value">${(userAgent || 'Unknown').substring(0, 60)}...</span>
                </div>
            </div>

            <div class="security-notice">
                <strong>⚠️ Security Notice:</strong> If you did not attempt to log in, your password may be compromised. Please change your password immediately and contact support.
            </div>
        `;

        const emailHTML = getEmailTemplate('Login Verification - SteelConnect', emailContent);

        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: user.email,
            subject: `🔐 ${otpCode} - Your SteelConnect Login Code`,
            html: emailHTML
        };

        const response = await resend.emails.send(emailData);

        if (response.error) {
            console.error('Resend API error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`✅ 2FA OTP email sent to ${user.email}. Message ID: ${response.data?.id || 'N/A'}`);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('OTP email error:', error);
        return { success: false, error: error.message || 'Failed to send OTP email' };
    }
}

export default {
    sendLoginNotification,
    sendEstimationResultNotification,
    sendProfileReviewNotification,
    sendPasswordResetEmail,
    sendOTPVerificationEmail
};
