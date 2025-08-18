// server.js - Updated with both Admin and Frontend URLs
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- ✅ ENHANCED CORS Middleware ---

// A default list of allowed frontend URLs for both admin and main frontends.
const defaultAllowedOrigins = [
    // Admin URLs
    'https://admin-pink-nine.vercel.app',
    'https://admin-git-main-sabins-projects-02d8db3a.vercel.app',
    'https://admin-r7lir0pwg-sabins-projects-02d8db3a.vercel.app',
    'https://admin-3ienhn8gu-sabins-projects-02d8db3a.vercel.app', // New URL added
    // Main Frontend URLs
    'https://steelconnect-frontend.vercel.app',
    'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
    'https://steelconnect-frontend-jlnaa22o7-sabins-projects-02d8db3a.vercel.app'
];

// Combine the default list with any origins defined in the environment variable.
const allowedOriginsFromEnv = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...allowedOriginsFromEnv])];

if (allowedOrigins.length > 0) {
    console.log('✅ CORS is configured for the following origins:', allowedOrigins);
} else {
    console.warn('⚠️ No CORS origins configured. Requests may be blocked in production.');
}

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) and local development
        if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.error(`❌ CORS Error: Origin "${origin}" not allowed.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Request logging middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Health check route ---
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'SteelConnect Backend is healthy' });
});

// --- Root route ---
app.get('/', (req, res) => {
    res.json({ message: 'SteelConnect Backend API is running', version: '1.0.0' });
});

// --- Register Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);

// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error.message);
    const status = error.status || 500;
    const message = error.message || 'Internal Server Error';
    res.status(status).json({ success: false, error: message });
});

// --- 404 handler ---
app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SteelConnect Backend Server Started on port ${PORT}`);
});
