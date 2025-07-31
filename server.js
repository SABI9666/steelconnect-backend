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
  'https://steelconnect-frontend.vercel.app',
  'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-fwpvudjyf-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-agxj6t88e-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-4lrnt0hv3-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-3mko9i2g2-sabins-projects-02d8db3a.vercel.app',
  // --- NEW URL ADDED ---
  'https://steelconnect-frontend-9yxpdja13-sabins-projects-02d8db3a.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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