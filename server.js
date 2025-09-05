// server.js - Enhanced with Notification System & Better Error Handling
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import existing routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';

// Import admin routes with enhanced error handling
let adminRoutes;
try {
    const adminModule = await import('./src/routes/admin.js');
    adminRoutes = adminModule.default;
    console.log('✅ Admin routes imported successfully');
} catch (error) {
    console.warn('⚠️ Admin routes not available:', error.message);
    console.warn('📝 Admin functionality will be limited');
}

// Import estimation routes with enhanced error handling
let estimationRoutes;
try {
    const estimationModule = await import('./src/routes/estimation.js');
    estimationRoutes = estimationModule.default;
    console.log('✅ Estimation routes imported successfully');
} catch (error) {
    console.warn('⚠️ Estimation routes not available:', error.message);
    console.warn('📝 AI estimation features will not work');
}

// Import notification routes with enhanced error handling
let notificationRoutes;
try {
    const notificationModule = await import('./src/routes/notifications.js');
    notificationRoutes = notificationModule.default;
    console.log('✅ Notification routes imported successfully');
    console.log('🔔 Real-time notification system is active');
} catch (error) {
    console.error('❌ Notification routes failed to load:', error.message);
    console.warn('📝 You need to create ./src/routes/notifications.js for notifications to work');
    console.warn('📝 Users will not receive real-time notifications');
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`⏰ Started at: ${new Date().toISOString()}`);

// Enhanced logging for development
if (process.env.NODE_ENV !== 'production') {
    console.log('🔧 Development mode: Enhanced logging enabled');
}

// --- Database Connection with enhanced error handling ---
if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    })
    .then(() => {
        console.log('✅ MongoDB connected successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
        console.error('📝 Check your MONGODB_URI environment variable');
        process.exit(1);
    });

    // MongoDB connection event handlers
    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
    });
} else {
    console.error('❌ MONGODB_URI not found in environment variables');
    console.error('📝 Database connection required for the application to work');
    process.exit(1);
}

// --- Enhanced Middleware Configuration ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is allowed
        if (allowedOrigins.includes(origin) || 
            origin.endsWith('.vercel.app') || 
            origin.endsWith('.netlify.app') ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" not in allowed list`);
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔧 Development mode: Allowing CORS for debugging');
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(helmet({ 
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enhanced request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`${timestamp} - ${method} ${url}`);
    
    if (process.env.NODE_ENV !== 'production' && method !== 'GET') {
        console.log(`📝 Body:`, JSON.stringify(req.body, null, 2).substring(0, 200));
    }
    
    next();
});

// --- Enhanced Health Check Route ---
app.get('/health', (req, res) => {
    const healthData = {
        success: true,
        message: 'SteelConnect Backend is healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
        },
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        services: {
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            notifications: notificationRoutes ? 'available' : 'unavailable',
            estimation: estimationRoutes ? 'available' : 'unavailable',
            admin: adminRoutes ? 'available' : 'unavailable'
        }
    };
    
    res.json(healthData);
});

// --- Enhanced Root Route ---
app.get('/', (req, res) => {
    res.json({ 
        message: 'SteelConnect Backend API is running',
        version: '1.0.0',
        status: 'healthy',
        documentation: 'Visit /api for available endpoints',
        features: {
            'Real-time Notifications': notificationRoutes ? '✅ Active' : '❌ Disabled',
            'AI Cost Estimation': estimationRoutes ? '✅ Active' : '❌ Disabled',
            'Admin Panel': adminRoutes ? '✅ Active' : '❌ Disabled',
            'Job Management': '✅ Active',
            'Quote System': '✅ Active',
            'Messaging': '✅ Active'
        },
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            admin: '/api/admin',
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation',
            notifications: '/api/notifications'
        }
    });
});

// --- Enhanced Route Registration ---
console.log('📋 Registering routes...');

