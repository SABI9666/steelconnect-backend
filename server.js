// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// --- Core Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      console.error(`CORS Error: The origin "${origin}" was not allowed.`);
      callback(new Error('This origin is not allowed by CORS policy.'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Dynamic Route Loading ---
const loadRoutes = async () => {
    console.log('🔄 Loading all application routes...');
    const routesToLoad = [
        { path: '/api/auth', file: './src/routes/auth.js', name: 'Auth' },
        { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs' },
        { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes' },
        { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages' },
        { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation' },
        { path: '/api/admin', file: './src/routes/admin.js', name: 'Admin' }
    ];

    for (const route of routesToLoad) {
        try {
            const { default: routeModule } = await import(route.file);
            app.use(route.path, routeModule);
            console.log(`✅ ${route.name} routes loaded successfully at ${route.path}.`);
        } catch (error) {
            console.error(`❌ Fatal: Error loading ${route.name} routes from ${route.file}: ${error.message}`);
        }
    }
};

// --- Server Initialization ---
const startServer = async () => {
    await loadRoutes();
    
    app.get('/', (req, res) => res.status(200).json({ 
        message: 'SteelConnect Backend API is running and healthy.',
        database: 'Firebase Firestore'
    }));
    
    app.use((error, req, res, next) => {
        console.error('❌ Global Error Handler caught an error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'An unexpected internal server error occurred.' 
        });
    });
    
    app.listen(PORT, () => {
        console.log(`✅ Server is live and listening on port ${PORT}`);
        console.log(`🔥 Using Firebase Firestore as database`);
    });
};

startServer();
