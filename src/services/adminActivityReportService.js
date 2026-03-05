// src/services/adminActivityReportService.js
// BATCHED alerts: Collects all admin + user activities and sends ONE combined
// WhatsApp + email summary every 1 hour. Includes detailed visitor analytics
// (location, time, duration, pages viewed, device, browser).

import { adminDb } from '../config/firebase.js';
import { getRecentActivities } from './adminActivityLogger.js';
import { getVisitorAnalyticsSummary } from './userActivityLogger.js';

const ADMIN_REPORT_EMAIL = process.env.ADMIN_REPORT_EMAIL || 'admin@steelconnect.com';
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER || '';
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || '';
const BATCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── In-memory activity queue ────────────────────────────────────────────────
const activityQueue = [];  // { activity, source }

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

// ─── Queue an activity for the next hourly batch ─────────────────────────────

/**
 * Queue an activity for the next hourly batch alert.
 * Replaces the old instant-send approach.
 *
 * @param {Object} activity - The activity log entry
 * @param {string} source - 'admin' or 'user'
 */
export function queueActivityForBatch(activity, source = 'admin') {
    activityQueue.push({ activity, source, queuedAt: new Date().toISOString() });
    console.log(`[BATCH-QUEUE] Queued [${source}] ${activity.category} — ${activity.action} (queue size: ${activityQueue.length})`);
}

// ─── Fetch detailed visitor sessions for the last N hours ────────────────────

async function getDetailedVisitorSessions(hours = 1) {
    try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const snapshot = await adminDb.collection('visitor_sessions')
            .where('startedAt', '>=', since)
            .orderBy('startedAt', 'desc')
            .limit(20)
            .get();

        return snapshot.docs.map(doc => {
            const v = doc.data();
            return {
                email: v.userEmail || v.contactEmail || 'Anonymous',
                location: v.location
                    ? `${v.location.city || ''}${v.location.city && v.location.country ? ', ' : ''}${v.location.country || 'Unknown'}`
                    : 'Unknown',
                visitedAt: v.startedAt,
                timeSpent: v.totalTimeSeconds || 0,
                pagesViewed: (v.pagesViewed || []).map(p => p.page || p).filter(Boolean),
                device: v.deviceType || 'Unknown',
                browser: v.browser || 'Unknown',
                os: v.os || '',
                isActive: v.isActive || false
            };
        });
    } catch (error) {
        console.error('[BATCH] Failed to fetch detailed visitor sessions:', error.message);
        return [];
    }
}

// ─── Build batch WhatsApp message ────────────────────────────────────────────

