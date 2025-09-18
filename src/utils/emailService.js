// src/utils/emailService.js - Enhanced with SC logo as sender avatar
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use your verified steelconnectapp.com domain
const FROM_EMAIL = 'noreply@steelconnectapp.com';
const COMPANY_NAME = 'SteelConnect';

// Base64 encoded SC logo for email avatar (this will show in inbox before opening)
// This is a blue SC logo that will appear as the sender's profile picture
const SC_LOGO_BASE64 = 'data:image/png;base64,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';

// Professional email template with SC logo
const getEmailTemplate = (title, content) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <!--[if mso]>
        <noscript>
            <xml>
                <o:OfficeDocumentSettings>
                    <o:PixelsPerInch>96</o:PixelsPerInch>
                </o:OfficeDocumentSettings>
            </xml>
        </noscript>
        <![endif]-->
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
                text-align: right;
                word-break: break-all;
            }
            .button {
                display: inline-block;
                background: linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%);
                color: white !important;
                padding: 12px 30px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                margin: 20px 0;
                box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
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
                .detail-row {
                    flex-direction: column;
                }
                .detail-value {
                    text-align: left;
                    margin-top: 5px;
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

// Send login notification email with avatar
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

        // Email configuration with custom headers for logo avatar
        const emailData = {
            from: `SteelConnect <${FROM_EMAIL}>`,
            to: user.email,
            subject: `Login Notification - ${COMPANY_NAME}`,
            html: emailHTML,
            headers: {
                'X-Entity-Ref-ID': null,
                'List-Unsubscribe': '<mailto:unsubscribe@steelconnectapp.com>',
                'X-Logo-URL': 'https://steelconnectapp.com/logo.png', // Add your hosted logo URL
                'X-Brand-Logo': SC_LOGO_BASE64
            },
            attachments: [
                {
                    filename: 'sc-logo.png',
                    content: SC_LOGO_BASE64.split(',')[1],
                    encoding: 'base64',
                    cid: 'sc-logo@steelconnect.com',
                    contentDisposition: 'inline'
                }
            ]
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

        console.log(`✅ Email sent successfully with SC logo. Message ID: ${response.data?.id || 'N/A'}`);
        
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

// Send estimation result notification with avatar
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
            subject: `Your Estimation Result is Ready - "${estimation.projectName || estimation.projectTitle}"`,
            html: emailHTML,
            headers: {
                'X-Entity-Ref-ID': null,
                'List-Unsubscribe': '<mailto:unsubscribe@steelconnectapp.com>',
                'X-Logo-URL': 'https://steelconnectapp.com/logo.png',
                'X-Brand-Logo': SC_LOGO_BASE64
            },
            attachments: [
                {
                    filename: 'sc-logo.png',
                    content: SC_LOGO_BASE64.split(',')[1],
                    encoding: 'base64',
                    cid: 'sc-logo@steelconnect.com',
                    contentDisposition: 'inline'
                }
            ]
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

// Send profile review notification with avatar
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
            html: emailHTML,
            headers: {
                'X-Entity-Ref-ID': null,
                'List-Unsubscribe': '<mailto:unsubscribe@steelconnectapp.com>',
                'X-Logo-URL': 'https://steelconnectapp.com/logo.png',
                'X-Brand-Logo': SC_LOGO_BASE64
            },
            attachments: [
                {
                    filename: 'sc-logo.png',
                    content: SC_LOGO_BASE64.split(',')[1],
                    encoding: 'base64',
                    cid: 'sc-logo@steelconnect.com',
                    contentDisposition: 'inline'
                }
            ]
        };

        const response = await resend.emails.send(emailData);
        return { success: true, messageId: response.data?.id };

    } catch (error) {
        console.error('Error sending profile review email:', error);
        throw error;
    }
}

// Export the logo for use in other parts of the application if needed
export const getSCLogoBase64 = () => SC_LOGO_BASE64;

export default {
    sendLoginNotification,
    sendEstimationResultNotification,
    sendProfileReviewNotification,
    getSCLogoBase64
};