// Auth routes (Critical - must work)
if (authRoutes) {
    app.use('/api/auth', authRoutes);
    console.log('✅ Auth routes registered at /api/auth');
} else {
    console.error('❌ CRITICAL: Auth routes failed to load');
    console.error('📝 Authentication will not work - application cannot start');
    process.exit(1);
}

// Jobs routes (Critical - core functionality)
if (jobsRoutes) {
    app.use('/api/jobs', jobsRoutes);
    console.log('✅ Jobs routes registered at /api/jobs');
} else {
    console.error('❌ CRITICAL: Jobs routes failed to load');
    console.error('📝 Job management will not work');
    process.exit(1);
}

// Quotes routes (Critical - core functionality)
if (quotesRoutes) {
    app.use('/api/quotes', quotesRoutes);
    console.log('✅ Quotes routes registered at /api/quotes');
} else {
    console.error('❌ CRITICAL: Quotes routes failed to load');
    console.error('📝 Quote system will not work');
    process.exit(1);
}

// Messages routes (Critical - core functionality)
if (messagesRoutes) {
    app.use('/api/messages', messagesRoutes);
    console.log('✅ Messages routes registered at /api/messages');
} else {
    console.error('❌ CRITICAL: Messages routes failed to load');
    console.error('📝 Messaging system will not work');
    process.exit(1);
}

// Notification routes (Important - enhances user experience)
if (notificationRoutes) {
    app.use('/api/notifications', notificationRoutes);
    console.log('✅ Notification routes registered at /api/notifications');
    console.log('🔔 Real-time notifications: ENABLED');
    console.log('📱 Users will receive instant updates for:');
    console.log('   • New job postings');
    console.log('   • Quote submissions & approvals');
    console.log('   • New messages');
    console.log('   • Estimation status changes');
} else {
    console.warn('⚠️ Notification routes unavailable - notifications will not work');
    console.warn('📝 Create ./src/routes/notifications.js for real-time notifications');
    console.warn('🔔 Users will not receive real-time updates');
}

// Admin routes (Optional - for administration)
if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes registered at /api/admin');
    console.log('👨‍💼 Admin panel: ENABLED');
} else {
    console.warn('⚠️ Admin routes unavailable - admin panel will not work');
    console.warn('📝 Admin functionality will be limited');
}

// Estimation routes (Optional - AI features)
if (estimationRoutes) {
    app.use('/api/estimation', estimationRoutes);
    console.log('✅ Estimation routes registered at /api/estimation');
    console.log('🤖 AI Cost Estimation: ENABLED');
} else {
    console.warn('⚠️ Estimation routes unavailable - AI features disabled');
    console.warn('📝 Cost estimation functionality will not work');
}

console.log('📦 Route registration completed');

