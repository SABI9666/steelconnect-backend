import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js'; 
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

// --- REGISTRATION ROUTE WITH DETAILED LOGGING ---
router.post('/register', async (req, res) => {
  try {
    const { fullName, username, email, password, role } = req.body;
    console.log('1. REGISTRATION PROCESS STARTED for:', email);

    // 1. Validate input
    if (!fullName || !username || !email || !password || !role) {
      console.log('Error: Missing required fields.');
      return res.status(400).json({ error: 'All fields are required.' });
    }
    console.log('2. Input validation passed.');

    // 2. Check if user already exists
    console.log('3. Connecting to Firestore to check for existing user...');
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email).limit(1).get();
    console.log('4. Firestore check complete.');
    
    if (!userSnapshot.empty) {
      console.log('Error: User with this email already exists.');
      return res.status(409).json({ error: 'User with this email already exists.' });
    }
    console.log('5. User does not exist, proceeding.');

    // 3. Hash the password
    console.log('6. Hashing password...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log('7. Password hashed successfully.');

    // 4. Create and save the new user
    const newUser = {
      fullName,
      username,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date().toISOString(),
    };
    console.log('8. Saving new user to Firestore...');
    const userRecord = await usersRef.add(newUser);
    console.log('9. User saved successfully with ID:', userRecord.id);

    // 5. Send a welcome email via Resend
    console.log('10. Sending welcome email...');
    await sendEmail({
      to: email,
      subject: 'Welcome to SteelConnect!',
      html: `<h1>Hi ${fullName},</h1><p>Thank you for registering at SteelConnect. Your account has been created successfully.</p>`,
    });
    console.log('11. Email sent successfully.');
    
    // 6. Send a final success response
    console.log('12. REGISTRATION COMPLETE. Sending 201 response.');
    res.status(201).json({ 
        message: 'User registered successfully. Please check your email.',
        userId: userRecord.id 
    });

  } catch (error) {
    console.error('CRITICAL ERROR IN /register ROUTE:', error);
    res.status(500).json({ error: 'A critical error occurred during registration.' });
  }
});

// --- Your Login Route and other routes would go here ---
router.post('/login', async (req, res) => {
    // Make sure your login logic is here
    // For now, returning a placeholder
    res.status(501).json({ message: "Login endpoint not fully implemented yet." });
});


export default router;