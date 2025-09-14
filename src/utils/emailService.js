// src/utils/emailService.js - Use your verified domain
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified steelconnectapp.com domain
const FROM_EMAIL = 'noreply@steelconnectapp.com'; // Your verified domain
const COMPANY_NAME = 'SteelConnect';

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
                }
                .detail-value { 
                    color: #333; 
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
                </div>

                <div style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin: 20px 0;">
                    <strong>Security Notice:</strong> If this login wasn't you, please contact our support team immediately.
                </div>

                <div class="footer">
                    <p>This is an automated security notification from ${COMPANY_NAME}.</p>
                    <p>© ${new Date().getFullYear()} ${COMPANY_NAME} - All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        // Simple email data - no complex formatting
        const emailData = {
            from: FROM_EMAIL,
            to: user.email,  // Single string, not array
            subject: `Login Notification - ${COMPANY_NAME}`,
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

// *** NEW FUNCTION ***
// Send estimation result notification
export async function sendEstimationResultNotification(contractor, estimation) {
    try {
        console.log(`Attempting to send estimation result email to: ${contractor.email}`);

        const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Estimation Result Ready - ${COMPANY_NAME}</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
                .content { padding: 10px 0; }
                .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
                .info-box { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
                .info-label { font-weight: bold; color: #555; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">${COMPANY_NAME}</div>
                </div>

                <div class="content">
                    <h2 style="color: #333;">Estimation Result Ready</h2>
                    <p>Hello <strong>${contractor.name}</strong>,</p>
                    <p>The estimation result for your project is now available. You can view and download the result from your dashboard.</p>
                    
                    <div class="info-box">
                        <p><span class="info-label">Project Title:</span> ${estimation.title}</p>
                        <p><span class="info-label">Estimation ID:</span> ${estimation.id}</p>
                        ${estimation.amount ? `<p><span class="info-label">Estimated Amount:</span> $${estimation.amount.toFixed(2)}</p>` : ''}
                    </div>

                    <p>Thank you for using ${COMPANY_NAME}.</p>
                </div>

                <div class="footer">
                    <p>This is an automated notification from ${COMPANY_NAME}.</p>
                    <p>© ${new Date().getFullYear()} ${COMPANY_NAME} - All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const emailData = {
            from: FROM_EMAIL,
            to: contractor.email,
            subject: `Your Estimation Result is Ready: "${estimation.title}"`,
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

export default {
    sendLoginNotification,
    sendEstimationResultNotification // Export the new function
};
