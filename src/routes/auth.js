import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken'; // <-- 1. Import jsonwebtoken
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- LOGIN ROUTE (UPDATED) ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();
    if (userSnapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const userData = userSnapshot.docs[0].data();
    const userDocId = userSnapshot.docs[0].id;
    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    
    // ** 2. Create JWT Payload with user info **
    const payload = {
      user: {
        id: userDocId,
        email: userData.email,
        role: userData.role,
        fullName: userData.fullName
      }
    };
    
    // ** 3. Sign the token with a secret key **
    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET || 'your_default_secret_key', 
      { expiresIn: '1d' }
    );

    // ** 4. Send token back to the frontend **
    res.status(200).json({
      message: 'Login successful',
      token: token, // <-- THE MISSING PIECE
      user: {
        id: userDocId,
        fullName: userData.fullName,
        email: userData.email,
        role: userData.role
      }
    });

  } catch (error) {
    console.error('CRITICAL LOGIN ERROR:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});


// (The rest of your auth.js file remains the same)
// ... registration route ...

export default router;