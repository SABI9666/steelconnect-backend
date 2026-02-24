// src/routes/subscriptions.js - Subscription Management, Stripe Integration & Invoice Generation
import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, storage } from '../config/firebase.js';
import Subscription from '../models/Subscription.js';
import Invoice from '../models/Invoice.js';
import { createInvoiceForSubscription, regenerateInvoicePDF } from '../services/invoiceService.js';

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
    },
    designer_5: {
        id: 'designer_5',
        label: 'Designer Basic',
        type: 'designer',
        price: 5,
        quotesAllowed: 5,
        description: '5 quotes per month',
        features: ['5 project quotes', 'Email support'],
    },
    designer_10: {
        id: 'designer_10',
        label: 'Designer Standard',
        type: 'designer',
        price: 10,
        quotesAllowed: 10,
        description: '10 quotes per month',
        features: ['10 project quotes', 'Priority support'],
    },
    designer_15: {
        id: 'designer_15',
        label: 'Designer Premium',
        type: 'designer',
        price: 15,
        quotesAllowed: 20,
        description: '20 quotes per month',
        features: ['20 project quotes', 'Priority support', 'Analytics access'],
    },
    contractor_pro: {
        id: 'contractor_pro',
        label: 'Contractor Pro',
        type: 'contractor',
        price: 49,
        quotesAllowed: null,
        aiEstimationRate: 0.40,
        aiAnalysisRate: 0.08,
        description: '$49/month - Lower AI rates',
        features: [
            '$0.40 per MB estimation (discounted)',
            '$0.08 per MB analysis (discounted)',
            'Priority AI processing',
            'Bulk estimation support',
            'Dedicated support',
        ],
    },
};

// ============================================================
// PUBLIC ROUTES (Authenticated users)
// ============================================================

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

// POST /api/subscriptions/create-checkout - Create Stripe checkout session
router.post('/create-checkout', authenticateToken, async (req, res) => {
    try {
        const { planId } = req.body;
        const userId = req.user.userId;
        const userEmail = req.user.email;
        const userName = req.user.name || '';

        if (!planId || !PLAN_DEFINITIONS[planId]) {
            return res.status(400).json({ success: false, message: 'Invalid plan selected' });
        }

        const plan = PLAN_DEFINITIONS[planId];

        if (plan.price === 0) {
            // Free plan - create subscription directly
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
                status: 'active',
                startDate: now,
                endDate,
                paymentMethod: 'free',
            });

            await subscription.save();

            // Update Firestore user record
            const usersRef = adminDb.collection('users');
            const userSnapshot = await usersRef.where('email', '==', userEmail).get();
            if (!userSnapshot.empty) {
                await userSnapshot.docs[0].ref.update({
                    'subscription.status': 'active',
                    'subscription.plan': planId,
                    'subscription.endDate': endDate,
                });
            }

            // Generate invoice for free plan
            try {
                await createInvoiceForSubscription(subscription);
            } catch (invoiceErr) {
                console.error('Invoice generation error (free plan):', invoiceErr);
            }

            return res.json({
                success: true,
                message: 'Free plan activated',
                subscription,
            });
        }

        // For paid plans
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
            amount: plan.price,
            quotesAllowed: plan.quotesAllowed,
            quotesUsed: 0,
            aiEstimationRate: plan.aiEstimationRate || null,
            aiAnalysisRate: plan.aiAnalysisRate || null,
            status: 'pending',
            startDate: now,
            endDate,
            paymentMethod: 'stripe',
        });

        await subscription.save();

        // NOTE: Replace with actual Stripe checkout session creation
        // when Stripe keys are configured:
        //
        // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        // const session = await stripe.checkout.sessions.create({
        //     payment_method_types: ['card'],
        //     line_items: [{
        //         price_data: {
        //             currency: 'usd',
        //             product_data: { name: plan.label, description: plan.description },
        //             unit_amount: plan.price * 100,
        //             recurring: { interval: 'month' },
        //         },
        //         quantity: 1,
        //     }],
        //     mode: 'subscription',
        //     success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        //     cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
        //     customer_email: userEmail,
        //     metadata: { userId, planId, subscriptionId: subscription._id.toString() },
        // });

        res.json({
            success: true,
            message: 'Subscription created. Stripe checkout will be available once payment keys are configured.',
            subscription,
            // checkoutUrl: session.url, // Uncomment when Stripe is configured
            stripeConfigured: false,
        });
    } catch (error) {
        console.error('Error creating checkout:', error);
        res.status(500).json({ success: false, message: 'Failed to create checkout session' });
    }
});

