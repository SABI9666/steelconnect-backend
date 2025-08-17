// src/models/Quote.js
import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
    // Example schema: adjust to your needs
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    details: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

const Quote = mongoose.model('Quote', quoteSchema);

export default Quote;
