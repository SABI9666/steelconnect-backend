// server.js
// SteelConnect Backend Server - Firebase Only

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Import Firebase config
import { admin, adminDb, adminStorage } from './src/config/firebase.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import adminRoutes from './src/routes/admin.js';
import estimationRoutes from './src/routes/estimation.js';

dotenv.config();

// --- 🛡️ Environment Variable Validation ---
const requiredEnvVars = [
  'PORT', 
  'JWT_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_KEY_BASE64',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ FATAL ERROR: Environment variable "${varName}" is not defined.`);
    console.error('Required environment variables:', requiredEnvVars);
    process.exit(1);
  }
}

console.log('✅ All required environment variables are set');

const app = express();
const PORT = process.env.PORT || 10000;

// --- 🔥 Test Firebase Connection ---
try {
  const projectId = admin.app().options.projectId;
  console.log(`✅ Firebase connected to project: ${projectId}`);
} catch (error) {
  console.error('❌ Firebase connection error:', error.message);
  process.exit(1);
}

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
};

// --- ⚙️ Middleware ---
app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy for Render
app.set('trust proxy', 1);

// --- 📝 Request Logging ---
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const authHeader = req.headers.authorization ? 'Bearer ***' : 'No Auth';
  console.log(`${timestamp} - ${req.method} ${req.url} - Auth: ${authHeader} - Origin: ${req.headers.origin || 'None'}`);
  next();
});

// --- ✅ Health Check ---
app.get('/health', async (req, res) => {
  try {
    // Test Firebase connection
    const projectId = admin.app().options.projectId;
    
    // Test Firestore
    await adminDb.collection('_health').doc('test').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'healthy'
    });
    
    res.json({
      success: true,
      message: 'SteelConnect Backend is healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      firebase: {
        connected: true,
        projectId: projectId,
        firestore: 'connected',
        storage: 'connected'
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    });
  }
});

// --- 🏠 Root Endpoint ---
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'SteelConnect Backend API', 
    version: '1.0.0',
    firebase: 'connected',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /health - Health check',
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

// --- 🚨 Error Handling ---
app.use((error, req, res, next) => {
  console.error('❌ Global Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  const status = error.status || 500;
  const message = error.message || 'An internal server error occurred.';
  
  res.status(status).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// --- ❓ 404 Handler ---
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      'GET /health',
      'GET /api/auth/test',
      'POST /api/auth/login/admin',
      'GET /api/admin/*'
    ],
    timestamp: new Date().toISOString()
  });
});

// --- 🚀 Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 SteelConnect Backend Server Started!');
  console.log('='.repeat(40));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`📍 Auth: http://localhost:${PORT}/api/auth/test`);
  console.log('='.repeat(40));
  console.log(`🔥 Firebase: ✅ Connected`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(40));
});

// --- 💥 Process Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('✅ SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
