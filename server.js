// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

// --- Database Connection ---
const connectDB = async () => {
    try {
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('✅ MongoDB connected');
        } else {
            console.log('⚠️ MongoDB URI not provided, running without database');
        }
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('🔄 Continuing without database connection');
    }
};

connectDB();

// --- Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            return callback(null, true);
        }

        // Check if the origin is in the whitelisted array OR if it's a Vercel URL
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            console.log(`CORS Info: Allowing origin "${origin}"`);
            callback(null, true); // Allow all origins for now - restrict in production
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Basic Health Check ---
app.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'SteelConnect Backend is healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- Safe Route Loading ---
const loadRoutes = async () => {
    console.log('🔄 Loading application routes...');
    
    const routesToLoad = [
        { path: '/api/auth', file: './src/routes/auth.js', name: 'Auth', required: false },
        { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs', required: false },
        { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes', required: false },
        { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages', required: false },
        { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation', required: false }
    ];

    for (const route of routesToLoad) {
        try {
            const routePath = path.join(projectRoot, route.file);
            const routeUrl = pathToFileURL(routePath).href;
            
            // Try to import the route
            const { default: routeModule } = await import(routeUrl);
            
            if (routeModule) {
                app.use(route.path, routeModule);
                console.log(`✅ ${route.name} routes loaded successfully`);
            } else {
                throw new Error('Route module returned undefined');
            }
            
        } catch (error) {
            console.error(`❌ Failed to load ${route.name} routes: ${error.message}`);
            
            if (route.required) {
                console.error(`💥 ${route.name} routes are required - stopping server`);
                process.exit(1);
            } else {
                console.log(`⚠️ ${route.name} routes are optional - continuing without them`);
                // Create a basic placeholder route
                app.use(route.path, (req, res) => {
                    res.status(503).json({
                        success: false,
                        error: `${route.name} service is temporarily unavailable`,
                        message: 'This feature is being configured'
                    });
                });
            }
        }
    }
};

// --- Default Routes ---
app.get('/', (req, res) => {
    res.json({
        message: 'SteelConnect Backend API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            jobs: '/api/jobs',
            quotes: '/api/quotes',
            messages: '/api/messages',
            estimation: '/api/estimation'
        },
        timestamp: new Date().toISOString()
    });
});

// --- Error Handlers ---
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

app.use((error, req, res, next) => {
    console.error('🔥 Global Error Handler:', error.message);
    
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(error.status || 500).json({
        success: false,
        error: isDevelopment ? error.message : 'Internal Server Error',
        ...(isDevelopment && { stack: error.stack })
    });
});

// --- Graceful Shutdown ---
const gracefulShutdown = (signal) => {
    console.log(`\n📡 Received ${signal}. Shutting down gracefully...`);
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
        mongoose.connection.close(() => {
            console.log('🗄️ MongoDB connection closed');
        });
    }
    
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Start Server ---
const startServer = async () => {
    try {
        await loadRoutes();
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 SteelConnect Backend Server Started`);
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
        });
        
        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${PORT} is already in use`);
            } else {
                console.error(`❌ Server error: ${error.message}`);
            }
            process.exit(1);
        });
        
    } catch (error) {
        console.error('💥 Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
