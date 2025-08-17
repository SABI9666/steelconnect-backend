// server.js - REFINED FOR DEPLOYMENT
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// --- Import all route handlers directly for reliability ---
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import estimationRoutes from './src/routes/estimation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// --- Database Connection ---
console.log('🚀 SteelConnect Backend Starting...');
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not found in environment variables.');
}

// --- Middleware Setup ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" not allowed.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginResourcePolicy: { policy: "cross-origin" } 
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Request Logging & Favicon Ignore ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
app.get('/favicon.ico', (req, res) => res.status(204).send());


// --- Centralized Route Definitions ---
const routes = [
    { path: '/api/auth', handler: authRoutes, name: 'Auth' },
    { path: '/api/jobs', handler: jobsRoutes, name: 'Jobs' },
    { path: '/api/quotes', handler: quotesRoutes, name: 'Quotes' },
    { path: '/api/messages', handler: messagesRoutes, name: 'Messages' },
    { path: '/api/admin', handler: adminRoutes, name: 'Admin' },
    { path: '/api/estimation', handler: estimationRoutes, name: 'Estimation' },
];

const availableApiPaths = routes.map(r => `${r.path}/*`);

// --- Programmatic Route Registration ---
console.log('🔄 Registering routes...');
routes.forEach(route => {
    if (route.handler) {
        app.use(route.path, route.handler);
        console.log(`✅ ${route.name} routes registered at ${route.path}`);
    } else {
        console.warn(`⚠️ ${route.name} routes not available, skipping.`);
    }
});
console.log('📦 Route registration completed.');

// --- Core API & Health Routes ---
app.get('/health', (req, res) => res.json({
    success: true,
    message: 'SteelConnect Backend is healthy',
    timestamp: new Date().toISOString()
}));

app.get('/', (req, res) => res.json({
    message: 'SteelConnect Backend API is running',
    version: '1.0.0',
    available_endpoints: availableApiPaths
}));

// --- Global Error Handler ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error.message);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
        success: false,
        error: error.message || 'Internal Server Error',
    });
});

// --- 404 Not Found Handler ---
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`,
        available_routes: ['/', '/health', ...availableApiPaths]
    });
});


// --- Server Start Logic ---

// This block is for traditional servers like Render or running locally
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log('🎉 SteelConnect Backend Server Started');
        console.log(`📍 Server running on port ${PORT}`);
    });
}

// This line is ESSENTIAL for serverless platforms like Vercel
export default app;
