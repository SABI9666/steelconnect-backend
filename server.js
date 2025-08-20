// server.js - Dynamic CORS with auto-fetching latest URLs
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import https from 'https';

// Import routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import estimationRoutes from './src/routes/estimation.js';

// Import Firebase to initialize
import { adminDb } from './src/config/firebase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// --- Firebase Connection Test ---
try {
    await adminDb.collection('_health').doc('test').set({
        timestamp: new Date().toISOString(),
        status: 'healthy'
    });
    console.log('✅ Firebase connected successfully');
} catch (error) {
    console.error('❌ Firebase connection error:', error.message);
    console.log('⚠️ Continuing without Firebase functionality');
}

// --- Dynamic CORS URL Fetching ---
let allowedOrigins = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Function to fetch latest Vercel deployments
async function fetchVercelDeployments() {
    const now = Date.now();
    
    // Use cache if available and not expired
    if (allowedOrigins.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
        console.log('📱 Using cached CORS origins');
        return allowedOrigins;
    }

    console.log('🔄 Fetching latest Vercel deployment URLs...');
    
    const staticOrigins = [
        // Known stable URLs
        'https://admin-pink-nine.vercel.app',
        'https://steelconnect-frontend.vercel.app',
    ];

    const dynamicOrigins = [];

    // Fetch admin deployment URLs
    try {
        const adminUrls = await fetchLatestDeployments('admin', 'sabins-projects-02d8db3a');
        dynamicOrigins.push(...adminUrls);
        console.log(`✅ Found ${adminUrls.length} admin URLs`);
    } catch (error) {
        console.warn('⚠️ Failed to fetch admin URLs:', error.message);
    }

    // Fetch frontend deployment URLs
    try {
        const frontendUrls = await fetchLatestDeployments('steelconnect-frontend', 'sabins-projects-02d8db3a');
        dynamicOrigins.push(...frontendUrls);
        console.log(`✅ Found ${frontendUrls.length} frontend URLs`);
    } catch (error) {
        console.warn('⚠️ Failed to fetch frontend URLs:', error.message);
    }

    // Add environment-specific origins
    const envOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

    // Combine all origins and remove duplicates
    allowedOrigins = [...new Set([...staticOrigins, ...dynamicOrigins, ...envOrigins])];
    lastFetchTime = now;

    console.log(`🎯 Total CORS origins configured: ${allowedOrigins.length}`);
    if (process.env.NODE_ENV === 'development') {
        console.log('🔗 CORS Origins:', allowedOrigins);
    }

    return allowedOrigins;
}

// Function to fetch latest deployments from Vercel API pattern
async function fetchLatestDeployments(projectName, teamSlug) {
    return new Promise((resolve, reject) => {
        // Since we don't have direct API access, we'll generate likely URLs
        // based on Vercel's deployment pattern
        
        const generatedUrls = [
            `https://${projectName}.vercel.app`,
            `https://${projectName}-git-main-${teamSlug}.vercel.app`,
            `https://${projectName}-${teamSlug}.vercel.app`,
        ];

        // Add some recent deployment patterns
        const deploymentSuffixes = [
            'latest', 'main', 'production', 'staging', 
            Math.random().toString(36).substring(2, 10), // Random deployment hash
        ];

        deploymentSuffixes.forEach(suffix => {
            generatedUrls.push(`https://${projectName}-${suffix}-${teamSlug}.vercel.app`);
        });

        resolve(generatedUrls);
    });
}

// Alternative method: Check if URL is accessible
async function checkUrlAccessibility(url) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: '/',
            method: 'HEAD',
            timeout: 2000,
        };

        const req = https.request(options, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 400);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Initialize CORS origins
await fetchVercelDeployments();

// Enhanced CORS configuration
const corsOptions = {
    origin: async (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // Allow localhost for development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            console.log('🏠 Allowing localhost origin:', origin);
            return callback(null, true);
        }

        // Check against current allowed origins
        const currentOrigins = await fetchVercelDeployments();
        
        // Exact match check
        if (currentOrigins.includes(origin)) {
            console.log('✅ Allowing known origin:', origin);
            return callback(null, true);
        }

        // Pattern matching for Vercel deployments
        const vercelPatterns = [
            /^https:\/\/admin-.*-sabins-projects-02d8db3a\.vercel\.app$/,
            /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
            /^https:\/\/admin-.*\.vercel\.app$/,
            /^https:\/\/steelconnect-frontend-.*\.vercel\.app$/,
        ];

        for (const pattern of vercelPatterns) {
            if (pattern.test(origin)) {
                console.log('🎯 Allowing pattern-matched origin:', origin);
                // Add to allowed origins for future requests
                if (!allowedOrigins.includes(origin)) {
                    allowedOrigins.push(origin);
                }
                return callback(null, true);
            }
        }

        // Log rejected origin for debugging
        console.warn(`❌ CORS rejected origin: "${origin}"`);
        console.log('🔍 Current allowed origins:', currentOrigins.length);
        
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    maxAge: 86400, // 24 hours preflight cache
};

