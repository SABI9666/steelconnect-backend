// src/routes/subscriptions.js - Subscription Management, Stripe + Razorpay Integration & Invoice Generation
import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, storage } from '../config/firebase.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import { createInvoiceForSubscription, regenerateInvoicePDF } from '../services/invoiceService.js';
import {
    isStripeConfigured,
    isRazorpayConfigured,
    getPaymentConfig,
    getStripeInstance,
    createStripeCheckout,
    verifyStripeWebhook,
    getRazorpayInstance,
    createRazorpayOrder,
    verifyRazorpayPayment,
    verifyRazorpayWebhook,
    usdToInr,
} from '../services/paymentGateway.js';

const router = express.Router();

// ============================================================
// PLAN DEFINITIONS
// ============================================================
const PLAN_DEFINITIONS = {
    designer_free: {
        id: 'designer_free',
        label: 'Designer Free',
        type: 'designer',
        price: 0,
        quotesAllowed: 1,
        description: '1 quote included',
        features: ['1 project quote', 'Basic access'],
        supportsYearly: false,
    },
    designer_5: {
        id: 'designer_5',
        label: 'Designer Basic',
        type: 'designer',
        price: 5,
        billingCycle: 'monthly',
        quotesAllowed: 5,
        description: '5 quotes per month',
        features: ['5 project quotes', 'Email support'],
        supportsYearly: true,
        yearlyPrice: parseFloat((5 * 12 * 0.9).toFixed(2)), // 10% discount
    },
    designer_10: {
        id: 'designer_10',
        label: 'Designer Standard',
        type: 'designer',
        price: 10,
        billingCycle: 'monthly',
        quotesAllowed: 10,
        description: '10 quotes per month',
        features: ['10 project quotes', 'Priority support'],
        supportsYearly: true,
        yearlyPrice: parseFloat((10 * 12 * 0.9).toFixed(2)),
    },
    designer_15: {
        id: 'designer_15',
        label: 'Designer Plus',
        type: 'designer',
        price: 15,
        billingCycle: 'monthly',
        quotesAllowed: 20,
        description: '20 quotes per month',
        features: ['20 project quotes', 'Priority support', 'Analytics access'],
        supportsYearly: true,
        yearlyPrice: parseFloat((15 * 12 * 0.9).toFixed(2)),
    },
    designer_30: {
        id: 'designer_30',
        label: 'Designer Premium',
        type: 'designer',
        price: 30,
        billingCycle: 'monthly',
        quotesAllowed: null, // unlimited
        description: 'Unlimited quotes for 1 month',
        features: [
            'Unlimited project quotes',
            'Priority support',
            'Full analytics access',
            'Dedicated account manager',
        ],
        supportsYearly: true,
        yearlyPrice: parseFloat((30 * 12 * 0.9).toFixed(2)),
    },
    // ── AI ESTIMATION (DRAWING BASED) PLANS ──
    estimation_free: {
        id: 'estimation_free',
        label: 'Free Plan',
        type: 'contractor',
        price: 0,
        billingCycle: 'monthly',
        aiEstimationsAllowed: 1,
        maxUploadMB: 25,
        description: '$0/month — Try AI estimation with 1 free estimate',
        features: [
            '1 AI estimation',
            'Max drawing upload 25 MB',
            'Preview estimate only',
            'Watermarked report',
        ],
        badge: null,
        bestFor: null,
        supportsYearly: false,
    },
    estimation_starter: {
        id: 'estimation_starter',
        label: 'Starter Plan',
        type: 'contractor',
        price: 29,
        billingCycle: 'monthly',
        aiEstimationsAllowed: 5,
        maxUploadMB: 25,
        description: '$29/month — 5 AI estimations per month',
        features: [
            '5 AI estimations / month',
            'Max upload 25 MB',
            'Full estimation report',
            'Excel download',
            'Email support',
        ],
        badge: null,
        bestFor: 'Best for freelance estimators',
        supportsYearly: true,
        yearlyPrice: parseFloat((29 * 12 * 0.9).toFixed(2)),
    },
    estimation_professional: {
        id: 'estimation_professional',
        label: 'Professional Plan',
        type: 'contractor',
        price: 79,
        billingCycle: 'monthly',
        aiEstimationsAllowed: 20,
        maxUploadMB: 25,
        description: '$79/month — 20 AI estimations with priority processing',
        features: [
            '20 AI estimations / month',
            'Max upload 25 MB',
            'Excel + PDF reports',
            'Faster AI processing',
            'Priority support',
        ],
        badge: 'popular',
        bestFor: 'Best for detailing companies & estimators',
        supportsYearly: true,
        yearlyPrice: parseFloat((79 * 12 * 0.9).toFixed(2)),
    },
    estimation_business: {
        id: 'estimation_business',
        label: 'Business Plan',
        type: 'contractor',
        price: 149,
        billingCycle: 'monthly',
        aiEstimationsAllowed: 60,
        maxUploadMB: 25,
        description: '$149/month — 60 AI estimations with team access',
        features: [
            '60 AI estimations / month',
            'Max upload 25 MB',
            'Excel + PDF reports',
            'Team access (up to 3 users)',
            'Priority processing',
        ],
        badge: null,
        bestFor: 'Best for fabrication companies',
        supportsYearly: true,
        yearlyPrice: parseFloat((149 * 12 * 0.9).toFixed(2)),
    },
    estimation_payperuse: {
        id: 'estimation_payperuse',
        label: 'Pay-Per-Estimate',
        type: 'contractor',
        price: 9,
        billingCycle: null,
        aiEstimationsAllowed: 1,
        maxUploadMB: 25,
        isPayPerUse: true,
        description: '$9 per estimate — No subscription required',
        features: [
            'Max drawing upload 25 MB',
            'Full estimation report',
            'Excel download',
        ],
        badge: null,
        bestFor: 'Best for occasional users',
        supportsYearly: false,
    },
    // ── AI DATA ANALYSIS (FABRICATION / PRODUCTION DATA) PLANS ──
    analysis_free: {
        id: 'analysis_free',
        label: 'Free Analysis',
        type: 'ai_analysis',
        price: 0,
        billingCycle: null,
        aiAnalysisQuota: 1,
        maxUploadMB: 10,
        description: '$0 — 1 free analysis to test the system',
        features: [
            '1 free analysis',
            'Max file size 10 MB',
            'Basic AI insights',
        ],
        badge: null,
        bestFor: 'Try the analysis system',
        supportsYearly: false,
    },
    analysis_basic: {
        id: 'analysis_basic',
        label: 'Basic Data Analysis',
        type: 'ai_analysis',
        price: 10,
        billingCycle: null,
        aiAnalysisQuota: 3,
        maxUploadMB: 15,
        isPayPerUse: true,
        description: '$10 — 3 analyses with AI summary insights',
        features: [
            '3 analyses',
            'Max file size 15 MB',
            'Excel / CSV upload',
            'AI summary insights',
        ],
        badge: null,
        bestFor: null,
        supportsYearly: false,
    },
    analysis_advanced: {
        id: 'analysis_advanced',
        label: 'Advanced Data Analysis',
        type: 'ai_analysis',
        price: 20,
        billingCycle: null,
        aiAnalysisQuota: 8,
        maxUploadMB: 20,
        isPayPerUse: true,
        description: '$20 — 8 analyses with charts & AI recommendations',
        features: [
            '8 analyses',
            'Max file size 20 MB',
            'Charts + AI insights',
            'AI recommendations',
        ],
        badge: null,
        bestFor: null,
        supportsYearly: false,
    },
    analysis_pro: {
        id: 'analysis_pro',
        label: 'Analysis Pro Plan',
        type: 'ai_analysis',
        price: 49,
        billingCycle: 'monthly',
        aiAnalysisQuota: 30,
        maxUploadMB: 20,
        description: '$49/month — 30 analyses per month with charts & insights',
        features: [
            '30 analyses / month',
            'Max file size 20 MB',
            'Charts + AI insights',
        ],
        badge: 'popular',
        bestFor: null,
        supportsYearly: true,
        yearlyPrice: parseFloat((49 * 12 * 0.9).toFixed(2)),
    },
    analysis_business: {
        id: 'analysis_business',
        label: 'Analysis Business Plan',
        type: 'ai_analysis',
        price: 99,
        billingCycle: 'monthly',
        aiAnalysisQuota: 80,
        maxUploadMB: 25,
        description: '$99/month — 80 analyses with advanced insights & priority processing',
        features: [
            '80 analyses / month',
            'Max file size 25 MB',
            'Advanced insights',
            'Priority processing',
        ],
        badge: null,
        bestFor: null,
        supportsYearly: true,
        yearlyPrice: parseFloat((99 * 12 * 0.9).toFixed(2)),
    },
};

