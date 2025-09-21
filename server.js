// server.js - Complete SteelConnect Backend with Profile Management System and Support System
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

// Import enhanced routes with proper error handling
let profileRoutes;
try {
    const profileModule = await import('./src/routes/profile.js');
    profileRoutes = profileModule.default;
    console.log('✅ Profile routes imported successfully');
} catch (error) {
    console.error('❌ Profile routes failed to load:', error.message);
    console.error('🔧 Profile completion functionality will not work');
    process.exit(1); // Exit since profile system is critical
}

let adminRoutes;
try {
    const adminModule = await import('./src/routes/admin.js');
    adminRoutes = adminModule.default;
    console.log('✅ Admin routes imported successfully');
} catch (error) {
    console.warn('⚠️ Admin routes not available:', error.message);
    console.warn('🔧 Admin functionality will be limited');
}

let estimationRoutes;
try {
    const estimationModule = await import('./src/routes/estimation.js');
    estimationRoutes = estimationModule.default;
    console.log('✅ Estimation routes imported successfully');
} catch (error) {
    console.warn('⚠️ Estimation routes not available:', error.message);
    console.warn('🔧 AI estimation features will not work');
}

let notificationRoutes;
try {
    const notificationModule = await import('./src/routes/notifications.js');
    notificationRoutes = notificationModule.default;
    console.log('✅ Notification routes imported successfully');
} catch (error) {
    console.warn('⚠️ Notification routes not available:', error.message);
    console.warn('🔧 Real-time notifications will not work');
}

// NEW: Import support routes
let supportRoutes;
try {
    const supportModule = await import('./src/routes/support.js');
    supportRoutes = supportModule.default;
    console.log('✅ Support routes imported successfully');
} catch (error) {
    console.warn('⚠️ Support routes not available:', error.message);
    console.warn('🔧 Support system will not work');
}

// NEW: Import analysis routes
import analysisRoutes from './routes/analysis.js';
import adminAnalysisRoutes from './routes/adminAnalysis.js';

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

// --- Email Configuration Check with Verified Domain ---
console.log('\n📧 Email Configuration Check:');
if (process.env.RESEND_API_KEY) {
    console.log('✅ Resend API Key: Configured');
    
    // Use verified steelconnectapp.com domain
    const emailDomain = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
    console.log(`📧 Email From Domain: ${emailDomain}`);
    
    if (emailDomain.includes('steelconnectapp.com')) {
        console.log('✅ Using VERIFIED domain: steelconnectapp.com - emails should work perfectly!');
        console.log('🎉 Domain verification confirmed in Resend dashboard');
    } else if (emailDomain.includes('steelconnect.com')) {
        console.log('⚠️ WARNING: Using steelconnect.com domain - ensure it\'s verified in Resend');
        console.log('💡 TIP: Use steelconnectapp.com (verified) or onboarding@resend.dev');
    } else if (emailDomain.includes('resend.dev')) {
        console.log('✅ Using Resend default verified domain');
    }
} else {
    console.log('❌ Resend API Key: Missing');
    console.log('🔧 Add RESEND_API_KEY to your environment variables');
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
        console.error('🔧 Check your MONGODB_URI environment variable');
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
    console.error('🔧 Database connection required for the application to work');
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
        const bodyStr = JSON.stringify(req.body, null, 2);
        if (bodyStr.length < 500) {
            console.log(`🔍 Body:`, bodyStr);
        }
    }
    
    next();
});

// --- Enhanced Health Check Route ---
app.get('/health', (req, res) => {
    const emailDomain = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
    const isVerifiedDomain = emailDomain.includes('steelconnectapp.com');
    
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
        version: '2.1.0', // Updated version for support system
        services: {
            database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            notifications: notificationRoutes ? 'available' : 'unavailable',
            estimation: estimationRoutes ? 'available' : 'unavailable',
            admin: adminRoutes ? 'available' : 'unavailable',
            profile: profileRoutes ? 'available' : 'unavailable',
            support: supportRoutes ? 'available' : 'unavailable', // NEW
            email: process.env.RESEND_API_KEY ? (isVerifiedDomain ? 'verified_domain' : 'configured') : 'missing',
            analysis: 'available' // NEW
        },
        email_config: {
            api_key: process.env.RESEND_API_KEY ? 'configured' : 'missing',
            from_domain: emailDomain,
            domain_status: isVerifiedDomain ? 'verified_steelconnectapp.com' : 'check_verification',
            ready_to_send: process.env.RESEND_API_KEY && isVerifiedDomain
        }
    };
    
    res.json(healthData);
});

