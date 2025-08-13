// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

// --- Basic Setup ---
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ MongoDB connected');
    } else {
      console.log('⚠️  MongoDB URI not provided - running without database');
    }
  } catch (error) {
    console.warn('⚠️  MongoDB connection failed:', error.message);
    console.log('📝 Continuing without database...');
  }
};

// --- Initial File & Directory Setup ---
const ensureDirectories = async () => {
  const dirs = ['src/services', 'uploads', 'temp', 'src/routes', 'src/models'].map(d => path.join(projectRoot, d));
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
};

// --- Middleware Setup ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Fallback Route Creator ---
// This function creates a basic estimation route if the main one fails to load.
const createBasicEstimationRoute = () => {
  console.log('📝 Creating basic estimation fallback route...');
  const estimationRouter = express.Router();
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  // This handler expects the file field name from the frontend to be 'pdf'
  estimationRouter.post('/generate-from-upload', upload.single('pdf'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded', message: "The server expects a file but didn't receive one." });
    }
    // Basic success response
    res.json({ success: true, message: 'Basic estimation fallback successful', projectId: `temp_${Date.now()}` });
  });

  app.use('/api/estimation', estimationRouter);
  console.log('✅ Basic estimation route created.');
};


// --- Dynamic Route Loading ---
// This function dynamically loads all routes from the 'src/routes' directory.
// It's more robust and provides clearer error messages if a route file is missing or invalid.
const loadRoutes = async () => {
  console.log('🔄 Loading routes...');
  
  // Define all routes you want to load
  const routesToLoad = [
    { path: '/api/auth', file: 'src/routes/auth.js', name: 'Auth' },
    { path: '/api/jobs', file: 'src/routes/jobs.js', name: 'Jobs' },
    { path: '/api/quotes', file: 'src/routes/quotes.js', name: 'Quotes' },
    { path: '/api/estimation', file: 'src/routes/estimation.js', name: 'Estimation' }
  ];

  for (const route of routesToLoad) {
    const routeFilePath = path.join(projectRoot, route.file);
    try {
      // First, check if the file actually exists
      await fs.access(routeFilePath);
      
      // If it exists, import and use it
      const routeUrl = pathToFileURL(routeFilePath).href;
      const { default: routeModule } = await import(routeUrl);
      app.use(route.path, routeModule);
      console.log(`✅ ${route.name} routes loaded successfully from ${route.file}`);

    } catch (error) {
      // Handle different kinds of errors during loading
      if (error.code === 'ENOENT') { // ENOENT = Error NO ENTry (file not found)
        console.warn(`⚠️  ${route.name} routes file not found at ${route.file}. This endpoint will not be available.`);
      } else {
        // This catches syntax errors or other issues within the route file itself
        console.error(`❌ Error loading ${route.name} routes from ${route.file}: ${error.message}`);
      }
      
      // Specific fallback for estimation routes if they fail to load
      if (route.name === 'Estimation') {
        createBasicEstimationRoute();
      }
    }
  }
};


// --- Initialization and Server Start ---
const initializeApp = async () => {
  try {
    await ensureDirectories();
    // Removed createAuthRoutes and createEstimationModel as they are not provided
    // You can add them back if they are defined elsewhere in your project
    await connectDB();
    console.log('🚀 SteelConnect Backend initialized successfully');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1); // Exit if initialization fails
  }
};

const startServer = async () => {
  await initializeApp();
  await loadRoutes(); // Load all our routes

  // Health check and root endpoints
  app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API', version: '1.0.0', status: 'running' }));
  app.get('/health', (req, res) => res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

  // 404 Handler: This should be placed AFTER all other routes are defined.
  app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not Found', message: `The route ${req.method} ${req.originalUrl} does not exist on this server.` });
  });

  // Global Error Handler: This catches errors from any route.
  app.use((error, req, res, next) => {
    // Specifically handle Multer's "Unexpected field" error
    if (error instanceof multer.MulterError && error.code === 'UNEXPECTED_FIELD') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected field',
        message: 'The file was uploaded with an incorrect field name. The server expects the field name to be "pdf".'
      });
    }
    
    // Log any other unhandled errors
    console.error('❌ Unhandled Error:', error);
    
    // Send a generic 500 Internal Server Error response
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  });

  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
};

startServer();