// ============================================================
// PAYMENT CONFIGURATION (Public)
// ============================================================

// GET /api/subscriptions/payment-config - Get available payment gateways
router.get('/payment-config', (req, res) => {
    try {
        const config = getPaymentConfig();
        res.json({ success: true, ...config });
    } catch (error) {
        console.error('Error fetching payment config:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payment config' });
    }
});

// ============================================================
// PUBLIC ROUTES (Authenticated users)
// ============================================================

// GET /api/subscriptions/public-plans - Public plans (no auth required, for landing page)
router.get('/public-plans', async (req, res) => {
    try {
        res.json({ success: true, plans: PLAN_DEFINITIONS });
    } catch (error) {
        console.error('Error fetching public plans:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
});

// GET /api/subscriptions/plans - Get available plans
router.get('/plans', authenticateToken, async (req, res) => {
    try {
        res.json({ success: true, plans: PLAN_DEFINITIONS });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
});

// GET /api/subscriptions/my-subscription - Get current user's subscription
router.get('/my-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'free_override'] }
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            subscription: subscription || null,
            plans: PLAN_DEFINITIONS,
        });
    } catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
    }
});

// GET /api/subscriptions/my-invoices - Get current user's invoices
router.get('/my-invoices', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const invoices = await Invoice.find({ userId })
            .sort({ issuedAt: -1 })
            .limit(50);

        res.json({ success: true, invoices });
    } catch (error) {
        console.error('Error fetching user invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
});

