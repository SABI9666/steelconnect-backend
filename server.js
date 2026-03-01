// server.js - Complete SteelConnect Backend with Profile Management System and Support System
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Import bcrypt for admin seeding
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
import { adminDb, admin } from './src/config/firebase.js';

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
import analysisRoutes from './src/routes/analysis.js';

// NEW: Import voice call routes
let voiceCallRoutes;
try {
    const voiceCallModule = await import('./src/routes/voiceCalls.js');
    voiceCallRoutes = voiceCallModule.default;
    console.log('✅ Voice call routes imported successfully');
} catch (error) {
    console.warn('⚠️ Voice call routes not available:', error.message);
}

// NEW: Import announcements routes
let announcementsRoutes;
try {
    const announcementsModule = await import('./src/routes/announcements.js');
    announcementsRoutes = announcementsModule.default;
    console.log('✅ Announcements routes imported successfully');
} catch (error) {
    console.warn('⚠️ Announcements routes not available:', error.message);
}

// NEW: Import community routes
let communityRoutes;
try {
    const communityModule = await import('./src/routes/community.js');
    communityRoutes = communityModule.default;
    console.log('✅ Community routes imported successfully');
} catch (error) {
    console.warn('⚠️ Community routes not available:', error.message);
    console.warn('🔧 Community feed will not work');
}

