// server.js
// SteelConnect Backend Server - Firebase Only (No MongoDB)

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Import Firebase config
import { firebaseStatus, isFirebaseEnabled } from './src/config/firebase.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import estimationRoutes from './src/routes/estimation.js';

dotenv.config();

// --- 🛡️ ENHANCED Environment Variable Validation ---
const requiredEnvVars = [
  'PORT', 
  'JWT_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_KEY_BASE64', // Firebase requirement
];

// Optional but recommended env vars
const optionalEnvVars = [
  'NODE_ENV',
  'CORS_ORIGIN',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ FATAL ERROR: Environment variable "${varName}" is not defined.`);
    console.error('Required environment variables:', requiredEnvVars);
    process.exit(1);
  }
}

console.log('✅ All required environment variables are set');

// Check optional vars
optionalEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.log(`⚠️ Optional environment variable "${varName}" is not set`);
  }
});

const app = express();
const PORT = process.env.PORT || 10000;

// --- 🔥 Firebase Status Check ---
if (!isFirebaseEnabled()) {
  console.error('❌ Firebase is not properly initialized!');
  console.log('Firebase Status:', firebaseStatus);
  process.exit(1);
}

console.log('✅ Firebase Status:', firebaseStatus);

// --- 🌐 CORS Configuration ---
const allowedOrigins = [
  'https://steelconnect-frontend.vercel.app',
  'https://admin-pink-nine.vercel.app',
  /^https:\/\/admin-.*-sabins-projects-02d8db3a\.vercel\.app$/,
  /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }

    // Check against allowed origins
    if (allowedOrigins.some(pattern => (pattern instanceof RegExp ? pattern.test(origin) : pattern === origin))) {
      callback(null, true);
    } else {
      console.error(`❌ CORS Error: Origin "${origin}" not allowed.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-JSON'],
  maxAge: 86400, // 24 hours
};

// --- ⚙️ Enhanced Middleware ---
app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" }
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy (important for Render deployment)
app.set('trust proxy', 1);

// --- 📝 Enhanced Request Logging ---
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const authHeader = req.headers.authorization ? 'Bearer ***' : 'No Auth';
  const userAgent = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 50) + '...' : 'Unknown';
  console.log(`${timestamp} - ${req.method} ${req.url} - Auth: ${authHeader} - Origin: ${req.headers.origin || 'None'} - UA: ${userAgent}`);
  next();
});

// --- ✅ ENHANCED Health Check ---
app.get('/health', (req, res) => {
  const healthCheck = {
    success: true,
    message: 'SteelConnect Backend is healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    platform: process.platform,
    nodeVersion: process.version,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    firebase: {
      initialized: firebaseStatus.initialized,
      hasFirestore: firebaseStatus.hasFirestore,
      hasStorage: firebaseStatus.hasStorage,
      projectId: firebaseStatus.projectId
    },
    // Don't expose sensitive info in production
    ...(process.env.NODE_ENV !== 'production' && {
      env: {
        jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not Set',
        firebaseKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 ? 'Set' : 'Not Set',
      }
    })
  };
  res.json(healthCheck);
});

// --- ✅ Firebase Status Endpoint ---
app.get('/firebase/status', (req, res) => {
  res.json({
    success: true,
    firebase: firebaseStatus,
    timestamp: new Date().toISOString()
  });
});

// --- ✅ API Status Endpoint ---
app.get('/api/status', (req, res) => {
  res.json({ 
    success: true, 
    message: 'SteelConnect API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      jobs: '/api/jobs',
      quotes: '/api/quotes',
      messages: '/api/messages',
      estimation: '/api/estimation'
    }
  });
});

// --- 🏠 Root Endpoint ---
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'SteelConnect Backend API', 
    version: '1.0.0',
    firebase: firebaseStatus.initialized,
    documentation: 'https://github.com/SABI9666/steelconnect-backend',
    endpoints: [
      'GET /health - Health check',
      'GET /firebase/status - Firebase status',
      'GET /api/status - API status',
      'GET /api/auth/test - Auth test',
      'POST /api/auth/login/admin - Admin login',
      'GET /api/admin/* - Admin routes',
      'GET /api/jobs/* - Jobs routes',
      'GET /api/quotes/* - Quotes routes',
      'GET /api/messages/* - Messages routes',
      'GET /api/estimation/* - Estimation routes'
    ]
  });
});

// --- 🏠 API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- 🚨 Enhanced Error Handling ---
app.use((error, req, res, next) => {
  const timestamp = new Date().toISOString();
  const errorId = Math.random().toString(36).substring(2, 15);
  
  console.error(`❌ Global Error [${errorId}] at ${timestamp}:`, {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    params: req.params,
    query: req.query
  });
  
  const status = error.status || error.statusCode || 500;
  const message = error.message || 'An internal server error occurred.';
  
  // Different error responses for different environments
  const response = {
    success: false,
    error: message,
    errorId: errorId,
    timestamp: timestamp,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      details: {
        url: req.url,
        method: req.method,
        headers: req.headers
      }
    })
  };
  
  res.status(status).json(response);
});

// --- ❓ 404 Not Found Handler ---
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    message: 'The requested endpoint does not exist',
    availableRoutes: [
      'GET /health',
      'GET /firebase/status', 
      'GET /api/status',
      'GET /api/auth/test',
      'POST /api/auth/login/admin',
      'GET /api/admin/*',
      'GET /api/jobs/*',
      'GET /api/quotes/*',
      'GET /api/messages/*',
      'GET /api/estimation/*'
    ],
    timestamp: new Date().toISOString()
  });
});

// --- 🚀 Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 SteelConnect Backend Server Started Successfully!');
  console.log('='.repeat(50));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📍 Firebase: http://localhost:${PORT}/firebase/status`);
  console.log(`📍 API Status: http://localhost:${PORT}/api/status`);
  console.log(`📍 Auth Test: http://localhost:${PORT}/api/auth/test`);
  console.log('='.repeat(50));
  console.log(`🔥 Firebase: ${firebaseStatus.initialized ? '✅ Connected' : '❌ Not Connected'}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕒 Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(50));
});

// --- 💥 Enhanced Process Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Stack:', reason?.stack);
  
  // Don't exit immediately in production, log and continue
  if (process.env.NODE_ENV === 'production') {
    console.log('🔄 Continuing in production mode...');
  } else {
    console.log('🛑 Shutting down due to unhandled rejection...');
    gracefulShutdown();
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  gracefulShutdown();
});

// Graceful shutdown function
const gracefulShutdown = () => {
  console.log('✅ SIGTERM received. Shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Since we're using Firebase instead of MongoDB, no database connection to close
    console.log('✅ All connections closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Export for testing
export default app;