// GET /api/subscriptions/invoice/:invoiceId/download - Download invoice PDF
router.get('/invoice/:invoiceId/download', authenticateToken, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }

        // Verify user owns this invoice (or is admin)
        const isOwner = invoice.userId === req.user.userId;
        const isAdminUser = req.user.role === 'admin';
        if (!isOwner && !isAdminUser) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (invoice.pdfUrl) {
            return res.json({ success: true, downloadUrl: invoice.pdfUrl });
        }

        // Regenerate PDF if missing
        const { pdfBuffer } = await regenerateInvoicePDF(invoice._id);
        const updatedInvoice = await Invoice.findById(invoice._id);

        res.json({ success: true, downloadUrl: updatedInvoice.pdfUrl });
    } catch (error) {
        console.error('Error downloading invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to download invoice' });
    }
});

// POST /api/subscriptions/create-checkout - Create payment checkout (Stripe or Razorpay)
router.post('/create-checkout', authenticateToken, async (req, res) => {
    try {
        const { planId, billingCycle: requestedCycle, gateway: requestedGateway } = req.body;
        const userId = req.user.userId;
        const userEmail = req.user.email;
        const userName = req.user.name || '';

        if (!planId || !PLAN_DEFINITIONS[planId]) {
            return res.status(400).json({ success: false, message: 'Invalid plan selected' });
        }

        const plan = PLAN_DEFINITIONS[planId];
        const isYearly = requestedCycle === 'yearly' && plan.supportsYearly;

        // ── FREE PLAN: activate immediately ──
        if (plan.price === 0) {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setMonth(endDate.getMonth() + 1);

            const subscription = new Subscription({
                userId,
                userEmail,
                userName,
                userType: plan.type,
                plan: planId,
                planLabel: plan.label,
                amount: 0,
                quotesAllowed: plan.quotesAllowed,
                quotesUsed: 0,
                aiEstimationsAllowed: plan.aiEstimationsAllowed || null,
                aiEstimationsUsed: 0,
                aiAnalysisQuota: plan.aiAnalysisQuota || null,
                aiAnalysesUsed: 0,
                maxUploadMB: plan.maxUploadMB || 25,
                billingCycle: plan.billingCycle || null,
                status: 'active',
                startDate: now,
                endDate,
                paymentMethod: 'free',
            });

            await subscription.save();

            // Update Firestore
            try {
                const usersRef = adminDb.collection('users');
                const userSnapshot = await usersRef.where('email', '==', userEmail).get();
                if (!userSnapshot.empty) {
                    await userSnapshot.docs[0].ref.update({
                        'subscription.status': 'active',
                        'subscription.plan': planId,
                        'subscription.endDate': endDate,
                    });
                }
            } catch (e) { console.error('Firestore update error:', e); }

            // Generate invoice
            try { await createInvoiceForSubscription(subscription); }
            catch (invoiceErr) { console.error('Invoice generation error (free plan):', invoiceErr); }

            return res.json({ success: true, message: 'Free plan activated', subscription });
        }

        // ── PAID PLAN: calculate final amount and dates ──
        const now = new Date();
        const endDate = new Date(now);
        let finalAmount = plan.price;
        let finalBillingCycle = plan.billingCycle || null;

        if (isYearly) {
            finalAmount = plan.yearlyPrice;
            finalBillingCycle = 'yearly';
            endDate.setFullYear(endDate.getFullYear() + 1);
        } else if (plan.billingCycle === 'weekly') {
            endDate.setDate(endDate.getDate() + 7);
        } else {
            endDate.setMonth(endDate.getMonth() + 1);
        }

        // Determine which payment gateway to use
        const gateway = requestedGateway || (isRazorpayConfigured() && !isStripeConfigured() ? 'razorpay' : 'stripe');

        const subscription = new Subscription({
            userId,
            userEmail,
            userName,
            userType: plan.type,
            plan: planId,
            planLabel: plan.label + (isYearly ? ' (Yearly)' : ''),
            amount: finalAmount,
            quotesAllowed: plan.quotesAllowed || null,
            quotesUsed: 0,
            aiEstimationsAllowed: plan.aiEstimationsAllowed || null,
            aiEstimationsUsed: 0,
            maxUploadMB: plan.maxUploadMB || 25,
            isPayPerUse: plan.isPayPerUse || false,
            aiEstimationRate: plan.aiEstimationRate || null,
            aiAnalysisRate: plan.aiAnalysisRate || null,
            aiAnalysisQuota: plan.aiAnalysisQuota || null,
            aiAnalysesUsed: 0,
            storageAllowedMB: plan.storageAllowedMB || null,
            storageUsedMB: 0,
            billingCycle: finalBillingCycle,
            status: 'pending',
            startDate: now,
            endDate,
            paymentMethod: gateway,
            paymentGateway: gateway,
        });

        await subscription.save();

        // ── STRIPE CHECKOUT ──
        if (gateway === 'stripe' && isStripeConfigured()) {
            try {
                const result = await createStripeCheckout({
                    plan,
                    finalAmount,
                    isYearly,
                    isPayPerUse: plan.isPayPerUse || false,
                    subscriptionId: subscription._id,
                    userId,
                    planId,
                    userEmail,
                    billingCycle: finalBillingCycle,
                });

                return res.json({
                    success: true,
                    gateway: 'stripe',
                    checkoutUrl: result.checkoutUrl,
                    sessionId: result.sessionId,
                    subscription,
                });
            } catch (stripeErr) {
                console.error('Stripe checkout error:', stripeErr);
                // Clean up pending subscription
                await Subscription.findByIdAndDelete(subscription._id);
                return res.status(500).json({ success: false, message: 'Failed to create Stripe checkout: ' + stripeErr.message });
            }
        }

        // ── RAZORPAY CHECKOUT ──
        if (gateway === 'razorpay' && isRazorpayConfigured()) {
            try {
                const result = await createRazorpayOrder({
                    plan,
                    finalAmount,
                    isYearly,
                    subscriptionId: subscription._id,
                    userId,
                    planId,
                    userEmail,
                    userName,
                    billingCycle: finalBillingCycle,
                });

                // Save Razorpay order ID to subscription
                subscription.razorpayOrderId = result.orderId;
                await subscription.save();

                return res.json({
                    success: true,
                    gateway: 'razorpay',
                    razorpay: result,
                    subscription,
                });
            } catch (rzpErr) {
                console.error('Razorpay order error:', rzpErr);
                await Subscription.findByIdAndDelete(subscription._id);
                return res.status(500).json({ success: false, message: 'Failed to create Razorpay order: ' + rzpErr.message });
            }
        }

        // ── NO GATEWAY CONFIGURED ──
        // Return subscription in pending state — will be activated when keys are added
        res.json({
            success: true,
            gateway: null,
            message: 'Subscription created in pending state. Payment gateways will be available once API keys are configured in environment variables.',
            subscription,
            paymentConfigured: false,
        });
    } catch (error) {
        console.error('Error creating checkout:', error);
        res.status(500).json({ success: false, message: 'Failed to create checkout session' });
    }
});

