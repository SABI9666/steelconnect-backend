// src/services/adminActivityReportService.js
// Sends real-time email & WhatsApp notifications when ANY activity occurs
// (admin actions, user activities like registrations/logins/jobs/quotes/estimations).
// Every activity triggers an immediate alert INCLUDING visitor analytics summary.

import { getRecentActivities } from './adminActivityLogger.js';
import { getVisitorAnalyticsSummary } from './userActivityLogger.js';

const ADMIN_REPORT_EMAIL = 'sabincn676@gmail.com';
const ADMIN_WHATSAPP_NUMBER = '919895909666'; // India country code + number
const ADMIN_PHONE_NUMBER = '9895909666';

// ─── Category colours (for email badges) ─────────────────────────────────────
const CATEGORY_COLORS = {
    'User Management':     { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    'Profile Review':      { bg: '#dcfce7', text: '#166534', border: '#86efac' },
    'Estimation':          { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    'Support':             { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
    'Marketing':           { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
    'Community':           { bg: '#f3e8ff', text: '#6b21a8', border: '#c084fc' },
    'Announcements':       { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
    'Business Analytics':  { bg: '#fff7ed', text: '#9a3412', border: '#fdba74' },
    'System Admin':        { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
    'Operations Portal':   { bg: '#f0f9ff', text: '#075985', border: '#7dd3fc' },
    'Dashboard':           { bg: '#f5f3ff', text: '#5b21b6', border: '#a78bfa' },
    'Bulk Email':          { bg: '#fdf4ff', text: '#86198f', border: '#e879f9' },
    'Messaging':           { bg: '#f0fdfa', text: '#134e4a', border: '#5eead4' },
    'Chatbot':             { bg: '#fffbeb', text: '#78350f', border: '#fbbf24' },
    'Jobs':                { bg: '#f1f5f9', text: '#334155', border: '#94a3b8' },
    'Quotes':              { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
    // User activity categories
    'User Registration':   { bg: '#dbeafe', text: '#1e40af', border: '#60a5fa' },
    'User Login':          { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
    'Profile Completion':  { bg: '#fef3c7', text: '#92400e', border: '#fbbf24' },
    'Job Posting':         { bg: '#e0e7ff', text: '#3730a3', border: '#818cf8' },
    'Quote Submission':    { bg: '#fce7f3', text: '#9d174d', border: '#f472b6' },
    'Estimation Request':  { bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
    'User Message':        { bg: '#f0fdfa', text: '#134e4a', border: '#2dd4bf' },
    'Visitor Activity':    { bg: '#ecfdf5', text: '#065f46', border: '#6ee7b7' },
    'Default':             { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
};

// ─── Build visitor analytics HTML section ────────────────────────────────────

function buildVisitorAnalyticsHTML(visitorStats) {
    if (!visitorStats || visitorStats.todayTotal === 0) {
        return `
<div style="margin:20px 0; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
    <h3 style="font-size:16px; font-weight:700; color:#0f172a; margin:0 0 8px 0;">Visitor Analytics (Today)</h3>
    <p style="font-size:14px; color:#64748b; margin:0;">No visitor sessions recorded today.</p>
</div>`;
    }

    const avgMinutes = Math.floor(visitorStats.avgTimeSeconds / 60);
    const avgSeconds = visitorStats.avgTimeSeconds % 60;

    let recentVisitorsHTML = '';
    if (visitorStats.recentVisitors && visitorStats.recentVisitors.length > 0) {
        const rows = visitorStats.recentVisitors.map(v => {
            const timeStr = new Date(v.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const mins = Math.floor(v.timeSpent / 60);
            return `<tr>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#334155;">${v.email}</td>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#64748b;">${v.country}${v.city ? ', ' + v.city : ''}</td>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#64748b;">${v.device} / ${v.browser}</td>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#64748b;">${mins}m</td>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#64748b;">${v.pages} pages</td>
                <td style="padding:6px 10px; font-size:12px; border-bottom:1px solid #f1f5f9; color:#64748b;">${timeStr}</td>
            </tr>`;
        }).join('');

        recentVisitorsHTML = `
        <h4 style="font-size:14px; font-weight:600; color:#334155; margin:14px 0 8px 0;">Recent Visitors</h4>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px;">
            <tr style="background:#f1f5f9;">
                <td style="padding:6px 10px; font-weight:600; color:#475569;">Visitor</td>
                <td style="padding:6px 10px; font-weight:600; color:#475569;">Location</td>
                <td style="padding:6px 10px; font-weight:600; color:#475569;">Device</td>
                <td style="padding:6px 10px; font-weight:600; color:#475569;">Time</td>
                <td style="padding:6px 10px; font-weight:600; color:#475569;">Pages</td>
                <td style="padding:6px 10px; font-weight:600; color:#475569;">At</td>
            </tr>
            ${rows}
        </table>`;
    }

    const topCountriesHTML = visitorStats.topCountries.length > 0
        ? visitorStats.topCountries.map(([country, count]) =>
            `<span style="display:inline-block; padding:2px 8px; margin:2px; background:#ecfdf5; color:#065f46; border-radius:10px; font-size:11px;">${country}: ${count}</span>`
        ).join('')
        : '<span style="color:#94a3b8; font-size:12px;">N/A</span>';

    return `
<div style="margin:20px 0; padding:16px; background:#f0f9ff; border-radius:8px; border:1px solid #bae6fd;">
    <h3 style="font-size:16px; font-weight:700; color:#0c4a6e; margin:0 0 12px 0;">Visitor Analytics Summary</h3>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:12px;">
        <tr>
            <td style="width:25%; text-align:center; padding:10px;">
                <div style="font-size:24px; font-weight:800; color:#0369a1;">${visitorStats.todayTotal}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Today</div>
            </td>
            <td style="width:25%; text-align:center; padding:10px;">
                <div style="font-size:24px; font-weight:800; color:#059669;">${visitorStats.activeNow}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Active Now</div>
            </td>
            <td style="width:25%; text-align:center; padding:10px;">
                <div style="font-size:24px; font-weight:800; color:#7c3aed;">${visitorStats.last24hTotal}</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Last 24h</div>
            </td>
            <td style="width:25%; text-align:center; padding:10px;">
                <div style="font-size:24px; font-weight:800; color:#ea580c;">${avgMinutes}m ${avgSeconds}s</div>
                <div style="font-size:11px; color:#64748b; margin-top:2px;">Avg. Time</div>
            </td>
        </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
            <td style="padding:4px 10px; font-size:13px; color:#64748b;">Identified Visitors:</td>
            <td style="padding:4px 10px; font-size:13px; color:#1e293b; font-weight:600;">${visitorStats.identifiedVisitors} of ${visitorStats.todayTotal}</td>
        </tr>
        <tr>
            <td style="padding:4px 10px; font-size:13px; color:#64748b;">Devices:</td>
            <td style="padding:4px 10px; font-size:13px; color:#1e293b;">Desktop: ${visitorStats.devices.Desktop || 0} | Mobile: ${visitorStats.devices.Mobile || 0} | Tablet: ${visitorStats.devices.Tablet || 0}</td>
        </tr>
        <tr>
            <td style="padding:4px 10px; font-size:13px; color:#64748b;">Top Countries:</td>
            <td style="padding:4px 10px;">${topCountriesHTML}</td>
        </tr>
    </table>

    ${recentVisitorsHTML}
</div>`;
}

// ─── Build email HTML for a single activity (admin or user) ──────────────────

function buildActivityEmailHTML(activity, source = 'admin') {
    const colors = CATEGORY_COLORS[activity.category] || CATEGORY_COLORS['Default'];
    const time = activity.timestamp
        ? new Date(activity.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'medium'
        })
        : new Date().toLocaleString();

    const isUserActivity = source === 'user';
    const personLabel = isUserActivity
        ? (activity.userEmail || activity.userName || 'Unknown User')
        : (activity.adminEmail || 'system');
    const titleLabel = isUserActivity ? 'Platform Activity Alert' : 'Admin Activity Alert';
    const introText = isUserActivity
        ? 'A user activity was just detected on SteelConnect:'
        : 'An admin action was just performed on SteelConnect:';

    return `
<h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">${titleLabel}</h2>
<p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">
    ${introText}
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0;">
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:35%;">Category</td>
        <td style="padding:10px 14px; font-size:14px; border-bottom:1px solid #f1f5f9;">
            <span style="display:inline-block; padding:3px 12px; border-radius:12px; background:${colors.bg}; color:${colors.text}; font-size:13px; font-weight:600;">${activity.category || 'Other'}</span>
        </td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Action</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; font-weight:700; border-bottom:1px solid #f1f5f9;">${activity.action || 'N/A'}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Description</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${activity.description || 'N/A'}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">${isUserActivity ? 'User' : 'Admin'}</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${personLabel}${activity.userType ? ' (' + activity.userType + ')' : ''}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Time</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${time}</td>
    </tr>
    ${activity.method ? `<tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Method</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${activity.method} ${activity.endpoint || ''}</td>
    </tr>` : ''}
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">IP Address</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${activity.ip || 'N/A'}</td>
    </tr>
</table>`;
}

// ─── Full email wrapper ──────────────────────────────────────────────────────
function buildFullEmailHTML(content) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f5f7fa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f7fa;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">
<tr>
<td style="padding:24px 32px; border-bottom:2px solid #2563eb;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td>
<span style="display:inline-block; background:#1e3a8a; color:#ffffff; font-weight:800; font-size:14px; padding:6px 10px; border-radius:6px; letter-spacing:0.5px; vertical-align:middle;">SC</span>
<span style="font-size:18px; font-weight:700; color:#1e3a8a; letter-spacing:-0.5px; margin-left:8px; vertical-align:middle;">SteelConnect</span>
</td>
<td style="text-align:right;">
<span style="font-size:11px; color:#94a3b8;">Activity Monitor</span>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:28px 32px; font-size:15px; line-height:1.7; color:#334155;">
${content}
</td>
</tr>
<tr>
<td style="padding:20px 32px; border-top:1px solid #e2e8f0; font-size:13px; color:#94a3b8; line-height:1.6;">
<p style="margin:0 0 6px 0;">SteelConnect &mdash; Professional Steel Construction Platform</p>
<p style="margin:0;">Real-time activity + visitor monitoring. Notifications: ${ADMIN_REPORT_EMAIL} | ${ADMIN_PHONE_NUMBER}</p>
<p style="margin:4px 0 0 0;">Contact <a href="mailto:support@steelconnectapp.com" style="color:#2563eb; text-decoration:none;">support@steelconnectapp.com</a> for questions.</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Build WhatsApp message body (supports both admin and user activities) ───

function buildWhatsAppMessage(activity, source = 'admin', visitorStats = null) {
    const time = activity.timestamp
        ? new Date(activity.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        })
        : new Date().toLocaleString();

    const isUser = source === 'user';
    const personLabel = isUser
        ? (activity.userEmail || activity.userName || 'Unknown')
        : (activity.adminEmail || 'system');
    const alertTitle = isUser ? 'Platform Activity Alert' : 'Admin Activity Alert';

    let msg = `*SteelConnect ${alertTitle}*

*Category:* ${activity.category || 'Other'}
*Action:* ${activity.action || 'N/A'}
*Description:* ${activity.description || 'N/A'}
*${isUser ? 'User' : 'Admin'}:* ${personLabel}${activity.userType ? ' (' + activity.userType + ')' : ''}
*Time:* ${time}
*IP:* ${activity.ip || 'N/A'}`;

    if (visitorStats && visitorStats.todayTotal > 0) {
        msg += `

--- Visitor Stats ---
*Today:* ${visitorStats.todayTotal} visitors
*Active Now:* ${visitorStats.activeNow}
*Last 24h:* ${visitorStats.last24hTotal}
*Identified:* ${visitorStats.identifiedVisitors}
*Avg Time:* ${Math.floor(visitorStats.avgTimeSeconds / 60)}m ${visitorStats.avgTimeSeconds % 60}s`;
    }

    msg += `

_Real-time alert from SteelConnect Monitoring_`;

    return msg;
}

// ─── Send WhatsApp notification via WhatsApp Business Cloud API ──────────────
// Strategy: Try text message first. If it fails with error 131047 (24-hour window
// not open), fall back to the pre-approved "hello_world" template which works anytime.

async function sendWhatsAppNotification(activity, source = 'admin', visitorStats = null) {
    try {
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneNumberId || !accessToken) {
            console.log('[ADMIN-ALERT] WhatsApp not configured (missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN). Skipping.');
            return { success: false, error: 'WhatsApp not configured' };
        }

        const messageBody = buildWhatsAppMessage(activity, source, visitorStats);
        const apiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };

        // Attempt 1: Send as text message (works within 24-hour conversation window)
        console.log(`[ADMIN-ALERT] Attempting text message to ${ADMIN_WHATSAPP_NUMBER}...`);
        const textResponse = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: ADMIN_WHATSAPP_NUMBER,
                type: 'text',
                text: { preview_url: false, body: messageBody }
            })
        });

        const textData = await textResponse.json();

        if (textResponse.ok && textData.messages) {
            console.log(`[ADMIN-ALERT] WhatsApp TEXT sent to ${ADMIN_WHATSAPP_NUMBER} — ID: ${textData.messages[0]?.id}`);
            return { success: true, messageId: textData.messages[0]?.id, method: 'text' };
        }

        // Log the error for debugging
        const errorCode = textData.error?.code;
        const errorMsg = textData.error?.message || 'Unknown';
        console.log(`[ADMIN-ALERT] Text message failed (code: ${errorCode}): ${errorMsg}`);

        // Attempt 2: Fall back to template message (works without 24-hour window)
        // "hello_world" is a pre-approved template that comes with every WhatsApp Business account
        console.log(`[ADMIN-ALERT] Falling back to template message...`);
        const templateResponse = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: ADMIN_WHATSAPP_NUMBER,
                type: 'template',
                template: {
                    name: 'hello_world',
                    language: { code: 'en_US' }
                }
            })
        });

        const templateData = await templateResponse.json();

        if (templateResponse.ok && templateData.messages) {
            console.log(`[ADMIN-ALERT] WhatsApp TEMPLATE sent to ${ADMIN_WHATSAPP_NUMBER} — ID: ${templateData.messages[0]?.id}`);
            return { success: true, messageId: templateData.messages[0]?.id, method: 'template' };
        }

        // Both attempts failed — log full errors for debugging
        console.error('[ADMIN-ALERT] WhatsApp BOTH attempts failed.');
        console.error('[ADMIN-ALERT] Text error:', JSON.stringify(textData.error || textData));
        console.error('[ADMIN-ALERT] Template error:', JSON.stringify(templateData.error || templateData));
        return {
            success: false,
            error: templateData.error?.message || textData.error?.message || 'Both text and template failed',
            textError: textData.error || null,
            templateError: templateData.error || null
        };
    } catch (error) {
        console.error('[ADMIN-ALERT] WhatsApp send exception:', error.message);
        return { success: false, error: error.message };
    }
}

