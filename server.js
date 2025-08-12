import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

// Import routes
import auth from './src/routes/auth.js';
import jobs from './src/routes/jobs.js';
import quotes from './src/routes/quotes.js';
import messages from './src/routes/messages.js';
import estimation from './src/routes/estimation.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const connectDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log('✅ MongoDB connected successfully');
        } else {
            console.warn('⚠️ MongoDB URI not provided - running without database');
        }
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        console.warn('⚠️ Continuing without database connection');
    }
};

// Initialize database connection
connectDB();

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// CORS Configuration with improved handling
const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5173',
    'https://steelconnect-frontend.vercel.app',
    // Add common Vercel patterns
    'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
].filter(Boolean); // Remove undefined values

console.log('🔧 Allowed Origins:', allowedOrigins);
console.log('🌐 FRONTEND_URL from env:', process.env.FRONTEND_URL);

const corsOptions = {
    origin: function (origin, callback) {
        console.log('🔍 Checking origin:', origin);
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            console.log('✅ No origin - allowing');
            return callback(null, true);
        }

        // Check exact matches
        if (allowedOrigins.includes(origin)) {
            console.log('✅ Origin found in allowed list');
            return callback(null, true);
        }

        // Check Vercel preview deployments with multiple patterns
        const vercelPatterns = [
            /^https:\/\/steelconnect-frontend-.*\.vercel\.app$/,
            /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/,
            /^https:\/\/steelconnect-frontend-git-.*-sabins-projects-02d8db3a\.vercel\.app$/,
        ];

        const isVercelPreview = vercelPatterns.some(pattern => pattern.test(origin));
        
        if (isVercelPreview) {
            console.log('✅ Vercel preview URL detected');
            return callback(null, true);
        }

        console.log('❌ Origin not allowed:', origin);
        console.log('📋 Available origins:', allowedOrigins);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.get('Origin') || 'none'}`);
    next();
});

// File Upload Configuration
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir + '/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

export const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf|dwg|dxf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images, PDFs, and CAD files are allowed'));
        }
    }
});

// Static file serving
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.get('/', (req, res) => {
    res.json({ 
        message: 'SteelConnect Backend API is running',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        features: {
            pdfProcessing: true,
            aiAnalysis: !!process.env.ANTHROPIC_API_KEY,
            costEstimation: true,
            reportGeneration: true
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        allowedOrigins: allowedOrigins,
        database: {
            status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
            host: mongoose.connection.host || 'N/A',
            name: mongoose.connection.name || 'N/A'
        },
        services: {
            anthropicAPI: !!process.env.ANTHROPIC_API_KEY,
            fileUploads: fs.existsSync(uploadsDir),
            memoryUsage: process.memoryUsage()
        }
    };

    const httpStatus = mongoose.connection.readyState === 1 ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
});

// API version endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'SteelConnect API v1',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation'
        },
        documentation: 'https://github.com/your-repo/steelconnect-backend'
    });
});

// Mount routes
app.use('/api/auth', auth);
app.use('/api/jobs', jobs);
app.use('/api/quotes', quotes);
app.use('/api/messages', messages);
app.use('/api/estimation', estimation);

// Test endpoint for PDF processing
app.get('/api/test/pdf-processing', (req, res) => {
    res.json({
        status: 'available',
        features: {
            pdfExtraction: true,
            aiAnalysis: !!process.env.ANTHROPIC_API_KEY,
            costCalculation: true,
            reportGeneration: true
        },
        requirements: {
            anthropicApiKey: !!process.env.ANTHROPIC_API_KEY
        }
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            'GET /',
            'GET /health',
            'GET /api',
            'POST /api/estimation/upload',
            'GET /api/estimation/:id',
            'GET /api/estimation/:id/report'
        ]
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    console.error('Request origin:', req.get('Origin'));
    console.error('Request method:', req.method);
    console.error('Request path:', req.path);
    
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ 
            error: 'File upload error: ' + error.message,
            type: 'multer_error',
            code: error.code
        });
    }
    
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({ 
            error: 'CORS policy violation',
            origin: req.get('Origin'),
            allowedOrigins: allowedOrigins,
            type: 'cors_error'
        });
    }

    if (error.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation error',
            details: error.message,
            type: 'validation_error'
        });
    }

    if (error.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID format',
            type: 'cast_error'
        });
    }
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        type: 'internal_error',
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    
    try {
        // Close database connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('✅ Database connection closed');
        }
        
        // Close server
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📁 Uploads directory: ${path.resolve(uploadsDir)}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 CORS allowed origins:`, allowedOrigins);
    console.log(`📡 Server URL: https://steelconnect-backend.onrender.com`);
    console.log(`🤖 AI Analysis: ${process.env.ANTHROPIC_API_KEY ? 'Enabled' : 'Disabled (set ANTHROPIC_API_KEY)'}`);
    console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Not connected'}`);
});

export default app;