// POST /api/subscriptions/razorpay-verify - Verify Razorpay payment after frontend completion
router.post('/razorpay-verify', authenticateToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, subscriptionId } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing Razorpay payment details' });
        }

        // Verify the payment signature
        const isValid = verifyRazorpayPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid signature.' });
        }

        // Find and activate the subscription
        const subscription = await Subscription.findOne({
            razorpayOrderId: razorpay_order_id,
            status: 'pending',
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found for this payment' });
        }

        subscription.status = 'active';
        subscription.razorpayPaymentId = razorpay_payment_id;
        subscription.razorpaySignature = razorpay_signature;
        await subscription.save();

        // Update Firestore user
        try {
            const usersRef = adminDb.collection('users');
            const snapshot = await usersRef.where('email', '==', subscription.userEmail).get();
            if (!snapshot.empty) {
                await snapshot.docs[0].ref.update({
                    'subscription.status': 'active',
                    'subscription.plan': subscription.plan,
                    'subscription.endDate': subscription.endDate,
                });
            }
        } catch (e) { console.error('Firestore update error:', e); }

        // Generate invoice
        try {
            await createInvoiceForSubscription(subscription, {
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
            });
        } catch (invoiceErr) {
            console.error('Invoice generation error (Razorpay):', invoiceErr);
        }

        res.json({
            success: true,
            message: 'Payment verified and subscription activated!',
            subscription,
        });
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
});

