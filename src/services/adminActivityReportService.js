// src/services/adminActivityReportService.js
// Generates a PDF report of admin activities and emails it every hour
import PDFDocument from 'pdfkit';
import { getRecentActivities } from './adminActivityLogger.js';
import { sendGenericEmail } from '../utils/emailService.js';

const ADMIN_REPORT_EMAIL = 'sabincn676@gmail.com';

// ─── Category colours (for the PDF badges) ──────────────────────────────────
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

// ─── PDF Generation ──────────────────────────────────────────────────────────

/**
 * Build a PDF buffer containing the admin activity report.
 *
 * @param {Array} activities - Array of activity log objects
 * @param {Date}  periodStart
 * @param {Date}  periodEnd
 * @returns {Promise<Buffer>}
 */
function generatePDFReport(activities, periodStart, periodEnd) {
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

            // ── Header ──────────────────────────────────────────────────────
            doc.rect(0, 0, doc.page.width, 100).fill('#1e3a8a');

            doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff')
                .text('SteelConnect', 50, 25);
            doc.fontSize(14).font('Helvetica').fillColor('#bfdbfe')
                .text('Admin Activity Report', 50, 52);

            const periodLabel = `${periodStart.toLocaleString()} — ${periodEnd.toLocaleString()}`;
            doc.fontSize(9).fillColor('#93c5fd')
                .text(periodLabel, 50, 75);

            doc.fillColor('#000000');
            let y = 120;

            // ── Summary Box ─────────────────────────────────────────────────
            const categorySummary = {};
            activities.forEach(a => {
                const cat = a.category || 'Other';
                categorySummary[cat] = (categorySummary[cat] || 0) + 1;
            });

            doc.rect(50, y, doc.page.width - 100, 28).fill('#f8fafc').stroke('#e2e8f0');
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b')
                .text(`Total Activities: ${activities.length}`, 60, y + 8);
            y += 40;

            // Category breakdown
            const cats = Object.entries(categorySummary).sort((a, b) => b[1] - a[1]);
            if (cats.length > 0) {
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a')
                    .text('Activity Breakdown by Category', 50, y);
                y += 20;

                cats.forEach(([cat, count]) => {
                    const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Default'];
                    const barWidth = Math.min((count / activities.length) * 350, 350);

                    doc.roundedRect(60, y, 350, 18, 3).fill('#f1f5f9');
                    doc.roundedRect(60, y, barWidth, 18, 3).fill(colors.border);
                    doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.text)
                        .text(`${cat}`, 65, y + 4, { width: 200 });
                    doc.fontSize(9).font('Helvetica').fillColor('#475569')
                        .text(`${count}`, 380, y + 4, { width: 40, align: 'right' });
                    y += 24;

                    if (y > doc.page.height - 80) {
                        doc.addPage();
                        y = 50;
                    }
                });
                y += 10;
            }

            // ── Detailed Activities (grouped by category) ────────────────────
            if (activities.length === 0) {
                doc.fontSize(13).font('Helvetica').fillColor('#64748b')
                    .text('No admin activities recorded during this period.', 50, y);
            } else {
                // Group activities by category
                const grouped = {};
                activities.forEach(a => {
                    const cat = a.category || 'Other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(a);
                });

                const sortedCategories = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

                for (const [category, items] of sortedCategories) {
                    // Check page space
                    if (y > doc.page.height - 120) {
                        doc.addPage();
                        y = 50;
                    }

                    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS['Default'];

                    // Category header
                    doc.rect(50, y, doc.page.width - 100, 28).fill(colors.bg);
                    doc.rect(50, y, 4, 28).fill(colors.border);
                    doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.text)
                        .text(`${category}  (${items.length})`, 62, y + 8);
                    y += 36;

                    // Table header
                    const colTime = 55;
                    const colAdmin = 145;
                    const colAction = 260;
                    const colDesc = 360;

                    doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b');
                    doc.text('TIME', colTime, y);
                    doc.text('ADMIN', colAdmin, y);
                    doc.text('ACTION', colAction, y);
                    doc.text('DETAILS', colDesc, y);
                    y += 14;

                    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
                    y += 6;

                    for (const item of items) {
                        if (y > doc.page.height - 60) {
                            doc.addPage();
                            y = 50;
                        }

                        const time = item.timestamp
                            ? new Date(item.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : '—';
                        const adminLabel = item.adminEmail ? item.adminEmail.split('@')[0] : 'system';
                        const action = item.action || '—';
                        const desc = item.description || '—';

                        doc.fontSize(8).font('Helvetica').fillColor('#334155');
                        doc.text(time, colTime, y, { width: 80 });
                        doc.text(adminLabel, colAdmin, y, { width: 110 });
                        doc.fontSize(8).font('Helvetica-Bold').fillColor(colors.text);
                        doc.text(action, colAction, y, { width: 95 });
                        doc.fontSize(7.5).font('Helvetica').fillColor('#475569');

                        // Description might be long — wrap it
                        const descHeight = doc.heightOfString(desc, { width: 185 });
                        doc.text(desc, colDesc, y, { width: 185 });
                        y += Math.max(descHeight, 12) + 6;

                        // Thin separator between rows
                        doc.moveTo(55, y - 3).lineTo(doc.page.width - 55, y - 3)
                            .strokeColor('#f1f5f9').lineWidth(0.3).stroke();
                    }

                    y += 10;
                }
            }

            // ── Footer on each page ─────────────────────────────────────────
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
                    .text(
                        `SteelConnect Admin Activity Report — Page ${i + 1} of ${pageCount} — Generated ${new Date().toLocaleString()}`,
                        50,
                        doc.page.height - 35,
                        { width: doc.page.width - 100, align: 'center' }
                    );
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// ─── HTML email body (summary + tells recipient to open the PDF) ─────────────