// NEW: Import subscription routes
let subscriptionRoutes;
try {
    const subscriptionModule = await import('./src/routes/subscriptions.js');
    subscriptionRoutes = subscriptionModule.default;
    console.log('✅ Subscription routes imported successfully');
} catch (error) {
    console.warn('⚠️ Subscription routes not available:', error.message);
    console.warn('🔧 Subscription management will not work');
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
        if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            const bodyStr = JSON.stringify(req.body, null, 2);
            if (bodyStr && bodyStr.length < 500) {
                console.log(`🔍 Body:`, bodyStr);
            }
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
            analysis: '/api/analysis' // NEW
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
console.log('📊 Analysis routes registered at /api/analysis');
console.log('   • User analytics and reporting');

// Start dashboard auto-sync scheduler
import { startAutoSync } from './src/services/dashboardSyncService.js';
startAutoSync();
console.log('🔄 Dashboard auto-sync scheduler started');

// NEW: Announcements routes (public for portal users)
if (announcementsRoutes) {
    app.use('/api/announcements', announcementsRoutes);
    console.log('✅ Announcements routes registered at /api/announcements');
    console.log('📢 Public announcements: ENABLED');
} else {
    console.warn('⚠️ Announcements routes unavailable');
}

// NEW: Community routes
if (communityRoutes) {
    app.use('/api/community', communityRoutes);
    console.log('✅ Community routes registered at /api/community');
    console.log('💬 Community Feed: ENABLED');
    console.log('   • Community post CRUD');
    console.log('   • Like and comment system');
    console.log('   • Admin approval workflow');
    console.log('   • Image uploads to GCS');
} else {
    console.warn('⚠️ Community routes unavailable - community feed disabled');
}

// Subscription routes
if (subscriptionRoutes) {
    app.use('/api/subscriptions', subscriptionRoutes);
    console.log('✅ Subscription routes registered at /api/subscriptions');
    console.log('💳 Subscriptions: ENABLED');
    console.log('   • Plan management');
    console.log('   • Stripe checkout (pending configuration)');
    console.log('   • Admin subscription controls');
} else {
    console.warn('⚠️ Subscription routes unavailable - subscription management disabled');
}

// Voice call routes
if (voiceCallRoutes) {
    app.use('/api/voice-calls', voiceCallRoutes);
    console.log('✅ Voice call routes registered at /api/voice-calls');
    console.log('📞 Voice Calls: ENABLED');
    console.log('   • Call history and logs');
    console.log('   • WebRTC signaling via Socket.IO');
} else {
    console.warn('⚠️ Voice call routes unavailable');
}

// Meeting scheduling routes
let meetingRoutes;
try {
    const meetingModule = await import('./src/routes/meetings.js');
    meetingRoutes = meetingModule.default;
    console.log('✅ Meeting routes imported successfully');
} catch (error) {
    console.warn('⚠️ Meeting routes not available:', error.message);
}
if (meetingRoutes) {
    app.use('/api/meetings', meetingRoutes);
    console.log('✅ Meeting routes registered at /api/meetings');
    console.log('📅 Meeting Scheduling: ENABLED');
    console.log('   • Schedule project meetings');
    console.log('   • Professional email invitations');
    console.log('   • Accept/decline meeting responses');
    console.log('   • Meeting reschedule & cancellation');
} else {
    console.warn('⚠️ Meeting routes unavailable - meeting scheduling disabled');
}

console.log('📦 Route registration completed');

// --- PUBLIC: Prospect Email Capture (no auth required) ---
app.post('/api/prospects/capture', async (req, res) => {
    try {
        const { email, source, scrollDepth, estimateData } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Valid email is required' });
        }
        const normalizedEmail = email.toLowerCase().trim();

        // Check if already captured
        const existing = await adminDb.collection('prospects')
            .where('email', '==', normalizedEmail).limit(1).get();
        if (!existing.empty) {
            return res.json({ success: true, message: 'Thank you! We already have your details.' });
        }

        const prospectData = {
            email: normalizedEmail,
            source: source || 'landing-page',
            scrollDepth: scrollDepth || null,
            capturedAt: new Date().toISOString(),
            inviteSent: false,
            inviteCount: 0,
        };
        // Store mini estimator data if provided
        if (estimateData) {
            prospectData.estimateData = {
                projectType: estimateData.projectType || '',
                area: estimateData.area || 0,
                unit: estimateData.unit || 'sqft',
                region: estimateData.region || '',
                currency: estimateData.currency || 'USD'
            };
        }
        await adminDb.collection('prospects').add(prospectData);

        res.json({ success: true, message: 'Thank you! We will reach out to you shortly.' });
    } catch (error) {
        console.error('Prospect capture error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});
console.log('📧 Prospect capture endpoint registered at POST /api/prospects/capture');

// --- PUBLIC: AI Chatbot for Landing Page (no auth required) ---
app.post('/api/chatbot/ask', async (req, res) => {
    try {
        const { message, sessionId, context } = req.body;
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        // Rate limit: simple in-memory check (per session)
        if (!global._chatbotRateLimit) global._chatbotRateLimit = {};
        const now = Date.now();
        const sid = sessionId || 'anonymous';
        if (!global._chatbotRateLimit[sid]) global._chatbotRateLimit[sid] = [];
        global._chatbotRateLimit[sid] = global._chatbotRateLimit[sid].filter(t => now - t < 60000);
        if (global._chatbotRateLimit[sid].length >= 15) {
            return res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment.' });
        }
        global._chatbotRateLimit[sid].push(now);

        // Clean up old sessions every 100 requests
        if (Math.random() < 0.01) {
            for (const key of Object.keys(global._chatbotRateLimit)) {
                if (global._chatbotRateLimit[key].every(t => now - t > 300000)) {
                    delete global._chatbotRateLimit[key];
                }
            }
        }

        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const systemPrompt = `You are the SteelConnect AI Assistant — a professional, knowledgeable, and friendly chatbot embedded on the SteelConnect landing page. Your purpose is to help visitors understand the platform and encourage them to sign up.

ABOUT STEELCONNECT:
SteelConnect is the world's premier AI-powered construction platform that connects steel designers, structural engineers, and contractors globally. Key facts:
- 2,500+ verified professionals across 50+ countries
- 850+ completed projects, 12,000+ AI estimates generated
- AI-powered cost estimation using Claude Opus with 95%+ accuracy
- Supports PDF drawing analysis, quantity takeoff, and BOQ generation
- Real-time encrypted messaging, project management, and collaboration tools
- Business analytics with predictive dashboards and KPI tracking
- Enterprise security: SOC 2 compliant, end-to-end encryption, NDA management
- Escrow payment protection, verified PE licenses, insurance validation

KEY FEATURES:
1. AI Cost Estimation: Upload PDF drawings → AI analyzes dimensions, materials, components → Detailed trade-by-trade breakdown with material BOQ, manpower, and timeline
2. Global Marketplace: Post projects or bid on opportunities. Verified professionals with PE licenses.
3. Real-Time Chat: Encrypted messaging with file sharing for project collaboration
4. Business Analytics: Revenue tracking, project metrics, market benchmarks, AI forecasting
5. Quote System: Submit and receive competitive project quotes
6. Community Hub: Industry news, discussions, networking with professionals
7. Support: 24/7 dedicated support team, in-app ticket system

PRICING:
- Free Tier: Sign up free, basic AI estimates, browse marketplace, connect with professionals
- Professional: Unlimited AI estimates, PDF analysis, priority matching, advanced analytics
- Enterprise: Custom solutions, dedicated support, API access, team management

HOW TO GET STARTED:
1. Click "Start Building Today" → 2. Enter email & choose role (Client/Contractor) → 3. Verify email with OTP → 4. Complete profile → 5. Get approved → 6. Start working!

RESPONSE GUIDELINES:
- Be concise but informative (max 150 words per response)
- Use HTML formatting: <strong> for emphasis, <ul><li> for lists
- Always mention relevant platform features
- Gently encourage signing up or sharing email for more info
- If the question is unrelated to construction/SteelConnect, politely redirect to platform topics
- Never make up information. If unsure, suggest they contact support or sign up for a demo
- Be professional yet warm and approachable`;

        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            system: systemPrompt,
            messages: [{ role: 'user', content: message.trim().substring(0, 500) }]
        });

        const aiText = response.content[0]?.text || 'I appreciate your question! For detailed help, please sign up for free or reach out to our support team.';

        res.json({ success: true, response: aiText });

    } catch (error) {
        console.error('Chatbot AI error:', error.message);
        res.json({
            success: true,
            response: "I'm having a brief moment — but I'm still here to help! Ask me about <strong>AI estimation</strong>, <strong>getting started</strong>, <strong>pricing</strong>, or any SteelConnect feature, and I'll do my best to assist you."
        });
    }
});
console.log('🤖 Chatbot endpoint registered at POST /api/chatbot/ask');

// --- PUBLIC: Save Chatbot Session (no auth required) ---
app.post('/api/chatbot/save-session', async (req, res) => {
    try {
        const { sessionId, messages, email, source } = req.body;
        if (!sessionId || !messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid session data' });
        }

        // Sanitize messages (keep only text and role, limit to 50 messages)
        const sanitizedMessages = messages.slice(0, 50).map(m => ({
            role: (m.role === 'user' || m.role === 'bot') ? m.role : 'unknown',
            text: (m.text || '').substring(0, 1000),
            time: m.time || new Date().toISOString()
        }));

        const sessionData = {
            sessionId: sessionId.substring(0, 100),
            messages: sanitizedMessages,
            messageCount: sanitizedMessages.length,
            email: email ? email.toLowerCase().trim().substring(0, 200) : null,
            source: (source || 'chatbot').substring(0, 50),
            capturedAt: new Date().toISOString(),
            replied: false
        };

        // Upsert: update if session exists, create if new
        const existing = await adminDb.collection('chatbot_sessions')
            .where('sessionId', '==', sessionData.sessionId)
            .limit(1)
            .get();

        if (!existing.empty) {
            await existing.docs[0].ref.update({
                messages: sanitizedMessages,
                messageCount: sanitizedMessages.length,
                email: sessionData.email || existing.docs[0].data().email,
                updatedAt: new Date().toISOString()
            });
        } else {
            await adminDb.collection('chatbot_sessions').add(sessionData);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Chatbot save-session error:', error.message);
        res.json({ success: true }); // Always return success to not block frontend
    }
});
console.log('💾 Chatbot session save endpoint registered at POST /api/chatbot/save-session');

// --- PUBLIC: Visitor Tracking (no auth required) ---
// Import user activity logger for visitor notifications
let logVisitorActivity;
try {
    const userActivityModule = await import('./src/services/userActivityLogger.js');
    logVisitorActivity = userActivityModule.logUserActivity;
} catch (e) {
    console.log('[VISITOR] User activity logger not available:', e.message);
    logVisitorActivity = () => Promise.resolve();
}

// Record a new visitor session (called when someone opens the website)
app.post('/api/visitors/track', async (req, res) => {
    try {
        const { sessionId, referrer, landingPage, userAgent, userEmail, userName, screenResolution, language } = req.body;
        if (!sessionId) return res.status(400).json({ success: false, message: 'sessionId is required' });

        // Parse user agent for device/browser info
        const ua = userAgent || req.headers['user-agent'] || '';
        const isMobile = /mobile|android|iphone|ipad/i.test(ua);
        const isTablet = /tablet|ipad/i.test(ua);
        const deviceType = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';

        let browser = 'Unknown';
        if (/edg/i.test(ua)) browser = 'Edge';
        else if (/chrome/i.test(ua)) browser = 'Chrome';
        else if (/firefox/i.test(ua)) browser = 'Firefox';
        else if (/safari/i.test(ua)) browser = 'Safari';
        else if (/opera|opr/i.test(ua)) browser = 'Opera';

        let os = 'Unknown';
        if (/windows/i.test(ua)) os = 'Windows';
        else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
        else if (/linux/i.test(ua)) os = 'Linux';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad/i.test(ua)) os = 'iOS';

        // Get IP from request headers
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'Unknown';

        // Check if session already exists (prevent duplicates)
        const existing = await adminDb.collection('visitor_sessions')
            .where('sessionId', '==', sessionId.substring(0, 100))
            .limit(1).get();

        if (!existing.empty) {
            return res.json({ success: true, message: 'Session already tracked' });
        }

        const visitorData = {
            sessionId: sessionId.substring(0, 100),
            ip: ip.substring(0, 50),
            referrer: (referrer || 'Direct').substring(0, 500),
            landingPage: (landingPage || '/').substring(0, 200),
            deviceType,
            browser,
            os,
            userAgent: ua.substring(0, 300),
            screenResolution: (screenResolution || '').substring(0, 20),
            language: (language || '').substring(0, 10),
            startedAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            pagesViewed: [{ page: (landingPage || '/').substring(0, 200), viewedAt: new Date().toISOString() }],
            totalTimeSeconds: 0,
            isActive: true,
            // Contact info (if user is logged in)
            userEmail: userEmail ? userEmail.toLowerCase().trim().substring(0, 200) : null,
            userName: userName ? userName.substring(0, 100) : null,
            // Location — will be populated async from IP geolocation
            location: null,
        };

        // Save immediately (don't wait for geolocation)
        const docRef = await adminDb.collection('visitor_sessions').add(visitorData);
        res.json({ success: true, message: 'Visitor tracked' });

        // Log visitor activity notification (fire-and-forget)
        if (logVisitorActivity) {
            logVisitorActivity({
                userEmail: userEmail || 'Anonymous Visitor',
                userName: userName || '',
                userId: '',
                userType: 'visitor',
                category: 'Visitor Activity',
                action: 'New Visitor Session',
                description: `New visitor from ${deviceType} (${browser}/${os}) — ${referrer || 'Direct'} — ${landingPage || '/'}`,
                metadata: { sessionId: sessionId.substring(0, 100), deviceType, browser, os, referrer: referrer || 'Direct' },
                ip
            }).catch(() => {});
        }

        // Async: Resolve IP to location using ip-api.com (free, no key needed)
        // This runs AFTER response is sent so it doesn't slow down the user
        try {
            if (ip && ip !== 'Unknown' && ip !== '127.0.0.1' && ip !== '::1') {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4000);
                const geoRes = await fetch(
                    `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org`,
                    { signal: controller.signal }
                );
                clearTimeout(timeout);
                const geo = await geoRes.json();
                if (geo.status === 'success') {
                    await docRef.update({
                        location: {
                            country: geo.country || '',
                            countryCode: geo.countryCode || '',
                            region: geo.regionName || '',
                            city: geo.city || '',
                            zip: geo.zip || '',
                            lat: geo.lat || 0,
                            lon: geo.lon || 0,
                            timezone: geo.timezone || '',
                            isp: geo.isp || '',
                            org: geo.org || '',
                        }
                    });
                }
            }
        } catch (geoErr) {
            // Geolocation failed — no problem, location stays null
            console.log('[VISITOR] Geo lookup skipped:', geoErr.message);
        }
    } catch (error) {
        console.error('Visitor track error:', error.message);
        res.json({ success: true }); // Don't block frontend
    }
});

// Update visitor activity (page change, heartbeat for time tracking)
app.post('/api/visitors/heartbeat', async (req, res) => {
    try {
        const { sessionId, currentPage, timeSpentSeconds, userEmail, userName } = req.body;
        if (!sessionId) return res.status(400).json({ success: false });

        const snapshot = await adminDb.collection('visitor_sessions')
            .where('sessionId', '==', sessionId.substring(0, 100))
            .limit(1).get();

        if (snapshot.empty) return res.json({ success: true });

        const doc = snapshot.docs[0];
        const data = doc.data();
        const updates = {
            lastActiveAt: new Date().toISOString(),
            totalTimeSeconds: Math.min(parseInt(timeSpentSeconds) || 0, 86400), // cap at 24h
            isActive: true,
        };

        // If user just logged in, capture their contact info
        if (userEmail && !data.userEmail) {
            updates.userEmail = userEmail.toLowerCase().trim().substring(0, 200);
        }
        if (userName && !data.userName) {
            updates.userName = userName.substring(0, 100);
        }

        // Add page to pagesViewed if it's new
        if (currentPage) {
            const pages = data.pagesViewed || [];
            const lastPage = pages[pages.length - 1]?.page;
            if (lastPage !== currentPage && pages.length < 100) {
                pages.push({ page: currentPage.substring(0, 200), viewedAt: new Date().toISOString() });
                updates.pagesViewed = pages;
            }
        }

        await doc.ref.update(updates);
        res.json({ success: true });
    } catch (error) {
        console.error('Visitor heartbeat error:', error.message);
        res.json({ success: true });
    }
});

// Mark visitor as left (called on page unload)
app.post('/api/visitors/leave', async (req, res) => {
    try {
        const { sessionId, timeSpentSeconds } = req.body;
        if (!sessionId) return res.json({ success: true });

        const snapshot = await adminDb.collection('visitor_sessions')
            .where('sessionId', '==', sessionId.substring(0, 100))
            .limit(1).get();

        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update({
                isActive: false,
                lastActiveAt: new Date().toISOString(),
                totalTimeSeconds: Math.min(parseInt(timeSpentSeconds) || 0, 86400),
                endedAt: new Date().toISOString(),
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.json({ success: true });
    }
});

console.log('👁️ Visitor tracking endpoints registered at /api/visitors/*');

// --- Seed Default Admin User ---
async function seedAdminUser() {
    try {
        const adminEmail = 'admin@steelconnect.com';
        const adminPassword = 'admin@9666';

        // Check if admin already exists
        const existingAdmin = await adminDb.collection('users')
            .where('email', '==', adminEmail)
            .where('type', '==', 'admin')
            .get();

        if (!existingAdmin.empty) {
            // Update existing admin password
            const adminDoc = existingAdmin.docs[0];
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            await adminDb.collection('users').doc(adminDoc.id).update({
                password: hashedPassword,
                updatedAt: new Date().toISOString()
            });
            console.log(`✅ Admin user updated: ${adminEmail}`);
        } else {
            // Create new admin user
            const hashedPassword = await bcrypt.hash(adminPassword, 12);
            const adminData = {
                name: 'Admin',
                email: adminEmail,
                password: hashedPassword,
                type: 'admin',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                profileCompleted: true,
                profileStatus: 'approved',
                canAccess: true,
                isSuper: true
            };

            const adminRef = await adminDb.collection('users').add(adminData);
            console.log(`✅ Admin user created: ${adminEmail} (ID: ${adminRef.id})`);
        }
    } catch (error) {
        console.error('❌ Admin seeding error:', error.message);
    }
}

seedAdminUser();

// --- Seed Operations User ---
async function seedOperationsUser() {
    try {
        const opsEmail = 'operations@steelconnect.com';
        const opsPassword = 'operations9666';

        const existingOps = await adminDb.collection('users')
            .where('email', '==', opsEmail)
            .where('type', '==', 'operations')
            .get();

        if (!existingOps.empty) {
            const opsDoc = existingOps.docs[0];
            const hashedPassword = await bcrypt.hash(opsPassword, 12);
            await adminDb.collection('users').doc(opsDoc.id).update({
                password: hashedPassword,
                updatedAt: new Date().toISOString()
            });
            console.log(`✅ Operations user updated: ${opsEmail}`);
        } else {
            const hashedPassword = await bcrypt.hash(opsPassword, 12);
            const opsData = {
                name: 'Operations Manager',
                email: opsEmail,
                password: hashedPassword,
                type: 'operations',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                profileCompleted: true,
                profileStatus: 'approved',
                canAccess: true
            };

            const opsRef = await adminDb.collection('users').add(opsData);
            console.log(`✅ Operations user created: ${opsEmail} (ID: ${opsRef.id})`);
        }
    } catch (error) {
        console.error('❌ Operations user seeding error:', error.message);
    }
}

seedOperationsUser();

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
            '/api/analysis/*' // NEW
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

// --- Socket.IO Voice Call Signaling Server ---
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin) ||
                origin.endsWith('.vercel.app') ||
                origin.endsWith('.netlify.app') ||
                origin.includes('localhost') ||
                origin.includes('127.0.0.1')) {
                callback(null, true);
            } else if (process.env.NODE_ENV !== 'production') {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 30000,
    // Improved settings for global cross-region connectivity
    connectTimeout: 20000,
    maxHttpBufferSize: 1e6,
    allowUpgrades: true
});

