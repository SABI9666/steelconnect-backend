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
  'https://admin-ixovjylrn-sabins-projects-02d8db3a.vercel.app', // New URL added

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
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Allowing origin ${origin}`);
      callback(null, true);
    } else if (origin.endsWith('.vercel.app')) {
      console.log(`✅ CORS: Allowing Vercel URL: ${origin}`);
      callback(null, true);
    } else {
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
    { path: '/api/users', file: './src/routes/users.js', name: 'Users' },
    { path: '/api/admin', file: './src/routes/admin.js', name: 'Admin' },
    { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs' },
    { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes' },
    { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages' },
    { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation' }
  ];

  for (const route of routesToLoad) {
    try {
      const routeUrl = pathToFileURL(path.join(projectRoot, route.file)).href;
      const { default: routeModule } = await import(routeUrl);
      app.use(route.path, routeModule);
      console.log(`✅ ${route.name} routes loaded successfully.`);
    } catch (error) {
      console.error(`❌ Error loading ${route.name} routes from ${route.file}:`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
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
      '/api/auth - Authentication (register, login, profile, etc.)',
      '/api/users - General user management',
      '/api/admin - Admin-specific operations',
      '/api/jobs - Job management',
      '/api/quotes - Quote management',
      '/api/messages - Messaging system',
      '/api/estimation - Cost estimation'
    ],
    authEndpoints: [
      'POST /api/auth/register - User registration',
      'POST /api/auth/login - Regular user login',
      'POST /api/auth/login/admin - Admin login',
      'GET /api/auth/profile - Get user profile',
      'PUT /api/auth/profile - Update profile',
      'PUT /api/auth/change-password - Change password',
      'POST /api/auth/logout - Logout',
      'GET /api/auth/verify - Verify token',
      'GET /api/auth/test - Test auth routes'
    ],
    timestamp: new Date().toISOString()
  });
});

// --- Root Route ---
app.get('/', (req, res) => {
  res.json({
    message: 'SteelConnect Backend API is running',
    status: 'active',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Start the server
loadRoutes().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
});
