// ISSUES FOUND IN YOUR SERVER:

// ❌ PROBLEM 1: Missing JWT_SECRET in environment validation
// ❌ PROBLEM 2: Admin routes might not have proper authentication middleware
// ❌ PROBLEM 3: No health check for auth endpoints

// ✅ FIXED SERVER CODE:

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

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
  'MONGODB_URI', 
  'PORT', 
  'JWT_SECRET',  // ✅ ADDED: This is crucial for JWT authentication
  // Add other required vars as needed
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

// --- 🔗 Enhanced Database Connection ---
mongoose.connect(process.env.MONGODB_URI, {
  // Add these options for better connection handling
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log('Database Name:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// --- 🌐 CORS Configuration (Your existing config is good) ---
const allowedOrigins = [
  'https://steelconnect-frontend.vercel.app',
  'https://admin-pink-nine.vercel.app',
  /^https:\/\/admin-.*-sabins-projects-02d8db3a\.vercel\.app$/,
  /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }

    if (allowedOrigins.some(pattern => (pattern instanceof RegExp ? pattern.test(origin) : pattern === origin))) {
      callback(null, true);
    } else {
      console.error(`❌ CORS Error: Origin "${origin}" not allowed.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // ✅ ADDED: More specific CORS headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

// --- ⚙️ Enhanced Middleware ---
app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: { policy: "cross-origin" } 
}));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 📝 Enhanced Request Logging ---
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const authHeader = req.headers.authorization ? 'Bearer ***' : 'No Auth';
  console.log(`${timestamp} - ${req.method} ${req.url} - Auth: ${authHeader} - Origin: ${req.headers.origin || 'None'}`);
  next();
});

// --- ✅ ENHANCED Health Check ---
app.get('/health', (req, res) => {
  const healthCheck = {
    success: true,
    message: 'Backend is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    // Don't expose sensitive info in production
    ...(process.env.NODE_ENV !== 'production' && {
      mongoUri: process.env.MONGODB_URI ? 'Set' : 'Not Set',
      jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not Set',
    })
  };
  res.json(healthCheck);
});

// --- ✅ AUTH TEST ENDPOINT ---
app.get('/api/auth/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth route is accessible',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'SteelConnect Backend API', 
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api/auth',
      '/api/admin',
      '/api/jobs',
      '/api/quotes',
      '/api/messages',
      '/api/estimation'
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
  console.error('❌ Global Error Handler:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  const status = error.status || 500;
  const message = error.message || 'An internal server error occurred.';
  
  // Don't expose stack traces in production
  const response = {
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  };
  
  res.status(status).json(response);
});

// --- ❓ 404 Not Found Handler ---
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: `Route not found: ${req.originalUrl}`,
    availableRoutes: [
      'GET /health',
      'GET /api/auth/test',
      'POST /api/auth/login/admin',
      'GET /api/admin/dashboard',
    ]
  });
});

// --- 🚀 Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SteelConnect Backend Server listening on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Auth test: http://localhost:${PORT}/api/auth/test`);
});

// --- 💥 Enhanced Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('✅ SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ Server and database connections closed.');
      process.exit(0);
    });
  });
});

export default app;
