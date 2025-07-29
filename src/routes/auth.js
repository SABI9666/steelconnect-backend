import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

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
    
    const payload = {
      user: {
        id: userDocId,
        email: userData.email,
        role: userData.role,
        fullName: userData.fullName
      }
    };
    
    // IMPORTANT: This environment variable MUST be set correctly on your server.
    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET || 'your_default_secret_key', 
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: userDocId,
        name: userData.fullName, // Ensure frontend uses 'name'
        email: userData.email,
        type: userData.role // Ensure frontend uses 'type'
      }
    });

  } catch (error) {
    console.error('CRITICAL LOGIN ERROR:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

// ... (your other routes like registration) ...

export default router;