// ─── Send email notification with visitor analytics included ─────────────────

async function sendEmailNotification(activity, source = 'admin', visitorStats = null) {
    try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const activityHTML = buildActivityEmailHTML(activity, source);
        const visitorHTML = buildVisitorAnalyticsHTML(visitorStats);

        const noticeText = `
<div style="padding:14px 16px; background:#f0fdf4; border-left:3px solid #22c55e; border-radius:4px; margin:18px 0; font-size:14px; color:#14532d;">
    Real-time notification sent immediately when activity is detected. Includes live visitor analytics.
</div>
<p style="font-size:13px; color:#94a3b8; margin-top:20px;">SteelConnect Activity Monitoring System — ${ADMIN_REPORT_EMAIL} | ${ADMIN_PHONE_NUMBER}</p>`;

        const htmlContent = activityHTML + visitorHTML + noticeText;

        const isUser = source === 'user';
        const categoryLabel = activity.category || (isUser ? 'User' : 'Admin');
        const actionLabel = activity.action || 'Activity';
        const personLabel = isUser
            ? (activity.userEmail || 'User')
            : (activity.adminEmail || 'system');

        const response = await resend.emails.send({
            from: 'SteelConnect System <noreply@steelconnectapp.com>',
            reply_to: 'support@steelconnectapp.com',
            to: ADMIN_REPORT_EMAIL,
            subject: `[${categoryLabel}] ${actionLabel} — ${personLabel} — SteelConnect`,
            html: buildFullEmailHTML(htmlContent)
        });

        if (response.error) {
            console.error('[ADMIN-ALERT] Email send error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`[ADMIN-ALERT] Email sent to ${ADMIN_REPORT_EMAIL} — ID: ${response.data?.id}`);
        return { success: true, emailId: response.data?.id };
    } catch (error) {
        console.error('[ADMIN-ALERT] Email send failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ─── Public API: Send real-time notification for admin activity ───────────────

/**
 * Send an immediate email + WhatsApp notification for a single admin activity.
 * Called by the adminActivityLogger right after logging to Firestore.
 * Now includes visitor analytics summary in the notification.
 */
export async function sendRealTimeActivityAlert(activity) {
    try {
        console.log(`[ADMIN-ALERT] Sending real-time alert for: [${activity.category}] ${activity.action}`);

        // Fetch visitor stats in parallel with sending
        const visitorStats = await getVisitorAnalyticsSummary().catch(() => null);

        const [emailResult, whatsappResult] = await Promise.allSettled([
            sendEmailNotification(activity, 'admin', visitorStats),
            sendWhatsAppNotification(activity, 'admin', visitorStats)
        ]);

        const email = emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason?.message };
        const whatsapp = whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason?.message };

        console.log(`[ADMIN-ALERT] Email: ${email.success ? 'sent' : 'failed'} | WhatsApp: ${whatsapp.success ? 'sent' : 'failed'}`);

        return { email, whatsapp };
    } catch (error) {
        console.error('[ADMIN-ALERT] Real-time alert failed:', error.message);
        return {
            email: { success: false, error: error.message },
            whatsapp: { success: false, error: error.message }
        };
    }
}

// ─── Public API: Send comprehensive alert for user activities ────────────────

/**
 * Send an immediate email + WhatsApp notification for ANY platform activity
 * (user registration, login, job post, quote, estimation, etc.).
 * Includes visitor analytics summary.
 *
 * @param {Object} activity - The activity log entry
 * @param {string} source - 'admin' or 'user'
 */
export async function sendComprehensiveActivityAlert(activity, source = 'user') {
    try {
        console.log(`[ACTIVITY-ALERT] Sending ${source} alert for: [${activity.category}] ${activity.action}`);

        const visitorStats = await getVisitorAnalyticsSummary().catch(() => null);

        const [emailResult, whatsappResult] = await Promise.allSettled([
            sendEmailNotification(activity, source, visitorStats),
            sendWhatsAppNotification(activity, source, visitorStats)
        ]);

        const email = emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason?.message };
        const whatsapp = whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason?.message };

        console.log(`[ACTIVITY-ALERT] Email: ${email.success ? 'sent' : 'failed'} | WhatsApp: ${whatsapp.success ? 'sent' : 'failed'}`);

        return { email, whatsapp };
    } catch (error) {
        console.error('[ACTIVITY-ALERT] Comprehensive alert failed:', error.message);
        return {
            email: { success: false, error: error.message },
            whatsapp: { success: false, error: error.message }
        };
    }
}

