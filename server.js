const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const fileUpload = require('express-fileupload');

// Load environment variables
dotenv.config();

// Import route handlers
const authRoutes = require('./src/routes/auth.js');
const jobRoutes = require('./src/routes/jobs.js');
const quoteRoutes = require('./src/routes/quotes.js');
const messageRoutes = require('./src/routes/messages.js');
const analysisRoutes = require('./src/routes/quoteAnalysis.js');
const estimationRoutes = require('./src/routes/estimation.js'); // Correctly imported

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware Setup ---

// CORS Configuration
const allowedOrigins = [
  'https://steelconnect-frontend.vercel.app',
  /^https:\/\/steelconnect-frontend-.+\.vercel\.app$/,
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
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

// File Upload Middleware
// Using express-fileupload to match fileProcessor.js
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    tempFileDir: '/temp/'
}));

// Static serving for any uploads if needed in the future
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));


// --- API Routes ---
app.get('/', (req, res) => {
  res.json({ message: 'SteelConnect Backend API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/estimation', estimationRoutes); // Using the estimation router


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

module.exports = app;