// POST /api/subscriptions/stripe-webhook - Stripe webhook handler
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!isStripeConfigured()) {
        return res.json({ received: true, message: 'Stripe not configured' });
    }

    let event;
    try {
        const sig = req.headers['stripe-signature'];
        event = await verifyStripeWebhook(req.body, sig);
    } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const { subscriptionId, userId, planId } = session.metadata || {};

                if (!subscriptionId) break;

                const updatedSub = await Subscription.findByIdAndUpdate(subscriptionId, {
                    status: 'active',
                    stripeSubscriptionId: session.subscription || null,
                    stripeCustomerId: session.customer || null,
                    stripePaymentIntentId: session.payment_intent || null,
                }, { new: true });

                // Update Firestore user
                if (updatedSub) {
                    try {
                        const usersRef = adminDb.collection('users');
                        const snap = await usersRef.where('email', '==', updatedSub.userEmail).get();
                        if (!snap.empty) {
                            await snap.docs[0].ref.update({
                                'subscription.status': 'active',
                                'subscription.plan': planId || updatedSub.plan,
                                'subscription.endDate': updatedSub.endDate,
                                'subscription.stripeCustomerId': session.customer || null,
                            });
                        }
                    } catch (e) { console.error('Firestore update error:', e); }

                    // Generate invoice
                    try {
                        await createInvoiceForSubscription(updatedSub, {
                            stripePaymentIntentId: session.payment_intent,
                            stripeInvoiceId: session.invoice,
                        });
                    } catch (invoiceErr) {
                        console.error('Invoice generation error after Stripe payment:', invoiceErr);
                    }
                }
                break;
            }

            case 'invoice.payment_succeeded': {
                // Recurring subscription payment — generate new invoice
                const stripeInvoice = event.data.object;
                if (!stripeInvoice.subscription) break;

                const sub = await Subscription.findOne({
                    stripeSubscriptionId: stripeInvoice.subscription,
                });

                if (sub) {
                    // Extend subscription end date
                    const newEndDate = new Date(sub.endDate);
                    if (sub.billingCycle === 'yearly') {
                        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                    } else {
                        newEndDate.setMonth(newEndDate.getMonth() + 1);
                    }
                    sub.endDate = newEndDate;
                    sub.aiEstimationsUsed = 0; // Reset usage for new period
                    sub.aiAnalysesUsed = 0;
                    sub.quotesUsed = 0;
                    sub.storageUsedMB = 0;
                    await sub.save();

                    try {
                        await createInvoiceForSubscription(sub, {
                            stripePaymentIntentId: stripeInvoice.payment_intent,
                            stripeInvoiceId: stripeInvoice.id,
                        });
                    } catch (invoiceErr) {
                        console.error('Invoice generation error on renewal:', invoiceErr);
                    }
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const stripeSubObj = event.data.object;
                const cancelledSub = await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: stripeSubObj.id },
                    { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Cancelled via Stripe' },
                    { new: true }
                );

                if (cancelledSub) {
                    try {
                        const usersRef = adminDb.collection('users');
                        const snap = await usersRef.where('email', '==', cancelledSub.userEmail).get();
                        if (!snap.empty) {
                            await snap.docs[0].ref.update({
                                'subscription.status': 'inactive',
                                'subscription.plan': null,
                            });
                        }
                    } catch (e) { console.error('Firestore update error:', e); }
                }
                break;
            }

            case 'charge.failed':
            case 'invoice.payment_failed': {
                const failedInvoice = event.data.object;
                if (failedInvoice.subscription) {
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: failedInvoice.subscription },
                        { status: 'pending' }
                    );
                }
                break;
            }
        }
    } catch (processErr) {
        console.error('Error processing Stripe webhook event:', processErr);
    }

    res.json({ received: true });
});

// POST /api/subscriptions/razorpay-webhook - Razorpay webhook handler
router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!isRazorpayConfigured()) {
        return res.json({ received: true, message: 'Razorpay not configured' });
    }

    try {
        const signature = req.headers['x-razorpay-signature'];
        const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        // Verify webhook signature if secret is configured
        if (process.env.RAZORPAY_WEBHOOK_SECRET && signature) {
            const isValid = verifyRazorpayWebhook(rawBody, signature);
            if (!isValid) {
                console.error('Razorpay webhook signature verification failed');
                return res.status(400).json({ error: 'Invalid signature' });
            }
        }

        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const eventType = event.event;

        switch (eventType) {
            case 'payment.captured': {
                const payment = event.payload?.payment?.entity;
                if (!payment) break;

                const orderId = payment.order_id;
                if (!orderId) break;

                // Activate subscription
                const sub = await Subscription.findOne({ razorpayOrderId: orderId });
                if (sub && sub.status === 'pending') {
                    sub.status = 'active';
                    sub.razorpayPaymentId = payment.id;
                    await sub.save();

                    // Update Firestore
                    try {
                        const usersRef = adminDb.collection('users');
                        const snap = await usersRef.where('email', '==', sub.userEmail).get();
                        if (!snap.empty) {
                            await snap.docs[0].ref.update({
                                'subscription.status': 'active',
                                'subscription.plan': sub.plan,
                                'subscription.endDate': sub.endDate,
                            });
                        }
                    } catch (e) { console.error('Firestore update error:', e); }

                    // Generate invoice if not already created by verify endpoint
                    const existingInvoice = await Invoice.findOne({ subscriptionId: sub._id });
                    if (!existingInvoice) {
                        try {
                            await createInvoiceForSubscription(sub, {
                                razorpayPaymentId: payment.id,
                                razorpayOrderId: orderId,
                            });
                        } catch (invoiceErr) {
                            console.error('Invoice generation error (Razorpay webhook):', invoiceErr);
                        }
                    }
                }
                break;
            }

            case 'payment.failed': {
                const payment = event.payload?.payment?.entity;
                if (payment?.order_id) {
                    await Subscription.findOneAndUpdate(
                        { razorpayOrderId: payment.order_id, status: 'pending' },
                        { status: 'pending' } // Keep pending — user can retry
                    );
                }
                break;
            }

            case 'subscription.cancelled': {
                const rzpSub = event.payload?.subscription?.entity;
                if (rzpSub?.id) {
                    const cancelledSub = await Subscription.findOneAndUpdate(
                        { razorpaySubscriptionId: rzpSub.id },
                        { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Cancelled via Razorpay' },
                        { new: true }
                    );

                    if (cancelledSub) {
                        try {
                            const usersRef = adminDb.collection('users');
                            const snap = await usersRef.where('email', '==', cancelledSub.userEmail).get();
                            if (!snap.empty) {
                                await snap.docs[0].ref.update({
                                    'subscription.status': 'inactive',
                                    'subscription.plan': null,
                                });
                            }
                        } catch (e) { console.error('Firestore update error:', e); }
                    }
                }
                break;
            }
        }
    } catch (processErr) {
        console.error('Error processing Razorpay webhook:', processErr);
    }

    res.json({ received: true });
});