function buildBatchWhatsAppMessage(adminActivities, userActivities, visitors) {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - BATCH_INTERVAL_MS);
    const timeRange = `${hourAgo.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    const dateStr = now.toLocaleDateString('en-US', { dateStyle: 'medium' });

    let msg = `*SteelConnect Hourly Report*\n*${dateStr} | ${timeRange}*`;

    // Admin activities summary
    if (adminActivities.length > 0) {
        msg += `\n\n*--- Admin Actions (${adminActivities.length}) ---*`;
        // Show up to 10 admin activities
        const showItems = adminActivities.slice(0, 10);
        for (const item of showItems) {
            const time = item.activity.timestamp
                ? new Date(item.activity.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '-';
            msg += `\n${time} | ${item.activity.category || 'Other'} | ${item.activity.action || '-'}`;
        }
        if (adminActivities.length > 10) {
            msg += `\n_...and ${adminActivities.length - 10} more_`;
        }
    }

    // User activities summary
    if (userActivities.length > 0) {
        msg += `\n\n*--- User Activities (${userActivities.length}) ---*`;
        const showItems = userActivities.slice(0, 10);
        for (const item of showItems) {
            const time = item.activity.timestamp
                ? new Date(item.activity.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '-';
            const user = item.activity.userEmail || item.activity.userName || 'Unknown';
            msg += `\n${time} | ${item.activity.action || '-'} | ${user}`;
        }
        if (userActivities.length > 10) {
            msg += `\n_...and ${userActivities.length - 10} more_`;
        }
    }

    // Detailed visitor analytics
    if (visitors.length > 0) {
        msg += `\n\n*--- Visitors (${visitors.length}) ---*`;
        // Show up to 8 visitors to stay within WhatsApp 4096 char limit
        const showVisitors = visitors.slice(0, 8);
        for (let i = 0; i < showVisitors.length; i++) {
            const v = showVisitors[i];
            const visitTime = v.visitedAt
                ? new Date(v.visitedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : '-';
            const mins = Math.floor(v.timeSpent / 60);
            const secs = v.timeSpent % 60;
            const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            const pages = v.pagesViewed.length > 0
                ? v.pagesViewed.slice(0, 5).join(', ') + (v.pagesViewed.length > 5 ? '...' : '')
                : 'N/A';
            const status = v.isActive ? ' (Active)' : '';

            msg += `\n\n*${i + 1}. ${v.email}*${status}`;
            msg += `\nLocation: ${v.location}`;
            msg += `\nTime: ${visitTime} | Duration: ${duration}`;
            msg += `\nDevice: ${v.device} | Browser: ${v.browser}`;
            msg += `\nPages: ${pages}`;
        }
        if (visitors.length > 8) {
            msg += `\n\n_...and ${visitors.length - 8} more visitors_`;
        }
    } else {
        msg += `\n\n*--- Visitors ---*\nNo visitors in the last hour.`;
    }

    if (adminActivities.length === 0 && userActivities.length === 0 && visitors.length === 0) {
        msg += `\n\nNo activity recorded in the last hour.`;
    }

    msg += `\n\n_Hourly batch report — SteelConnect_`;

    return msg;
}

// ─── Build batch email HTML ──────────────────────────────────────────────────

function buildBatchEmailHTML(adminActivities, userActivities, visitors) {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - BATCH_INTERVAL_MS);
    const timeRange = `${hourAgo.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    const dateStr = now.toLocaleDateString('en-US', { dateStyle: 'medium' });

    let html = `<h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 8px 0;">Hourly Activity Report</h2>
<p style="font-size:14px; color:#64748b; margin:0 0 20px 0;">${dateStr} | ${timeRange}</p>`;

    // Admin activities
    if (adminActivities.length > 0) {
        html += `<div style="margin:16px 0; padding:14px; background:#f5f3ff; border-radius:8px; border:1px solid #c4b5fd;">
<h3 style="font-size:15px; font-weight:700; color:#5b21b6; margin:0 0 10px 0;">Admin Actions (${adminActivities.length})</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px;">
<tr style="background:#ede9fe;"><td style="padding:6px 8px; font-weight:600;">Time</td><td style="padding:6px 8px; font-weight:600;">Category</td><td style="padding:6px 8px; font-weight:600;">Action</td><td style="padding:6px 8px; font-weight:600;">Admin</td></tr>`;
        for (const item of adminActivities) {
            const time = item.activity.timestamp ? new Date(item.activity.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';
            html += `<tr><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${time}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.category || '-'}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.action || '-'}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.adminEmail || 'system'}</td></tr>`;
        }
        html += `</table></div>`;
    }

    // User activities
    if (userActivities.length > 0) {
        html += `<div style="margin:16px 0; padding:14px; background:#ecfdf5; border-radius:8px; border:1px solid #86efac;">
<h3 style="font-size:15px; font-weight:700; color:#065f46; margin:0 0 10px 0;">User Activities (${userActivities.length})</h3>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px;">
<tr style="background:#d1fae5;"><td style="padding:6px 8px; font-weight:600;">Time</td><td style="padding:6px 8px; font-weight:600;">Action</td><td style="padding:6px 8px; font-weight:600;">User</td><td style="padding:6px 8px; font-weight:600;">Type</td></tr>`;
        for (const item of userActivities) {
            const time = item.activity.timestamp ? new Date(item.activity.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';
            html += `<tr><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${time}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.action || '-'}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.userEmail || 'unknown'}</td><td style="padding:5px 8px; border-bottom:1px solid #f1f5f9;">${item.activity.userType || '-'}</td></tr>`;
        }
        html += `</table></div>`;
    }

    // Detailed visitor analytics
    html += `<div style="margin:16px 0; padding:14px; background:#f0f9ff; border-radius:8px; border:1px solid #bae6fd;">
<h3 style="font-size:15px; font-weight:700; color:#0c4a6e; margin:0 0 10px 0;">Visitor Details (${visitors.length})</h3>`;

    if (visitors.length > 0) {
        html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:12px;">
<tr style="background:#e0f2fe;"><td style="padding:6px 6px; font-weight:600;">Visitor</td><td style="padding:6px 6px; font-weight:600;">Location</td><td style="padding:6px 6px; font-weight:600;">Time</td><td style="padding:6px 6px; font-weight:600;">Duration</td><td style="padding:6px 6px; font-weight:600;">Device/Browser</td><td style="padding:6px 6px; font-weight:600;">Pages Viewed</td></tr>`;
        for (const v of visitors) {
            const visitTime = v.visitedAt ? new Date(v.visitedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';
            const mins = Math.floor(v.timeSpent / 60);
            const secs = v.timeSpent % 60;
            const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            const pages = v.pagesViewed.length > 0 ? v.pagesViewed.join(', ') : 'N/A';
            const status = v.isActive ? '<span style="color:#059669; font-weight:600;"> (Active)</span>' : '';
            html += `<tr>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9;">${v.email}${status}</td>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9;">${v.location}</td>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9;">${visitTime}</td>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9;">${duration}</td>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9;">${v.device} / ${v.browser}</td>
<td style="padding:5px 6px; border-bottom:1px solid #f1f5f9; max-width:150px; word-break:break-all;">${pages}</td>
</tr>`;
        }
        html += `</table>`;
    } else {
        html += `<p style="font-size:13px; color:#64748b; margin:0;">No visitors in the last hour.</p>`;
    }
    html += `</div>`;

    if (adminActivities.length === 0 && userActivities.length === 0 && visitors.length === 0) {
        html += `<p style="font-size:14px; color:#64748b; margin:16px 0;">No activity recorded in the last hour.</p>`;
    }

    html += `<div style="padding:12px 16px; background:#f0fdf4; border-left:3px solid #22c55e; border-radius:4px; margin:18px 0; font-size:13px; color:#14532d;">
Hourly batch report. Next report in ~1 hour.</div>`;

    return html;
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
<span style="font-size:11px; color:#94a3b8;">Hourly Report</span>
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
<p style="margin:0;">Hourly batch monitoring. Notifications: ${ADMIN_REPORT_EMAIL} | ${ADMIN_PHONE_NUMBER}</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Send WhatsApp via Cloud API with template fallback ──────────────────────

async function sendWhatsAppBatch(messageBody) {
    try {
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

        if (!phoneNumberId || !accessToken) {
            console.log('[BATCH] WhatsApp not configured. Skipping.');
            return { success: false, error: 'WhatsApp not configured' };
        }

        const apiUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };

        // Attempt 1: Text message
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
            console.log(`[BATCH] WhatsApp TEXT sent — ID: ${textData.messages[0]?.id}`);
            return { success: true, messageId: textData.messages[0]?.id, method: 'text' };
        }

        console.log(`[BATCH] Text failed (${textData.error?.code}): ${textData.error?.message}`);

        // Attempt 2: Template fallback
        const templateResponse = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: ADMIN_WHATSAPP_NUMBER,
                type: 'template',
                template: { name: 'hello_world', language: { code: 'en_US' } }
            })
        });

        const templateData = await templateResponse.json();

        if (templateResponse.ok && templateData.messages) {
            console.log(`[BATCH] WhatsApp TEMPLATE fallback sent — ID: ${templateData.messages[0]?.id}`);
            return { success: true, messageId: templateData.messages[0]?.id, method: 'template' };
        }

        console.error('[BATCH] WhatsApp both attempts failed.');
        return { success: false, error: templateData.error?.message || textData.error?.message };
    } catch (error) {
        console.error('[BATCH] WhatsApp send exception:', error.message);
        return { success: false, error: error.message };
    }
}

// ─── Send batch email ────────────────────────────────────────────────────────

async function sendBatchEmail(htmlContent, activityCount, visitorCount) {
    try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const response = await resend.emails.send({
            from: 'SteelConnect System <noreply@steelconnectapp.com>',
            reply_to: 'support@steelconnectapp.com',
            to: ADMIN_REPORT_EMAIL,
            subject: `Hourly Report — ${activityCount} activities, ${visitorCount} visitors — ${timeStr} — SteelConnect`,
            html: buildFullEmailHTML(htmlContent)
        });

        if (response.error) {
            console.error('[BATCH] Email error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`[BATCH] Email sent — ID: ${response.data?.id}`);
        return { success: true, emailId: response.data?.id };
    } catch (error) {
        console.error('[BATCH] Email failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ─── Main batch send function ────────────────────────────────────────────────

async function sendBatchAlerts() {
    try {
        // Drain the queue
        const items = activityQueue.splice(0, activityQueue.length);

        // Fetch detailed visitor sessions from the last hour
        const visitors = await getDetailedVisitorSessions(1);

        // Skip if nothing happened
        if (items.length === 0 && visitors.length === 0) {
            console.log('[BATCH] No activities or visitors in the last hour. Skipping batch.');
            return;
        }

        // Split into admin vs user activities
        const adminItems = items.filter(i => i.source === 'admin');
        const userItems = items.filter(i => i.source === 'user');

        console.log(`[BATCH] Sending hourly report: ${adminItems.length} admin, ${userItems.length} user activities, ${visitors.length} visitors`);

        // Build messages
        const whatsappMsg = buildBatchWhatsAppMessage(adminItems, userItems, visitors);
        const emailHTML = buildBatchEmailHTML(adminItems, userItems, visitors);

        // Send both in parallel
        const [emailResult, whatsappResult] = await Promise.allSettled([
            sendBatchEmail(emailHTML, items.length, visitors.length),
            sendWhatsAppBatch(whatsappMsg)
        ]);

        const email = emailResult.status === 'fulfilled' ? emailResult.value : { success: false, error: emailResult.reason?.message };
        const whatsapp = whatsappResult.status === 'fulfilled' ? whatsappResult.value : { success: false, error: whatsappResult.reason?.message };

        console.log(`[BATCH] Email: ${email.success ? 'sent' : 'failed'} | WhatsApp: ${whatsapp.success ? 'sent' : 'failed'}`);
    } catch (error) {
        console.error('[BATCH] Batch send failed:', error.message);
    }
}

// ─── Start the 1-hour batch scheduler ────────────────────────────────────────

let batchTimer = null;

export function startBatchScheduler() {
    if (batchTimer) {
        console.log('[BATCH] Scheduler already running.');
        return;
    }

    console.log(`[BATCH] Starting hourly batch scheduler (every ${BATCH_INTERVAL_MS / 60000} minutes)`);

    batchTimer = setInterval(() => {
        sendBatchAlerts().catch(err => {
            console.error('[BATCH] Scheduler error:', err.message);
        });
    }, BATCH_INTERVAL_MS);

    // Send first batch 5 minutes after startup (to collect initial activities)
    setTimeout(() => {
        console.log('[BATCH] Sending initial batch (5 min after startup)...');
        sendBatchAlerts().catch(err => {
            console.error('[BATCH] Initial batch error:', err.message);
        });
    }, 5 * 60 * 1000);
}

// Auto-start the scheduler when this module is loaded
startBatchScheduler();

// ─── Legacy: Keep old functions working (now they just queue) ────────────────

export async function sendRealTimeActivityAlert(activity) {
    queueActivityForBatch(activity, 'admin');
    return { email: { success: true, queued: true }, whatsapp: { success: true, queued: true } };
}

export async function sendComprehensiveActivityAlert(activity, source = 'user') {
    queueActivityForBatch(activity, source);
    return { email: { success: true, queued: true }, whatsapp: { success: true, queued: true } };
}

// ─── PDF Report Generation (unchanged) ───────────────────────────────────────

export async function generateManualReport(hours = 1) {
    const PDFDocument = (await import('pdfkit')).default;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);
    const activities = await getRecentActivities(hours);

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

            // Visitor Analytics Section
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

            // Admin Activities Section
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

            // User Activities Section
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

            if (adminActivities.length === 0 && userActivities.length === 0) {
                doc.fontSize(13).font('Helvetica').fillColor('#64748b')
                    .text('No activities recorded during this period.', 50, y);
            }

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
    queueActivityForBatch,
    startBatchScheduler,
    sendRealTimeActivityAlert,
    sendComprehensiveActivityAlert,
    generateManualReport
};
