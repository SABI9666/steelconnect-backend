// src/services/whatsappService.js
// Dedicated WhatsApp Business Cloud API service for SteelConnect.
// Handles sending text and template messages via Meta's Graph API.

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Check whether WhatsApp credentials are configured.
 * @returns {{ configured: boolean, phoneNumberId: string|null }}
 */
export function getWhatsAppConfig() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null;
    return {
        configured: !!(phoneNumberId && accessToken),
        phoneNumberId,
        hasAccessToken: !!accessToken
    };
}

/**
 * Send a plain-text WhatsApp message.
 *
 * @param {Object} opts
 * @param {string} opts.to       - Recipient phone number in international format (e.g. "919895909666")
 * @param {string} opts.message  - Text message body (supports WhatsApp markdown: *bold*, _italic_, ~strike~)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppText({ to, message }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        console.log('[WHATSAPP] Not configured — missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return { success: false, error: 'WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in your environment.' };
    }

    if (!to || !message) {
        return { success: false, error: 'Missing required fields: to, message' };
    }

    try {
        const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: message }
            })
        });

        const data = await response.json();

        if (response.ok && data.messages) {
            console.log(`[WHATSAPP] Message sent to ${to} — ID: ${data.messages[0]?.id}`);
            return { success: true, messageId: data.messages[0]?.id };
        }

        // Handle specific Meta API errors
        const errorMsg = data.error?.message || 'Unknown WhatsApp API error';
        const errorCode = data.error?.code;
        console.error(`[WHATSAPP] API error (code ${errorCode}): ${errorMsg}`);
        return { success: false, error: errorMsg, code: errorCode };
    } catch (error) {
        console.error('[WHATSAPP] Send failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a WhatsApp template message (pre-approved by Meta).
 * Useful for notifications where you need to message users who haven't
 * messaged you in the last 24 hours.
 *
 * @param {Object} opts
 * @param {string}   opts.to             - Recipient phone number
 * @param {string}   opts.templateName   - Approved template name
 * @param {string}   opts.languageCode   - Template language (default: "en_US")
 * @param {Array}    opts.components     - Template components (header, body, button params)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendWhatsAppTemplate({ to, templateName, languageCode = 'en_US', components = [] }) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        console.log('[WHATSAPP] Not configured — skipping template message');
        return { success: false, error: 'WhatsApp not configured' };
    }

    if (!to || !templateName) {
        return { success: false, error: 'Missing required fields: to, templateName' };
    }

    try {
        const payload = {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode },
                ...(components.length > 0 && { components })
            }
        };

        const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.messages) {
            console.log(`[WHATSAPP] Template "${templateName}" sent to ${to} — ID: ${data.messages[0]?.id}`);
            return { success: true, messageId: data.messages[0]?.id };
        }

        const errorMsg = data.error?.message || 'Unknown WhatsApp API error';
        console.error(`[WHATSAPP] Template API error: ${errorMsg}`);
        return { success: false, error: errorMsg };
    } catch (error) {
        console.error('[WHATSAPP] Template send failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Verify WhatsApp API connectivity by fetching the phone number details.
 * Useful for health checks and admin dashboard status.
 *
 * @returns {Promise<{ success: boolean, phoneNumber?: string, displayName?: string, error?: string }>}
 */
export async function verifyWhatsAppConnection() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        return { success: false, error: 'WhatsApp not configured' };
    }

    try {
        const response = await fetch(
            `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
            {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }
        );

        const data = await response.json();

        if (response.ok && data.display_phone_number) {
            console.log(`[WHATSAPP] Connection verified — Phone: ${data.display_phone_number}, Name: ${data.verified_name}`);
            return {
                success: true,
                phoneNumber: data.display_phone_number,
                displayName: data.verified_name,
                qualityRating: data.quality_rating
            };
        }

        const errorMsg = data.error?.message || 'Could not verify WhatsApp connection';
        console.error(`[WHATSAPP] Verification failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
    } catch (error) {
        console.error('[WHATSAPP] Verification error:', error.message);
        return { success: false, error: error.message };
    }
}

export default {
    getWhatsAppConfig,
    sendWhatsAppText,
    sendWhatsAppTemplate,
    verifyWhatsAppConnection
};
