// src/utils/emailService.js - Enhanced email service with Resend API
import { Resend } from 'resend';

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const EMAIL_CONFIG = {
    fromEmail: 'SteelConnect <noreply@steelconnect.com>',
    fallbackFromEmail: 'SteelConnect <notifications@your-domain.com>', // Update with your verified domain
};

// Generic email sending function
export async function sendEmail(to, subject, htmlContent, textContent = '') {
    try {
        console.log(`Attempting to send email to: ${to}`);
        console.log(`Subject: ${subject}`);

        if (!process.env.RESEND_API_KEY) {
            console.warn('RESEND_API_KEY not configured. Email will be logged only.');
            console.log(`Email content: ${htmlContent}`);
            return { success: true, message: 'Email logged (Resend API key not configured)' };
        }

        const emailData = {
            from: EMAIL_CONFIG.fromEmail,
            to: [to],
            subject: subject,
            html: htmlContent,
            ...(textContent && { text: textContent })
        };

        const result = await resend.emails.send(emailData);

        if (result.error) {
            console.error('Resend API error:', result.error);
            return { success: false, error: result.error.message };
        }

        console.log('Email sent successfully via Resend API');
        console.log('Email ID:', result.data?.id);
        
        return { 
            success: true, 
            message: 'Email sent successfully', 
            emailId: result.data?.id 
        };

    } catch (error) {
        console.error('Email service error:', error);
        
        // Log email content for debugging in case of API failure
        console.log('Failed email content:', {
            to,
            subject,
            htmlContent: htmlContent.substring(0, 200) + '...'
        });
        
        return { success: false, error: error.message };
    }
}

