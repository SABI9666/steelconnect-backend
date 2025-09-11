// server.js - Complete SteelConnect Backend with Profile Management System
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// --- Import All Application Routes ---

// Core routes for all users
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';

// User-specific routes (optional, but good practice to keep separate)
let profileRoutes;
try {
    profileRoutes = (await import('./src/routes/profile.js')).default;
    console.log('✅ Profile routes for users imported successfully.');
} catch (error) {
    console.warn('⚠️ User profile routes not found. Profile functionality will be limited.');
}

// Admin-specific routes
let adminRoutes;
try {
    adminRoutes = (await import('./src/routes/admin.js')).default;
    console.log('✅ Admin routes imported successfully.');
} catch (error) {
    console.error('❌ CRITICAL: Admin routes failed to load. Admin panel will not work.');
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection ---
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables. Exiting.');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ MongoDB connected successfully.'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
});

mongoose.connection.on('error', (err) => console.error('❌ MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected.'));

// --- Core Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g., mobile apps, Postman) or from allowed domains/localhost
        if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost')) {
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

// --- Health Check & Root Routes ---
app.get('/health', (req, res) => res.json({ success: true, message: 'Backend is healthy and running.' }));
app.get('/', (req, res) => res.json({ message: 'Welcome to the SteelConnect Backend API' }));

// --- API Route Registration ---
console.log('📋 Registering API routes...');

// Registering routes for normal users - NO CHANGES HERE
if (authRoutes) app.use('/api/auth', authRoutes);
if (jobsRoutes) app.use('/api/jobs', jobsRoutes);
if (quotesRoutes) app.use('/api/quotes', quotesRoutes);
if (messagesRoutes) app.use('/api/messages', messagesRoutes);
if (profileRoutes) app.use('/api/profile', profileRoutes);

// Registering routes for the Admin Panel
if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes registered at /api/admin.');
} else {
    // If admin routes fail, this prevents the server from crashing and informs the admin
    app.use('/api/admin', (req, res) => {
        res.status(503).json({ success: false, message: 'Admin panel is currently unavailable due to a server error.' });
    });
}

console.log('📦 All routes registered.');

// --- Error Handling Middleware ---
app.use((error, req, res, next) => {
    console.error(`❌ Global Error Handler:`, error);
    res.status(error.status || 500).json({ 
        success: false, 
        error: error.message || 'An internal server error occurred.',
    });
});

// --- 404 "Not Found" Handler ---
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `The requested resource was not found: ${req.method} ${req.originalUrl}`,
    });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎉 Server is running successfully on port ${PORT}`);
    console.log(`🔗 Access the API at http://localhost:${PORT}`);
});

export default app;