// ============================================================
// ADMIN ROUTES (Requires admin authentication)
// ============================================================

// GET /api/subscriptions/admin/plans - Get plan definitions for admin
router.get('/admin/plans', authenticateToken, isAdmin, async (req, res) => {
    try {
        res.json({ success: true, plans: PLAN_DEFINITIONS });
    } catch (error) {
        console.error('Error fetching admin plans:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
});

// GET /api/subscriptions/admin/all - Get all subscriptions with client details
router.get('/admin/all', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status, plan, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (status && status !== 'all') {
            filter.status = status;
        }
        if (plan && plan !== 'all') {
            filter.plan = plan;
        }

        const total = await Subscription.countDocuments(filter);
        const subscriptions = await Subscription.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Enrich with Firestore user data
        const enrichedSubscriptions = [];
        for (const sub of subscriptions) {
            let userData = null;
            try {
                const usersRef = adminDb.collection('users');
                const snapshot = await usersRef.where('email', '==', sub.userEmail).get();
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    const data = doc.data();
                    userData = {
                        name: data.name || data.profileData?.fullName || sub.userName,
                        email: data.email,
                        type: data.type,
                        profileStatus: data.profileStatus,
                        phone: data.profileData?.phone || null,
                        company: data.profileData?.companyName || null,
                    };
                }
            } catch (e) {
                // Skip enrichment if Firestore lookup fails
            }

            // Get latest invoice for this subscription
            let latestInvoice = null;
            try {
                latestInvoice = await Invoice.findOne({ subscriptionId: sub._id })
                    .sort({ issuedAt: -1 })
                    .select('invoiceNumber status total pdfUrl issuedAt');
            } catch (e) { /* skip */ }

            enrichedSubscriptions.push({
                ...sub.toObject(),
                userData,
                latestInvoice,
            });
        }

        // Compute stats
        const allSubs = await Subscription.find({});
        const totalInvoices = await Invoice.countDocuments({});
        const stats = {
            total: allSubs.length,
            active: allSubs.filter(s => s.status === 'active').length,
            freeOverride: allSubs.filter(s => s.status === 'free_override').length,
            cancelled: allSubs.filter(s => s.status === 'cancelled').length,
            expired: allSubs.filter(s => s.status === 'expired').length,
            pending: allSubs.filter(s => s.status === 'pending').length,
            totalRevenue: allSubs
                .filter(s => s.status === 'active' && s.paymentMethod !== 'free')
                .reduce((sum, s) => sum + (s.amount || 0), 0),
            designerCount: allSubs.filter(s => s.userType === 'designer' && s.status === 'active').length,
            estimationCount: allSubs.filter(s => s.plan?.startsWith('estimation_') && s.status === 'active').length,
            analysisCount: allSubs.filter(s => s.plan?.startsWith('analysis_') && s.status === 'active').length,
            // Legacy counts
            contractorProCount: allSubs.filter(s => s.plan === 'contractor_pro' && s.status === 'active').length,
            aiAnalysisCount: allSubs.filter(s => (s.plan?.startsWith('ai_analysis_') || s.plan?.startsWith('analysis_')) && s.status === 'active').length,
            totalInvoices,
        };

        res.json({
            success: true,
            subscriptions: enrichedSubscriptions,
            stats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching all subscriptions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
    }
});

// GET /api/subscriptions/admin/stats - Get subscription statistics
router.get('/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const allSubs = await Subscription.find({});
        const totalInvoices = await Invoice.countDocuments({});

        const stats = {
            total: allSubs.length,
            active: allSubs.filter(s => s.status === 'active').length,
            freeOverride: allSubs.filter(s => s.status === 'free_override').length,
            cancelled: allSubs.filter(s => s.status === 'cancelled').length,
            expired: allSubs.filter(s => s.status === 'expired').length,
            pending: allSubs.filter(s => s.status === 'pending').length,
            totalRevenue: allSubs
                .filter(s => s.status === 'active' && s.paymentMethod !== 'free')
                .reduce((sum, s) => sum + (s.amount || 0), 0),
            monthlyRevenue: allSubs
                .filter(s => {
                    const now = new Date();
                    const start = new Date(now.getFullYear(), now.getMonth(), 1);
                    return s.status === 'active' && s.paymentMethod !== 'free' && s.createdAt >= start;
                })
                .reduce((sum, s) => sum + (s.amount || 0), 0),
            planBreakdown: {
                // Designer plans
                designer_free: allSubs.filter(s => s.plan === 'designer_free' && s.status === 'active').length,
                designer_5: allSubs.filter(s => s.plan === 'designer_5' && s.status === 'active').length,
                designer_10: allSubs.filter(s => s.plan === 'designer_10' && s.status === 'active').length,
                designer_15: allSubs.filter(s => s.plan === 'designer_15' && s.status === 'active').length,
                designer_30: allSubs.filter(s => s.plan === 'designer_30' && s.status === 'active').length,
                // AI Estimation plans
                estimation_free: allSubs.filter(s => s.plan === 'estimation_free' && s.status === 'active').length,
                estimation_starter: allSubs.filter(s => s.plan === 'estimation_starter' && s.status === 'active').length,
                estimation_professional: allSubs.filter(s => s.plan === 'estimation_professional' && s.status === 'active').length,
                estimation_business: allSubs.filter(s => s.plan === 'estimation_business' && s.status === 'active').length,
                estimation_payperuse: allSubs.filter(s => s.plan === 'estimation_payperuse' && s.status === 'active').length,
                // AI Data Analysis plans
                analysis_free: allSubs.filter(s => s.plan === 'analysis_free' && s.status === 'active').length,
                analysis_basic: allSubs.filter(s => s.plan === 'analysis_basic' && s.status === 'active').length,
                analysis_advanced: allSubs.filter(s => s.plan === 'analysis_advanced' && s.status === 'active').length,
                analysis_pro: allSubs.filter(s => s.plan === 'analysis_pro' && s.status === 'active').length,
                analysis_business: allSubs.filter(s => s.plan === 'analysis_business' && s.status === 'active').length,
            },
            estimationCount: allSubs.filter(s => s.plan?.startsWith('estimation_') && s.status === 'active').length,
            analysisCount: allSubs.filter(s => s.plan?.startsWith('analysis_') && s.status === 'active').length,
            totalInvoices,
        };

        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error fetching subscription stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

// GET /api/subscriptions/admin/invoices - Get all invoices (admin)
router.get('/admin/invoices', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status && status !== 'all') {
            filter.status = status;
        }

        const total = await Invoice.countDocuments(filter);
        const invoices = await Invoice.find(filter)
            .sort({ issuedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        res.json({
            success: true,
            invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching admin invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
});

// GET /api/subscriptions/admin/invoices/:subscriptionId - Get invoices for a specific subscription
router.get('/admin/invoices/:subscriptionId', authenticateToken, isAdmin, async (req, res) => {
    try {
        const invoices = await Invoice.find({ subscriptionId: req.params.subscriptionId })
            .sort({ issuedAt: -1 });

        res.json({ success: true, invoices });
    } catch (error) {
        console.error('Error fetching subscription invoices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
});

// POST /api/subscriptions/admin/invoices/:invoiceId/regenerate - Regenerate invoice PDF
router.post('/admin/invoices/:invoiceId/regenerate', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { invoice } = await regenerateInvoicePDF(req.params.invoiceId);
        res.json({
            success: true,
            message: 'Invoice PDF regenerated',
            invoice,
        });
    } catch (error) {
        console.error('Error regenerating invoice:', error);
        res.status(500).json({ success: false, message: 'Failed to regenerate invoice' });
    }
});

// POST /api/subscriptions/admin/toggle-free - Toggle free service for a user
router.post('/admin/toggle-free', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { subscriptionId, grantFree } = req.body;

        if (!subscriptionId) {
            return res.status(400).json({ success: false, message: 'Subscription ID required' });
        }

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        const adminEmail = req.user.email;

        if (grantFree) {
            subscription.freeOverride = true;
            subscription.freeOverrideBy = adminEmail;
            subscription.freeOverrideAt = new Date();
            subscription.status = 'free_override';
            subscription.paymentMethod = 'free';
        } else {
            subscription.freeOverride = false;
            subscription.freeOverrideBy = null;
            subscription.freeOverrideAt = null;
            subscription.status = 'active';
            subscription.paymentMethod = subscription.amount > 0 ? 'stripe' : 'free';
        }

        await subscription.save();

        // Update Firestore
        try {
            const usersRef = adminDb.collection('users');
            const snapshot = await usersRef.where('email', '==', subscription.userEmail).get();
            if (!snapshot.empty) {
                await snapshot.docs[0].ref.update({
                    'subscription.status': subscription.status,
                });
            }
        } catch (e) {
            console.error('Error updating Firestore user subscription:', e);
        }

        res.json({
            success: true,
            message: grantFree ? 'Free service granted' : 'Free service revoked',
            subscription,
        });
    } catch (error) {
        console.error('Error toggling free service:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle subscription' });
    }
});

// POST /api/subscriptions/admin/cancel - Cancel a subscription
router.post('/admin/cancel', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { subscriptionId, reason } = req.body;

        if (!subscriptionId) {
            return res.status(400).json({ success: false, message: 'Subscription ID required' });
        }

        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        subscription.cancelReason = reason || 'Cancelled by admin';
        await subscription.save();

        // Update Firestore
        try {
            const usersRef = adminDb.collection('users');
            const snapshot = await usersRef.where('email', '==', subscription.userEmail).get();
            if (!snapshot.empty) {
                await snapshot.docs[0].ref.update({
                    'subscription.status': 'inactive',
                    'subscription.plan': null,
                });
            }
        } catch (e) {
            console.error('Error updating Firestore user subscription:', e);
        }

        res.json({
            success: true,
            message: 'Subscription cancelled',
            subscription,
        });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
});

