<<<<<<< HEAD
// server.js

// 1. Import necessary modules
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// Import all route modules from the central index.js file
import { auth, admin, messages, quotes, users, uploads } from './index.js'; //
// Import Firebase Admin SDK initialization from your config file
import { db, firebaseAdminApp, adminStorage } from './config/firebase.js'; //

// 2. Load environment variables at the very top
// This ensures process.env variables are available throughout your application
dotenv.config();

// 3. Initialize Express app and define PORT
const app = express();
const PORT = process.env.PORT || 3000;

// 4. Middleware Setup
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// Request logging middleware (using console.log as a simple example)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 5. Health Check Endpoints
// Basic root endpoint to confirm the server is running
app.get('/', (req, res) => {
  res.json({
    message: 'SteelConnect Backend API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// More detailed health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(), // Node.js process uptime
    timestamp: new Date().toISOString(),
    // You could add checks for database connection status here if needed
  });
});

// 6. Route Mounting
// Mount each router under its respective base path
app.use('/auth', auth); //
app.use('/admin', admin); //
// Note: The 'firebase' route module (from routes/firebase.js) provides client-facing config
// It is not related to the Firebase Admin SDK initialization in config/firebase.js
// If you intend to use routes/firebase.js, uncomment the line below.
// app.use('/firebase', firebase);
app.use('/messages', messages); //
app.use('/quotes', quotes); //
app.use('/users', users); //
app.use('/uploads', uploads); // Mount the new uploads router

// 7. Error Handling

// 404 Not Found Handler: Catches requests to undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global Error Handler: Catches errors thrown by middleware or route handlers
app.use((error, req, res, next) => {
  console.error('Global error handler caught an error:', error); // Log the full error for debugging
  // Send a generic error message in production, more detailed in development
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong on the server.'
  });
});

// 8. Start the Server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('✅ Firebase Admin SDK initialized successfully.'); // Confirm Firebase Admin init
  console.log(`✅ Available API routes:`);
  console.log(`   GET  /`);
  console.log(`   GET  /health`);
  console.log(`   POST /auth/register`); //
  console.log(`   POST /auth/login`); //
  console.log(`   GET  /auth/profile`); //
  console.log(`   GET  /admin/dashboard`); //
  console.log(`   GET  /admin/users`); //
  console.log(`   POST /uploads/file`); // New upload route
  console.log(`   POST /uploads/link`); // New link submission route
  console.log(`   GET  /jobs`); //
  console.log(`   POST /jobs`); //
  console.log(`   GET  /jobs/:id`); //
  console.log(`   GET  /quotes`); //
  console.log(`   POST /quotes`); //
  console.log(`   GET  /quotes/:id`); //
  console.log(`   GET  /messages`); //
  console.log(`   POST /messages`); //
  console.log(`   PUT  /messages/:id/read`); //
  console.log(`   ... and more as per your route files`);
});

// Export the app for testing or other modules if needed (optional for main server file)
export default app;
=======
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables at the very top
dotenv.config();

// Initialize app and PORT immediately after environment variables
const app = express();
const PORT = process.env.PORT || 3000;

// Corrected: Import route modules from the correct path.
// The index.js file is in the same directory as server.js.
import { auth, admin, firebase, messages, quotes, users } from './index.js';

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
// If you have a 'setup' module, ensure it's imported and uncomment the line below.
// Otherwise, keep it commented or remove it if not needed.
// app.use('/setup', setup);
app.use('/users', users);

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
  console.log(`✅ Available routes:`);
  console.log(`   GET  /`);
  console.log(`   GET  /health`);
  console.log(`   POST /auth/register`);
  console.log(`   POST /auth/login`);
  console.log(`   GET  /auth/profile`);
  console.log(`   GET  /admin/dashboard`);
  console.log(`   GET  /admin/users`);
  console.log(`   ... and more`);
});

export default app;
>>>>>>> 4c4d2afbcdcbe9f64bae5421272e93ca67d748e2
