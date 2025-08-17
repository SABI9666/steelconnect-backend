// src/models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    // Example schema: adjust to your needs
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true }
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

export default Message;
