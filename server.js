// server.js
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

// --- Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Enhanced CORS Configuration ---
const allowedOrigins = [
  // Admin URLs
  'https://admin-pink-nine.vercel.app',
  'https://admin-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://admin-6j5gozq46-sabins-projects-02d8db3a.vercel.app',
  
  // Frontend URLs
  'https://steelconnect-frontend.vercel.app',
  'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-jlnaa22o7-sabins-projects-02d8db3a.vercel.app',
  
  // Development URLs
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173', // Vite default port
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  
  // Add any additional URLs from environment variable
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(url => url.trim()) : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if the origin is in the allowedOrigins array
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Allowing origin ${origin}`);
      callback(null, true);
    } 
    // Check if it's any Vercel preview URL (for future deployments)
    else if (origin.endsWith('.vercel.app')) {
      console.log(`✅ CORS: Allowing Vercel URL: ${origin}`);
      callback(null, true);
    } 
    // Block unauthorized origins
    else {
      console.error(`❌ CORS Error: The origin "${origin}" was not allowed.`);
      callback(new Error(`CORS Error: Origin "${origin}" not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-auth-token',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Origin',
    'Accept',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

// --- Middleware ---
app.use(cors(corsOptions));

// Security middleware with updated CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.get('Origin') || 'No Origin'}`);
  next();
});

// --- Dynamic Route Loading ---
const loadRoutes = async () => {
  console.log('🔄 Loading all application routes...');
  const routesToLoad = [
    { path: '/api/auth', file: './src/routes/auth.js', name: 'Auth' },
    { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs' },
    { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes' },
    { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages' },
    { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation' },
    { path: '/api/admin', file: './src/routes/admin.js', name: 'Admin' } 
  ];

  for (const route of routesToLoad) {
    try {
      const routeUrl = pathToFileURL(path.join(projectRoot, route.file)).href;
      const { default: routeModule } = await import(routeUrl);
      app.use(route.path, routeModule);
      console.log(`✅ ${route.name} routes loaded successfully.`);
    } catch (error) {
      console.error(`❌ Error loading ${route.name} routes from ${route.file}:`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
  }
};

// --- Health Check Route ---
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// --- API Info Route ---
app.get('/api', (req, res) => {
  res.json({ 
    message: 'SteelConnect Backend API',
    version: '1.0.0',
    endpoints: [
      '/api/auth',
      '/api/jobs',
      '/api/quotes', 
      '/api/messages',
      '/api/estimation',
      '/api/admin'
    ],
    timestamp: new Date().toISOString()
  });
});

// --- Root Route ---
app.get('/', (req, res) => {
  res.json({ 
    message: 'SteelConnect Backend API is running',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// --- 404 Handler ---
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// --- Global Error Handler ---
app.use((error, req, res, next) => {
  console.error('❌ Global Error Handler:');
  console.error(`   URL: ${req.method} ${req.originalUrl}`);
  console.error(`   Error: ${error.message}`);
  console.error(`   Stack: ${error.stack}`);
  
  // Don't send stack trace in production
  const errorResponse = {
    success: false,
    error: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };
  
  res.status(error.status || 500).json(errorResponse);
});

// --- Graceful Shutdown Handler ---
const gracefulShutdown = (signal) => {
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  mongoose.connection.close(() => {
    console.log('✅ MongoDB connection closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Start Server ---
const startServer = async () => {
  try {
    await loadRoutes();
    
    app.listen(PORT, () => {
      console.log('\n🚀 SteelConnect Backend Server Started');
      console.log(`✅ Server is live on port ${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
      console.log('\n📋 Available Routes:');
      console.log('   GET  /          - API status');
      console.log('   GET  /health    - Health check');
      console.log('   GET  /api       - API information');
      console.log('   *    /api/*     - Application routes');
      console.log('\n🌐 Allowed Origins:');
      allowedOrigins.forEach(origin => console.log(`   ${origin}`));
      console.log('   + All *.vercel.app domains');
      console.log('\n' + '='.repeat(60) + '\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();
