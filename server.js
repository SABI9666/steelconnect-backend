import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import your route handlers
import auth from './src/routes/auth.js';
import jobs from './src/routes/jobs.js';
import uploads from './src/routes/uploads.js';
import quotes from './src/routes/quotes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration ---
// This list tells your backend which frontend URLs are allowed to make requests.
const allowedOrigins = [
  'https://steelconnect-frontend.vercel.app',
  'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app', // <-- NEW
  'https://steelconnect-frontend-gz59nddpm-sabins-projects-02d8db3a.vercel.app', // <-- NEW
  'http://localhost:3000', // For local testing
  'http://localhost:5173'  // For local testing (e.g., with Vite)
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
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

// --- Serve Static Files ---
// This line makes files in the "uploads" directory accessible to the frontend.
app.use('/uploads', express.static('uploads'));

// --- Routes ---
app.get('/', (req, res) => {
  res.json({ message: 'SteelConnect Backend API is running' });
});

app.use('/auth', auth);
app.use('/jobs', jobs);
app.use('/uploads', uploads);
app.use('/quotes', quotes);

// --- Error Handling ---
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;






