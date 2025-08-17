// server.js

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

// Import necessary modules
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import admin from 'firebase-admin';

// Import route modules
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';
import adminRoutes from './src/routes/admin.js';
import authRoutes from './src/routes/auth.js';

// --- Firebase Initialization (CRITICAL FIX) ---
// Initialize the Firebase Admin SDK using the service account key from environment variables.
// This must run before any other file attempts to use Firebase services.
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialized successfully');
  console.log('🔥 Using Firebase Firestore as database');
} catch (error) {
  console.error('❌ FATAL: Firebase initialization failed. Check FIREBASE_SERVICE_ACCOUNT_KEY environment variable.');
  console.error('Error details:', error.message);
  process.exit(1); // Exit the process if Firebase initialization fails
}

// Create Express application
const app = express();
const PORT = process.env.PORT || 10000;

// --- Middleware Configuration ---

// Security middleware
app.use(helmet());

// Enable CORS for all origins (for development)
app.use(cors({ origin: '*' }));
app.options('*', cors()); // Enable pre-flight OPTIONS requests

// Check and log CORS origin for incoming requests
app.use((req, res, next) => {
  const origin = req.headers.origin || 'undefined';
  console.log(`🌐 CORS check for origin: "${origin}"`);
  if (origin === 'undefined' || origin === 'https://admin-q4y7l6gxz-sabins-projects-02d8db3a.vercel.app') {
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

  // Auth routes (must be loaded after Firebase is initialized)
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
