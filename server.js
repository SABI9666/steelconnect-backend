// server.js - Complete SteelConnect Backend with Profile & Notification Systems
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// --- Import All Application Routes ---
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import profileRoutes from './src/routes/profile.js'; // <-- ADDED
import notificationRoutes from './src/routes/notifications.js'; // <-- ADDED

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully.'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    });

// --- Core Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};
app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- API Route Registration ---
console.log('📋 Registering API routes...');
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes); // <-- ADDED
app.use('/api/notifications', notificationRoutes); // <-- ADDED
console.log('📦 All routes registered.');

// --- Error & 404 Handlers ---
app.use((error, req, res, next) => {
    console.error(`❌ Global Error Handler:`, error);
    res.status(error.status || 500).json({ success: false, error: error.message || 'Internal Server Error.' });
});
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎉 Server is running successfully on port ${PORT}`);
});

export default app;
