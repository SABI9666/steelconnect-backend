import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables at the very top
dotenv.config();

// Initialize app and PORT
const app = express();
const PORT = process.env.PORT || 3000;

// Import all route modules
import auth from './src/routes/auth.js';
import admin from './src/routes/admin.js';
import firebase from './src/routes/firebase.js';
import messages from './src/routes/messages.js';
import quotes from './src/routes/quotes.js';
import users from './src/routes/users.js';
import uploads from './src/routes/uploads.js';

// --- CORS CONFIGURATION ---

const allowedOrigins = [
   'https://steelconnect-frontend-git-main-sabins-projects-02d8db3a.vercel.app',
  'https://steelconnect-frontend-6w9mke1zk-sabins-projects-02d8db3a.vercel.app', // <-- ADD THIS NEW URL
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
// --- END CORS CONFIGURATION ---

// Standard Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoints
app.get('/', (req, res) => {
  res.json({ message: 'SteelConnect Backend API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// --- DEBUGGING MIDDLEWARE ---
app.use('/auth', (req, res, next) => {
  console.log('>>> A request just hit the /auth router gate.');
  next();
});
// --- END DEBUGGING MIDDLEWARE ---

// Routes
app.use('/auth', auth);
app.use('/admin', admin);
app.use('/firebase', firebase);
app.use('/messages', messages);
app.use('/quotes', quotes);
app.use('/users', users);
app.use('/uploads', uploads);


// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
