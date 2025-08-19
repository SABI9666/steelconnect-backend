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
// --- ✅ ADD THIS LINE ---
import estimationRoutes from './src/routes/estimation.js'; // Import the estimation routes

dotenv.config();

// --- 🛡️ Environment Variable Validation ---
const requiredEnvVars = ['MONGODB_URI', 'PORT'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`FATAL ERROR: Environment variable "${varName}" is not defined.`);
  }
}

const app = express();
const PORT = process.env.PORT || 10000;

// --- 🔗 Database Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1); // Exit process with failure
  });

// --- 🌐 Dynamic CORS Policy for Vercel ---
const allowedOrigins = [
  // Production frontend URL
  'https://steelconnect-frontend.vercel.app',
  
  // Specific Vercel domain for the admin panel
  'https://admin-pink-nine.vercel.app',

  // Regex for the admin site's main branch and all preview deployments
  /^https:\/\/admin-.*-sabins-projects-02d8db3a\.vercel\.app$/,

  // Regex for the main frontend's preview deployments
  /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow tools like Postman (no origin) and local development
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }

    // Check if the incoming origin matches any allowed strings or patterns
    if (allowedOrigins.some(pattern => (pattern instanceof RegExp ? pattern.test(origin) : pattern === origin))) {
      callback(null, true);
    } else {
      console.error(`❌ CORS Error: Origin "${origin}" not allowed.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

console.log('✅ CORS is configured with a dynamic policy for Vercel.');

// --- ⚙️ Middleware ---
app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(express.json({ limit: '50mb' })); // Corrected the limit format
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- 📝 Request Logging ---
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// --- 🏠 API Routes ---
app.get('/health', (req, res) => res.json({ success: true, message: 'Backend is healthy' }));
app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API', version: '1.0.0' }));

// Register Main Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
// --- ✅ ADD THIS LINE ---
app.use('/api/estimation', estimationRoutes); // Register the estimation routes

// --- 🚨 Error Handling ---
app.use((error, req, res, next) => {
  console.error('❌ Global Error Handler:', error.message);
  const status = error.status || 500;
  const message = error.message || 'An internal server error occurred.';
  res.status(status).json({ success: false, error: message });
});

// --- ❓ 404 Not Found Handler ---
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.originalUrl}` });
});

// --- 🚀 Start Server ---
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SteelConnect Backend Server listening on port ${PORT}`);
});

// --- 💥 Unhandled Promise Rejection Catcher ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => process.exit(1));
});
