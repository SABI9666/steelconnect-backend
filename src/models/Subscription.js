// src/models/Subscription.js

import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
    },
    userEmail: {
        type: String,
        required: true,
    },
    userName: {
        type: String,
        default: '',
    },
    userType: {
        type: String,
        enum: ['designer', 'contractor', 'ai_analysis'],
        required: true,
    },
    plan: {
        type: String,
        required: true,
        enum: [
            // Designer plans
            'designer_free',
            'designer_5',
            'designer_10',
            'designer_15',
            'designer_30',
            // AI Estimation (Drawing Based) plans
            'estimation_free',
            'estimation_starter',
            'estimation_professional',
            'estimation_business',
            'estimation_payperuse',
            // AI Data Analysis plans
            'analysis_free',
            'analysis_basic',
            'analysis_advanced',
            'analysis_pro',
            'analysis_business',
            // Legacy plans (for backward compatibility)
            'contractor_pro',
            'contractor_ai_estimation',
            'contractor_ai_analysis',
            'ai_analysis_daily_weekly',
            'ai_analysis_monthly',
            'ai_analysis_premium',
            'ai_analysis_pro'
        ],
        trim: true,
    },
    planLabel: {
        type: String,
        default: '',
    },
    amount: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'usd',
    },
    quotesAllowed: {
        type: Number,
        default: 0,
    },
    quotesUsed: {
        type: Number,
        default: 0,
    },
    // AI Estimation plan fields
    aiEstimationsAllowed: {
        type: Number,
        default: null,
    },
    aiEstimationsUsed: {
        type: Number,
        default: 0,
    },
    maxUploadMB: {
        type: Number,
        default: 25,
    },
    isPayPerUse: {
        type: Boolean,
        default: false,
    },
    // Legacy fields (kept for backward compatibility)
    aiEstimationRate: {
        type: Number,
        default: null,
    },
    aiAnalysisRate: {
        type: Number,
        default: null,
    },
    // AI Analysis plan fields
    aiAnalysisQuota: {
        type: Number,
        default: null, // number of free analyses per period (null = not applicable)
    },
    aiAnalysesUsed: {
        type: Number,
        default: 0,
    },
    storageAllowedMB: {
        type: Number,
        default: null, // storage cap in MB (null = no cap)
    },
    storageUsedMB: {
        type: Number,
        default: 0,
    },
    billingCycle: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly', null],
        default: null,
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'pending', 'free_override'],
        default: 'active',
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    // Stripe integration fields
    stripeCustomerId: {
        type: String,
        default: null,
    },
    stripeSubscriptionId: {
        type: String,
        default: null,
    },
    stripePaymentIntentId: {
        type: String,
        default: null,
    },
    paymentMethod: {
        type: String,
        enum: ['stripe', 'manual', 'free'],
        default: 'manual',
    },
    // Admin override: when true, subscription is free (admin granted)
    freeOverride: {
        type: Boolean,
        default: false,
    },
    freeOverrideBy: {
        type: String,
        default: null,
    },
    freeOverrideAt: {
        type: Date,
        default: null,
    },
    cancelledAt: {
        type: Date,
        default: null,
    },
    cancelReason: {
        type: String,
        default: null,
    },
}, {
    timestamps: true
});

// Index for fast lookups
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ userEmail: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