// --- WEB PUSH (VAPID) SETUP ---
// Auto-generate VAPID keys if not provided via environment variables.
// These keys enable push notifications without requiring Firebase client SDK.
// In production, set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY env vars.
let VAPID_PUBLIC_KEY = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    const generated = webpush.generateVAPIDKeys();
    VAPID_PUBLIC_KEY = generated.publicKey;
    VAPID_PRIVATE_KEY = generated.privateKey;
    console.log('[WEB-PUSH] Auto-generated VAPID keys (set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY env vars for persistence)');
    console.log('[WEB-PUSH] Public Key:', VAPID_PUBLIC_KEY);
}

webpush.setVapidDetails(
    'mailto:support@steelconnect.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Endpoint: Get VAPID public key (frontend needs this to subscribe)
app.get('/api/push/vapid-key', (req, res) => {
    res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

// Endpoint: Save Web Push subscription for a user
app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { userId, subscription } = req.body;
        if (!userId || !subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: 'userId and subscription are required' });
        }

        // Upsert: check if this exact endpoint already exists for this user
        const existing = await adminDb.collection('web_push_subscriptions')
            .where('userId', '==', userId)
            .where('endpoint', '==', subscription.endpoint)
            .get();

        if (existing.empty) {
            await adminDb.collection('web_push_subscriptions').add({
                userId,
                endpoint: subscription.endpoint,
                subscription: JSON.stringify(subscription),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            console.log(`[WEB-PUSH] New subscription saved for user ${userId}`);
        } else {
            // Update existing subscription (keys may have changed)
            await existing.docs[0].ref.update({
                subscription: JSON.stringify(subscription),
                updatedAt: new Date().toISOString(),
            });
            console.log(`[WEB-PUSH] Subscription updated for user ${userId}`);
        }

        res.json({ success: true, message: 'Push subscription saved' });
    } catch (error) {
        console.error('[WEB-PUSH] Subscription save error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to save subscription' });
    }
});

