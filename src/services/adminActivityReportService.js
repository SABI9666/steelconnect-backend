// src/services/adminActivityReportService.js
// Sends real-time email & WhatsApp notifications when any admin activity occurs.
// No hourly batch — every activity triggers an immediate alert.

import { getRecentActivities } from './adminActivityLogger.js';
import { sendWhatsAppText } from './whatsappService.js';

const ADMIN_REPORT_EMAIL = 'sabincn676@gmail.com';
const ADMIN_WHATSAPP_NUMBER = '919895909666'; // India country code + number

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
    'Default':             { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
};

// ─── Build email HTML for a single activity ──────────────────────────────────

function buildActivityEmailHTML(activity) {
    const colors = CATEGORY_COLORS[activity.category] || CATEGORY_COLORS['Default'];
    const time = activity.timestamp
        ? new Date(activity.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'medium'
        })
        : new Date().toLocaleString();
    const adminLabel = activity.adminEmail || 'system';

    return `
<h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">Admin Activity Alert</h2>
<p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">
    An admin action was just performed on SteelConnect:
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
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Admin</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${adminLabel}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Time</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${time}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Method</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${activity.method || 'N/A'} ${activity.endpoint || ''}</td>
    </tr>
    <tr>
        <td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">IP Address</td>
        <td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${activity.ip || 'N/A'}</td>
    </tr>
</table>

<div style="padding:14px 16px; background:#f0fdf4; border-left:3px solid #22c55e; border-radius:4px; margin:18px 0; font-size:14px; color:#14532d;">
    This is a real-time notification sent immediately when admin activity is detected.
</div>

<p style="font-size:13px; color:#94a3b8; margin-top:20px;">SteelConnect Admin Activity Monitoring System</p>`;
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
<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="max-width:580px; width:100%; background:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">
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
<tr>
<td style="padding:28px 32px; font-size:15px; line-height:1.7; color:#334155;">
${content}
</td>
</tr>
<tr>
<td style="padding:20px 32px; border-top:1px solid #e2e8f0; font-size:13px; color:#94a3b8; line-height:1.6;">
<p style="margin:0 0 6px 0;">SteelConnect &mdash; Professional Steel Construction Platform</p>
<p style="margin:0;">This is an automated real-time admin activity alert. Contact <a href="mailto:support@steelconnectapp.com" style="color:#2563eb; text-decoration:none;">support@steelconnectapp.com</a> for questions.</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Build WhatsApp message body ─────────────────────────────────────────────

function buildWhatsAppMessage(activity) {
    const time = activity.timestamp
        ? new Date(activity.timestamp).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        })
        : new Date().toLocaleString();

    return `*SteelConnect Admin Activity Alert*

*Category:* ${activity.category || 'Other'}
*Action:* ${activity.action || 'N/A'}
*Description:* ${activity.description || 'N/A'}
*Admin:* ${activity.adminEmail || 'system'}
*Time:* ${time}
*Method:* ${activity.method || 'N/A'} ${activity.endpoint || ''}
*IP:* ${activity.ip || 'N/A'}

_Real-time alert from SteelConnect Admin Monitoring_`;
}

// ─── Send WhatsApp notification via WhatsApp Business Cloud API ──────────────

async function sendWhatsAppNotification(activity) {
    const messageBody = buildWhatsAppMessage(activity);
    const result = await sendWhatsAppText({
        to: ADMIN_WHATSAPP_NUMBER,
        message: messageBody
    });

    if (result.success) {
        console.log(`[ADMIN-ALERT] WhatsApp sent to ${ADMIN_WHATSAPP_NUMBER} — ID: ${result.messageId}`);
    } else {
        console.log(`[ADMIN-ALERT] WhatsApp skipped/failed: ${result.error}`);
    }

    return result;
}

// ─── Send email notification for a single activity ───────────────────────────

