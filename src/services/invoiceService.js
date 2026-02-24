// src/services/invoiceService.js - Invoice PDF Generation & Email Delivery
import { storage, adminDb } from '../config/firebase.js';
import Invoice from '../models/Invoice.js';
import Subscription from '../models/Subscription.js';
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'noreply@steelconnectapp.com';
const REPLY_TO = 'support@steelconnectapp.com';
const ADMIN_EMAIL = process.env.ADMIN_INVOICE_EMAIL || 'sabincn676@gmail.com';

// Company details for invoice header
const COMPANY = {
    name: 'SteelConnect',
    legalName: 'SteelConnect LLC',
    address: 'Professional Steel Construction Platform',
    email: 'billing@steelconnectapp.com',
    website: 'steelconnectapp.com',
    tagline: 'Professional Steel & Rebar Design Marketplace',
};

// ============================================================
// Generate unique invoice number: SC-INV-YYYYMM-XXXX
// ============================================================
async function generateInvoiceNumber() {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await Invoice.countDocuments({
        invoiceNumber: { $regex: `^SC-INV-${yearMonth}` },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `SC-INV-${yearMonth}-${seq}`;
}

// ============================================================
// Generate Invoice PDF using PDFKit
// ============================================================
async function generateInvoicePDF(invoice) {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                info: {
                    Title: `Invoice ${invoice.invoiceNumber}`,
                    Author: COMPANY.name,
                    Subject: `Invoice for ${invoice.planLabel}`,
                },
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const pageWidth = doc.page.width - 100; // 50 margin each side
            const leftCol = 50;
            const rightCol = 350;

            // ─── HEADER BAR ──────────────────────────────────
            doc.rect(0, 0, doc.page.width, 100).fill('#1e3a8a');

            // Company name
            doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
                .text(COMPANY.name, leftCol, 30, { width: 250 });
            doc.fontSize(9).fillColor('#93c5fd').font('Helvetica')
                .text(COMPANY.tagline, leftCol, 60, { width: 250 });

            // INVOICE label on right
            doc.fontSize(28).fillColor('#ffffff').font('Helvetica-Bold')
                .text('INVOICE', rightCol, 30, { width: 200, align: 'right' });
            doc.fontSize(10).fillColor('#93c5fd').font('Helvetica')
                .text(invoice.invoiceNumber, rightCol, 62, { width: 200, align: 'right' });

            // ─── INVOICE META ────────────────────────────────
            let y = 120;

            doc.fontSize(9).fillColor('#64748b').font('Helvetica')
                .text('Issue Date:', leftCol, y)
                .text('Billing Period:', leftCol, y + 16)
                .text('Status:', leftCol, y + 32);

            doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold')
                .text(formatDate(invoice.issuedAt), leftCol + 85, y)
                .text(`${formatDate(invoice.billingPeriodStart)} — ${formatDate(invoice.billingPeriodEnd)}`, leftCol + 85, y + 16);

            // Status badge
            const statusColor = invoice.status === 'paid' ? '#059669' : invoice.status === 'free' ? '#2563eb' : '#d97706';
            const statusLabel = invoice.status.toUpperCase();
            doc.fontSize(9).fillColor(statusColor).font('Helvetica-Bold')
                .text(statusLabel, leftCol + 85, y + 32);

            // ─── FROM / TO BLOCKS ────────────────────────────
            y = 185;

            // From (Company)
            doc.rect(leftCol, y, 230, 95).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold')
                .text('FROM', leftCol + 14, y + 10);
            doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold')
                .text(COMPANY.legalName, leftCol + 14, y + 26);
            doc.fontSize(9).fillColor('#475569').font('Helvetica')
                .text(COMPANY.address, leftCol + 14, y + 42)
                .text(COMPANY.email, leftCol + 14, y + 56)
                .text(COMPANY.website, leftCol + 14, y + 70);

            // To (Customer)
            doc.rect(rightCol - 20, y, 230, 95).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fontSize(8).fillColor('#64748b').font('Helvetica-Bold')
                .text('BILL TO', rightCol - 6, y + 10);
            doc.fontSize(11).fillColor('#0f172a').font('Helvetica-Bold')
                .text(invoice.customerName, rightCol - 6, y + 26);
            doc.fontSize(9).fillColor('#475569').font('Helvetica');

            const addr = invoice.customerAddress || {};
            const addrLines = [
                invoice.customerCompany,
                invoice.customerEmail,
                [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', '),
                addr.country,
            ].filter(Boolean);

            let addrY = y + 42;
            addrLines.forEach(line => {
                doc.text(line, rightCol - 6, addrY, { width: 210 });
                addrY += 14;
            });

            // ─── LINE ITEMS TABLE ────────────────────────────
            y = 310;

            // Table header
            doc.rect(leftCol, y, pageWidth, 28).fill('#1e3a8a');
            doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold')
                .text('Description', leftCol + 14, y + 8, { width: 260 })
                .text('Qty', leftCol + 280, y + 8, { width: 50, align: 'center' })
                .text('Unit Price', leftCol + 340, y + 8, { width: 80, align: 'right' })
                .text('Amount', leftCol + 420, y + 8, { width: 70, align: 'right' });

            y += 28;

            // Line item row
            const rowBg = '#ffffff';
            doc.rect(leftCol, y, pageWidth, 36).fillAndStroke(rowBg, '#e2e8f0');
            doc.fontSize(10).fillColor('#0f172a').font('Helvetica-Bold')
                .text(invoice.planLabel, leftCol + 14, y + 6, { width: 260 });
            doc.fontSize(8).fillColor('#64748b').font('Helvetica')
                .text(invoice.description || 'Monthly subscription', leftCol + 14, y + 20, { width: 260 });
            doc.fontSize(10).fillColor('#0f172a').font('Helvetica')
                .text('1', leftCol + 280, y + 12, { width: 50, align: 'center' })
                .text(`$${invoice.subtotal.toFixed(2)}`, leftCol + 340, y + 12, { width: 80, align: 'right' })
                .text(`$${invoice.subtotal.toFixed(2)}`, leftCol + 420, y + 12, { width: 70, align: 'right' });

            y += 36;

            // ─── TOTALS ──────────────────────────────────────
            y += 16;
            const totalsX = leftCol + 320;
            const totalsValueX = leftCol + 420;

            // Subtotal
            doc.fontSize(10).fillColor('#64748b').font('Helvetica')
                .text('Subtotal:', totalsX, y, { width: 100, align: 'right' });
            doc.fontSize(10).fillColor('#0f172a').font('Helvetica')
                .text(`$${invoice.subtotal.toFixed(2)}`, totalsValueX, y, { width: 70, align: 'right' });

            y += 18;

            // Tax
            if (invoice.tax > 0) {
                doc.fontSize(10).fillColor('#64748b').font('Helvetica')
                    .text(`Tax (${invoice.taxRate}%):`, totalsX, y, { width: 100, align: 'right' });
                doc.fontSize(10).fillColor('#0f172a').font('Helvetica')
                    .text(`$${invoice.tax.toFixed(2)}`, totalsValueX, y, { width: 70, align: 'right' });
                y += 18;
            }

            // Divider line
            doc.moveTo(totalsX, y).lineTo(totalsValueX + 70, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
            y += 8;

            // Total
            doc.rect(totalsX - 10, y - 4, 170, 30).fill('#f0fdf4');
            doc.fontSize(14).fillColor('#059669').font('Helvetica-Bold')
                .text('TOTAL:', totalsX, y, { width: 100, align: 'right' });
            doc.fontSize(14).fillColor('#059669').font('Helvetica-Bold')
                .text(`$${invoice.total.toFixed(2)} ${invoice.currency}`, totalsValueX, y, { width: 70, align: 'right' });

            // ─── PAYMENT INFO ────────────────────────────────
            y += 50;
            doc.rect(leftCol, y, pageWidth, 50).fillAndStroke('#eff6ff', '#bfdbfe');
            doc.fontSize(9).fillColor('#1e40af').font('Helvetica-Bold')
                .text('Payment Information', leftCol + 14, y + 8);
            doc.fontSize(9).fillColor('#3b82f6').font('Helvetica');

            const paymentInfo = invoice.paymentMethod === 'stripe'
                ? `Paid via Stripe${invoice.stripePaymentIntentId ? ` (Ref: ${invoice.stripePaymentIntentId})` : ''}`
                : invoice.paymentMethod === 'free'
                    ? 'Complimentary — No charge'
                    : 'Manual payment';
            doc.text(paymentInfo, leftCol + 14, y + 24, { width: pageWidth - 28 });

            // ─── FOOTER ──────────────────────────────────────
            y = doc.page.height - 80;
            doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y)
                .strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 10;
            doc.fontSize(8).fillColor('#94a3b8').font('Helvetica')
                .text('Thank you for choosing SteelConnect! If you have questions about this invoice, contact billing@steelconnectapp.com', leftCol, y, {
                    width: pageWidth,
                    align: 'center',
                });
            doc.fontSize(7).fillColor('#cbd5e1')
                .text(`${COMPANY.legalName} • ${COMPANY.website} • Generated on ${new Date().toISOString().split('T')[0]}`, leftCol, y + 16, {
                    width: pageWidth,
                    align: 'center',
                });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// ============================================================
// Upload PDF to Firebase Storage
// ============================================================
async function uploadInvoicePDF(pdfBuffer, invoiceNumber) {
    const bucket = storage.bucket();
    const filePath = `invoices/${invoiceNumber}.pdf`;
    const file = bucket.file(filePath);

    await file.save(pdfBuffer, {
        metadata: {
            contentType: 'application/pdf',
            metadata: {
                invoiceNumber,
                generatedAt: new Date().toISOString(),
            },
        },
    });

    // Generate a long-lived signed URL (365 days)
    const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    return { filePath, signedUrl };
}

// ============================================================
// Send Invoice Email
// ============================================================
async function sendInvoiceEmail(invoice, pdfBuffer, recipientEmail, isAdmin = false) {
    try {
        const subject = isAdmin
            ? `[Admin Copy] Invoice ${invoice.invoiceNumber} — ${invoice.customerName}`
            : `Your Invoice ${invoice.invoiceNumber} from SteelConnect`;

        const greeting = isAdmin
            ? `<p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">New invoice generated for <strong>${invoice.customerName}</strong> (${invoice.customerEmail}).</p>`
            : `<p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">Hi ${invoice.customerName},</p><p style="font-size:15px; color:#334155; margin:0 0 14px 0; line-height:1.7;">Thank you for your subscription! Please find your invoice attached below.</p>`;

        const htmlContent = `
<h2 style="font-size:20px; font-weight:700; color:#0f172a; margin:0 0 16px 0;">Invoice ${invoice.invoiceNumber}</h2>
${greeting}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:16px 0;">
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9; width:40%;">Invoice Number</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${invoice.invoiceNumber}</td></tr>
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Plan</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${invoice.planLabel}</td></tr>
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Amount</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;"><strong>$${invoice.total.toFixed(2)} ${invoice.currency}</strong></td></tr>
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Status</td><td style="padding:10px 14px; font-size:14px; color:#059669; border-bottom:1px solid #f1f5f9; font-weight:600;">${invoice.status.toUpperCase()}</td></tr>
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Billing Period</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${formatDate(invoice.billingPeriodStart)} — ${formatDate(invoice.billingPeriodEnd)}</td></tr>
<tr><td style="padding:10px 14px; font-size:14px; color:#64748b; font-weight:500; border-bottom:1px solid #f1f5f9;">Payment</td><td style="padding:10px 14px; font-size:14px; color:#1e293b; border-bottom:1px solid #f1f5f9;">${invoice.paymentMethod === 'free' ? 'Complimentary' : invoice.paymentMethod === 'stripe' ? 'Stripe' : 'Manual'}</td></tr>
</table>
${invoice.pdfUrl ? `<p style="margin:20px 0;"><a href="${invoice.pdfUrl}" style="display:inline-block; background:#2563eb; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">Download Invoice PDF</a></p>` : ''}
<p style="font-size:14px; color:#64748b; text-align:center; margin:0 0 14px 0;">If you have questions about this invoice, please contact billing@steelconnectapp.com</p>`;

        const emailTemplate = getInvoiceEmailTemplate(htmlContent);

        const emailData = {
            from: `SteelConnect Billing <${FROM_EMAIL}>`,
            reply_to: REPLY_TO,
            to: recipientEmail,
            subject,
            html: emailTemplate,
            headers: {
                'X-Entity-Ref-ID': crypto.randomUUID(),
            },
        };

        // Attach PDF if available
        if (pdfBuffer) {
            emailData.attachments = [{
                filename: `${invoice.invoiceNumber}.pdf`,
                content: pdfBuffer.toString('base64'),
            }];
        }

        const response = await resend.emails.send(emailData);

        if (response.error) {
            console.error(`Invoice email error (${recipientEmail}):`, response.error);
            return false;
        }

        console.log(`Invoice email sent to ${recipientEmail} — ID: ${response.data?.id}`);
        return true;
    } catch (error) {
        console.error(`Failed to send invoice email to ${recipientEmail}:`, error);
        return false;
    }
}

// ============================================================
// MAIN: Create invoice for a subscription
// ============================================================
export async function createInvoiceForSubscription(subscription, options = {}) {
    try {
        const {
            stripePaymentIntentId = null,
            stripeInvoiceId = null,
        } = options;

        // Look up user details from Firestore
        let userData = {};
        try {
            const usersRef = adminDb.collection('users');
            const snapshot = await usersRef.where('email', '==', subscription.userEmail).get();
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                userData = {
                    name: data.name || data.profileData?.fullName || subscription.userName,
                    company: data.profileData?.companyName || '',
                    phone: data.profileData?.phone || '',
                    address: {
                        street: data.profileData?.address || data.profileData?.street || '',
                        city: data.profileData?.city || '',
                        state: data.profileData?.state || '',
                        zip: data.profileData?.zipCode || data.profileData?.zip || '',
                        country: data.profileData?.country || 'USA',
                    },
                };
            }
        } catch (e) {
            console.error('Error looking up user data for invoice:', e);
        }

        const invoiceNumber = await generateInvoiceNumber();

        const isFree = subscription.paymentMethod === 'free' || subscription.freeOverride;

        const invoice = new Invoice({
            invoiceNumber,
            subscriptionId: subscription._id,
            userId: subscription.userId,
            customerName: userData.name || subscription.userName || 'Customer',
            customerEmail: subscription.userEmail,
            customerAddress: userData.address || {},
            customerCompany: userData.company || '',
            customerPhone: userData.phone || '',
            planId: subscription.plan,
            planLabel: subscription.planLabel || subscription.plan,
            description: `${subscription.planLabel || subscription.plan} — Monthly Subscription`,
            subtotal: subscription.amount || 0,
            tax: 0,
            taxRate: 0,
            total: subscription.amount || 0,
            currency: 'USD',
            paymentMethod: subscription.paymentMethod || 'stripe',
            stripePaymentIntentId,
            stripeInvoiceId,
            status: isFree ? 'free' : 'paid',
            billingPeriodStart: subscription.startDate,
            billingPeriodEnd: subscription.endDate,
            issuedAt: new Date(),
        });

        await invoice.save();

        // Generate PDF
        let pdfBuffer = null;
        try {
            pdfBuffer = await generateInvoicePDF(invoice);

            // Upload to Firebase Storage
            const { filePath, signedUrl } = await uploadInvoicePDF(pdfBuffer, invoiceNumber);
            invoice.pdfPath = filePath;
            invoice.pdfUrl = signedUrl;
            await invoice.save();
        } catch (pdfErr) {
            console.error('PDF generation/upload error:', pdfErr);
            // Continue even if PDF fails — invoice record is still created
        }

        // Send invoice email to customer
        try {
            const customerSent = await sendInvoiceEmail(invoice, pdfBuffer, subscription.userEmail, false);
            if (customerSent) {
                invoice.emailSentToCustomer = true;
            }
        } catch (emailErr) {
            console.error('Customer invoice email error:', emailErr);
        }

        // Send invoice email to admin
        try {
            const adminSent = await sendInvoiceEmail(invoice, pdfBuffer, ADMIN_EMAIL, true);
            if (adminSent) {
                invoice.emailSentToAdmin = true;
            }
        } catch (emailErr) {
            console.error('Admin invoice email error:', emailErr);
        }

        // Save email delivery status
        await invoice.save();

        console.log(`Invoice ${invoiceNumber} created for ${subscription.userEmail} ($${invoice.total})`);
        return invoice;
    } catch (error) {
        console.error('Error creating invoice:', error);
        throw error;
    }
}

// ============================================================
// Regenerate PDF for an existing invoice
// ============================================================
export async function regenerateInvoicePDF(invoiceId) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    const pdfBuffer = await generateInvoicePDF(invoice);
    const { filePath, signedUrl } = await uploadInvoicePDF(pdfBuffer, invoice.invoiceNumber);

    invoice.pdfPath = filePath;
    invoice.pdfUrl = signedUrl;
    await invoice.save();

    return { invoice, pdfBuffer };
}

// ============================================================
// Helpers
// ============================================================
function formatDate(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInvoiceEmailTemplate(content) {
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
<td style="text-align:right;">
<span style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:1px;">Invoice</span>
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
<p style="margin:0 0 6px 0;">SteelConnect — Professional Steel Construction Platform</p>
<p style="margin:0;">Questions? Contact <a href="mailto:billing@steelconnectapp.com" style="color:#2563eb; text-decoration:none;">billing@steelconnectapp.com</a></p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