// Endpoint: Remove Web Push subscription
app.post('/api/push/unsubscribe', async (req, res) => {
    try {
        const { userId, endpoint } = req.body;
        if (!userId || !endpoint) {
            return res.status(400).json({ success: false, message: 'userId and endpoint are required' });
        }

        const snapshot = await adminDb.collection('web_push_subscriptions')
            .where('userId', '==', userId)
            .where('endpoint', '==', endpoint)
            .get();

        for (const doc of snapshot.docs) {
            await doc.ref.delete();
        }

        console.log(`[WEB-PUSH] Subscription removed for user ${userId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('[WEB-PUSH] Unsubscribe error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to remove subscription' });
    }
});

// Send Web Push notification to all subscriptions for a user
async function sendWebPushNotification(userId, payload) {
    try {
        const snapshot = await adminDb.collection('web_push_subscriptions')
            .where('userId', '==', userId)
            .get();

        if (snapshot.empty) {
            console.log(`[WEB-PUSH] No subscriptions found for user ${userId}`);
            return 0;
        }

        let sentCount = 0;
        const invalidDocs = [];

        for (const doc of snapshot.docs) {
            try {
                const subscription = JSON.parse(doc.data().subscription);
                await webpush.sendNotification(subscription, JSON.stringify(payload));
                sentCount++;
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription expired or invalid - mark for cleanup
                    invalidDocs.push(doc);
                }
                console.warn(`[WEB-PUSH] Failed to send to subscription: ${err.message}`);
            }
        }

        // Clean up expired subscriptions
        for (const doc of invalidDocs) {
            await doc.ref.delete();
            console.log(`[WEB-PUSH] Removed expired subscription for user ${userId}`);
        }

        console.log(`[WEB-PUSH] Sent to ${sentCount}/${snapshot.size} subscriptions for user ${userId}`);
        return sentCount;
    } catch (err) {
        console.error('[WEB-PUSH] Error sending push:', err.message);
        return 0;
    }
}

// Track online users, presence statuses, and active calls
const onlineUsers = new Map(); // userId -> Set<socketId> (multiple devices per user)
const userStatuses = new Map(); // userId -> 'online' | 'away' | 'busy' | 'offline'
const activeCalls = new Map(); // callId -> { callerId, calleeId, startedAt, status, calleeSocketId }
const pendingCalls = new Map(); // calleeId -> { callId, callerId, callerName, conversationId, callType, startedAt }

// Helper: add a socket for a user (multi-device support)
function addUserSocket(userId, socketId) {
    if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socketId);
}

// Helper: remove a socket for a user
function removeUserSocket(userId, socketId) {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) onlineUsers.delete(userId);
    }
}

// Helper: get all socket IDs for a user
function getUserSockets(userId) {
    return onlineUsers.get(userId) || new Set();
}

// Helper: get any one socket ID for a user (for backwards-compat)
function getUserSocket(userId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets || sockets.size === 0) return null;
    return sockets.values().next().value;
}

// Helper: emit to ALL sockets of a user (rings on all devices)
function emitToUser(userId, event, data) {
    const sockets = getUserSockets(userId);
    for (const sid of sockets) {
        io.to(sid).emit(event, data);
    }
    return sockets.size;
}

// Send FCM push notification for incoming call
async function sendCallPushNotification(calleeId, callData) {
    try {
        // Look up FCM tokens for this user
        const tokensSnapshot = await adminDb.collection('user_fcm_tokens')
            .where('userId', '==', calleeId)
            .get();

        if (tokensSnapshot.empty) {
            console.log(`[FCM] No FCM tokens found for user ${calleeId}`);
            return false;
        }

        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
        console.log(`[FCM] Sending call notification to ${tokens.length} device(s) for user ${calleeId}`);

        const message = {
            notification: {
                title: 'Incoming Call',
                body: `${callData.callerName} is calling you on SteelConnect`,
            },
            data: {
                type: 'incoming_call',
                callId: callData.callId,
                callerId: callData.callerId,
                callerName: callData.callerName,
                conversationId: callData.conversationId || '',
                callType: callData.callType || 'voice',
            },
            webpush: {
                notification: {
                    title: 'Incoming Call',
                    body: `${callData.callerName} is calling you`,
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: `call-${callData.callId}`,
                    requireInteraction: true,
                    actions: [
                        { action: 'answer', title: 'Answer' },
                        { action: 'decline', title: 'Decline' }
                    ],
                    vibrate: [300, 100, 300, 100, 300],
                },
                fcmOptions: {
                    link: '/?callId=' + callData.callId,
                }
            },
        };

        let sentCount = 0;
        const invalidTokens = [];

        for (const token of tokens) {
            try {
                await admin.messaging().send({ ...message, token });
                sentCount++;
            } catch (err) {
                if (err.code === 'messaging/invalid-registration-token' ||
                    err.code === 'messaging/registration-token-not-registered') {
                    invalidTokens.push(token);
                }
                console.warn(`[FCM] Failed to send to token: ${err.message}`);
            }
        }

        // Clean up invalid tokens
        for (const invalidToken of invalidTokens) {
            const tokenDoc = tokensSnapshot.docs.find(d => d.data().token === invalidToken);
            if (tokenDoc) {
                await tokenDoc.ref.delete();
                console.log(`[FCM] Removed invalid token for user ${calleeId}`);
            }
        }

        console.log(`[FCM] Sent call notification to ${sentCount}/${tokens.length} devices`);
        return sentCount > 0;
    } catch (err) {
        console.error('[FCM] Error sending push notification:', err.message);
        return false;
    }
}

// FCM token registration endpoint
app.post('/api/users/fcm-token', async (req, res) => {
    try {
        const { userId, token } = req.body;
        if (!userId || !token) {
            return res.status(400).json({ success: false, message: 'userId and token are required' });
        }

        // Upsert token for this user + device
        const existingToken = await adminDb.collection('user_fcm_tokens')
            .where('userId', '==', userId)
            .where('token', '==', token)
            .get();

        if (existingToken.empty) {
            await adminDb.collection('user_fcm_tokens').add({
                userId,
                token,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            console.log(`[FCM] Registered new token for user ${userId}`);
        } else {
            // Update timestamp
            await existingToken.docs[0].ref.update({ updatedAt: new Date().toISOString() });
        }

        res.json({ success: true, message: 'FCM token registered' });
    } catch (error) {
        console.error('[FCM] Token registration error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to register token' });
    }
});

// FCM token removal endpoint
app.delete('/api/users/fcm-token', async (req, res) => {
    try {
        const { userId, token } = req.body;
        if (!userId || !token) {
            return res.status(400).json({ success: false, message: 'userId and token are required' });
        }

        const snapshot = await adminDb.collection('user_fcm_tokens')
            .where('userId', '==', userId)
            .where('token', '==', token)
            .get();

        for (const doc of snapshot.docs) {
            await doc.ref.delete();
        }

        res.json({ success: true, message: 'FCM token removed' });
    } catch (error) {
        console.error('[FCM] Token removal error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to remove token' });
    }
});

// Active calls count endpoint for admin monitoring
app.get('/api/voice-calls/active-count', (req, res) => {
    const statusList = [];
    for (const [userId, status] of userStatuses.entries()) {
        statusList.push({ userId, status });
    }
    res.json({
        success: true,
        activeCalls: activeCalls.size,
        onlineUsers: onlineUsers.size,
        userStatuses: statusList
    });
});

// TURN credentials endpoint for global call connectivity
// Returns ICE server configuration with globally distributed STUN/TURN servers
// Supports cross-region calls: India <-> UK, US <-> Asia, Europe <-> Middle East, etc.
//
// Configuration priority:
// 1. METERED_API_KEY env var -> fetches fresh credentials from Metered.ca API
// 2. TURN_USERNAME + TURN_CREDENTIAL env vars -> uses custom TURN server
// 3. Built-in defaults
app.get('/api/voice-calls/turn-credentials', async (req, res) => {
    try {
        // Option 1: Use Metered.ca API for dynamic TURN credentials (most reliable)
        if (process.env.METERED_API_KEY) {
            try {
                const meteredResponse = await fetch(
                    `https://steelconnect.metered.live/api/v1/turn/credentials?apiKey=${process.env.METERED_API_KEY}`
                );
                if (meteredResponse.ok) {
                    const meteredServers = await meteredResponse.json();
                    console.log('[TURN] Fetched fresh credentials from Metered.ca API');
                    return res.json({
                        success: true,
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            ...meteredServers
                        ],
                        ttl: 86400,
                        source: 'metered-api'
                    });
                }
            } catch (meteredErr) {
                console.warn('[TURN] Metered API fetch failed, using fallback:', meteredErr.message);
            }
        }

        // Option 2: Use environment-configured TURN credentials
        const turnUsername = process.env.TURN_USERNAME || 'e8dd65b92f4f1be4b7de7118';
        const turnCredential = process.env.TURN_CREDENTIAL || '4F0VEYoAbOCLpmhH';
        const turnServer = process.env.TURN_SERVER || 'global.relay.metered.ca';

        const iceServers = [
            // Globally distributed STUN servers for NAT discovery
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // TURN relay servers - all transport variations for maximum compatibility
            // UDP on port 80 - standard path, works on most networks
            {
                urls: `turn:${turnServer}:80`,
                username: turnUsername,
                credential: turnCredential
            },
            // TCP on port 80 - for networks that block UDP
            {
                urls: `turn:${turnServer}:80?transport=tcp`,
                username: turnUsername,
                credential: turnCredential
            },
            // UDP on port 443 - passes through HTTPS-only firewalls
            {
                urls: `turn:${turnServer}:443`,
                username: turnUsername,
                credential: turnCredential
            },
            // TURNS (TURN over TLS) on port 443/TCP - maximum firewall compatibility
            // Essential for India (Jio, Airtel, BSNL), Middle East, China
            {
                urls: `turns:${turnServer}:443?transport=tcp`,
                username: turnUsername,
                credential: turnCredential
            }
        ];

        res.json({
            success: true,
            iceServers,
            ttl: 86400,
            source: process.env.TURN_USERNAME ? 'custom' : 'default'
        });
    } catch (error) {
        console.error('[TURN] Error generating credentials:', error.message);
        // Return minimal STUN-only config as last resort
        res.json({
            success: true,
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            ttl: 86400,
            source: 'stun-only-fallback'
        });
    }
});