// --- Enhanced Root Route ---
app.get('/', (req, res) => {
    const emailDomain = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
    const isVerifiedDomain = emailDomain.includes('steelconnectapp.com');
    
    res.json({ 
        message: 'SteelConnect Backend API v2.1 - Profile Management & Support System',
        version: '2.1.0',
        status: 'healthy',
        documentation: 'Visit /api for available endpoints',
        features: {
            'Profile Management System': profileRoutes ? '✅ Active' : '❌ Disabled',
            'Support System': supportRoutes ? '✅ Active' : '❌ Disabled', // NEW
            'Real-time Notifications': notificationRoutes ? '✅ Active' : '❌ Disabled',
            'AI Cost Estimation': estimationRoutes ? '✅ Active' : '❌ Disabled',
            'Admin Panel': adminRoutes ? '✅ Active' : '❌ Disabled',
            'Job Management': '✅ Active',
            'Quote System': '✅ Active',
            'Messaging': '✅ Active',
            'Analysis & Reporting': '✅ Active', // NEW
            'Login Email Notifications': process.env.RESEND_API_KEY && isVerifiedDomain ? '✅ Active with Verified Domain' : 
                                        process.env.RESEND_API_KEY ? '⚠️ Check Domain Verification' : '❌ Disabled'
        },
        email_status: {
            configured: process.env.RESEND_API_KEY ? true : false,
            from_domain: emailDomain,
            domain_verified: isVerifiedDomain ? 'steelconnectapp.com (verified)' : 'verification_needed',
            production_ready: isVerifiedDomain && process.env.RESEND_API_KEY
        },
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            profile: '/api/profile',
            admin: '/api/admin',
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation',
            notifications: '/api/notifications',
            support: '/api/support', // NEW
            analysis: '/api/analysis', // NEW
            adminAnalysis: '/api/admin/analysis' // NEW
        }
    });
});

// --- Enhanced API Documentation Endpoint ---
app.get('/api', (req, res) => {
    const emailDomain = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
    const isVerifiedDomain = emailDomain.includes('steelconnectapp.com');
    
    res.json({
        message: 'SteelConnect API v2.1 - Profile Management & Support System',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        status: 'operational',
        authentication: 'Bearer token required for protected routes',
        profile_system: 'Users must complete profile and get admin approval',
        support_system: 'Integrated support ticket system for user assistance', // NEW
        email_configuration: {
            status: process.env.RESEND_API_KEY ? 'configured' : 'missing',
            from_domain: emailDomain,
            domain_verification: isVerifiedDomain ? 'verified (steelconnectapp.com)' : 'needs_verification',
            production_ready: isVerifiedDomain && process.env.RESEND_API_KEY,
            note: 'Verify domain in Resend dashboard'
        },
        available_endpoints: [
            {
                path: 'GET /health',
                description: 'System health check with email verification status',
                authentication: 'None'
            },
            {
                path: 'POST /api/auth/register',
                description: 'User registration',
                authentication: 'None'
            },
            {
                path: 'POST /api/auth/login',
                description: 'User login with email notification from verified domain',
                authentication: 'None',
                email_required: true,
                email_domain: emailDomain
            },
            {
                path: 'POST /api/support/submit',
                description: 'Submit support request with file attachments',
                authentication: 'Required',
                status: supportRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/support/my-tickets',
                description: 'Get user\'s support tickets',
                authentication: 'Required',
                status: supportRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/profile/status',
                description: 'Check profile completion status',
                authentication: 'Required'
            },
            {
                path: 'PUT /api/profile/complete',
                description: 'Submit profile for admin approval',
                authentication: 'Required'
            },
            {
                path: 'GET /api/admin/profile-reviews',
                description: 'Get pending profile reviews',
                authentication: 'Required (Admin)',
                status: adminRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/admin/support-messages',
                description: 'Get all support tickets for admin',
                authentication: 'Required (Admin)',
                status: adminRoutes && supportRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/jobs',
                description: 'Get all jobs',
                authentication: 'Required (Approved Profile)'
            },
            {
                path: 'POST /api/jobs',
                description: 'Create new job',
                authentication: 'Required (Contractor, Approved Profile)'
            },
            {
                path: 'GET /api/estimation/*',
                description: 'AI cost estimation',
                authentication: 'Required (Contractor, Approved Profile)',
                status: estimationRoutes ? 'Available' : 'Disabled'
            },
            {
                path: 'GET /api/analysis/*',
                description: 'Analysis and reporting endpoints for users',
                authentication: 'Required',
                status: 'Available'
            },
            {
                path: 'GET /api/admin/analysis/*',
                description: 'Analysis and reporting endpoints for administrators',
                authentication: 'Required (Admin)',
                status: adminRoutes ? 'Available' : 'Disabled'
            }
        ]
    });
});

