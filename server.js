import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import jobsRoutes from './routes/jobs.js';
import quotesRoutes from './routes/quotes.js';
import messagesRoutes from './routes/messages.js';
import estimationRoutes from './routes/estimation.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Regex to allow all Vercel preview URLs
    const vercelPreviewRegex = /^https:\/\/steelconnect-frontend-.*-sabins-projects-02d8db3a\.vercel\.app$/;
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || vercelPreviewRegex.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json());

// Ensure the 'uploads' directory exists and serve it statically
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));


// --- API Routes ---
app.get('/', (req, res) => res.json({ message: 'SteelConnect Backend API is running' }));
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/estimation', estimationRoutes);

// --- Error Handling ---
// Catch-all for 404 routes
app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Server Start ---
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

export default app;
