// src/models/Invoice.js

import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
    // Invoice identification
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
    },
    // Link to subscription
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true,
    },
    // User (customer) details
    userId: {
        type: String,
        required: true,
    },
    customerName: {
        type: String,
        required: true,
    },
    customerEmail: {
        type: String,
        required: true,
    },
    customerAddress: {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        zip: { type: String, default: '' },
        country: { type: String, default: '' },
    },
    customerCompany: {
        type: String,
        default: '',
    },
    customerPhone: {
        type: String,
        default: '',
    },
    // Plan / line item details
    planId: {
        type: String,
        required: true,
    },
    planLabel: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    // Amounts
    subtotal: {
        type: Number,
        required: true,
    },
    tax: {
        type: Number,
        default: 0,
    },
    taxRate: {
        type: Number,
        default: 0,
    },
    total: {
        type: Number,
        required: true,
    },
    currency: {
        type: String,
        default: 'USD',
    },
    // Payment details
    paymentMethod: {
        type: String,
        enum: ['stripe', 'manual', 'free'],
        default: 'stripe',
    },
    stripePaymentIntentId: {
        type: String,
        default: null,
    },
    stripeInvoiceId: {
        type: String,
        default: null,
    },
    // Status
    status: {
        type: String,
        enum: ['paid', 'pending', 'failed', 'refunded', 'free'],
        default: 'paid',
    },
    // PDF file
    pdfPath: {
        type: String,
        default: null,
    },
    pdfUrl: {
        type: String,
        default: null,
    },
    // Billing period
    billingPeriodStart: {
        type: Date,
        required: true,
    },
    billingPeriodEnd: {
        type: Date,
        required: true,
    },
    // Issue date
    issuedAt: {
        type: Date,
        default: Date.now,
    },
    // Email delivery tracking
    emailSentToCustomer: {
        type: Boolean,
        default: false,
    },
    emailSentToAdmin: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ userId: 1 });
invoiceSchema.index({ subscriptionId: 1 });
invoiceSchema.index({ customerEmail: 1 });
invoiceSchema.index({ status: 1, issuedAt: -1 });

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