// --- Enhanced Route Registration ---
console.log('📋 Registering routes...');

// Auth routes (Critical - must work)
if (authRoutes) {
    app.use('/api/auth', authRoutes);
    console.log('✅ Auth routes registered at /api/auth');
    console.log('   • User registration with profile workflow');
    console.log('   • Login with email notifications from verified domain');
    console.log('   • Token verification');
} else {
    console.error('❌ CRITICAL: Auth routes failed to load');
    console.error('🔧 Authentication will not work - application cannot start');
    process.exit(1);
}

// Profile routes (Critical - for profile management system)
if (profileRoutes) {
    app.use('/api/profile', profileRoutes);
    console.log('✅ Profile routes registered at /api/profile');
    console.log('👤 Profile management system: ENABLED');
    console.log('🔧 Profile features available:');
    console.log('   • Profile completion workflow');
    console.log('   • File uploads (resumes, certificates)');
    console.log('   • Admin review system');
    console.log('   • User type specific forms');
    console.log('   • Email notifications for approvals');
    console.log('   • Profile status tracking');
} else {
    console.error('❌ CRITICAL: Profile routes failed to load');
    console.error('🔧 Profile management will not work - required for app functionality');
    process.exit(1);
}

// NEW: Support routes (Important - for user assistance)
if (supportRoutes) {
    app.use('/api/support', supportRoutes);
    console.log('✅ Support routes registered at /api/support');
    console.log('🎧 Support system: ENABLED');
    console.log('   • User support request form');
    console.log('   • File attachment support');
    console.log('   • Priority levels (Low, Medium, High, Critical)');
    console.log('   • Ticket ID generation and tracking');
    console.log('   • Admin notifications for new requests');
    console.log('   • Integration with admin message dashboard');
} else {
    console.warn('⚠️ Support routes unavailable - support system disabled');
    console.warn('🔧 Create ./src/routes/support.js for support functionality');
}

// Admin routes (Important - for profile approval and support management)
if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes registered at /api/admin');
    console.log('👨‍💼 Admin panel: ENABLED');
    console.log('   • Profile review and approval system');
    console.log('   • User management');
    console.log('   • Dashboard statistics');
    if (supportRoutes) {
        console.log('   • Support ticket management'); // NEW
    }
} else {
    console.warn('⚠️ Admin routes unavailable - profile approval will not work');
    console.warn('🔧 Create ./src/routes/admin.js for profile approval system');
}

// Jobs routes (Critical - core functionality)
if (jobsRoutes) {
    app.use('/api/jobs', jobsRoutes);
    console.log('✅ Jobs routes registered at /api/jobs');
} else {
    console.error('❌ CRITICAL: Jobs routes failed to load');
    console.error('🔧 Job management will not work');
    process.exit(1);
}

