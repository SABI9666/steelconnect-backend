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

// --- FIX: Correct CORS Configuration ---
// This setup is more secure and robust.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
};
app.use(cors(corsOptions));
// --- END FIX ---

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Fallback Route Creator ---
const createBasicEstimationRoute = () => {
  console.log('📝 Creating basic estimation fallback route...');
  const estimationRouter = express.Router();
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  estimationRouter.post('/generate-from-upload', upload.any(), (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    res.json({ success: true, message: 'Basic estimation fallback successful', projectId: `temp_${Date.now()}` });
  });

  app.use('/api/estimation', estimationRouter);
  console.log('✅ Basic estimation route created.');
};


// --- Dynamic Route Loading ---
const loadRoutes = async () => {
  console.log('🔄 Loading routes...');
  const routesToLoad = [
    { path: '/api/auth', file: 'src/routes/auth.js', name: 'Auth' },
    { path: '/api/jobs', file: 'src/routes/jobs.js', name: 'Jobs' },
    { path: '/api/quotes', file: 'src/routes/quotes.js', name: 'Quotes' },
    { path: '/api/estimation', file: 'src/routes/estimation.js', name: 'Estimation' }
  ];

  for (const route of routesToLoad) {
    const routeFilePath = path.join(projectRoot, route.file);
    try {
      await fs.access(routeFilePath);
      const routeUrl = pathToFileURL(routeFilePath).href;
      const { default: routeModule } = await import(routeUrl);
      app.use(route.path, routeModule);
      console.log(`✅ ${route.name} routes loaded successfully from ${route.file}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`⚠️  ${route.name} routes file not found at ${route.file}.`);
      } else {
        console.error(`❌ Error loading ${route.name} routes from ${route.file}: ${error.message}`);
      }
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
    await connectDB();
    console.log('🚀 SteelConnect Backend initialized successfully');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
};

const startServer = async () => {
  await initializeApp();
  await loadRoutes();

  app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API', version: '1.0.0', status: 'running' }));
  app.get('/health', (req, res) => res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

  app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Not Found', message: `The route ${req.method} ${req.originalUrl} does not exist.` });
  });

  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: 'File Upload Error', message: error.message });
    }
    console.error('❌ Unhandled Error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  });

  app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
};

startServer();
