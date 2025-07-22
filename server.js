import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables at the very top
dotenv.config();

// Initialize app and PORT immediately after environment variables
const app = express();
const PORT = process.env.PORT || 3000;

// Corrected: Import route modules using default import syntax
import auth from './src/routes/auth.js';
import admin from './src/routes/admin.js';
import firebase from './src/routes/firebase.js';
import messages from './src/routes/messages.js';
import quotes from './src/routes/quotes.js';
import users from './src/routes/users.js';
import uploads from './src/routes/uploads.js';

// Middleware
app.use(cors());
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