// src/services/paymentGateway.js - Stripe & Razorpay Payment Gateway Integration
//
// Environment Variables Required:
// ── Stripe (International) ──
//   STRIPE_SECRET_KEY        - Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET    - Stripe webhook signing secret (whsec_...)
//   STRIPE_PUBLISHABLE_KEY   - Stripe publishable key for frontend (pk_live_... or pk_test_...)
//
// ── Razorpay (India) ──
//   RAZORPAY_KEY_ID          - Razorpay Key ID (rzp_live_... or rzp_test_...)
//   RAZORPAY_KEY_SECRET      - Razorpay Key Secret
//   RAZORPAY_WEBHOOK_SECRET  - Razorpay webhook secret
//
// ── General ──
//   FRONTEND_URL             - Frontend URL for redirect after payment
//   RAZORPAY_INR_RATE        - USD to INR conversion rate (default: 83)

import crypto from 'crypto';

// ============================================================
// GATEWAY AVAILABILITY CHECK
// ============================================================
export function isStripeConfigured() {
    return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_'));
}

export function isRazorpayConfigured() {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getPaymentConfig() {
    return {
        stripe: {
            enabled: isStripeConfigured(),
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
        },
        razorpay: {
            enabled: isRazorpayConfigured(),
            keyId: process.env.RAZORPAY_KEY_ID || null,
        },
        defaultGateway: isStripeConfigured() ? 'stripe' : isRazorpayConfigured() ? 'razorpay' : null,
    };
}

// ============================================================
// STRIPE HELPERS
// ============================================================
let _stripe = null;

// Lazy-load Stripe to avoid crash if not configured
export async function getStripeInstance() {
    if (!isStripeConfigured()) return null;
    if (!_stripe) {
        const { default: Stripe } = await import('stripe');
        _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
    return _stripe;
}

/**
 * Create a Stripe Checkout Session
 */
export async function createStripeCheckout({
    plan,
    finalAmount,
    isYearly,
    isPayPerUse,
    subscriptionId,
    userId,
    planId,
    userEmail,
    billingCycle,
}) {
    const stripe = await getStripeInstance();
    if (!stripe) {
        throw new Error('Stripe is not configured. Add STRIPE_SECRET_KEY to environment variables.');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://steelconnectapp.com';

    // For pay-per-use plans, use 'payment' mode (one-time)
    // For recurring plans, use 'subscription' mode
    const isRecurring = !isPayPerUse && (billingCycle === 'monthly' || billingCycle === 'yearly');

    const lineItem = {
        price_data: {
            currency: 'usd',
            product_data: {
                name: plan.label + (isYearly ? ' (Yearly)' : ''),
                description: plan.description,
            },
            unit_amount: Math.round(finalAmount * 100), // Stripe uses cents
        },
        quantity: 1,
    };

    if (isRecurring) {
        lineItem.price_data.recurring = {
            interval: isYearly ? 'year' : 'month',
        };
    }

    const sessionConfig = {
        payment_method_types: ['card'],
        line_items: [lineItem],
        mode: isRecurring ? 'subscription' : 'payment',
        success_url: `${frontendUrl}/?section=subscription&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/?section=subscription&payment=cancelled`,
        customer_email: userEmail,
        metadata: {
            userId,
            planId,
            subscriptionId: subscriptionId.toString(),
            billingCycle: billingCycle || 'monthly',
            gateway: 'stripe',
        },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return {
        checkoutUrl: session.url,
        sessionId: session.id,
        gateway: 'stripe',
    };
}

/**
 * Verify Stripe webhook signature
 */
export async function verifyStripeWebhook(rawBody, signature) {
    const stripe = await getStripeInstance();
    if (!stripe) throw new Error('Stripe not configured');

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

    return stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
}

// ============================================================
// RAZORPAY HELPERS
// ============================================================
let _razorpay = null;

export async function getRazorpayInstance() {
    if (!isRazorpayConfigured()) return null;
    if (!_razorpay) {
        const { default: Razorpay } = await import('razorpay');
        _razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return _razorpay;
}

/**
 * Convert USD to INR (paise)
 * Razorpay requires amounts in the smallest currency unit (paise for INR)
 */
export function usdToInrPaise(usdAmount) {
    const rate = parseFloat(process.env.RAZORPAY_INR_RATE) || 83;
    const inrAmount = usdAmount * rate;
    return Math.round(inrAmount * 100); // Convert to paise
}

export function usdToInr(usdAmount) {
    const rate = parseFloat(process.env.RAZORPAY_INR_RATE) || 83;
    return parseFloat((usdAmount * rate).toFixed(2));
}

/**
 * Create a Razorpay Order (for one-time / pay-per-use payments)
 */
export async function createRazorpayOrder({
    plan,
    finalAmount,
    isYearly,
    subscriptionId,
    userId,
    planId,
    userEmail,
    userName,
    billingCycle,
}) {
    const razorpay = await getRazorpayInstance();
    if (!razorpay) {
        throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to environment variables.');
    }

    const amountInPaise = usdToInrPaise(finalAmount);
    const amountInInr = usdToInr(finalAmount);

    const orderOptions = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: `sub_${subscriptionId}`,
        notes: {
            userId,
            planId,
            subscriptionId: subscriptionId.toString(),
            billingCycle: billingCycle || 'monthly',
            usdAmount: finalAmount.toString(),
            gateway: 'razorpay',
        },
    };

    const order = await razorpay.orders.create(orderOptions);

    return {
        gateway: 'razorpay',
        orderId: order.id,
        amount: amountInPaise,
        amountInr: amountInInr,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        prefill: {
            name: userName || '',
            email: userEmail,
        },
        notes: orderOptions.notes,
        planLabel: plan.label + (isYearly ? ' (Yearly)' : ''),
        description: `SteelConnect - ${plan.label}${isYearly ? ' (Yearly)' : ''}`,
    };
}

/**
 * Verify Razorpay payment signature
 * This is called after the user completes payment on the frontend
 */
export function verifyRazorpayPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) throw new Error('RAZORPAY_KEY_SECRET not configured');

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

    return expectedSignature === razorpay_signature;
}

/**
 * Verify Razorpay webhook signature
 */
export function verifyRazorpayWebhook(rawBody, signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET not configured');

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    return expectedSignature === signature;
}
