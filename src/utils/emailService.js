// src/services/emailService.js - Updated for domain verification
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Update your from address to use your verified domain
const FROM_ADDRESS = 'noreply@steelconnect.com'; // Replace with your verified domain
const FALLBACK_FROM = 'sabincn676@gmail.com'; // Your verified email for testing

class EmailService {
    static async sendEmail(to, subject, htmlContent, textContent = '') {
        try {
            // Use verified domain email or fallback for testing
            const fromAddress = process.env.NODE_ENV === 'production' 
                ? FROM_ADDRESS 
                : FALLBACK_FROM;

            console.log(`Attempting to send email from: ${fromAddress} to: ${to}`);

            const emailData = {
                from: fromAddress,
                to: Array.isArray(to) ? to : [to],
                subject,
                html: htmlContent,
            };

            // Add text content if provided
            if (textContent) {
                emailData.text = textContent;
            }

            const response = await resend.emails.send(emailData);

            console.log('Email sent successfully:', response);
            return { success: true, messageId: response.id };

        } catch (error) {
            console.error('Email sending failed:', error);
            
            // More detailed error handling
            if (error.message && error.message.includes('testing emails')) {
                console.log('Domain not verified - using fallback email');
                
                // Try again with fallback email for testing
                try {
                    const fallbackResponse = await resend.emails.send({
                        from: FALLBACK_FROM,
                        to: [FALLBACK_FROM], // Send to yourself for testing
                        subject: `[TEST] ${subject} - Original recipient: ${to}`,
                        html: `
                            <p><strong>This email was originally intended for:</strong> ${to}</p>
                            <hr>
                            ${htmlContent}
                        `,
                    });
                    
                    console.log('Fallback email sent:', fallbackResponse);
                    return { success: true, messageId: fallbackResponse.id, note: 'Sent to fallback email' };
                    
                } catch (fallbackError) {
                    console.error('Fallback email also failed:', fallbackError);
                    return { success: false, error: fallbackError.message };
                }
            }
            
            return { success: false, error: error.message };
        }
    }

    // Login notification email
    static async sendLoginNotification(userEmail, loginData) {
        const subject = 'Security Alert: Login to Your SteelConnect Account';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                    .header { background: #1f2937; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .alert { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; }
                    .info { background: #f0f9ff; border: 1px solid #bae6fd; padding: 10px; border-radius: 5px; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>SteelConnect Security Alert</h1>
                </div>
                <div class="content">
                    <div class="alert">
                        <h2>New Login Detected</h2>
                        <p>We detected a new login to your SteelConnect account.</p>
                    </div>
                    
                    <div class="info">
                        <h3>Login Details:</h3>
                        <p><strong>Email:</strong> ${userEmail}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        <p><strong>IP Address:</strong> ${loginData.ip || 'Unknown'}</p>
                        <p><strong>Location:</strong> ${loginData.location || 'Unknown'}</p>
                    </div>
                    
                    <p>If this was you, no action is required. If you don't recognize this login, please secure your account immediately.</p>
                    
                    <p>Best regards,<br>SteelConnect Security Team</p>
                </div>
            </body>
            </html>
        `;

        const textContent = `
            SteelConnect Security Alert
            
            New Login Detected
            We detected a new login to your SteelConnect account.
            
            Login Details:
            Email: ${userEmail}
            Time: ${new Date().toLocaleString()}
            IP Address: ${loginData.ip || 'Unknown'}
            Location: ${loginData.location || 'Unknown'}
            
            If this was you, no action is required. If you don't recognize this login, please secure your account immediately.
            
            Best regards,
            SteelConnect Security Team
        `;

        return await this.sendEmail(userEmail, subject, htmlContent, textContent);
    }

    // Welcome email
    static async sendWelcomeEmail(userEmail, userName) {
        const subject = 'Welcome to SteelConnect!';
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                    .header { background: #1f2937; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .welcome { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Welcome to SteelConnect</h1>
                </div>
                <div class="content">
                    <div class="welcome">
                        <h2>Hello ${userName}!</h2>
                        <p>Welcome to SteelConnect. We're excited to have you on board!</p>
                    </div>
                    
                    <p>You can now access all our services and manage your projects through our platform.</p>
                    
                    <p>If you have any questions, feel free to reach out to our support team.</p>
                    
                    <p>Best regards,<br>The SteelConnect Team</p>
                </div>
            </body>
            </html>
        `;

        return await this.sendEmail(userEmail, subject, htmlContent);
    }

    // Job notification email
    static async sendJobNotification(userEmail, jobData, type = 'update') {
        const subject = `Job ${type.charAt(0).toUpperCase() + type.slice(1)}: ${jobData.title}`;
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                    .header { background: #1f2937; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .job-info { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Job ${type.charAt(0).toUpperCase() + type.slice(1)}</h1>
                </div>
                <div class="content">
                    <div class="job-info">
                        <h2>${jobData.title}</h2>
                        <p><strong>Status:</strong> ${jobData.status}</p>
                        <p><strong>Description:</strong> ${jobData.description}</p>
                        ${jobData.estimatedCost ? `<p><strong>Estimated Cost:</strong> $${jobData.estimatedCost}</p>` : ''}
                    </div>
                    
                    <p>Thank you for using SteelConnect!</p>
                    
                    <p>Best regards,<br>The SteelConnect Team</p>
                </div>
            </body>
            </html>
        `;

        return await this.sendEmail(userEmail, subject, htmlContent);
    }
}

export { EmailService };
