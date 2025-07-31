import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- User Registration (No changes needed here) ---
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, type } = req.body;

    if (!email || !password || !name || !type) {
      return res.status(400).json({ error: 'Email, password, name, and type are required.' });
    }
    if (type !== 'contractor' && type !== 'designer') {
        return res.status(400).json({ error: 'User type must be either "contractor" or "designer".' });
    }

    const existingUser = await adminDb.collection('users').where('email', '==', email).get();
    if (!existingUser.empty) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      email,
      password: hashedPassword,
      name,
      type,
      createdAt: new Date().toISOString(),
    };

    const userRef = await adminDb.collection('users').add(newUser);
    const { password: _, ...userToReturn } = newUser;

    res.status(201).json({
      message: 'User registered successfully.',
      user: { id: userRef.id, ...userToReturn }
    });

  } catch (error) {
    console.error('REGISTRATION ERROR:', error);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});


// --- User Login ---
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

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    
    // --- FIX: The payload is now "flat" to match the authentication middleware ---
    const payload = {
      userId: userDoc.id,
      email: userData.email,
      type: userData.type,
      name: userData.name
    };
    
    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET || 'your_default_secret_key', 
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: userDoc.id,
        name: userData.name,
        email: userData.email,
        type: userData.type
      }
    });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

export default router;