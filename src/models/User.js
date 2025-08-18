// src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    // --- NEW FEATURE START ---
    subscription: {
        status: { 
            type: String, 
            enum: ['active', 'inactive'], 
            default: 'inactive' 
        },
        endDate: { type: Date, default: null }
    }
    // --- NEW FEATURE END ---
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User;
