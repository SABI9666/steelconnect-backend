// server.js - Complete, stable, and secure backend server
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
import profileRoutes from './src/routes/profile.js'; // Restored user profile routes
import estimationRoutes from './src/routes/estimation.js'; // Restored user estimation routes
import adminRoutes from './src/routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection ---
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Exiting.');
    process.exit(1);
}
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
        // Allow requests with no origin (e.g., Postman) or from whitelisted domains
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" was blocked.`);
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
// ** Routes for regular users (Contractors, Designers) are now restored **
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/estimation', estimationRoutes);

// Routes for the Admin Panel
app.use('/api/admin', adminRoutes);
console.log('✅ Admin routes registered at /api/admin.');
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