// REST endpoint for declining calls from push notification (when user has no socket)
app.post('/api/voice-calls/decline', (req, res) => {
    const { callId, reason } = req.body;
    if (!callId) return res.status(400).json({ error: 'callId required' });

    const call = activeCalls.get(callId);
    if (!call) return res.json({ success: true, message: 'Call already ended' });

    console.log(`[VOICE-CALL] Call declined via push notification: ${callId} | reason: ${reason || 'declined'}`);

    // Notify caller on all their devices
    emitToUser(call.callerId, 'call-rejected', {
        callId, calleeId: call.calleeId, reason: reason || 'declined'
    });
    // Fallback to stored caller socket
    if (call.callerSocketId) {
        io.to(call.callerSocketId).emit('call-rejected', {
            callId, calleeId: call.calleeId, reason: reason || 'declined'
        });
    }

    // Dismiss on all callee devices
    emitToUser(call.calleeId, 'call-dismissed', { callId, reason: 'declined' });

    // Clean up
    pendingCalls.delete(call.calleeId);
    activeCalls.delete(callId);

    // Log the declined call
    adminDb.collection('call_logs').add({
        callId, callerId: call.callerId, callerName: call.callerName,
        calleeId: call.calleeId, conversationId: call.conversationId,
        callType: call.callType, status: 'rejected', reason: reason || 'declined',
        startedAt: call.startedAt, endedAt: new Date().toISOString(), duration: 0
    }).catch(err => console.error('[VOICE-CALL] Failed to log push-declined call:', err.message));

    res.json({ success: true });
});

