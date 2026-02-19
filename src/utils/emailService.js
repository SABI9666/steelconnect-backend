
// src/utils/emailService.js - Inbox-optimized (avoid Gmail Promotions tab)
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'noreply@steelconnectapp.com';
const REPLY_TO = 'support@steelconnectapp.com';
const COMPANY_NAME = 'SteelConnect';

// ---------------------------------------------------------------------------
// INBOX-FRIENDLY PROFESSIONAL EMAIL TEMPLATE
// - Professional look with branded header (minimal, not heavy marketing)
// - Clean table-based layout for email client compatibility
// - Plain text alternative auto-generated
// - No gradients/box-shadows (Gmail flags these as promotional)
// - Single CTA button, personal tone, high text-to-HTML ratio
// ---------------------------------------------------------------------------
const getEmailTemplate = (content) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f5f7fa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7fa;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px; width:100%; background:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">

<!-- HEADER -->
<tr>
<td style="padding:24px 32px; border-bottom:2px solid #2563eb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="display:inline-block; background:#1e3a8a; color:#ffffff; font-weight:800; font-size:14px; padding:6px 10px; border-radius:6px; letter-spacing:0.5px; vertical-align:middle;">SC</span>
<span style="font-size:18px; font-weight:700; color:#1e3a8a; letter-spacing:-0.5px; margin-left:8px; vertical-align:middle;">SteelConnect</span>
</td>
</tr>
</table>
</td>
</tr>

<!-- CONTENT -->
<tr>
<td style="padding:28px 32px; font-size:15px; line-height:1.7; color:#334155;">
${content}
</td>
</tr>

<!-- FOOTER -->
<tr>
<td style="padding:20px 32px; border-top:1px solid #e2e8f0; font-size:13px; color:#94a3b8; line-height:1.6;">
<p style="margin:0 0 6px 0;">SteelConnect &mdash; Professional Steel Construction Platform</p>
<p style="margin:0;">Questions? Reply to this email or contact <a href="mailto:support@steelconnectapp.com" style="color:#2563eb; text-decoration:none;">support@steelconnectapp.com</a></p>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`;
};

// Strip HTML to create plain-text version (helps inbox placement)
function htmlToPlainText(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/h[1-6]>/gi, '\n\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '  - ')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<td[^>]*>/gi, ' | ')
        .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
        .replace(/<[^>]+>/g, '')
        .replace(/&mdash;/g, '—')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Core email sender with inbox-optimized defaults
async function sendEmail({ to, subject, htmlContent, textContent }) {
    const html = getEmailTemplate(htmlContent);
    const text = textContent || htmlToPlainText(html);

    const emailData = {
        from: `SteelConnect Team <${FROM_EMAIL}>`,
        reply_to: REPLY_TO,
        to,
        subject,
        html,
        text,
        headers: {
            'X-Entity-Ref-ID': crypto.randomUUID(),
        },
    };

    const response = await resend.emails.send(emailData);

    if (response.error) {
        console.error('Resend API error:', response.error);
        return { success: false, error: response.error };
    }

    console.log(`Email sent to ${to} — ID: ${response.data?.id || 'N/A'}`);
    return { success: true, messageId: response.data?.id };
}

// Reusable inline styles for email content (email clients strip <style> blocks)
const S = {
    h2: 'style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;"',
    p: 'style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;"',
    table: 'role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0;"',
    tdLabel: 'style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;"',
    tdValue: 'style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;"',
    btn: 'style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;"',
    notice: 'style="padding:14px 16px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:4px; margin:18px 0; font-size:14px; color:#78350f; line-height:1.6;"',
    success: 'style="padding:14px 16px; background:#f0fdf4; border-left:3px solid #22c55e; border-radius:4px; margin:18px 0; font-size:14px; color:#14532d; line-height:1.6;"',
    codeBox: 'style="text-align:center; margin:24px 0; padding:24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;"',
    code: 'style="font-size:34px; font-weight:700; letter-spacing:8px; color:#1e3a8a; font-family:Courier New,monospace; margin:0;"',
    codeLabel: 'style="margin:0 0 8px 0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:1.5px;"',
    muted: 'style="font-size:14px; color:#64748b; text-align:center; margin:0 0 14px 0;"',
};

// ============================================================
// LOGIN NOTIFICATION
// ============================================================
export async function sendLoginNotification(user, loginTime, clientIP, userAgent) {
    try {
        const htmlContent = `
