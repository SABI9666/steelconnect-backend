import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Import Firebase config (ensure this initializes adminDb)
import './src/config/firebase.js';

// Import routes
import authRoutes from './src/routes/auth.js';
import adminRoutes from './src/routes/admin.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';
import estimationRoutes from './src/routes/estimation.js';
import notificationsRoutes from './src/routes/notifications.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting (Firebase Mode)...');

// --- Middleware ---
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// --- Health check route ---
app.get('/health', (req, res) => {
    res.json({ success: true, message: 'Backend is healthy' });
});

// --- Register All API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);
app.use('/api/notifications', notificationsRoutes);

console.log('✅ All routes registered successfully.');

// --- Error handling middleware ---
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    res.status(error.status || 500).json({ 
        success: false, 
        error: error.message || 'Internal Server Error'
    });
});

// --- 404 handler ---
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`
    });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🎉 Server running on port ${PORT}`);
});