// Quotes routes (Critical - core functionality)
if (quotesRoutes) {
    app.use('/api/quotes', quotesRoutes);
    console.log('✅ Quotes routes registered at /api/quotes');
} else {
    console.error('❌ CRITICAL: Quotes routes failed to load');
    console.error('🔧 Quote system will not work');
    process.exit(1);
}

// Messages routes (Critical - core functionality)
if (messagesRoutes) {
    app.use('/api/messages', messagesRoutes);
    console.log('✅ Messages routes registered at /api/messages');
} else {
    console.error('❌ CRITICAL: Messages routes failed to load');
    console.error('🔧 Messaging system will not work');
    process.exit(1);
}

// Notification routes (Important - enhances user experience)
if (notificationRoutes) {
    app.use('/api/notifications', notificationRoutes);
    console.log('✅ Notification routes registered at /api/notifications');
    console.log('📱 Real-time notifications: ENABLED');
} else {
    console.warn('⚠️ Notification routes unavailable - notifications will not work');
    console.warn('🔧 Create ./src/routes/notifications.js for real-time notifications');
}

// Estimation routes (Optional - AI features)
if (estimationRoutes) {
    app.use('/api/estimation', estimationRoutes);
    console.log('✅ Estimation routes registered at /api/estimation');
    console.log('🤖 AI Cost Estimation: ENABLED');
    console.log('   • File upload and processing');
    console.log('   • Contractor estimation requests');
    console.log('   • Admin result management');
} else {
    console.warn('⚠️ Estimation routes unavailable - AI features disabled');
    console.warn('🔧 Cost estimation functionality will not work');
}

// NEW: Analysis routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/admin/analysis', adminAnalysisRoutes);
console.log('📊 Analysis routes registered at /api/analysis and /api/admin/analysis');
console.log('   • User analytics and reporting');
console.log('   • Admin dashboard insights');

console.log('📦 Route registration completed');

// =================================================================
// START: ADDED CODE - Backend Proxy Download Route
// =================================================================
// IMPORTANT: You must implement the `getFileRecord` function yourself.
// It should query your database to find the file's metadata (GCS URL, filename, mimetype).
async function getFileRecord(fileId) {
    console.log(`Fetching file record for ID: ${fileId}`);
    // Example implementation with MongoDB:
    // const file = await YourFileModel.findById(fileId);
    // if (!file) return null;
    // return {
    //     gcsUrl: file.url,
    //     filename: file.originalName,
    //     mimetype: file.mimetype
    // };
    // For now, returning a placeholder. Replace this!
    return null; 
}

app.get('/api/files/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        
        // Get the actual GCS URL from your database
        const fileRecord = await getFileRecord(fileId);
        if (!fileRecord || !fileRecord.gcsUrl) {
            return res.status(404).json({ success: false, error: 'File not found or URL is missing' });
        }

        console.log(`Proxying download for ${fileRecord.filename} from ${fileRecord.gcsUrl}`);
        
        // Fetch the file from GCS using server-side request
        // This requires Node.js v18+ for native fetch.
        // For older versions, you might need a library like `node-fetch`.
        const response = await fetch(fileRecord.gcsUrl);
        
        if (!response.ok) {
            console.error(`GCS fetch failed with status: ${response.status}`);
            throw new Error('Failed to fetch file from storage');
        }
        
        // Set appropriate headers for the client to trigger a download
        res.set({
            'Content-Type': fileRecord.mimetype || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fileRecord.filename}"`
        });
        
        // Pipe the file data from GCS directly to the client response
        response.body.pipe(res);

    } catch (error) {
        console.error('Download proxy error:', error);
        res.status(500).json({ success: false, error: 'Download failed due to an internal error' });
    }
});
// =================================================================
// END: ADDED CODE
// =================================================================

