import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- Admin Login Route ---
router.post('/login/admin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    // Method 1: Environment Variable Admin
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword && email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
        // CORRECTED: Use 'id' instead of 'userId'
        const payload = {
          id: 'env_admin',
          email: adminEmail,
          type: 'admin',
          name: 'Administrator',
          role: 'admin'
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production', { expiresIn: '8h' });
        return res.json({ success: true, message: 'Admin login successful', token, user: payload });
    }

    // Method 2: Database Admin Check
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email.toLowerCase()).where('type', '==', 'admin').limit(1).get();
    
    if (userSnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
    }

    const adminDoc = userSnapshot.docs[0];
    const adminData = adminDoc.data();

    const isMatch = await bcrypt.compare(password, adminData.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid admin credentials.' });
    }

    // CORRECTED: Use 'id' instead of 'userId'
    const payload = {
      id: adminDoc.id,
      email: adminData.email,
      type: 'admin',
      name: adminData.name,
      role: 'admin'
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production', { expiresIn: '8h' });
    
    await adminDoc.ref.update({ lastLoginAt: new Date().toISOString() });
    
    res.json({ success: true, message: 'Admin login successful', token, user: payload });

  } catch (error) {
    console.error('ADMIN LOGIN ERROR:', error);
    res.status(500).json({ success: false, error: 'An internal error occurred during admin login.' });
  }
});

// --- User Registration ---
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, type } = req.body;

    if (!email || !password || !name || !type) {
      return res.status(400).json({ success: false, error: 'Email, password, name, and type are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await adminDb.collection('users').where('email', '==', email.toLowerCase()).get();
    if (!existingUser.empty) {
      return res.status(409).json({ success: false, error: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    const userRef = await adminDb.collection('users').add(newUser);
    const { password: _, ...userToReturn } = newUser;

    res.status(201).json({
      message: 'User registered successfully.',
      success: true,
      user: { id: userRef.id, ...userToReturn }
    });

  } catch (error) {
    console.error('REGISTRATION ERROR:', error);
    res.status(500).json({ success: false, error: 'An error occurred during registration.' });
  }
});

// --- Regular User Login (Contractors & Designers) ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email.toLowerCase().trim()).limit(1).get();
    
    if (userSnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.isActive === false) {
      return res.status(401).json({ success: false, error: 'Account is deactivated. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    await userDoc.ref.update({ lastLoginAt: new Date().toISOString() });
    
    // CORRECTED: Use 'id' instead of 'userId'
    const payload = {
      id: userDoc.id,
      email: userData.email,
      type: userData.type,
      name: userData.name
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production', { expiresIn: '7d' });

    res.status(200).json({
      message: 'Login successful',
      success: true,
      token: token,
      user: {
        id: userDoc.id,
        name: userData.name,
        email: userData.email,
        type: userData.type,
      }
    });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ success: false, error: 'An error occurred during login.' });
  }
});

export default router;