<h2 ${S.h2}>Login Notification</h2>
<p ${S.p}>Hi ${user.name},</p>
<p ${S.p}>We detected a new login to your SteelConnect account. Here are the details:</p>
<table ${S.table}>
<tr><td ${S.tdLabel}>Account</td><td ${S.tdValue}>${user.email}</td></tr>
<tr><td ${S.tdLabel}>User Type</td><td ${S.tdValue}>${user.type.charAt(0).toUpperCase() + user.type.slice(1)}</td></tr>
<tr><td ${S.tdLabel}>Login Time</td><td ${S.tdValue}>${new Date(loginTime).toLocaleString()}</td></tr>
<tr><td ${S.tdLabel}>IP Address</td><td ${S.tdValue}>${clientIP}</td></tr>
<tr><td ${S.tdLabel}>Device</td><td ${S.tdValue}>${userAgent.substring(0, 50)}</td></tr>
</table>
<div ${S.notice}><strong>Security Notice:</strong> If this wasn't you, please change your password immediately and contact support.</div>
<p style="margin:20px 0;"><a href="https://steelconnectapp.com/dashboard" ${S.btn}>Go to Dashboard</a></p>`;

        return await sendEmail({
            to: user.email,
            subject: `Login Notification - ${COMPANY_NAME}`,
            htmlContent,
        });
    } catch (error) {
        console.error('Email service error:', error);
        return { success: false, error: error.message || 'Failed to send email' };
    }
}

// ============================================================
// ESTIMATION RESULT NOTIFICATION
// ============================================================
export async function sendEstimationResultNotification(contractor, estimation, resultFile) {
    try {
        const projectName = estimation.projectName || estimation.projectTitle;
        const htmlContent = `
<h2 ${S.h2}>Your Estimation Result is Ready</h2>
<p ${S.p}>Hi ${contractor.name},</p>
<p ${S.p}>The estimation for your project has been completed and is ready for download.</p>
<table ${S.table}>
<tr><td ${S.tdLabel}>Project</td><td ${S.tdValue}>${projectName}</td></tr>
<tr><td ${S.tdLabel}>Estimation ID</td><td ${S.tdValue}>#${estimation._id.substring(0, 8).toUpperCase()}</td></tr>
<tr><td ${S.tdLabel}>Submitted</td><td ${S.tdValue}>${new Date(estimation.createdAt).toLocaleDateString()}</td></tr>
<tr><td ${S.tdLabel}>Completed</td><td ${S.tdValue}>${new Date().toLocaleDateString()}</td></tr>
${resultFile ? `<tr><td ${S.tdLabel}>File</td><td ${S.tdValue}>${resultFile.name || 'Estimation_Result.pdf'}</td></tr>` : ''}
</table>
<div ${S.success}><strong>Ready for download</strong> — Your estimation document is available in your dashboard.</div>
<p style="margin:20px 0;"><a href="https://steelconnectapp.com/dashboard/estimations" ${S.btn}>View Estimation Result</a></p>
<p ${S.muted}>If you have questions about your result, just reply to this email.</p>`;

        return await sendEmail({
            to: contractor.email,
            subject: `Estimation Result Ready — "${projectName}"`,
            htmlContent,
        });
    } catch (error) {
        console.error('Error sending estimation result email:', error);
        throw error;
    }
}

// ============================================================
// PROFILE REVIEW NOTIFICATION (Approval / Rejection)
// ============================================================
export async function sendProfileReviewNotification(user, status, reason = null) {
    try {
        const isApproved = status === 'approved';

        const htmlContent = isApproved
            ? `
<h2 ${S.h2}>Your Profile Has Been Approved</h2>
<p ${S.p}>Hi ${user.name},</p>
<p ${S.p}>Great news — your SteelConnect profile has been reviewed and approved. You now have full access to all platform features.</p>
<div ${S.success}>Your profile is live. You can start using the platform right away.</div>
<p style="margin:20px 0;"><a href="https://steelconnectapp.com/dashboard" ${S.btn}>Go to Dashboard</a></p>`
            : `
<h2 ${S.h2}>Profile Review Update</h2>
<p ${S.p}>Hi ${user.name},</p>
<p ${S.p}>We reviewed your profile and need a few updates before we can approve it.</p>
${reason ? `<div ${S.notice}><strong>Reason:</strong> ${reason}</div>` : ''}
<p ${S.p}>Please log in and update your profile. It will be automatically resubmitted for review.</p>
<p style="margin:20px 0;"><a href="https://steelconnectapp.com/dashboard/profile" ${S.btn}>Update Your Profile</a></p>`;

        return await sendEmail({
            to: user.email,
            subject: isApproved
                ? `Profile Approved - Welcome to ${COMPANY_NAME}`
                : `Profile Review Update - ${COMPANY_NAME}`,
            htmlContent,
        });
    } catch (error) {
        console.error('Error sending profile review email:', error);
        throw error;
    }
}

// ============================================================
// PASSWORD RESET
// ============================================================
export async function sendPasswordResetEmail(user, resetToken, resetUrl) {
    try {
        const htmlContent = `
