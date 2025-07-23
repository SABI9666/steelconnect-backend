import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- START: VERIFY TOKEN MIDDLEWARE ---
// This function protects routes by checking for a valid user token.
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};
// --- END: VERIFY TOKEN MIDDLEWARE ---


// Your existing /register route...
router.post('/register', async (req, res) => {
  // ... existing code for registration
});

// Your existing /login route...
router.post('/login', async (req, res) => {
  // ... existing code for login
});

// Your existing /forgot-password route...
router.post('/forgot-password', async (req, res) => {
  // ... existing code for forgot password
});

// Your existing /reset-password route...
router.post('/reset-password', async (req, res) => {
  // ... existing code for reset password
});


// --- START: EXPORTS ---
// Export the middleware as a named export for other files to use.
export { verifyToken };

// Export the router as the default export.
export default router;
// --- END: EXPORTS ---