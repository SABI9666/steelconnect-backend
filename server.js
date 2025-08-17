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
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Middleware ---
// Split the allowed origins from the environment variable.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // Check if the origin is in the whitelisted array OR if it's a Vercel URL.
    // Vercel preview URLs are dynamic, so checking the suffix is a robust strategy.
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      // Log the blocked origin for easier debugging
      console.error(`CORS Error: The origin "${origin}" was not allowed.`);
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

// --- Dynamic Route Loading ---
const loadRoutes = async () => {
    console.log('🔄 Loading all application routes...');
    const routesToLoad = [
        { path: '/api/auth', file: './src/routes/auth.js', name: 'Auth' },
        { path: '/api/jobs', file: './src/routes/jobs.js', name: 'Jobs' },
        { path: '/api/quotes', file: './src/routes/quotes.js', name: 'Quotes' },
        { path: '/api/messages', file: './src/routes/messages.js', name: 'Messages' },
        { path: '/api/estimation', file: './src/routes/estimation.js', name: 'Estimation' },
        // Add the new admin route here.
        { path: '/api/admin', file: './src/routes/admin.js', name: 'Admin' } 
    ];

    for (const route of routesToLoad) {
        try {
            const routeUrl = pathToFileURL(path.join(projectRoot, route.file)).href;
            const { default: routeModule } = await import(routeUrl);
            app.use(route.path, routeModule);
            console.log(`✅ ${route.name} routes loaded.`);
        } catch (error) {
            console.error(`❌ Error loading ${route.name} routes from ${route.file}: ${error.message}`);
        }
    }
};

// --- Start Server ---
const startServer = async () => {
    await loadRoutes();
    app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API is running' }));
    app.use((error, req, res, next) => {
        console.error('❌ Global Error Handler:', error);
        res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    });
    app.listen(PORT, () => console.log(`✅ Server is live on port ${PORT}`));
};

startServer();