// POST /api/subscriptions/admin/create-manual - Admin manually creates subscription for a user
router.post('/admin/create-manual', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userEmail, planId, isFree, billingCycle: requestedCycle } = req.body;

        if (!userEmail || !planId) {
            return res.status(400).json({ success: false, message: 'User email and plan are required' });
        }

        if (!PLAN_DEFINITIONS[planId]) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        const plan = PLAN_DEFINITIONS[planId];
        const isYearly = requestedCycle === 'yearly' && plan.supportsYearly;

        // Look up user in Firestore
        const usersRef = adminDb.collection('users');
        const snapshot = await usersRef.where('email', '==', userEmail).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userData = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;

        // Cancel any existing active subscription
        await Subscription.updateMany(
            { userEmail, status: { $in: ['active', 'free_override'] } },
            { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Replaced by admin' }
        );

        const now = new Date();
        const endDate = new Date(now);
        let finalAmount = isFree ? 0 : plan.price;
        let finalBillingCycle = plan.billingCycle || null;

        if (isYearly && !isFree) {
            finalAmount = plan.yearlyPrice;
            finalBillingCycle = 'yearly';
            endDate.setFullYear(endDate.getFullYear() + 1);
        } else if (plan.billingCycle === 'weekly') {
            endDate.setDate(endDate.getDate() + 7);
        } else {
            endDate.setMonth(endDate.getMonth() + 1);
        }

        const subscription = new Subscription({
            userId,
            userEmail,
            userName: userData.name || userData.profileData?.fullName || '',
            userType: plan.type,
            plan: planId,
            planLabel: plan.label + (isYearly ? ' (Yearly)' : ''),
            amount: finalAmount,
            quotesAllowed: plan.quotesAllowed || null,
            quotesUsed: 0,
            aiEstimationsAllowed: plan.aiEstimationsAllowed || null,
            aiEstimationsUsed: 0,
            maxUploadMB: plan.maxUploadMB || 25,
            isPayPerUse: plan.isPayPerUse || false,
            aiEstimationRate: plan.aiEstimationRate || null,
            aiAnalysisRate: plan.aiAnalysisRate || null,
            aiAnalysisQuota: plan.aiAnalysisQuota || null,
            aiAnalysesUsed: 0,
            storageAllowedMB: plan.storageAllowedMB || null,
            storageUsedMB: 0,
            billingCycle: finalBillingCycle,
            status: isFree ? 'free_override' : 'active',
            startDate: now,
            endDate,
            paymentMethod: isFree ? 'free' : 'manual',
            freeOverride: isFree || false,
            freeOverrideBy: isFree ? req.user.email : null,
            freeOverrideAt: isFree ? now : null,
        });

        await subscription.save();

        // Update Firestore user
        await snapshot.docs[0].ref.update({
            'subscription.status': isFree ? 'free_override' : 'active',
            'subscription.plan': planId,
            'subscription.endDate': endDate,
        });

        // Generate invoice for the new subscription
        try {
            await createInvoiceForSubscription(subscription);
        } catch (invoiceErr) {
            console.error('Invoice generation error (manual):', invoiceErr);
        }

        res.json({
            success: true,
            message: `Subscription created for ${userEmail}`,
            subscription,
        });
    } catch (error) {
        console.error('Error creating manual subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to create subscription' });
    }
});

export default router;
