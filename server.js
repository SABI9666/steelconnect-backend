// server.js - FIXED VERSION
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

console.log('🚀 SteelConnect Backend Starting...');
console.log(`📁 Project root: ${projectRoot}`);
console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);

// --- Database Connection ---
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB connected'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not found in environment variables');
}

// --- Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl requests, or localhost development)
        if (!origin) {
            return callback(null, true);
        }

        // Check if the origin is in the whitelisted array OR if it's a Vercel URL
        if (allowedOrigins.includes(origin) || 
            origin.endsWith('.vercel.app') || 
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" not in allowed list`);
            // Allow in development, block in production
            if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
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

// --- Request logging middleware ---
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Dynamic Route Loading ---
const loadRoutes = async () => {
    console.log('🔄 Loading application routes...');
    
    const routesToLoad = [
        { path: '/api/auth', file: './src/routes/auth.js', name: 'Auth', required: true },
        { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs', required: true },
        { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes', required: true },
        { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages', required: true },
        { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation', required: false }
    ];

    for (const route of routesToLoad) {
        try {
            const routeUrl = pathToFileURL(path.join(projectRoot, route.file)).href;
            const { default: routeModule } = await import(routeUrl);
            
            if (routeModule) {
                app.use(route.path, routeModule);
                console.log(`✅ ${route.name} routes loaded successfully`);
            } else {
                console.error(`❌ ${route.name} routes module is empty`);
                if (route.required) {
                    throw new Error(`Required route ${route.name} failed to load`);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to load ${route.name} routes: ${error.message}`);
            
            if (route.required) {
                console.error(`💥 Required route ${route.name} failed - server cannot start`);
                process.exit(1);
            } else {
                console.warn(`⚠️ ${route.name} routes are optional - continuing without them`);
            }
        }
    }
    
    console.log('📦 Route loading completed');
};

// --- Health check route (always available) ---
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
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation'
        }
    });
});

// --- API Routes test endpoint ---
app.get('/api', (req, res) => {
    res.json({
        message: 'SteelConnect API',
        version: '1.0.0',
        available_endpoints: [
            'GET /api/auth/health',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'GET /api/jobs',
            'GET /api/quotes', 
            'GET /api/messages',
            'GET /api/estimation/health',
            'POST /api/estimation/test'
        ]
    });
});

// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
            success: false, 
            error: 'File too large. Maximum size is 50MB.' 
        });
    }
    
    // Handle CORS errors
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
        });
    }
    
    // Generic error response
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
            '/api/jobs/*',
            '/api/quotes/*',
            '/api/messages/*',
            '/api/estimation/*'
        ]
    });
});

// --- Graceful shutdown handling ---
process.on('SIGTERM', () => {
    console.log('📴 SIGTERM received, shutting down gracefully...');
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 SIGINT received, shutting down gracefully...');
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close();
    }
    process.exit(0);
});

// --- Start Server ---
const startServer = async () => {
    try {
        // Load routes first
        await loadRoutes();
        
        // Start the server
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🎉 SteelConnect Backend Server Started');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`⏰ Started at: ${new Date().toISOString()}`);
            
            // Log environment status
            console.log('\n📋 Environment Check:');
            console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   Anthropic API: ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing'}`);
            console.log(`   CORS Origins: ${process.env.CORS_ORIGIN ? '✅ Configured' : '⚠️ Using defaults'}`);
            
            console.log('\n🔗 Available endpoints:');
            console.log(`   Health: http://localhost:${PORT}/health`);
            console.log(`   API: http://localhost:${PORT}/api`);
            console.log('');
        });
        
    } catch (error) {
        console.error('💥 Failed to start server:', error);
        process.exit(1);
    }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

startServer();