// ─── PDF Report Generation (legacy for download endpoint) ────────────────────

export async function generateManualReport(hours = 1) {
    const PDFDocument = (await import('pdfkit')).default;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);
    const activities = await getRecentActivities(hours);

    // Also fetch user activities and visitor stats for comprehensive report
    let userActivities = [];
    let visitorStats = null;
    try {
        const { getRecentUserActivities, getVisitorAnalyticsSummary: getVS } = await import('./userActivityLogger.js');
        userActivities = await getRecentUserActivities(hours);
        visitorStats = await getVS();
    } catch (e) {
        console.error('[REPORT] Failed to fetch user activities/visitor stats:', e.message);
    }

    const pdfBuffer = await generatePDFReport(PDFDocument, activities, userActivities, visitorStats, periodStart, periodEnd);
    return { pdfBuffer, activitiesCount: activities.length + userActivities.length, periodStart, periodEnd };
}

function generatePDFReport(PDFDocument, adminActivities, userActivities, visitorStats, periodStart, periodEnd) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                bufferPages: true,
                info: {
                    Title: 'SteelConnect Comprehensive Activity Report',
                    Author: 'SteelConnect System',
                    Subject: `Activity Report — ${periodStart.toLocaleDateString()}`
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.rect(0, 0, doc.page.width, 100).fill('#1e3a8a');
            doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff').text('SteelConnect', 50, 20);
            doc.fontSize(14).font('Helvetica').fillColor('#bfdbfe').text('Comprehensive Activity & Visitor Report', 50, 47);
            const periodLabel = `${periodStart.toLocaleString()} — ${periodEnd.toLocaleString()}`;
            doc.fontSize(9).fillColor('#93c5fd').text(periodLabel, 50, 68);
            doc.fontSize(9).fillColor('#93c5fd').text(`Report to: ${ADMIN_REPORT_EMAIL} | ${ADMIN_PHONE_NUMBER}`, 50, 82);
            doc.fillColor('#000000');
            let y = 115;

            // ── Visitor Analytics Section ──
            if (visitorStats) {
                doc.rect(50, y, doc.page.width - 100, 24).fill('#0369a1');
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff').text('VISITOR ANALYTICS', 60, y + 6);
                y += 32;

                doc.fontSize(10).font('Helvetica').fillColor('#334155');
                doc.text(`Today: ${visitorStats.todayTotal} visitors | Active Now: ${visitorStats.activeNow} | Last 24h: ${visitorStats.last24hTotal}`, 55, y);
                y += 16;
                doc.text(`Avg Time: ${Math.floor(visitorStats.avgTimeSeconds / 60)}m ${visitorStats.avgTimeSeconds % 60}s | Identified: ${visitorStats.identifiedVisitors}`, 55, y);
                y += 16;
                doc.text(`Devices — Desktop: ${visitorStats.devices.Desktop || 0} | Mobile: ${visitorStats.devices.Mobile || 0} | Tablet: ${visitorStats.devices.Tablet || 0}`, 55, y);
                y += 16;

                if (visitorStats.topCountries.length > 0) {
                    doc.text(`Top Countries: ${visitorStats.topCountries.map(([c, n]) => `${c}(${n})`).join(', ')}`, 55, y);
                    y += 16;
                }

                if (visitorStats.recentVisitors.length > 0) {
                    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0369a1').text('Recent Visitors:', 55, y);
                    y += 14;
                    for (const v of visitorStats.recentVisitors) {
                        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
                        const mins = Math.floor(v.timeSpent / 60);
                        doc.fontSize(8).font('Helvetica').fillColor('#334155')
                            .text(`${v.email} | ${v.country}${v.city ? ', ' + v.city : ''} | ${v.device}/${v.browser} | ${mins}m | ${v.pages} pages`, 60, y, { width: doc.page.width - 120 });
                        y += 14;
                    }
                }
                y += 10;
            }

            // ── Admin Activities Section ──
            if (adminActivities.length > 0) {
                if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
                doc.rect(50, y, doc.page.width - 100, 24).fill('#7c3aed');
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff').text(`ADMIN ACTIVITIES (${adminActivities.length})`, 60, y + 6);
                y += 32;

                const grouped = {};
                adminActivities.forEach(a => {
                    const cat = a.category || 'Other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(a);
                });

                for (const [category, items] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
                    if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
                    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Default'];
                    doc.rect(50, y, doc.page.width - 100, 22).fill(colors.bg);
                    doc.rect(50, y, 4, 22).fill(colors.border);
                    doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text).text(`${category} (${items.length})`, 62, y + 5);
                    y += 28;

                    for (const item of items) {
                        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
                        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                        doc.fontSize(8).font('Helvetica').fillColor('#334155')
                            .text(`${time} | ${item.adminEmail || 'system'} | ${item.action || '-'} | ${item.description || '-'}`, 55, y, { width: doc.page.width - 110 });
                        y += 14;
                    }
                    y += 6;
                }
            }

            // ── User Activities Section ──
            if (userActivities.length > 0) {
                if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
                doc.rect(50, y, doc.page.width - 100, 24).fill('#059669');
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff').text(`USER ACTIVITIES (${userActivities.length})`, 60, y + 6);
                y += 32;

                const grouped = {};
                userActivities.forEach(a => {
                    const cat = a.category || 'Other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(a);
                });

                for (const [category, items] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
                    if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
                    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Default'];
                    doc.rect(50, y, doc.page.width - 100, 22).fill(colors.bg);
                    doc.rect(50, y, 4, 22).fill(colors.border);
                    doc.fontSize(10).font('Helvetica-Bold').fillColor(colors.text).text(`${category} (${items.length})`, 62, y + 5);
                    y += 28;

                    for (const item of items) {
                        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
                        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
                        doc.fontSize(8).font('Helvetica').fillColor('#334155')
                            .text(`${time} | ${item.userEmail || 'unknown'} (${item.userType || ''}) | ${item.action || '-'} | ${item.description || '-'}`, 55, y, { width: doc.page.width - 110 });
                        y += 14;
                    }
                    y += 6;
                }
            }

            // No activities
            if (adminActivities.length === 0 && userActivities.length === 0) {
                doc.fontSize(13).font('Helvetica').fillColor('#64748b')
                    .text('No activities recorded during this period.', 50, y);
            }

            // Page footers
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
                    .text(`SteelConnect Activity Report — Page ${i + 1} of ${pageCount} — Generated ${new Date().toLocaleString()} — ${ADMIN_REPORT_EMAIL}`, 50, doc.page.height - 35, { width: doc.page.width - 100, align: 'center' });
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export default {
    sendRealTimeActivityAlert,
    sendComprehensiveActivityAlert,
    generateManualReport
};
