import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// --- Import All Your Route Handlers ---
import authRoutes from './src/routes/auth.js';
import jobRoutes from './src/routes/jobs.js';
import quoteRoutes from './src/routes/quotes.js';
import messageRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js'; // <-- CONNECTING YOUR NEW TOOL

// --- Initialize App and Environment ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// --- Dynamic CORS Configuration for Live URLs ---
const allowedOrigins = [
  // Regex to match your Vercel production and preview URLs dynamically
  /^https:\/\/steelconnect-frontend.*\.vercel\.app$/,
  // For local development
  'http://localhost:5173',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the origin matches any of the allowed origins
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('This origin is not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// --- End of CORS Configuration ---


// --- Core Middleware ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Static File Serving for Uploads ---
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));


// --- API Routes ---
app.get('/', (req, res) => {
  res.json({
      message: 'SteelConnect Backend API is running smoothly',
      status: 'active',
      timestamp: new Date().toISOString()
  });
});

// Using your existing routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/messages', messageRoutes);

// Connecting the new estimation API
app.use('/api/estimation', estimationRoutes);


// --- Error Handling Middleware ---
// Handle 404 for routes not found
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global Error Handler:', error);
  res.status(500).json({
      error: 'An internal server error occurred.',
      message: error.message
  });
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
});

export default app;
