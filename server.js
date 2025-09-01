// server.js - CORRECTED Firebase-Only Version

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
// import mongoose from 'mongoose'; // <-- REMOVED

// Import routes directly
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import estimationRoutes from './src/routes/estimation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection (REMOVED) ---
// The connection to Firebase is handled within your config/firebase.js
// and used by the route files directly. No connection logic is needed here.

// --- CORRECTED CORS CONFIGURATION ---
const allowedOrigins = [
    'https://www.steelconnectapp.com',
    'https://steelconnectapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    ...(process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim())
];

console.log('🌐 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    // FIXED: Added 'PATCH' to allow features like user activation to work
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
    ]
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

app.use(helmet({ 
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Request logging middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin || 'No origin'}`);
    next();
});

// --- Health check route ---
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'SteelConnect Backend is healthy' });
});

// --- Root route ---
app.get('/', (req, res) => {
    res.json({ message: 'SteelConnect Backend API is running' });
});

// --- Register Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    res.status(error.status || 500).json({ 
        success: false, 
        error: error.message || 'Internal Server Error'
    });
});

// --- Graceful shutdown ---
const shutdown = (signal) => {
    process.on(signal, () => {
        console.log(`🔴 ${signal} received, shutting down gracefully...`);
        // No database connection to close here, just exit
        process.exit(0);
    });
};

shutdown('SIGTERM');
shutdown('SIGINT');


// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎉 SteelConnect Backend Server Started on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    console.log('\n📋 Environment Check:');
    // REMOVED: MongoDB check
    console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing Service Account Key'}`);
    console.log(`   CORS Origins: ${allowedOrigins.length > 5 ? '✅ Configured' : '⚠️ Using defaults'}`); // Check if more than defaults are present
});
