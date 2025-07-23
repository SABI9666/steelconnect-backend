import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- START: VERIFY TOKEN MIDDLEWARE (NEWLY ADDED) ---
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


// REGISTRATION ROUTE
router.post('/register', async (req, res) => {
  // ... your existing register code ...
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
  // ... your existing login code ...
});

// FORGOT PASSWORD ROUTE
router.post('/forgot-password', async (req, res) => {
  // ... your existing forgot-password code ...
});

// RESET PASSWORD ROUTE
router.post('/reset-password', async (req, res) => {
  // ... your existing reset-password code ...
});


// --- START: ADD NAMED EXPORT FOR verifyToken (NEWLY ADDED) ---
export { verifyToken };
// --- END: ADD NAMED EXPORT ---

export default router;
