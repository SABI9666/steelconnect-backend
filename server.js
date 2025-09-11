// server.js - Complete, stable, and secure backend server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// --- Import All Application Routes ---
// These are your standard user-facing routes
import authRoutes from './src/routes/auth.js';
import jobsRoutes from './src/routes/jobs.js';
import quotesRoutes from './src/routes/quotes.js';
import messagesRoutes from './src/routes/messages.js';

// --- Safely Import Admin Routes ---
// This try/catch block prevents the entire server from crashing if admin.js has an error.
let adminRoutes;
try {
    adminRoutes = (await import('./src/routes/admin.js')).default;
    console.log('✅ Admin routes imported successfully.');
} catch (error) {
    console.error('❌ CRITICAL: Admin routes failed to load. The admin panel will not work.', error);
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🚀 SteelConnect Backend Starting...');

// --- Database Connection ---
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables. Exiting.');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ MongoDB connected successfully.'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
});

// --- Core Middleware ---
// Using the more flexible CORS configuration to better handle Vercel deployments
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS Warning: Origin "${origin}" was blocked.`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// --- Health Check & Root Routes ---
app.get('/health', (req, res) => res.json({ success: true, message: 'Backend is healthy.' }));
app.get('/', (req, res) => res.json({ message: 'Welcome to the SteelConnect API' }));

// --- API Route Registration ---
console.log('📋 Registering API routes...');
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);

if (adminRoutes) {
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes registered at /api/admin.');
} else {
    app.use('/api/admin', (req, res) => {
        res.status(503).json({ success: false, message: 'Admin panel is unavailable due to a server configuration error.' });
    });
}
console.log('📦 All routes registered.');

// --- Error & 404 Handlers ---
app.use((error, req, res, next) => {
    console.error(`❌ Global Error Handler:`, error);
    res.status(error.status || 500).json({ success: false, error: error.message || 'Internal Server Error.'});
});

app.use('*', (req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}`});
});

// --- Start Server ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎉 Server is running successfully on port ${PORT}`);
});

export default app;
