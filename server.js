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

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);

// --- Database Connection ---
// Connect to MongoDB using the URI from environment variables
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully.'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Core Middleware ---
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like server-to-server, mobile apps, or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    // Allow if the origin is in the whitelist or is a Vercel preview URL
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.error(`CORS Error: The origin "${origin}" was not allowed.`);
      callback(new Error('This origin is not allowed by CORS policy.'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions)); // Enable Cross-Origin Resource Sharing
app.use(helmet({ contentSecurityPolicy: false })); // Apply security headers
app.use(compression()); // Compress responses for better performance
app.use(express.json({ limit: '50mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded bodies

// --- Dynamic Route Loading ---
const loadRoutes = async () => {
    console.log('🔄 Loading all application routes...');
    // --- FIX: Removed './' prefix to prevent path duplication on Render ---
    const routesToLoad = [
        { path: '/api/auth', file: 'src/routes/auth.js', name: 'Auth' },
        { path: '/api/jobs', file: 'src/routes/jobs.js', name: 'Jobs' },
        { path: '/api/quotes', file: 'src/routes/quotes.js', name: 'Quotes' },
        { path: '/api/messages', file: 'src/routes/messages.js', name: 'Messages' },
        { path: '/api/estimation', file: 'src/routes/estimation.js', name: 'Estimation' },
        { path: '/api/admin', file: 'src/routes/admin.js', name: 'Admin' } // Admin routes
    ];

    for (const route of routesToLoad) {
        try {
            // Dynamically import the route module
            const routeUrl = pathToFileURL(path.join(projectRoot, route.file)).href;
            const { default: routeModule } = await import(routeUrl);
            app.use(route.path, routeModule);
            console.log(`✅ ${route.name} routes loaded successfully at ${route.path}.`);
        } catch (error) {
            console.error(`❌ Fatal: Error loading ${route.name} routes from ${route.file}: ${error.message}`);
            // In a real production scenario, you might want to exit if critical routes fail
            // process.exit(1);
        }
    }
};

// --- Server Initialization ---
const startServer = async () => {
    await loadRoutes();

    // Health check endpoint
    app.get('/', (req, res) => res.status(200).json({ message: 'SteelConnect Backend API is running and healthy.' }));

    // Global error handling middleware (must be the last app.use call)
    app.use((error, req, res, next) => {
        console.error('❌ Global Error Handler caught an error:', error);
        res.status(500).json({ success: false, error: error.message || 'An unexpected internal server error occurred.' });
    });

    // Start listening on the specified port
    app.listen(PORT, () => console.log(`✅ Server is live and listening on port ${PORT}`));
};

startServer();