<h2 ${S.h2}>Password Reset Request</h2>
<p ${S.p}>Hi ${user.name},</p>
<p ${S.p}>We received a request to reset your SteelConnect password. Use the code below to proceed. It expires in <strong>15 minutes</strong>.</p>
<div ${S.codeBox}>
<p ${S.codeLabel}>Verification Code</p>
<p ${S.code}>${resetToken}</p>
</div>
<table ${S.table}>
<tr><td ${S.tdLabel}>Account</td><td ${S.tdValue}>${user.email}</td></tr>
<tr><td ${S.tdLabel}>Requested</td><td ${S.tdValue}>${new Date().toLocaleString()}</td></tr>
<tr><td ${S.tdLabel}>Expires</td><td ${S.tdValue}>15 minutes</td></tr>
</table>
<div ${S.notice}><strong>Security Notice:</strong> If you didn't request this, you can safely ignore this email. Your password has not been changed.</div>`;

        const textContent = `Password Reset Request\n\nHi ${user.name},\n\nYour verification code is: ${resetToken}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, ignore this email.\n\n— SteelConnect Team`;

        return await sendEmail({
            to: user.email,
            subject: `Password Reset Code - ${COMPANY_NAME}`,
            htmlContent,
            textContent,
        });
    } catch (error) {
        console.error('Password reset email error:', error);
        return { success: false, error: error.message || 'Failed to send password reset email' };
    }
}

// ============================================================
// 2FA OTP VERIFICATION
// ============================================================
export async function sendOTPVerificationEmail(user, otpCode, clientIP, userAgent) {
    try {
        const htmlContent = `
<h2 ${S.h2}>Login Verification Code</h2>
<p ${S.p}>Hi ${user.name},</p>
<p ${S.p}>A login attempt was made on your SteelConnect account. Enter the code below to verify your identity. It expires in <strong>5 minutes</strong>.</p>
<div ${S.codeBox}>
<p ${S.codeLabel}>Your Code</p>
<p ${S.code}>${otpCode}</p>
</div>
<p ${S.muted}>Do not share this code with anyone.</p>
<table ${S.table}>
<tr><td ${S.tdLabel}>Account</td><td ${S.tdValue}>${user.email}</td></tr>
<tr><td ${S.tdLabel}>Time</td><td ${S.tdValue}>${new Date().toLocaleString()}</td></tr>
<tr><td ${S.tdLabel}>IP Address</td><td ${S.tdValue}>${clientIP || 'Unknown'}</td></tr>
<tr><td ${S.tdLabel}>Device</td><td ${S.tdValue}>${(userAgent || 'Unknown').substring(0, 60)}</td></tr>
</table>
<div ${S.notice}><strong>Security Notice:</strong> If you did not attempt to log in, your password may be compromised. Change it immediately.</div>`;

        const textContent = `Login Verification Code\n\nHi ${user.name},\n\nYour verification code is: ${otpCode}\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\nIf you didn't attempt to log in, change your password immediately.\n\n— SteelConnect Team`;

        return await sendEmail({
            to: user.email,
            subject: `${otpCode} - Your SteelConnect Login Code`,
            htmlContent,
            textContent,
        });
    } catch (error) {
        console.error('OTP email error:', error);
        return { success: false, error: error.message || 'Failed to send OTP email' };
    }
}

// ============================================================
// PROFILE APPROVAL REQUEST (to Admin)
// ============================================================
export async function sendProfileApprovalRequestToAdmin(user, profileData) {
    const ADMIN_EMAIL = 'sabincn676@gmail.com';
    try {
        const htmlContent = `
<h2 ${S.h2}>New Profile Approval Request</h2>
<p ${S.p}>A user has submitted their profile for review on SteelConnect.</p>
<table ${S.table}>
<tr><td ${S.tdLabel}>Name</td><td ${S.tdValue}>${user.name || 'N/A'}</td></tr>
<tr><td ${S.tdLabel}>Email</td><td ${S.tdValue}>${user.email || 'N/A'}</td></tr>
<tr><td ${S.tdLabel}>Type</td><td ${S.tdValue}>${(user.type || 'N/A').charAt(0).toUpperCase() + (user.type || '').slice(1)}</td></tr>
<tr><td ${S.tdLabel}>Submitted</td><td ${S.tdValue}>${new Date().toLocaleString()}</td></tr>
${profileData.companyName ? `<tr><td ${S.tdLabel}>Company</td><td ${S.tdValue}>${profileData.companyName}</td></tr>` : ''}
${profileData.skills ? `<tr><td ${S.tdLabel}>Skills</td><td ${S.tdValue}>${Array.isArray(profileData.skills) ? profileData.skills.join(', ') : profileData.skills}</td></tr>` : ''}
${profileData.experience ? `<tr><td ${S.tdLabel}>Experience</td><td ${S.tdValue}>${profileData.experience}</td></tr>` : ''}
</table>
<p style="margin:20px 0;"><a href="https://steelconnectapp.com/admin" ${S.btn}>Review in Admin Panel</a></p>`;

        return await sendEmail({
            to: ADMIN_EMAIL,
            subject: `Profile Review: ${user.name || user.email} (${(user.type || '').charAt(0).toUpperCase() + (user.type || '').slice(1)})`,
            htmlContent,
        });
    } catch (error) {
        console.error('Admin profile approval email error:', error);
        return { success: false, error: error.message || 'Failed to send admin notification email' };
    }
}

