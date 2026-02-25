// src/services/whatsappService.js
// WhatsApp Business Cloud API service for sending marketing messages.
// Uses Meta's Graph API v21.0.
//
// Required environment variables:
//   WHATSAPP_PHONE_NUMBER_ID  - Your WhatsApp Business phone number ID (from Meta Developer Portal)
//   WHATSAPP_ACCESS_TOKEN     - Permanent access token from Meta Business
//   WHATSAPP_BUSINESS_ID      - (optional) Your WhatsApp Business Account ID
//
// Admin phone (for activity alerts): 919895909666 (testing, will change to Dubai number)

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Check if WhatsApp Cloud API is configured.
 */
export function isWhatsAppConfigured() {
    return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * Get WhatsApp configuration status (safe for frontend).
 */
export function getWhatsAppStatus() {
    const configured = isWhatsAppConfigured();
    return {
        configured,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? '***' + process.env.WHATSAPP_PHONE_NUMBER_ID.slice(-4) : null,
        businessId: process.env.WHATSAPP_BUSINESS_ID ? '***' + process.env.WHATSAPP_BUSINESS_ID.slice(-4) : null,
        senderNumber: process.env.WHATSAPP_SENDER_NUMBER || '9895909666',
        message: configured
            ? 'WhatsApp Cloud API is configured and ready'
            : 'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in environment variables.'
    };
}

/**
 * Send a text message to a single WhatsApp number.
 *
 * @param {string} to - Recipient phone number with country code (e.g. "919895909666")
 * @param {string} message - Text message body
 * @returns {Object} { success, messageId, error }
 */
export async function sendWhatsAppText(to, message) {
    if (!isWhatsAppConfigured()) {
        return { success: false, error: 'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.' };
    }

    try {
        // Clean phone number - remove spaces, dashes, plus sign
        const cleanPhone = to.replace(/[\s\-\+\(\)]/g, '');

        const response = await fetch(
            `${GRAPH_API_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanPhone,
                    type: 'text',
                    text: {
                        preview_url: true,
                        body: message
                    }
                })
            }
        );

        const data = await response.json();

        if (response.ok && data.messages && data.messages.length > 0) {
            console.log(`[WHATSAPP] Message sent to ${cleanPhone} — ID: ${data.messages[0].id}`);
            return {
                success: true,
                messageId: data.messages[0].id,
                phone: cleanPhone
            };
        } else {
            const errorMsg = data.error?.message || data.error?.error_data?.details || 'Unknown WhatsApp API error';
            console.error(`[WHATSAPP] Send failed to ${cleanPhone}:`, errorMsg);
            return {
                success: false,
                error: errorMsg,
                phone: cleanPhone,
                errorCode: data.error?.code
            };
        }
    } catch (error) {
        console.error(`[WHATSAPP] Network error sending to ${to}:`, error.message);
        return { success: false, error: error.message, phone: to };
    }
}

/**
 * Send a template message (required for first-time contacts in WhatsApp Business).
 *
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Template name registered in Meta Business
 * @param {string} languageCode - e.g. "en_US"
 * @param {Array} components - Template components with parameters
 */
export async function sendWhatsAppTemplate(to, templateName, languageCode = 'en_US', components = []) {
    if (!isWhatsAppConfigured()) {
        return { success: false, error: 'WhatsApp not configured' };
    }

    try {
        const cleanPhone = to.replace(/[\s\-\+\(\)]/g, '');

        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanPhone,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode }
            }
        };

        if (components.length > 0) {
            body.template.components = components;
        }

        const response = await fetch(
            `${GRAPH_API_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        const data = await response.json();

        if (response.ok && data.messages) {
            return { success: true, messageId: data.messages[0]?.id, phone: cleanPhone };
        } else {
            return { success: false, error: data.error?.message || 'Template send failed', phone: cleanPhone };
        }
    } catch (error) {
        return { success: false, error: error.message, phone: to };
    }
}

/**
 * Send bulk WhatsApp messages to multiple recipients.
 * Sends sequentially with a small delay to avoid rate limits.
 *
 * @param {Array} recipients - Array of { phone, name } objects
 * @param {string} messageTemplate - Message with {{name}} placeholder
 * @param {number} delayMs - Delay between messages (default 1000ms)
 * @returns {Object} { sent, failed, results }
 */
export async function sendBulkWhatsApp(recipients, messageTemplate, delayMs = 1000) {
    if (!isWhatsAppConfigured()) {
        return { sent: 0, failed: recipients.length, error: 'WhatsApp not configured', results: [] };
    }

    const results = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i++) {
        const { phone, name } = recipients[i];

        // Personalize message
        const personalizedMsg = messageTemplate
            .replace(/\{\{name\}\}/gi, name || 'there')
            .replace(/\{\{phone\}\}/gi, phone || '');

        const result = await sendWhatsAppText(phone, personalizedMsg);
        results.push({ ...result, recipientName: name, recipientPhone: phone });

        if (result.success) {
            sent++;
        } else {
            failed++;
        }

        // Rate limit: wait between messages (skip delay on last message)
        if (i < recipients.length - 1 && delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    console.log(`[WHATSAPP-BULK] Sent: ${sent}, Failed: ${failed} out of ${recipients.length}`);
    return { sent, failed, total: recipients.length, results };
}

export default {
    isWhatsAppConfigured,
    getWhatsAppStatus,
    sendWhatsAppText,
    sendWhatsAppTemplate,
    sendBulkWhatsApp
};
