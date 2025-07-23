import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables at the very top
dotenv.config();

// Initialize app and PORT immediately after environment variables
const app = express();
const PORT = process.env.PORT || 3000;

// Import all route modules from your src/routes directory
import auth from './src/routes/auth.js';
import admin from './src/routes/admin.js';
import firebase from './src/routes/firebase.js';
import messages from './src/routes/messages.js';
import quotes from './src/routes/quotes.js';
import users from './src/routes/users.js';
import uploads from './src/routes/uploads.js';

// --- START: CORS CONFIGURATION ---
// Add all your Vercel frontend URLs to this list
const allowedOrigins = [
  'https://steelconnect-frontend.vercel.app',
  'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
   'https://steelconnect-frontend-e4ji967z7-sabins-projects-02d8db3a.vercel.app'

  // Add new Vercel preview URLs here as they are generated
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
// --- END: CORS CONFIGURATION ---


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'SteelConnect Backend API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/auth', auth);
app.use('/admin', admin);
app.use('/firebase', firebase);
app.use('/messages', messages);
app.use('/quotes', quotes);
app.use('/users', users);
app.use('/uploads', uploads);


// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;