async function sendEmailNotification(activity) {
    try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const htmlContent = buildActivityEmailHTML(activity);
        const categoryLabel = activity.category || 'Admin';
        const actionLabel = activity.action || 'Activity';

        const response = await resend.emails.send({
            from: 'SteelConnect System <noreply@steelconnectapp.com>',
            reply_to: 'support@steelconnectapp.com',
            to: ADMIN_REPORT_EMAIL,
            subject: `[${categoryLabel}] ${actionLabel} — ${activity.adminEmail || 'system'} — SteelConnect`,
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

// ─── Public API: Send real-time notification for a single activity ───────────

/**
 * Send an immediate email + WhatsApp notification for a single admin activity.
 * Called by the adminActivityLogger right after logging to Firestore.
 *
 * @param {Object} activity - The activity log entry
 * @returns {Object} { email: { success, ... }, whatsapp: { success, ... } }
 */
export async function sendRealTimeActivityAlert(activity) {
    try {
        console.log(`[ADMIN-ALERT] Sending real-time alert for: [${activity.category}] ${activity.action}`);

        // Send email and WhatsApp in parallel
        const [emailResult, whatsappResult] = await Promise.allSettled([
            sendEmailNotification(activity),
            sendWhatsAppNotification(activity)
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

/**
 * Generate and return the PDF buffer for a manual download (API endpoint).
 * Kept for backward compatibility with the download endpoint.
 */
export async function generateManualReport(hours = 1) {
    const PDFDocument = (await import('pdfkit')).default;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);
    const activities = await getRecentActivities(hours);
    const pdfBuffer = await generatePDFReportLegacy(PDFDocument, activities, periodStart, periodEnd);
    return { pdfBuffer, activitiesCount: activities.length, periodStart, periodEnd };
}

// Legacy PDF generation kept for manual download endpoint
function generatePDFReportLegacy(PDFDocument, activities, periodStart, periodEnd) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                bufferPages: true,
                info: {
                    Title: 'SteelConnect Admin Activity Report',
                    Author: 'SteelConnect System',
                    Subject: `Admin Activity Report — ${periodStart.toLocaleDateString()}`
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            doc.rect(0, 0, doc.page.width, 100).fill('#1e3a8a');
            doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff').text('SteelConnect', 50, 25);
            doc.fontSize(14).font('Helvetica').fillColor('#bfdbfe').text('Admin Activity Report', 50, 52);
            const periodLabel = `${periodStart.toLocaleString()} — ${periodEnd.toLocaleString()}`;
            doc.fontSize(9).fillColor('#93c5fd').text(periodLabel, 50, 75);
            doc.fillColor('#000000');
            let y = 120;

            if (activities.length === 0) {
                doc.fontSize(13).font('Helvetica').fillColor('#64748b')
                    .text('No admin activities recorded during this period.', 50, y);
            } else {
                const grouped = {};
                activities.forEach(a => {
                    const cat = a.category || 'Other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(a);
                });

                for (const [category, items] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
                    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
                    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Default'];
                    doc.rect(50, y, doc.page.width - 100, 28).fill(colors.bg);
                    doc.rect(50, y, 4, 28).fill(colors.border);
                    doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.text).text(`${category}  (${items.length})`, 62, y + 8);
                    y += 36;

                    for (const item of items) {
                        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
                        const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
                        doc.fontSize(8).font('Helvetica').fillColor('#334155').text(`${time} | ${item.adminEmail || 'system'} | ${item.action || '—'} | ${item.description || '—'}`, 55, y, { width: doc.page.width - 110 });
                        y += 16;
                    }
                    y += 10;
                }
            }

            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
                    .text(`SteelConnect Admin Activity Report — Page ${i + 1} of ${pageCount} — Generated ${new Date().toLocaleString()}`, 50, doc.page.height - 35, { width: doc.page.width - 100, align: 'center' });
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export default {
    sendRealTimeActivityAlert,
    generateManualReport
};