// --- Enhanced API Documentation Endpoint ---
app.get('/api', (req, res) => {
    res.json({
        message: 'SteelConnect API Documentation',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        status: 'operational',
        authentication: 'Bearer token required for protected routes',
        rate_limiting: 'Applied per endpoint',
        available_endpoints: [
            {
                path: 'GET /health',
                description: 'System health check',
                authentication: 'None'
            },
            {
                path: 'POST /api/auth/register',
                description: 'User registration',
                authentication: 'None'
            },
            {
                path: 'POST /api/auth/login',
                description: 'User login',
                authentication: 'None'
            },
            {
                path: 'GET /api/jobs',
                description: 'Get all jobs',
                authentication: 'Optional'
            },
            {
                path: 'POST /api/jobs',
                description: 'Create new job',
                authentication: 'Required (Contractor)'
            },
            {
                path: 'GET /api/quotes/*',
                description: 'Quote management',
                authentication: 'Required'
            },
            {
                path: 'GET /api/messages/*',
                description: 'Messaging system',
                authentication: 'Required'
            },
            {
                path: 'GET /api/notifications/*',
                description: 'Notification system',
                authentication: 'Required',
                status: notificationRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/estimation/*',
                description: 'AI cost estimation',
                authentication: 'Required',
                status: estimationRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/admin/*',
                description: 'Admin panel',
                authentication: 'Required (Admin)',
                status: adminRoutes ? 'Available' : 'Disabled'
            }
        ]
    });
});

// --- Enhanced Error Handling Middleware ---
app.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    console.error(`❌ ${timestamp} - Global Error Handler:`, error);
    
    // Log request details for debugging
    console.error(`📝 Request: ${req.method} ${req.url}`);
    console.error(`📝 User-Agent: ${req.get('User-Agent')}`);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
            success: false, 
            error: 'File too large. Maximum size is 50MB.',
            code: 'FILE_TOO_LARGE',
            timestamp
        });
    }
    
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            error: 'CORS policy violation',
            code: 'CORS_ERROR',
            timestamp
        });
    }

    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: error.message,
            code: 'VALIDATION_ERROR',
            timestamp
        });
    }

    if (error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            error: 'Invalid ID format',
            code: 'INVALID_ID',
            timestamp
        });
    }
    
    // Generic error response
    res.status(error.status || 500).json({ 
        success: false, 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal Server Error' 
            : error.message || 'Internal Server Error',
        code: 'INTERNAL_ERROR',
        timestamp,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
});

// --- Enhanced 404 Handler ---
app.use('*', (req, res) => {
    console.warn(`⚠️ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`,
        method: req.method,
        timestamp: new Date().toISOString(),
        available_routes: [
            '/',
            '/health',
            '/api',
            '/api/auth/*',
            '/api/jobs/*',
            '/api/quotes/*',
            '/api/messages/*',
            ...(notificationRoutes ? ['/api/notifications/*'] : ['⚠️ /api/notifications/* (disabled)']),
            ...(estimationRoutes ? ['/api/estimation/*'] : ['⚠️ /api/estimation/* (disabled)']),
            ...(adminRoutes ? ['/api/admin/*'] : ['⚠️ /api/admin/* (disabled)'])
        ],
        suggestion: 'Check the API documentation at /api'
    });
});

// --- Enhanced Graceful Shutdown ---
const gracefulShutdown = (signal) => {
    console.log(`🔴 ${signal} received, shutting down gracefully...`);
    
    // Close MongoDB connection
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close()
            .then(() => console.log('📊 MongoDB connection closed'))
            .catch(err => console.error('❌ Error closing MongoDB:', err));
    }
    
    // Give time for cleanup
    setTimeout(() => {
        console.log('👋 Server shutdown complete');
        process.exit(0);
    }, 1000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// --- Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('🎉 SteelConnect Backend Server Started Successfully');
    console.log(`🔗 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    console.log('\n📋 Environment Check:');
    console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   CORS Origins: ${process.env.CORS_ORIGIN ? '✅ Configured' : '⚠️ Using defaults'}`);
    
    console.log('\n🔗 Available endpoints:');
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API Docs: http://localhost:${PORT}/api`);
    console.log(`   Auth: http://localhost:${PORT}/api/auth/*`);
    console.log(`   Jobs: http://localhost:${PORT}/api/jobs/*`);
    console.log(`   Quotes: http://localhost:${PORT}/api/quotes/*`);
    console.log(`   Messages: http://localhost:${PORT}/api/messages/*`);
    
    if (notificationRoutes) {
        console.log(`   Notifications: http://localhost:${PORT}/api/notifications/*`);
    }
    if (estimationRoutes) {
        console.log(`   Estimation: http://localhost:${PORT}/api/estimation/*`);
    }
    if (adminRoutes) {
        console.log(`   Admin: http://localhost:${PORT}/api/admin/*`);
    }
    
    console.log('\n🚀 SteelConnect Backend is ready to serve requests!');
    console.log('📝 Check logs above for any missing features or configurations');
    console.log('');
});

// Set server timeout for long-running requests
server.timeout = 120000; // 2 minutes

export default app;