// ============================================================
// MARKETING EMAIL (inbox-optimized: personal sender, List-Unsubscribe)
// ============================================================
export async function sendMarketingEmail(recipientEmail, recipientName, subject, htmlBody) {
    try {
        const htmlContent = htmlBody;
        const html = getEmailTemplate(htmlContent);
        const text = htmlToPlainText(html);

        const { data, error } = await resend.emails.send({
            from: `SteelConnect <${FROM_EMAIL}>`,
            reply_to: REPLY_TO,
            to: recipientEmail,
            subject,
            html,
            text,
            headers: {
                'X-Entity-Ref-ID': crypto.randomUUID(),
                'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
        });

        if (error) {
            console.error(`[EMAIL] Marketing email failed for ${recipientEmail}:`, error);
            return { success: false, error: error.message };
        }
        console.log(`[EMAIL] Marketing email sent to ${recipientEmail}: ${data?.id}`);
        return { success: true, emailId: data?.id };
    } catch (error) {
        console.error(`[EMAIL] Marketing email error for ${recipientEmail}:`, error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================
// GENERIC sendEmail (used by adminController for approval/rejection)
// ============================================================
export async function sendGenericEmail({ to, subject, html: rawHtml }) {
    try {
        const htmlContent = rawHtml;
        const wrappedHtml = getEmailTemplate(htmlContent);
        const text = htmlToPlainText(wrappedHtml);

        const { data, error } = await resend.emails.send({
            from: `SteelConnect Team <${FROM_EMAIL}>`,
            reply_to: REPLY_TO,
            to,
            subject,
            html: wrappedHtml,
            text,
            headers: {
                'X-Entity-Ref-ID': crypto.randomUUID(),
            },
        });

        if (error) {
            console.error('sendGenericEmail error:', error);
            return { success: false, error: error.message };
        }
        console.log(`Generic email sent to ${to}: ${data?.id}`);
        return { success: true, emailId: data?.id };
    } catch (error) {
        console.error('sendGenericEmail exception:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================
// BULK OUTREACH EMAIL — Inbox-optimized (avoids Promotions tab)
// ============================================================
// Key inbox placement techniques:
// 1. Sent from a person name, not brand name
// 2. Minimal HTML — looks like a personal email, not a newsletter
// 3. No images, gradients, or heavy formatting
// 4. High plain-text-to-HTML ratio
// 5. Conversational tone, not marketing speak
// 6. Single link only (fewer links = less promotional)
// 7. Proper Reply-To so replies go to real mailbox
// 8. No List-Unsubscribe header (personal emails don't have it)
// 9. Short subject line, no caps or exclamation marks
// ============================================================
export async function sendBulkOutreachEmail({ to, subject, htmlBody, textBody }) {
    try {
        // Wrap in a minimal personal-style email shell (no heavy branding)
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px;">
<tr><td style="font-size:15px;line-height:1.75;color:#1a1a1a;">
${htmlBody}
</td></tr>
</table>
</body></html>`;

        const text = textBody || htmlToPlainText(html);

        const { data, error } = await resend.emails.send({
            from: `Sabi from SteelConnect <${FROM_EMAIL}>`,
            reply_to: REPLY_TO,
            to,
            subject,
            html,
            text,
            headers: {
                'X-Entity-Ref-ID': crypto.randomUUID(),
                'X-Mailer': 'SteelConnect',
                'Precedence': 'bulk',
            },
        });

        if (error) {
            console.error(`[BULK-OUTREACH] Failed for ${to}:`, error);
            return { success: false, error: error.message };
        }
        return { success: true, emailId: data?.id };
    } catch (error) {
        console.error(`[BULK-OUTREACH] Exception for ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

export default {
    sendLoginNotification,
    sendEstimationResultNotification,
    sendProfileReviewNotification,
    sendPasswordResetEmail,
    sendOTPVerificationEmail,
    sendProfileApprovalRequestToAdmin,
    sendMarketingEmail,
    sendGenericEmail,
};
