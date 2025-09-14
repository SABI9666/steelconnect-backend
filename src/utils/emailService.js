// src/utils/emailService.js - Complete email service with Resend integration
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified domain
const FROM_EMAIL = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
const COMPANY_NAME = 'SteelConnect';
const SUPPORT_EMAIL = 'support@steelconnectapp.com';

// Send login notification email
export async function sendLoginNotification(user, loginTime, clientIP, userAgent) {
    try {
        console.log(`Attempting to send email to: ${user.email}`);
        console.log(`Subject: Login Notification - ${COMPANY_NAME}`);

        const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login Notification - ${COMPANY_NAME}</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f4f4f4;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    padding: 20px; 
                    background: white; 
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px solid #2563eb; 
                    padding-bottom: 20px; 
                    margin-bottom: 30px;
                }
                .logo { 
                    font-size: 28px; 
                    font-weight: bold; 
                    color: #2563eb; 
                    margin-bottom: 5px;
                }
                .subtitle { 
                    color: #666; 
                    font-size: 16px;
                }
                .alert-box { 
                    background: #e3f2fd; 
                    border-left: 4px solid #2196f3; 
                    padding: 15px; 
                    margin: 20px 0; 
                    border-radius: 4px;
                }
                .details { 
                    background: #f8f9fa; 
                    padding: 20px; 
                    border-radius: 6px; 
                    margin: 20px 0;
                }
                .detail-row { 
                    display: flex; 
                    justify-content: space-between; 
                    margin: 8px 0; 
                    padding: 5px 0;
                    border-bottom: 1px solid #eee;
                }
                .detail-row:last-child {
                    border-bottom: none;
                }
                .detail-label { 
                    font-weight: 600; 
                    color: #555;
                    min-width: 120px;
                }
                .detail-value { 
                    color: #333; 
                    text-align: right;
                    word-break: break-all;
                }
                .warning { 
                    background: #fff3cd; 
                    border: 1px solid #ffeaa7; 
                    color: #856404; 
                    padding: 15px; 
                    border-radius: 4px; 
                    margin: 20px 0;
                }
                .footer { 
                    text-align: center; 
                    color: #666; 
                    font-size: 14px; 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 1px solid #eee;
                }
                .button { 
                    display: inline-block; 
                    background: #2563eb; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 500;
                    margin: 10px 0;
                }
                @media (max-width: 600px) {
                    .container { margin: 10px; padding: 15px; }
                    .detail-row { flex-direction: column; }
                    .detail-value { text-align: left; margin-top: 5px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">${COMPANY_NAME}</div>
                    <div class="subtitle">Steel Construction Platform</div>
                </div>

                <div class="alert-box">
                    <h2 style="margin: 0 0 10px 0; color: #1976d2;">Login Notification</h2>
                    <p style="margin: 0;">Hello <strong>${user.name}</strong>, we detected a login to your ${COMPANY_NAME} account.</p>
                </div>

                <div class="details">
                    <h3 style="margin-top: 0; color: #333;">Login Details</h3>
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
                    ${userAgent !== 'Unknown' ? `
                    <div class="detail-row">
                        <span class="detail-label">Device:</span>
                        <span class="detail-value">${userAgent.length > 50 ? userAgent.substring(0, 50) + '...' : userAgent}</span>
                    </div>
                    ` : ''}
                </div>

                <div class="warning">
                    <strong>Security Notice:</strong> If this login wasn't you, please contact our support team immediately and consider changing your password.
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="mailto:${SUPPORT_EMAIL}" class="button">Contact Support</a>
                </div>

                <div class="footer">
                    <p>This is an automated security notification from ${COMPANY_NAME}.</p>
                    <p>If you have any questions, contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
                    <p style="margin-top: 20px; font-size: 12px; color: #999;">
                        ${COMPANY_NAME} - Steel Construction Platform<br>
                        © ${new Date().getFullYear()} All rights reserved.
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;

        const emailText = `
${COMPANY_NAME} - Login Notification

Hello ${user.name},

We detected a login to your ${COMPANY_NAME} account with the following details:

Account: ${user.email}
User Type: ${user.type.charAt(0).toUpperCase() + user.type.slice(1)}
Login Time: ${new Date(loginTime).toLocaleString()}
IP Address: ${clientIP}
${userAgent !== 'Unknown' ? `Device: ${userAgent}` : ''}

If this login wasn't you, please contact our support team immediately at ${SUPPORT_EMAIL} and consider changing your password.

Best regards,
The ${COMPANY_NAME} Team

---
This is an automated security notification.
Contact us: ${SUPPORT_EMAIL}
© ${new Date().getFullYear()} ${COMPANY_NAME} - All rights reserved.
        `;

        const emailData = {
            from: FROM_EMAIL,
            to: [user.email],
            subject: `Login Notification - ${COMPANY_NAME}`,
            html: emailHTML,
            text: emailText,
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

// Send profile approval notification
export async function sendProfileApprovalNotification(user, approvedBy) {
    try {
        console.log(`Sending profile approval notification to: ${user.email}`);

        const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Profile Approved - ${COMPANY_NAME}</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f4f4f4;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    padding: 20px; 
                    background: white; 
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px solid #10b981; 
                    padding-bottom: 20px; 
                    margin-bottom: 30px;
                }
                .logo { 
                    font-size: 28px; 
                    font-weight: bold; 
                    color: #10b981; 
                    margin-bottom: 5px;
                }
                .success-box { 
                    background: #dcfce7; 
                    border-left: 4px solid #10b981; 
                    padding: 20px; 
                    margin: 20px 0; 
                    border-radius: 4px;
                }
                .button { 
                    display: inline-block; 
                    background: #10b981; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 500;
                    margin: 20px 0;
                }
                .footer { 
                    text-align: center; 
                    color: #666; 
                    font-size: 14px; 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 1px solid #eee;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">${COMPANY_NAME}</div>
                    <div style="color: #666; font-size: 16px;">Steel Construction Platform</div>
                </div>

                <div class="success-box">
                    <h2 style="margin: 0 0 15px 0; color: #059669;">🎉 Profile Approved!</h2>
                    <p style="margin: 0; font-size: 16px;">Congratulations <strong>${user.name}</strong>! Your ${user.type} profile has been approved and you now have full access to ${COMPANY_NAME}.</p>
                </div>

                <p>You can now:</p>
                <ul style="color: #555; padding-left: 20px;">
                    <li>Access all platform features</li>
                    <li>View and respond to job postings</li>
                    <li>Connect with other professionals</li>
                    <li>Submit quotes and proposals</li>
                    <li>Use our AI cost estimation tools</li>
                </ul>

                <div style="text-align: center;">
                    <a href="${process.env.FRONTEND_URL || 'https://steelconnect.vercel.app'}" class="button">Access Platform</a>
                </div>

                <div class="footer">
                    <p>Welcome to ${COMPANY_NAME}!</p>
                    <p>If you have any questions, contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
                </div>
            </div>
        </body>
        </html>
        `;

        const emailData = {
            from: FROM_EMAIL,
            to: [user.email],
            subject: `Profile Approved - Welcome to ${COMPANY_NAME}!`,
            html: emailHTML,
        };

        const response = await resend.emails.send(emailData);
        
        if (response.error) {
            console.error('Profile approval email error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`✅ Profile approval email sent to ${user.email}`);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Profile approval email error:', error);
        return { success: false, error: error.message };
    }
}

// Send profile rejection notification
export async function sendProfileRejectionNotification(user, rejectedBy, reason) {
    try {
        console.log(`Sending profile rejection notification to: ${user.email}`);

        const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Profile Review - ${COMPANY_NAME}</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f4f4f4;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    padding: 20px; 
                    background: white; 
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px solid #f59e0b; 
                    padding-bottom: 20px; 
                    margin-bottom: 30px;
                }
                .logo { 
                    font-size: 28px; 
                    font-weight: bold; 
                    color: #f59e0b; 
                    margin-bottom: 5px;
                }
                .warning-box { 
                    background: #fef3c7; 
                    border-left: 4px solid #f59e0b; 
                    padding: 20px; 
                    margin: 20px 0; 
                    border-radius: 4px;
                }
                .reason-box { 
                    background: #f8f9fa; 
                    padding: 15px; 
                    border-radius: 4px; 
                    margin: 15px 0;
                    border: 1px solid #dee2e6;
                }
                .button { 
                    display: inline-block; 
                    background: #f59e0b; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 500;
                    margin: 20px 0;
                }
                .footer { 
                    text-align: center; 
                    color: #666; 
                    font-size: 14px; 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 1px solid #eee;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">${COMPANY_NAME}</div>
                    <div style="color: #666; font-size: 16px;">Steel Construction Platform</div>
                </div>

                <div class="warning-box">
                    <h2 style="margin: 0 0 15px 0; color: #d97706;">Profile Review Required</h2>
                    <p style="margin: 0;">Hello <strong>${user.name}</strong>, your ${user.type} profile requires some updates before approval.</p>
                </div>

                ${reason ? `
                <div class="reason-box">
                    <h4 style="margin: 0 0 10px 0; color: #555;">Reason for Review:</h4>
                    <p style="margin: 0; color: #333;">${reason}</p>
                </div>
                ` : ''}

                <p>Please review and update your profile information, then resubmit for approval. Our team will review your updated profile as soon as possible.</p>

                <div style="text-align: center;">
                    <a href="${process.env.FRONTEND_URL || 'https://steelconnect.vercel.app'}/profile" class="button">Update Profile</a>
                </div>

                <div class="footer">
                    <p>If you have any questions about the review process, please contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
                </div>
            </div>
        </body>
        </html>
        `;

        const emailData = {
            from: FROM_EMAIL,
            to: [user.email],
            subject: `Profile Review Required - ${COMPANY_NAME}`,
            html: emailHTML,
        };

        const response = await resend.emails.send(emailData);
        
        if (response.error) {
            console.error('Profile rejection email error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`✅ Profile rejection email sent to ${user.email}`);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Profile rejection email error:', error);
        return { success: false, error: error.message };
    }
}

// Send password reset email
export async function sendPasswordResetEmail(email, resetToken) {
    try {
        console.log(`Sending password reset email to: ${email}`);

        const resetLink = `${process.env.FRONTEND_URL || 'https://steelconnect.vercel.app'}/reset-password?token=${resetToken}`;

        const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset - ${COMPANY_NAME}</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f4f4f4;
                }
                .container { 
                    max-width: 600px; 
                    margin: 20px auto; 
                    padding: 20px; 
                    background: white; 
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px solid #dc2626; 
                    padding-bottom: 20px; 
                    margin-bottom: 30px;
                }
                .logo { 
                    font-size: 28px; 
                    font-weight: bold; 
                    color: #dc2626; 
                    margin-bottom: 5px;
                }
                .alert-box { 
                    background: #fef2f2; 
                    border-left: 4px solid #dc2626; 
                    padding: 20px; 
                    margin: 20px 0; 
                    border-radius: 4px;
                }
                .button { 
                    display: inline-block; 
                    background: #dc2626; 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    font-weight: 500;
                    margin: 20px 0;
                }
                .footer { 
                    text-align: center; 
                    color: #666; 
                    font-size: 14px; 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 1px solid #eee;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">${COMPANY_NAME}</div>
                    <div style="color: #666; font-size: 16px;">Steel Construction Platform</div>
                </div>

                <div class="alert-box">
                    <h2 style="margin: 0 0 15px 0; color: #b91c1c;">Password Reset Request</h2>
                    <p style="margin: 0;">Someone requested a password reset for your ${COMPANY_NAME} account.</p>
                </div>

                <p>If this was you, click the button below to reset your password:</p>

                <div style="text-align: center;">
                    <a href="${resetLink}" class="button">Reset Password</a>
                </div>

                <p style="color: #666; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>

                <div style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <strong>Important:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                </div>

                <div class="footer">
                    <p>If you're having trouble with the button above, copy and paste this URL into your browser:</p>
                    <p style="word-break: break-all; font-size: 12px; color: #999;">${resetLink}</p>
                    <p>Contact us: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
                </div>
            </div>
        </body>
        </html>
        `;

        const emailData = {
            from: getFromField(),
            to: [email],
            subject: `Password Reset - ${COMPANY_NAME}`,
            html: emailHTML,
        };

        const response = await resend.emails.send(emailData);
        
        if (response.error) {
            console.error('Password reset email error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`✅ Password reset email sent to ${email}`);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Password reset email error:', error);
        return { success: false, error: error.message };
    }
}

export default {
    sendLoginNotification,
    sendProfileApprovalNotification,
    sendProfileRejectionNotification,
    sendPasswordResetEmail
};
