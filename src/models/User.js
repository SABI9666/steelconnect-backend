// src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    subscription: {
        status: {
            type: String,
            enum: ['active', 'inactive', 'free_override'],
            default: 'inactive'
        },
        plan: { type: String, default: null },
        endDate: { type: Date, default: null },
        stripeCustomerId: { type: String, default: null },
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User;
