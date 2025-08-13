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
// --- FIX: Add required modules for robust pathing ---
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

// --- FIX: Define the project's root directory reliably ---
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection (optional - will work without MongoDB)
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

// Ensure required directories exist
const ensureDirectories = async () => {
  // --- FIX: Use absolute path for directory creation ---
  const dirs = ['src/services', 'uploads', 'temp', 'src/routes', 'src/models'].map(d => path.join(projectRoot, d));
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }
};

// Create basic auth routes if they don't exist
const createAuthRoutes = async () => {
  // --- FIX: Use absolute path to check for and create auth file ---
  const authRoutesPath = path.join(projectRoot, 'src', 'routes', 'auth.js');
  try {
    await fs.access(authRoutesPath);
    console.log('✅ Auth routes already exist');
  } catch {
    console.log('🔧 Creating basic auth routes...');
    const basicAuthRoutes = `// src/routes/auth.js
import express from 'express';

const router = express.Router();

// Basic auth endpoints
router.post('/register', (req, res) => {
  res.status(201).json({
    success: true,
    message: 'User registration successful',
    user: { id: 1, email: req.body.email }
  });
});

router.post('/login', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'User login successful',
    token: 'sample-jwt-token-for-testing',
    user: { id: 1, email: req.body.email }
  });
});

router.get('/profile', (req, res) => {
  res.status(200).json({
    success: true,
    user: { id: 1, name: 'Test User', email: 'user@example.com' }
  });
});

export default router;
`;
    
    await fs.writeFile(authRoutesPath, basicAuthRoutes);
    console.log('✅ Basic auth routes created');
  }
};

// Create basic estimation model if it doesn't exist
const createEstimationModel = async () => {
  // --- FIX: Use absolute path to check for and create model file ---
  const modelPath = path.join(projectRoot, 'src', 'models', 'estimation.js');
  try {
    await fs.access(modelPath);
    console.log('✅ Estimation model already exists');
  } catch {
    console.log('🔧 Creating basic estimation model...');
    const basicModel = `// src/models/estimation.js
import mongoose from 'mongoose';

const estimationSchema = new mongoose.Schema({
  projectName: { type: String, required: true, trim: true },
  projectLocation: { type: String, required: true },
  clientName: { type: String, default: '' },
  status: { type: String, enum: ['Draft', 'Approved', 'Archived', 'Completed'], default: 'Draft' },
  user: { type: String },
  originalFilename: String,
  fileSize: Number,
  extractionConfidence: { type: Number, default: 0 },
  processingMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  structuredData: { type: mongoose.Schema.Types.Mixed, default: {} },
  analysisResults: { type: mongoose.Schema.Types.Mixed, required: true },
  estimationData: { type: mongoose.Schema.Types.Mixed, required: true },
  version: { type: Number, default: 1 }
}, {
  timestamps: true
});

// Create a mock model if mongoose isn't connected
let Estimation;
if (mongoose.connection.readyState === 1) {
  Estimation = mongoose.model('Estimation', estimationSchema);
} else {
  // Create a mock model for when DB isn't available
  Estimation = {
    find: () => ({ sort: () => ({ limit: () => ({ skip: () => ({ select: () => Promise.resolve([]) }) }) }) }),
    findById: () => Promise.resolve(null),
    findByIdAndUpdate: () => Promise.resolve(null),
    findByIdAndDelete: () => Promise.resolve(null),
    countDocuments: () => Promise.resolve(0),
    aggregate: () => Promise.resolve([]),
    save: () => Promise.resolve({ _id: Date.now().toString() })
  };
  // Add a static method for creating new instances
  Estimation.create = (data) => Promise.resolve({ ...data, _id: Date.now().toString() });
}

export default Estimation;
`;
    
    await fs.writeFile(modelPath, basicModel);
    console.log('✅ Basic estimation model created');
  }
};

// Middleware setup
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize the application
const initializeApp = async () => {
  try {
    await ensureDirectories();
    await createAuthRoutes();
    await createEstimationModel();
    await connectDB();
    console.log('🚀 SteelConnect Backend initialized successfully');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
  }
};

// --- Routes ---

// API Documentation
app.get('/', (req, res) => {
  res.json({
    message: 'SteelConnect Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: { /* ... (endpoints remain the same) ... */ }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SteelConnect Backend is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Load routes after initialization
const loadRoutes = async () => {
  try {
    // --- FIX: Use absolute path for dynamic imports ---
    const authRoutesPath = path.join(projectRoot, 'src', 'routes', 'auth.js');
    const estimationRoutesPath = path.join(projectRoot, 'src', 'routes', 'estimation.js');

    const authRoutesUrl = pathToFileURL(authRoutesPath).href;
    const estimationRoutesUrl = pathToFileURL(estimationRoutesPath).href;

    // Import auth routes
    const { default: authRoutesModule } = await import(authRoutesUrl);
    app.use('/api/auth', authRoutesModule);
    
    // Import estimation routes if they exist
    try {
      const { default: estimationRoutesModule } = await import(estimationRoutesUrl);
      app.use('/api/estimation', estimationRoutesModule);
      console.log('✅ Loaded full estimation routes');
    } catch (importError) {
      // ... (fallback logic remains the same) ...
    }
    console.log('✅ All routes loaded successfully');
  } catch (error) {
    console.error('❌ Error loading routes:', error);
  }
};

// --- Error Handling & Server Start (remains the same) ---
// ...

const startServer = async () => {
  await initializeApp();
  await loadRoutes();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌟 SteelConnect Backend running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API docs: http://localhost:${PORT}/`);
  });
};

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
