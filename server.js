import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// IMPORTANT: This line initializes Firebase for the entire application.
// It must be imported before any of your routes.
import './src/config/firebase.js';

// Import all your application routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Middleware Setup ---
// Enable CORS for all origins. You can restrict this in production if needed.
app.use(cors({ credentials: true, origin: true }));

// Basic security headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compress responses to save bandwidth
app.use(compression());

// Parse JSON and URL-encoded request bodies
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

// --- API Routes ---
// Register each route module with a base path.
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);

// FIXED: Changed base path from '/api/contractor' to '/api/estimation'
// This matches your frontend API calls
app.use('/api/estimation', estimationRoutes);

console.log('✅ All API routes have been registered.');
console.log('📋 Available routes:');
console.log('   - /api/auth/*');
console.log('   - /api/jobs/*');
console.log('   - /api/quotes/*');
console.log('   - /api/messages/*');
console.log('   - /api/estimation/* (UPDATED)');

// --- Health Check Endpoint ---
// A simple route to verify that the server is running.
app.get('/health', (req, res) => res.status(200).json({ 
    status: 'UP',
    timestamp: new Date().toISOString(),
    port: PORT
}));

// --- 404 Not Found Handler ---
// This catches any requests that don't match the routes above.
app.use((req, res, next) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.originalUrl}`,
        availableRoutes: [
            '/api/auth',
            '/api/jobs', 
            '/api/quotes',
            '/api/messages',
            '/api/estimation'
        ]
    });
});

// --- Global Error Handler ---
// This catches any errors thrown from your route handlers.
app.use((error, req, res, next) => {
    console.error('❌ An unexpected error occurred:', error);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error. Please try again later.',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

// --- Start the Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎉 Server is live and listening on port ${PORT}`);
    console.log(`🔗 Health check available at http://localhost:${PORT}/health`);
    console.log(`🌐 CORS enabled for all origins`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