function buildEmailHTML(activities, periodStart, periodEnd) {
    const categorySummary = {};
    activities.forEach(a => {
        const cat = a.category || 'Other';
        categorySummary[cat] = (categorySummary[cat] || 0) + 1;
    });

    const catRows = Object.entries(categorySummary)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => {
            const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Default'];
            return `<tr>
                <td style="padding:8px 12px; border-bottom:1px solid #f1f5f9;">
                    <span style="display:inline-block; padding:2px 10px; border-radius:12px; background:${colors.bg}; color:${colors.text}; font-size:12px; font-weight:600;">${cat}</span>
                </td>
                <td style="padding:8px 12px; border-bottom:1px solid #f1f5f9; text-align:right; font-weight:700; color:#1e293b;">${count}</td>
            </tr>`;
        })
        .join('');

    return `
<h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">Hourly Admin Activity Report</h2>
<p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">
    Here is your admin activity summary for the period:<br>
    <strong>${periodStart.toLocaleString()}</strong> to <strong>${periodEnd.toLocaleString()}</strong>
</p>

<div style="padding:14px 16px; background:#f0fdf4; border-left:3px solid #22c55e; border-radius:4px; margin:18px 0; font-size:14px; color:#14532d;">
    <strong>Total Activities:</strong> ${activities.length}
</div>

${activities.length > 0 ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0;">
    <tr style="background:#f8fafc;">
        <th style="padding:10px 12px; text-align:left; font-size:12px; color:#64748b; border-bottom:2px solid #e2e8f0;">CATEGORY</th>
        <th style="padding:10px 12px; text-align:right; font-size:12px; color:#64748b; border-bottom:2px solid #e2e8f0;">COUNT</th>
    </tr>
    ${catRows}
</table>
` : `
<p style="font-size:14px; color:#64748b; text-align:center; padding:20px; background:#f8fafc; border-radius:8px;">
    No admin activities recorded during this period.
</p>
`}

<div style="padding:14px 16px; background:#fffbeb; border-left:3px solid #f59e0b; border-radius:4px; margin:18px 0; font-size:14px; color:#78350f; line-height:1.6;">
    <strong>Note:</strong> The detailed report is attached as a PDF with all individual activities grouped by category.
</div>

<p style="font-size:13px; color:#94a3b8; margin-top:20px;">This is an automated report sent every hour from SteelConnect.</p>`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate and email the hourly admin activity report.
 * Called by the scheduler every 60 minutes.
 */
export async function sendHourlyAdminActivityReport() {
    try {
        const periodEnd = new Date();
        const periodStart = new Date(periodEnd.getTime() - 60 * 60 * 1000); // 1 hour ago

        console.log(`[ADMIN-REPORT] Generating hourly report: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

        const activities = await getRecentActivities(1);

        console.log(`[ADMIN-REPORT] Found ${activities.length} activities in the last hour`);

        // Generate PDF
        const pdfBuffer = await generatePDFReport(activities, periodStart, periodEnd);
        console.log(`[ADMIN-REPORT] PDF generated — ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        // Build email body
        const htmlContent = buildEmailHTML(activities, periodStart, periodEnd);

        // Send via Resend with PDF attachment
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const dateStr = periodEnd.toISOString().slice(0, 10);
        const timeStr = periodEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).replace(/[: ]/g, '');

        // We wrap the HTML just like sendGenericEmail does
        const { default: emailService } = await import('../utils/emailService.js');

        const response = await resend.emails.send({
            from: 'SteelConnect System <noreply@steelconnectapp.com>',
            reply_to: 'support@steelconnectapp.com',
            to: ADMIN_REPORT_EMAIL,
            subject: `Admin Activity Report — ${periodEnd.toLocaleString()} (${activities.length} activities)`,
            html: buildFullEmailHTML(htmlContent),
            attachments: [
                {
                    filename: `SteelConnect_Admin_Report_${dateStr}_${timeStr}.pdf`,
                    content: pdfBuffer.toString('base64'),
                    content_type: 'application/pdf'
                }
            ]
        });

        if (response.error) {
            console.error('[ADMIN-REPORT] Email send error:', response.error);
            return { success: false, error: response.error };
        }

        console.log(`[ADMIN-REPORT] Report emailed to ${ADMIN_REPORT_EMAIL} — ID: ${response.data?.id}`);
        return { success: true, activitiesCount: activities.length, emailId: response.data?.id };
    } catch (error) {
        console.error('[ADMIN-REPORT] Failed to send hourly report:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate and return the PDF buffer for a manual download (API endpoint).
 */
export async function generateManualReport(hours = 1) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);
    const activities = await getRecentActivities(hours);
    const pdfBuffer = await generatePDFReport(activities, periodStart, periodEnd);
    return { pdfBuffer, activitiesCount: activities.length, periodStart, periodEnd };
}

// ─── Minimal email wrapper (replicates the emailService template) ────────────
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
<p style="margin:0;">This is an automated hourly report. Contact <a href="mailto:support@steelconnectapp.com" style="color:#2563eb; text-decoration:none;">support@steelconnectapp.com</a> for questions.</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export default {
    sendHourlyAdminActivityReport,
    generateManualReport
};
