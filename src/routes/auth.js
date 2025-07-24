import express from 'express';
import bcrypt from 'bcryptjs';
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- REGISTRATION ROUTE ---
router.post('/register', async (req, res) => {
  try {
    const { fullName, username, email, password, role } = req.body;
    console.log('1. REGISTRATION PROCESS STARTED for:', email);

    if (!fullName || !username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    console.log('2. Input validation passed.');

    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();
    console.log('3. Firestore user check complete.');

    if (!userSnapshot.empty) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }
    console.log('4. User does not exist, proceeding.');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('5. Password hashed.');

    const newUser = {
      fullName,
      username,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date().toISOString(),
    };
    const userRecord = await usersRef.add(newUser);
    console.log('6. User saved to Firestore with ID:', userRecord.id);

    await sendEmail({
      to: email,
      subject: 'Welcome to SteelConnect!',
      html: `<h1>Hi ${fullName},</h1><p>Thank you for registering. Your account has been created successfully.</p>`,
    });
    console.log('7. Welcome email sent.');

    console.log('8. REGISTRATION COMPLETE.');
    res.status(201).json({
        message: 'User registered successfully. Please check your email.',
        userId: userRecord.id
    });

  } catch (error) {
    console.error('CRITICAL ERROR IN /register ROUTE:', error);
    res.status(500).json({ error: 'A critical error occurred during registration.' });
  }
});

// --- LOGIN ROUTE ---
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
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: userDocId,
        fullName: userData.fullName,
        email: userData.email,
        role: userData.role
      }
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

export default router;