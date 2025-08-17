// server.js

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Import the Firebase configuration to run the initialization
import './src/config/firebase.js';

// Import necessary modules
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';

// Import route modules
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';
import adminRoutes from './src/routes/admin.js';
import authRoutes from './src/routes/auth.js';

// Create Express application
const app = express();
const PORT = process.env.PORT || 10000;

// --- Middleware Configuration ---

// Security middleware
app.use(helmet());

// List of allowed origins for CORS
const allowedOrigins = [
  // Admin Frontend Domains
  'https://admin-pink-nine.vercel.app',
  'https://admin-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://admin-q4y7l6gxz-sabins-projects-02d8db3a.vercel.app',
  
  // User Frontend Domains
  'https://steelconnect-frontend.vercel.app',
  'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-jlnaa22o7-sabins-projects-02d8db3a.vercel.app',

  // Local development origins
  'http://localhost:3000',
  'http://localhost:3001',
];

// Configure CORS to allow only specific origins
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Check and log CORS origin for incoming requests (for debugging)
app.use((req, res, next) => {
  const origin = req.headers.origin || 'undefined';
  console.log(`🌐 CORS check for origin: "${origin}"`);
  if (allowedOrigins.includes(origin) || origin === 'undefined') {
    console.log('✅ Allowing request with no origin or allowed origin');
  }
  next();
});

// JSON and URL-encoded body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Gzip compression for all responses
app.use(compression());

// --- Routes Configuration ---

// Base route
app.get('/', (req, res) => {
  console.log(`🌐 ${new Date().toISOString()} - GET /`);
  console.log('📥 Headers:', req.headers);
  res.status(200).json({
    message: 'Welcome to the SteelConnect API! 🎉',
    status: 'Server is running',
    version: '1.0.0'
  });
});

// Dynamically load routes
try {
  console.log('🔄 Loading all application routes...');

  // Auth routes
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded successfully at /api/auth.');

  // Other routes
  app.use('/api/jobs', jobsRoutes);
  console.log('✅ Jobs routes loaded successfully at /api/jobs.');

  app.use('/api/quotes', quotesRoutes);
  console.log('✅ Quotes routes loaded successfully at /api/quotes.');

  app.use('/api/messages', messagesRoutes);
  console.log('✅ Messages routes loaded successfully at /api/messages.');

  app.use('/api/estimation', estimationRoutes);
  console.log('✅ Estimation routes loaded successfully at /api/estimation.');

  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes loaded successfully at /api/admin.');

} catch (error) {
  console.error(`❌ Fatal: Error loading application routes: ${error.message}`);
  process.exit(1); // Exit if routes fail to load
}

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server is live and listening on port ${PORT}`);
  console.log(`==> Your service is live 🎉`);
  console.log(`==> ///////////////////////////////////////////////////////////`);
  console.log(`==> Available at your primary URL https://steelconnect-backend.onrender.com`);
  console.log(`==> ///////////////////////////////////////////////////////////`);
});

export default app;
