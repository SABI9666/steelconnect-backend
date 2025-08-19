// server.js - Updated with a dynamic CORS policy for Vercel
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

// --- ✅ PERMANENT CORS SOLUTION for Vercel ---

// List of exact domains and patterns (Regular Expressions) to allow.
const allowedOrigins = [
    // Add your main production frontend URL
    'https://steelconnect-frontend.vercel.app',
    
    // This pattern matches your main branch AND all preview deployments for the admin site.
    /^https:\/\/admin-.*-sabins-projects-02d8db3a\.vercel\.app$/,

    // This pattern matches all preview deployments for the main frontend site.
    /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like Postman) or from localhost for development
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

        // Check if the incoming origin matches any of our allowed strings or patterns
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return allowedOrigin === origin;
            }
            if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin);
            }
            return false;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.error(`❌ CORS Error: Origin "${origin}" not allowed.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

console.log('✅ CORS is configured with a dynamic policy for Vercel.');

// --- Middleware ---
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
