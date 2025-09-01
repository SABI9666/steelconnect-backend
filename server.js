// server.js - FIXED VERSION with Admin Routes and CORS
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import routes directly
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';

// Import estimation routes
let estimationRoutes;
try {
    const estimationModule = await import('./src/routes/estimation.js');
    estimationRoutes = estimationModule.default;
    console.log('✅ Estimation routes imported successfully');
} catch (error) {
    console.warn('⚠️ Estimation routes not available:', error.message);
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);

// --- Database Connection ---
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not found in environment variables');
}

// --- FIXED CORS CONFIGURATION ---
// Add your frontend domains explicitly
const allowedOrigins = [
    'https://www.steelconnectapp.com',
    'https://steelconnectapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    // Add any additional domains from environment variable
    ...(process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim())
];

console.log('🌐 Allowed CORS origins:', allowedOrigins);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || 
            origin.endsWith('.vercel.app') || 
            origin.endsWith('.netlify.app') ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" not in allowed list`);
            if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-Requested-With'
    ]
};

app.use(cors(corsOptions));

// Add preflight handling for all routes
app.options('*', cors(corsOptions));

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
    res.json({
        success: true,
        message: 'SteelConnect Backend is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// --- Root route ---
app.get('/', (req, res) => {
    res.json({ 
        message: 'SteelConnect Backend API is running',
        version: '1.0.0',
        status: 'healthy',
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            admin: '/api/admin',
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation'
        }
    });
});

// --- Register Routes ---
console.log('📄 Registering routes...');

// Auth routes
if (authRoutes) {
    app.use('/api/auth', authRoutes);
    console.log('✅ Auth routes registered');
} else {
    console.error('❌ Auth routes failed to load');
}

// Admin routes
if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes registered');
} else {
    console.error('❌ Admin routes failed to load');
}

// Jobs routes  
if (jobsRoutes) {
    app.use('/api/jobs', jobsRoutes);
    console.log('✅ Jobs routes registered');
} else {
    console.error('❌ Jobs routes failed to load');
}

// Quotes routes
if (quotesRoutes) {
    app.use('/api/quotes', quotesRoutes);
    console.log('✅ Quotes routes registered');
} else {
    console.error('❌ Quotes routes failed to load');
}

// Messages routes
if (messagesRoutes) {
    app.use('/api/messages', messagesRoutes);
    console.log('✅ Messages routes registered');
} else {
    console.error('❌ Messages routes failed to load');
}

// Estimation routes
if (estimationRoutes) {
    app.use('/api/estimation', estimationRoutes);
    console.log('✅ Estimation routes registered');
} else {
    console.warn('⚠️ Estimation routes unavailable - some services may be missing');
}

console.log('📦 Route registration completed');

// --- API test endpoint ---
app.get('/api', (req, res) => {
    res.json({
        message: 'SteelConnect API',
        version: '1.0.0',
        available_endpoints: [
            'GET /health',
            'GET /api',
            'GET /api/auth/*',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/auth/login/admin',
            'GET /api/admin/*',
            'GET /api/jobs/*',
            'GET /api/quotes/*', 
            'GET /api/messages/*',
            'GET /api/estimation/*'
        ]
    });
});

// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
            success: false, 
            error: 'File too large. Maximum size is 50MB.' 
        });
    }
    
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
        });
    }
    
    res.status(error.status || 500).json({ 
        success: false, 
        error: error.message || 'Internal Server Error',
        timestamp: new Date().toISOString()
    });
});

// --- 404 handler ---
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`,
        available_routes: [
            '/',
            '/health',
            '/api',
            '/api/auth/*',
            '/api/admin/*',
            '/api/jobs/*',
            '/api/quotes/*',
            '/api/messages/*',
            '/api/estimation/*'
        ]
    });
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
    console.log('🔴 SIGTERM received, shutting down gracefully...');
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔴 SIGINT received, shutting down gracefully...');
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log('🎉 SteelConnect Backend Server Started');
    console.log(`🔗 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    console.log('\n📋 Environment Check:');
    console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Anthropic API: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   CORS Origins: ${allowedOrigins.length > 0 ? '✅ Configured' : '⚠️ Using defaults'}`);
    
    console.log('\n🔗 Available endpoints:');
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API: http://localhost:${PORT}/api`);
    console.log(`   Admin: http://localhost:${PORT}/api/admin`);
    console.log('');
});
