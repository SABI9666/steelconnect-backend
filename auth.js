import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Make sure your path to firebase config and mailer is correct
import { adminDb } from '../config/firebase.js'; 
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- START: REGISTRATION ROUTE ---
router.post('/register', async (req, res) => {
  try {
    const { fullName, username, email, password, role } = req.body;

    // 1. Validate input
    if (!fullName || !username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // 2. Check if user already exists
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();
    if (!userSnapshot.empty) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create and save the new user
    const newUser = {
      fullName,
      username,
      email,
      password: hashedPassword,
      role, // 'contractor' or 'designer'
      createdAt: new Date().toISOString(),
    };
    const userRecord = await usersRef.add(newUser);

    // 5. Send a welcome email
    await sendEmail({
      to: email,
      subject: 'Welcome to SteelConnect!',
      html: `<h1>Hi ${fullName},</h1><p>Thank you for registering at SteelConnect. Your account has been created successfully.</p>`,
    });
    
    // 6. Send a success response
    res.status(201).json({ 
        message: 'User registered successfully. Please check your email.',
        userId: userRecord.id 
    });

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'An error occurred during registration.' });
  }
});
// --- END: REGISTRATION ROUTE ---


// Your other routes (login, forgot-password, etc.) and exports would go here...

// Your existing /login route...
router.post('/login', async (req, res) => {
  // ... existing code for login
});

// ... and so on

export default router;