io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // User registers their identity after connecting
    socket.on('register', (userId) => {
        if (!userId) return;
        addUserSocket(userId, socket.id);
        const previousStatus = userStatuses.get(userId);
        if (!previousStatus || previousStatus === 'offline') {
            userStatuses.set(userId, 'online');
        }
        socket.userId = userId;
        console.log(`[SOCKET] User registered: ${userId} -> ${socket.id} | status: ${userStatuses.get(userId)}`);
        io.emit('user-online', { userId, status: userStatuses.get(userId) });

        // Deliver any pending calls for this user (they may have received a push notification)
        const pending = pendingCalls.get(userId);
        if (pending) {
            const call = activeCalls.get(pending.callId);
            if (call && call.status === 'ringing') {
                console.log(`[VOICE-CALL] Delivering pending call ${pending.callId} to user ${userId} who just came online`);
                socket.emit('incoming-call', {
                    callId: pending.callId,
                    callerId: pending.callerId,
                    callerName: pending.callerName,
                    conversationId: pending.conversationId,
                    callType: pending.callType || 'voice'
                });
            }
            pendingCalls.delete(userId);
        }
    });

    // Register FCM token via socket (for push notifications when offline)
    socket.on('register-fcm-token', async (data) => {
        const { userId, token } = data;
        if (!userId || !token) return;
        try {
            const existing = await adminDb.collection('user_fcm_tokens')
                .where('userId', '==', userId)
                .where('token', '==', token)
                .get();
            if (existing.empty) {
                await adminDb.collection('user_fcm_tokens').add({
                    userId, token,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                console.log(`[FCM] Token registered via socket for user ${userId}`);
            }
        } catch (err) {
            console.error('[FCM] Socket token registration error:', err.message);
        }
    });

    // User sets their presence status
    socket.on('set-status', (data) => {
        const { status } = data;
        if (!socket.userId) return;
        const validStatuses = ['online', 'away', 'busy', 'offline'];
        if (!validStatuses.includes(status)) return;
        userStatuses.set(socket.userId, status);
        console.log(`[SOCKET] User ${socket.userId} set status: ${status}`);
        io.emit('user-status-changed', { userId: socket.userId, status });
    });

    // Voice call: Initiate a call
    socket.on('call-initiate', async (data) => {
        const { callerId, callerName, calleeId, conversationId, callType } = data;
        const calleeSockets = getUserSockets(calleeId);
        const calleeStatus = userStatuses.get(calleeId) || 'offline';
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Ensure caller is registered in onlineUsers (safety net for race conditions)
        if (callerId) {
            addUserSocket(callerId, socket.id);
            socket.userId = callerId;
        }

        // Log all registered users for debugging call delivery issues
        const registeredUserIds = Array.from(onlineUsers.keys());
        console.log(`[VOICE-CALL] ${callerName} (${callerId}) calling ${calleeId} | callId: ${callId} | calleeStatus: ${calleeStatus} | calleeSockets: ${calleeSockets.size} | callerSocketId: ${socket.id} | onlineUsers: [${registeredUserIds.join(', ')}]`);

        // Block calls to busy users
        if (calleeStatus === 'busy') {
            socket.emit('call-rejected', { callId, calleeId, reason: 'busy', status: 'busy' });
            try {
                await adminDb.collection('call_logs').add({
                    callId, callerId, callerName, calleeId, conversationId,
                    callType: callType || 'voice', status: 'rejected', reason: 'busy',
                    startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), duration: 0
                });
            } catch (err) {
                console.error('[VOICE-CALL] Failed to log busy rejection:', err.message);
            }
            return;
        }

        // Store active call with caller's socket ID for reliable event delivery
        activeCalls.set(callId, {
            callerId, callerName, calleeId, conversationId,
            callerSocketId: socket.id,
            calleeSocketId: null, // set when callee accepts on a specific device
            callType: callType || 'voice',
            startedAt: new Date().toISOString(),
            status: 'ringing'
        });

        const callPayload = {
            callId, callerId, callerName, conversationId,
            callType: callType || 'voice'
        };

        // Deliver incoming call to ALL connected devices (laptop, phone, etc.)
        const deliveredCount = emitToUser(calleeId, 'incoming-call', callPayload);

        // Store as pending so new devices connecting can also get the call
        pendingCalls.set(calleeId, {
            callId, callerId, callerName, conversationId,
            callType: callType || 'voice',
            startedAt: new Date().toISOString()
        });

        // Emit call-ringing IMMEDIATELY so caller gets the callId right away
        // (before the potentially slow push notification)
        socket.emit('call-ringing', { callId, calleeId });
        if (deliveredCount > 0) {
            console.log(`[VOICE-CALL] Call delivered to ${deliveredCount} device(s) for ${calleeId}`);
        } else {
            console.log(`[VOICE-CALL] Callee ${calleeId} has no active sockets, will rely on push`);
        }

        // Send push notifications in background — catches devices without an active tab
        // (e.g., phone screen off, browser closed, user in another app)
        const pushCallData = { callId, callerId, callerName, conversationId, callType: callType || 'voice' };

        // Web Push (VAPID) — works even when browser is closed, no Firebase needed on client
        const webPushPayload = {
            type: 'incoming_call',
            callId, callerId, callerName,
            conversationId: conversationId || '',
            callType: callType || 'voice',
            timestamp: new Date().toISOString()
        };
        sendWebPushNotification(calleeId, webPushPayload).then(count => {
            console.log(`[VOICE-CALL] Web Push sent to ${count} subscription(s) for ${callId}`);
        }).catch(err => {
            console.error(`[VOICE-CALL] Web Push error for ${callId}:`, err.message);
        });

        // FCM push (fallback for devices with Firebase configured)
        sendCallPushNotification(calleeId, pushCallData).then(pushSent => {
            console.log(`[VOICE-CALL] FCM push for ${callId}: ${pushSent}`);
        }).catch(err => {
            console.error(`[VOICE-CALL] FCM push error for ${callId}:`, err.message);
        });

        // 60-second timeout for all calls (allows time for push notification + login)
        setTimeout(async () => {
            const call = activeCalls.get(callId);
            if (call && call.status === 'ringing') {
                emitToUser(call.callerId, 'call-timeout', { callId });
                emitToUser(call.calleeId, 'call-timeout', { callId });
                activeCalls.delete(callId);
                pendingCalls.delete(calleeId);
                try {
                    await adminDb.collection('call_logs').add({
                        callId, callerId, callerName, calleeId, conversationId,
                        callType: callType || 'voice', status: 'missed', reason: 'no_answer',
                        startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), duration: 0
                    });
                    // Create missed call notification only when the call actually times out
                    await adminDb.collection('notifications').add({
                        userId: calleeId,
                        title: 'Missed Call',
                        message: `${callerName} tried to call you`,
                        type: 'voice_call',
                        metadata: { callId, callerId, callerName, conversationId },
                        isRead: false,
                        seen: false,
                        deleted: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[VOICE-CALL] Failed to log timeout:', err.message);
                }
            }
        }, 60000);
    });

    // Voice call: Accept
    socket.on('call-accept', (data) => {
        const { callId, calleeId } = data;
        const call = activeCalls.get(callId);
        if (!call) {
            console.warn(`[VOICE-CALL] Call accept failed: call ${callId} not found in activeCalls`);
            return;
        }

        // Only the first device to accept wins
        if (call.status === 'connected') {
            console.log(`[VOICE-CALL] Call ${callId} already accepted, ignoring duplicate accept from ${socket.id}`);
            socket.emit('call-dismissed', { callId, reason: 'answered_elsewhere' });
            return;
        }

        call.status = 'connected';
        call.connectedAt = new Date().toISOString();
        // Track which specific socket accepted — WebRTC goes to THIS socket only
        call.calleeSocketId = socket.id;
        pendingCalls.delete(calleeId);

        // Notify caller — use the STORED socket first (the one that made the call),
        // fall back to any online socket
        const callerSocketId = call.callerSocketId || getUserSocket(call.callerId);
        console.log(`[VOICE-CALL] Call accepted: ${callId} | device: ${socket.id} | callerId: ${call.callerId} | callerSocketId: ${callerSocketId || 'NOT FOUND'}`);
        if (callerSocketId) {
            io.to(callerSocketId).emit('call-accepted', { callId, calleeId });
        } else {
            console.error(`[VOICE-CALL] Cannot notify caller ${call.callerId} - socket not found`);
        }

        // Dismiss the call on ALL OTHER devices of the callee
        const calleeSockets = getUserSockets(calleeId);
        for (const sid of calleeSockets) {
            if (sid !== socket.id) {
                io.to(sid).emit('call-dismissed', { callId, reason: 'answered_elsewhere' });
            }
        }
    });

    // Voice call: Reject
    socket.on('call-reject', async (data) => {
        const { callId, calleeId, reason } = data;
        const call = activeCalls.get(callId);
        if (!call) {
            console.warn(`[VOICE-CALL] Call reject failed: call ${callId} not found in activeCalls`);
            return;
        }

        // Notify caller — use STORED socket first (the one that made the call)
        const callerSocketId = call.callerSocketId || getUserSocket(call.callerId);
        console.log(`[VOICE-CALL] Call rejected: ${callId} | reason: ${reason || 'declined'} | callerId: ${call.callerId} | callerSocketId: ${callerSocketId || 'NOT FOUND'}`);

        if (callerSocketId) {
            io.to(callerSocketId).emit('call-rejected', { callId, calleeId, reason: reason || 'declined' });
        } else {
            console.error(`[VOICE-CALL] Cannot notify caller ${call.callerId} of rejection - socket not found`);
        }

        // Dismiss on all other callee devices
        const calleeSockets = getUserSockets(call.calleeId);
        for (const sid of calleeSockets) {
            if (sid !== socket.id) {
                io.to(sid).emit('call-dismissed', { callId, reason: 'declined_elsewhere' });
            }
        }
        pendingCalls.delete(call.calleeId);

        // Log rejected call
        try {
            await adminDb.collection('call_logs').add({
                callId, callerId: call.callerId, callerName: call.callerName,
                calleeId: call.calleeId, conversationId: call.conversationId,
                callType: call.callType, status: 'rejected', reason: reason || 'declined',
                startedAt: call.startedAt, endedAt: new Date().toISOString(), duration: 0
            });
        } catch (err) {
            console.error('[VOICE-CALL] Failed to log rejected call:', err.message);
        }

        activeCalls.delete(callId);
    });

    // Voice call: End
    socket.on('call-end', async (data) => {
        const { callId } = data;
        const call = activeCalls.get(callId);
        if (!call) return;

        const endedAt = new Date().toISOString();
        const duration = call.connectedAt
            ? Math.floor((new Date(endedAt) - new Date(call.connectedAt)) / 1000)
            : 0;

        console.log(`[VOICE-CALL] Call ended: ${callId} | duration: ${duration}s`);

        // Notify the other party on all their devices
        const otherUserId = socket.userId === call.callerId ? call.calleeId : call.callerId;
        emitToUser(otherUserId, 'call-ended', { callId, endedBy: socket.userId });
        // Fallback: also try stored caller socket ID
        if (socket.userId !== call.callerId && call.callerSocketId) {
            io.to(call.callerSocketId).emit('call-ended', { callId, endedBy: socket.userId });
        }

        // Log completed call
        try {
            await adminDb.collection('call_logs').add({
                callId, callerId: call.callerId, callerName: call.callerName,
                calleeId: call.calleeId, conversationId: call.conversationId,
                callType: call.callType, status: duration > 0 ? 'completed' : 'cancelled',
                startedAt: call.startedAt, connectedAt: call.connectedAt || null,
                endedAt, duration
            });
        } catch (err) {
            console.error('[VOICE-CALL] Failed to log call:', err.message);
        }

        activeCalls.delete(callId);
    });

    // WebRTC signaling: Offer (supports ICE restart for cross-region recovery)
    // Routes to the SPECIFIC socket that accepted the call (not all devices)
    socket.on('webrtc-offer', (data) => {
        const { callId, targetUserId, offer, iceRestart } = data;
        const call = activeCalls.get(callId);
        // Use the specific callee/caller socket from the call, fall back to any socket
        const targetSocketId = call
            ? (targetUserId === call.calleeId ? call.calleeSocketId : call.callerSocketId)
            : null;
        const finalTarget = targetSocketId || getUserSocket(targetUserId);
        if (finalTarget) {
            io.to(finalTarget).emit('webrtc-offer', {
                callId, offer, fromUserId: socket.userId,
                iceRestart: iceRestart || false
            });
            if (iceRestart) {
                console.log(`[VOICE-CALL] ICE restart offer forwarded: ${callId}`);
            }
        }
    });

    // WebRTC signaling: Answer
    socket.on('webrtc-answer', (data) => {
        const { callId, targetUserId, answer } = data;
        const call = activeCalls.get(callId);
        const targetSocketId = call
            ? (targetUserId === call.calleeId ? call.calleeSocketId : call.callerSocketId)
            : null;
        const finalTarget = targetSocketId || getUserSocket(targetUserId);
        if (finalTarget) {
            io.to(finalTarget).emit('webrtc-answer', { callId, answer, fromUserId: socket.userId });
        }
    });

    // WebRTC signaling: ICE Candidate
    socket.on('webrtc-ice-candidate', (data) => {
        const { callId, targetUserId, candidate } = data;
        const call = activeCalls.get(callId);
        const targetSocketId = call
            ? (targetUserId === call.calleeId ? call.calleeSocketId : call.callerSocketId)
            : null;
        const finalTarget = targetSocketId || getUserSocket(targetUserId);
        if (finalTarget) {
            io.to(finalTarget).emit('webrtc-ice-candidate', { callId, candidate, fromUserId: socket.userId });
        }
    });

    // Check if user is online and get their status
    socket.on('check-online', (data) => {
        const { userId } = data;
        const isOnline = onlineUsers.has(userId);
        const status = userStatuses.get(userId) || 'offline';
        socket.emit('user-online-status', { userId, isOnline, status });
    });

    // Disconnect
    socket.on('disconnect', async () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
        if (socket.userId) {
            // Remove this specific socket from the user's set
            removeUserSocket(socket.userId, socket.id);
            const remainingSockets = getUserSockets(socket.userId);

            // Only mark user as offline if ALL their devices are disconnected
            if (remainingSockets.size === 0) {
                userStatuses.set(socket.userId, 'offline');
                io.emit('user-offline', { userId: socket.userId });
                io.emit('user-status-changed', { userId: socket.userId, status: 'offline' });
            } else {
                console.log(`[SOCKET] User ${socket.userId} still has ${remainingSockets.size} other device(s) connected`);
            }

            // End active calls ONLY if this was the specific socket in the call
            for (const [callId, call] of activeCalls.entries()) {
                const isCallerSocket = call.callerId === socket.userId && call.callerSocketId === socket.id;
                const isCalleeSocket = call.calleeId === socket.userId && call.calleeSocketId === socket.id;

                // For ringing calls: if callee's socket disconnects but they have other devices, don't end
                if (call.status === 'ringing' && call.calleeId === socket.userId && remainingSockets.size > 0) {
                    continue; // Other devices are still ringing
                }

                if (isCallerSocket || isCalleeSocket ||
                    (call.status === 'ringing' && (call.callerId === socket.userId || call.calleeId === socket.userId) && remainingSockets.size === 0)) {
                    const otherUserId = socket.userId === call.callerId ? call.calleeId : call.callerId;
                    emitToUser(otherUserId, 'call-ended', { callId, endedBy: socket.userId, reason: 'disconnected' });

                    try {
                        const endedAt = new Date().toISOString();
                        const duration = call.connectedAt
                            ? Math.floor((new Date(endedAt) - new Date(call.connectedAt)) / 1000)
                            : 0;
                        await adminDb.collection('call_logs').add({
                            callId, callerId: call.callerId, callerName: call.callerName,
                            calleeId: call.calleeId, conversationId: call.conversationId,
                            callType: call.callType, status: 'disconnected',
                            startedAt: call.startedAt, connectedAt: call.connectedAt || null,
                            endedAt, duration
                        });
                    } catch (err) {
                        console.error('[VOICE-CALL] Failed to log disconnected call:', err.message);
                    }
                    activeCalls.delete(callId);
                }
            }
        }
    });
});