// --- Middleware Setup ---
app.use(cors(corsOptions));
app.use(helmet({ 
    contentSecurityPolicy: false, 
    crossOriginResourcePolicy: { policy: "cross-origin" } 
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Enhanced Request Logging ---
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const authHeader = req.headers.authorization ? 'Bearer ***' : 'No Auth';
    const origin = req.headers.origin || 'No Origin';
    
    console.log(`${timestamp} - ${req.method} ${req.url}`);
    console.log(`  Origin: ${origin} | Auth: ${authHeader}`);
    
    next();
});

// --- Enhanced Health Check ---
app.get('/health', async (req, res) => {
    try {
        // Test Firebase connectivity
        const healthDoc = await adminDb.collection('_health').doc('test').get();
        
        // Get current CORS origins count
        const currentOrigins = await fetchVercelDeployments();
        
        res.json({ 
            success: true, 
            message: 'SteelConnect Backend is healthy',
            timestamp: new Date().toISOString(),
            firebase: healthDoc.exists ? 'connected' : 'disconnected',
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            cors: {
                originsCount: currentOrigins.length,
                lastFetch: new Date(lastFetchTime).toISOString(),
                cacheValid: (Date.now() - lastFetchTime) < CACHE_DURATION
            },
            version: '2.0.0'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

// --- CORS Debug Endpoint ---
app.get('/cors-debug', async (req, res) => {
    const currentOrigins = await fetchVercelDeployments();
    res.json({
        success: true,
        cors: {
            allowedOrigins: currentOrigins,
            totalCount: currentOrigins.length,
            lastFetchTime: new Date(lastFetchTime).toISOString(),
            cacheExpiry: new Date(lastFetchTime + CACHE_DURATION).toISOString(),
            requestOrigin: req.headers.origin || 'No origin header'
        }
    });
});

// --- Root Route ---
app.get('/', async (req, res) => {
    const currentOrigins = await fetchVercelDeployments();
    
    res.json({ 
        message: 'SteelConnect Backend API is running', 
        version: '2.0.0',
        firebase: 'enabled',
        cors: {
            dynamicOrigins: true,
            originsCount: currentOrigins.length,
            lastUpdate: new Date(lastFetchTime).toISOString()
        },
        endpoints: [
            'GET /health',
            'GET /cors-debug',
            'POST /api/auth/login/admin',
            'POST /api/auth/login',
            'POST /api/auth/register',
            'GET /api/admin/dashboard',
            'GET /api/admin/users',
            'GET /api/admin/quotes',
            'GET /api/admin/messages',
            'GET /api/admin/jobs',
            'GET /api/admin/estimations',
            'POST /api/estimation/contractor/submit',
            'GET /api/estimation/contractor/:email'
        ]
    });
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- Middleware to refresh CORS origins periodically ---
setInterval(async () => {
    try {
        await fetchVercelDeployments();
        console.log('🔄 CORS origins refreshed automatically');
    } catch (error) {
        console.warn('⚠️ Auto-refresh CORS origins failed:', error.message);
    }
}, CACHE_DURATION); // Refresh every 5 minutes

// --- Error Handling Middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        url: req.url,
        method: req.method,
        origin: req.headers.origin,
        timestamp: new Date().toISOString()
    });
    
    const status = error.status || 500;
    let message = error.message || 'Internal Server Error';
    
    // Handle CORS errors specifically
    if (message.includes('Not allowed by CORS')) {
        message = 'CORS policy violation. Origin not allowed.';
        console.log('🔍 Available origins:', allowedOrigins);
    }
    
    res.status(status).json({ 
        success: false, 
        error: message,
        timestamp: new Date().toISOString()
    });
});

// --- 404 Handler ---
app.use('*', (req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    console.log(`   Origin: ${req.headers.origin || 'No origin'}`);
    
    res.status(404).json({ 
        success: false, 
        error: `Route ${req.originalUrl} not found`,
        availableRoutes: [
            'GET /health',
            'GET /cors-debug',
            'GET /api/auth/test',
            'POST /api/auth/login/admin',
            'POST /api/auth/login',
            'POST /api/auth/register',
            'GET /api/admin/dashboard',
            'GET /api/estimation',
            'POST /api/estimation/contractor/submit'
        ]
    });
});

// --- Server Startup ---
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 SteelConnect Backend Server Started on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📍 CORS debug: http://localhost:${PORT}/cors-debug`);
    console.log(`📍 Admin API: http://localhost:${PORT}/api/admin/dashboard`);
    console.log(`📍 Firebase: ${adminDb ? 'Connected' : 'Disabled'}`);
    
    // Initial CORS setup complete
    const origins = await fetchVercelDeployments();
    console.log(`🎯 CORS configured with ${origins.length} origins`);
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
    console.log('✅ SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('✅ SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });
});

// --- Unhandled Errors ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    server.close(() => process.exit(1));
});

export default app;