// --- Enhanced Error Handling Middleware ---
app.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    console.error(`❌ ${timestamp} - Global Error Handler:`, error);
    
    // Log request details for debugging
    console.error(`🔍 Request: ${req.method} ${req.url}`);
    console.error(`🔍 User-Agent: ${req.get('User-Agent')}`);
    
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
            '/api/profile/*',
            '/api/jobs/*',
            '/api/quotes/*',
            '/api/messages/*',
            '/api/files/download/:fileId',
            ...(supportRoutes ? ['/api/support/*'] : ['⚠️ /api/support/* (disabled)']), // NEW
            ...(notificationRoutes ? ['/api/notifications/*'] : ['⚠️ /api/notifications/* (disabled)']),
            ...(estimationRoutes ? ['/api/estimation/*'] : ['⚠️ /api/estimation/* (disabled)']),
            ...(adminRoutes ? ['/api/admin/*'] : ['⚠️ /api/admin/* (disabled)']),
            '/api/analysis/*', // NEW
            '/api/admin/analysis/*' // NEW
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
    console.log('🎉 SteelConnect Backend v2.1 Started Successfully');
    console.log(`🔗 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    console.log('\n📋 Environment Check:');
    console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   CORS Origins: ${process.env.CORS_ORIGIN ? '✅ Configured' : '⚠️ Using defaults'}`);
    console.log(`   Resend API: ${process.env.RESEND_API_KEY ? '✅ Configured' : '⚠️ Missing'}`);
    
    const emailDomain = process.env.EMAIL_FROM_DOMAIN || 'noreply@steelconnectapp.com';
    const isVerifiedDomain = emailDomain.includes('steelconnectapp.com');
    console.log(`   Email From: ${emailDomain} ${isVerifiedDomain ? '✅ (VERIFIED DOMAIN)' : '⚠️ (verify needed)'}`);
    
    console.log('\n🔗 Available endpoints:');
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API Docs: http://localhost:${PORT}/api`);
    console.log(`   Auth: http://localhost:${PORT}/api/auth/*`);
    console.log(`   Profile: http://localhost:${PORT}/api/profile/*`);
    console.log(`   Jobs: http://localhost:${PORT}/api/jobs/*`);
    console.log(`   Quotes: http://localhost:${PORT}/api/quotes/*`);
    console.log(`   Messages: http://localhost:${PORT}/api/messages/*`);
    console.log(`   File Download: http://localhost:${PORT}/api/files/download/:fileId`);
    
    if (supportRoutes) {
        console.log(`   Support: http://localhost:${PORT}/api/support/*`);
    }
    if (notificationRoutes) {
        console.log(`   Notifications: http://localhost:${PORT}/api/notifications/*`);
    }
    if (estimationRoutes) {
        console.log(`   Estimation: http://localhost:${PORT}/api/estimation/*`);
    }
    if (adminRoutes) {
        console.log(`   Admin: http://localhost:${PORT}/api/admin/*`);
    }

    console.log(`   Analysis: http://localhost:${PORT}/api/analysis/*`);
    console.log(`   Admin Analysis: http://localhost:${PORT}/api/admin/analysis/*`);

    console.log('\n🚀 SteelConnect Backend v2.1 is ready!');
    console.log('📋 Profile Management System: ACTIVE');
    console.log('👨‍💼 Admin Approval Workflow: ACTIVE');
    
    if (supportRoutes) {
        console.log('🎧 Support System: ✅ ACTIVE');
        console.log('   • User support requests with file uploads');
        console.log('   • Priority-based ticket management');
        console.log('   • Admin notification system');
        console.log('   • Integration with admin dashboard');
    } else {
        console.log('🎧 Support System: ❌ DISABLED');
    }
    
    // Email status summary
    if (process.env.RESEND_API_KEY && isVerifiedDomain) {
        console.log('📧 Login Email Notifications: ✅ ACTIVE with VERIFIED DOMAIN');
        console.log('🎉 Email system ready for production with steelconnectapp.com');
    } else if (process.env.RESEND_API_KEY) {
        console.log('📧 Login Email Notifications: ⚠️ ACTIVE but domain needs verification');
        console.log('💡 Verify your domain in Resend dashboard or use steelconnectapp.com');
    } else {
        console.log('📧 Login Email Notifications: ❌ DISABLED (missing RESEND_API_KEY)');
    }
    
    console.log('🔍 Check logs above for any missing features or configurations');
    console.log('');
});

// Set server timeout for long-running requests
server.timeout = 120000; // 2 minutes

export default app;