// --- Start Server ---
const server = httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('🎉 SteelConnect Backend v2.1 Started Successfully');
    console.log(`🔗 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    console.log('\n📋 Environment Check:');
    console.log(`   MongoDB: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Web Push VAPID: ${process.env.WEB_PUSH_VAPID_PUBLIC_KEY ? '✅ Persistent keys' : '⚠️ Auto-generated (set WEB_PUSH_VAPID_PUBLIC_KEY & WEB_PUSH_VAPID_PRIVATE_KEY for persistence)'}`);
    console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   CORS Origins: ${process.env.CORS_ORIGIN ? '✅ Configured' : '⚠️ Using defaults'}`);
    console.log(`   Resend API: ${process.env.RESEND_API_KEY ? '✅ Configured' : '⚠️ Missing'}`);
    console.log(`   TURN Server: ${process.env.METERED_API_KEY ? '✅ Metered.ca API configured' : process.env.TURN_USERNAME ? '✅ Custom TURN configured' : '⚠️ Using default TURN credentials'}`);
    
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
    if (voiceCallRoutes) {
        console.log(`   Voice Calls: http://localhost:${PORT}/api/voice-calls/*`);
    }
    console.log(`   Socket.IO: ws://localhost:${PORT} (WebRTC signaling)`);

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
    
    console.log('📞 Voice Call System: ✅ ACTIVE');
    console.log('   • WebRTC signaling via Socket.IO');
    console.log('   • Call history and logging');
    console.log('   • Online presence tracking');

    console.log('🔍 Check logs above for any missing features or configurations');
    console.log('');
});

// Set server timeout for long-running requests
server.timeout = 120000; // 2 minutes

// ─── Real-Time Admin Activity Monitoring ─────────────────────────────────────
// Admin activity notifications are now sent in real-time (email + WhatsApp)
// whenever any admin action happens. No hourly scheduler needed.
// Notifications are sent to:
//   Email: sabincn676@gmail.com
//   WhatsApp: 9895909666
// The real-time alerts are triggered by the adminActivityLogger service
// immediately after logging each activity to Firestore.
console.log('[ADMIN-ACTIVITY-MONITOR] Real-time admin activity monitoring is active');
console.log('[ADMIN-ACTIVITY-MONITOR] Notifications sent to email: sabincn676@gmail.com & WhatsApp: 9895909666');
console.log('[ADMIN-ACTIVITY-MONITOR] Every admin action triggers an immediate email + WhatsApp alert');

export default app;