// POST /api/subscriptions/stripe-webhook - Stripe webhook handler
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // NOTE: Enable this when Stripe is configured
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const sig = req.headers['stripe-signature'];
    // const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    //
    // let event;
    // try {
    //     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    // } catch (err) {
    //     return res.status(400).send(`Webhook Error: ${err.message}`);
    // }
    //
    // switch (event.type) {
    //     case 'checkout.session.completed': {
    //         const session = event.data.object;
    //         const { subscriptionId, userId, planId } = session.metadata;
    //         const updatedSub = await Subscription.findByIdAndUpdate(subscriptionId, {
    //             status: 'active',
    //             stripeSubscriptionId: session.subscription,
    //             stripeCustomerId: session.customer,
    //         }, { new: true });
    //
    //         // Update Firestore user
    //         const usersRef = adminDb.collection('users');
    //         const snap = await usersRef.where('uid', '==', userId).get();
    //         if (!snap.empty) {
    //             await snap.docs[0].ref.update({
    //                 'subscription.status': 'active',
    //                 'subscription.plan': planId,
    //             });
    //         }
    //
    //         // >>> GENERATE INVOICE on successful payment <<<
    //         if (updatedSub) {
    //             try {
    //                 await createInvoiceForSubscription(updatedSub, {
    //                     stripePaymentIntentId: session.payment_intent,
    //                     stripeInvoiceId: session.invoice,
    //                 });
    //             } catch (invoiceErr) {
    //                 console.error('Invoice generation error after Stripe payment:', invoiceErr);
    //             }
    //         }
    //         break;
    //     }
    //     case 'invoice.payment_succeeded': {
    //         // Recurring subscription payment — generate new invoice
    //         const stripeInvoice = event.data.object;
    //         const sub = await Subscription.findOne({
    //             stripeSubscriptionId: stripeInvoice.subscription
    //         });
    //         if (sub) {
    //             try {
    //                 await createInvoiceForSubscription(sub, {
    //                     stripePaymentIntentId: stripeInvoice.payment_intent,
    //                     stripeInvoiceId: stripeInvoice.id,
    //                 });
    //             } catch (invoiceErr) {
    //                 console.error('Invoice generation error on renewal:', invoiceErr);
    //             }
    //         }
    //         break;
    //     }
    //     case 'customer.subscription.deleted': {
    //         const sub = event.data.object;
    //         await Subscription.findOneAndUpdate(
    //             { stripeSubscriptionId: sub.id },
    //             { status: 'cancelled', cancelledAt: new Date() }
    //         );
    //         break;
    //     }
    // }

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
            contractorProCount: allSubs.filter(s => s.plan === 'contractor_pro' && s.status === 'active').length,
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
                designer_free: allSubs.filter(s => s.plan === 'designer_free' && s.status === 'active').length,
                designer_5: allSubs.filter(s => s.plan === 'designer_5' && s.status === 'active').length,
                designer_10: allSubs.filter(s => s.plan === 'designer_10' && s.status === 'active').length,
                designer_15: allSubs.filter(s => s.plan === 'designer_15' && s.status === 'active').length,
                contractor_pro: allSubs.filter(s => s.plan === 'contractor_pro' && s.status === 'active').length,
            },
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
        const { userEmail, planId, isFree } = req.body;

        if (!userEmail || !planId) {
            return res.status(400).json({ success: false, message: 'User email and plan are required' });
        }

        if (!PLAN_DEFINITIONS[planId]) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        const plan = PLAN_DEFINITIONS[planId];

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
        endDate.setMonth(endDate.getMonth() + 1);

        const subscription = new Subscription({
            userId,
            userEmail,
            userName: userData.name || userData.profileData?.fullName || '',
            userType: plan.type,
            plan: planId,
            planLabel: plan.label,
            amount: isFree ? 0 : plan.price,
            quotesAllowed: plan.quotesAllowed,
            quotesUsed: 0,
            aiEstimationRate: plan.aiEstimationRate || null,
            aiAnalysisRate: plan.aiAnalysisRate || null,
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