// Login notification email
export async function sendLoginNotification(user, loginTime, clientIP, userAgent) {
    try {
        const subject = 'Login Notification - SteelConnect';
        const loginDate = new Date(loginTime).toLocaleString();
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login Notification</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                    .logo { font-size: 24px; font-weight: bold; }
                    h1 { margin: 0; font-size: 28px; }
                    h2 { color: #333; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🏗️ SteelConnect</div>
                        <h1>Login Notification</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${user.name},</h2>
                        <p>You have successfully logged in to your SteelConnect portal.</p>
                        
                        <div class="info-box">
                            <h3>Login Details:</h3>
                            <p><strong>Time:</strong> ${loginDate}</p>
                            <p><strong>IP Address:</strong> ${clientIP}</p>
                            <p><strong>User Agent:</strong> ${userAgent}</p>
                        </div>
                        
                        <p>If this wasn't you, please contact our support team immediately.</p>
                        
                        <p>Thank you for using SteelConnect!</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email from SteelConnect. Please do not reply to this email.</p>
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const textContent = `
Hello ${user.name},

You have successfully logged in to your SteelConnect portal.

Login Details:
- Time: ${loginDate}
- IP Address: ${clientIP}
- User Agent: ${userAgent}

If this wasn't you, please contact our support team immediately.

Thank you for using SteelConnect!

This is an automated email from SteelConnect. Please do not reply to this email.
        `;

        const result = await sendEmail(user.email, subject, htmlContent, textContent);
        
        if (result.success) {
            console.log(`Login notification sent successfully to ${user.email}`);
        } else {
            console.error(`Failed to send login notification to ${user.email}:`, result.error);
        }
        
        return result;

    } catch (error) {
        console.error('Login notification error:', error);
        return { success: false, error: error.message };
    }
}

// Estimation result notification email
export async function sendEstimationResultNotification(user, estimationData) {
    try {
        const subject = 'Estimation Result Available - SteelConnect';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Estimation Result Available</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
                    .cta-button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                    .logo { font-size: 24px; font-weight: bold; }
                    h1 { margin: 0; font-size: 28px; }
                    h2 { color: #333; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🏗️ SteelConnect</div>
                        <h1>Estimation Result Ready!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${user.name || 'Valued Customer'},</h2>
                        <p>Great news! Your estimation result is now available for download.</p>
                        
                        <div class="info-box">
                            <h3>Project Details:</h3>
                            <p><strong>Project Title:</strong> ${estimationData.projectTitle}</p>
                            ${estimationData.estimatedAmount ? `<p><strong>Estimated Cost:</strong> $${estimationData.estimatedAmount.toLocaleString()}</p>` : ''}
                            <p><strong>Submitted:</strong> ${new Date(estimationData.createdAt).toLocaleDateString()}</p>
                            <p><strong>Status:</strong> Completed</p>
                        </div>
                        
                        <p>Please login to your SteelConnect portal to view and download your detailed estimation report.</p>
                        
                        <div style="text-align: center;">
                            <a href="#" class="cta-button">Login to View Result</a>
                        </div>
                        
                        <p>If you have any questions about your estimation, please don't hesitate to contact our support team.</p>
                        
                        <p>Thank you for choosing SteelConnect for your project estimation needs!</p>
                    </div>
                    <div class="footer">
                        <p>This is an automated email from SteelConnect. Please do not reply to this email.</p>
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const textContent = `
Hello ${user.name || 'Valued Customer'},

Great news! Your estimation result is now available for download.

Project Details:
- Project Title: ${estimationData.projectTitle}
${estimationData.estimatedAmount ? `- Estimated Cost: $${estimationData.estimatedAmount.toLocaleString()}` : ''}
- Submitted: ${new Date(estimationData.createdAt).toLocaleDateString()}
- Status: Completed

Please login to your SteelConnect portal to view and download your detailed estimation report.

If you have any questions about your estimation, please don't hesitate to contact our support team.

Thank you for choosing SteelConnect for your project estimation needs!

This is an automated email from SteelConnect. Please do not reply to this email.
        `;

        const result = await sendEmail(user.email, subject, htmlContent, textContent);
        
        if (result.success) {
            console.log(`Estimation result notification sent successfully to ${user.email}`);
        } else {
            console.error(`Failed to send estimation result notification to ${user.email}:`, result.error);
        }
        
        return result;

    } catch (error) {
        console.error('Estimation result notification error:', error);
        return { success: false, error: error.message };
    }
}

// Welcome email (keeping existing functionality)
export async function sendWelcomeEmail(userEmail, userName) {
    try {
        const subject = 'Welcome to SteelConnect!';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Welcome to SteelConnect</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                    .logo { font-size: 24px; font-weight: bold; }
                    h1 { margin: 0; font-size: 28px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="logo">🏗️ SteelConnect</div>
                        <h1>Welcome to SteelConnect!</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName},</h2>
                        <p>Welcome to SteelConnect! Your account has been created successfully.</p>
                        <p>Please complete your profile to unlock all platform features.</p>
                        <p>Thank you for joining our professional network!</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return await sendEmail(userEmail, subject, htmlContent);
        
    } catch (error) {
        console.error('Welcome email error:', error);
        return { success: false, error: error.message };
    }
}

// Job notification email (keeping existing functionality)
export async function sendJobNotification(userEmail, jobData, type = 'update') {
    try {
        const subject = `Job ${type.charAt(0).toUpperCase() + type.slice(1)} - SteelConnect`;
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Job Notification</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Job ${type.charAt(0).toUpperCase() + type.slice(1)}</h1>
                    </div>
                    <div class="content">
                        <h2>Job: ${jobData.title || 'Unknown'}</h2>
                        <p>There has been an ${type} to your job on SteelConnect.</p>
                        <p>Please login to your portal for more details.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 SteelConnect. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return await sendEmail(userEmail, subject, htmlContent);
        
    } catch (error) {
        console.error('Job notification error:', error);
        return { success: false, error: error.message };
    }
}

// Default export for compatibility
export default {
    sendEmail,
    sendLoginNotification,
    sendEstimationResultNotification,
    sendWelcomeEmail,
    sendJobNotification
};
