import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

// Import your route handlers
import auth from './src/routes/auth.js';
import jobs from './src/routes/jobs.js';
import quotes from './src/routes/quotes.js';
import messages from './src/routes/messages.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
const allowedOrigins = [
  // --- NEW: Main Production URL ---
  'https://steelconnect-frontend.vercel.app',
  
  // --- NEW: Automatically allow all Vercel preview URLs ---
  /^https:\/\/steelconnect-frontend-.+\.vercel\.app$/,
  
  // --- Local development URLs ---
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Check if the origin is in the array or matches the regex
    const isAllowed = allowedOrigins.some(allowedOrigin => {
        if (allowedOrigin instanceof RegExp) {
            return allowedOrigin.test(origin);
        }
        return allowedOrigin === origin;
    });

    if (!origin || isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// --- File Upload & Static Serving Configuration ---

const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir + '/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

export const upload = multer({ storage: storage });

app.use('/uploads', express.static(uploadsDir));


// --- Routes ---
app.get('/', (req, res) => {
  res.json({ message: 'SteelConnect Backend API is running' });
});

app.use('/api/auth', auth);
app.use('/api/jobs', jobs);
app.use('/api/quotes', quotes);
app.use('/api/messages', messages);


// --- Error Handling ---
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + error.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;