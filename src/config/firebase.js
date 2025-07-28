// src/config/firebase.js (Corrected)
import admin from 'firebase-admin';

// This should be your project ID from your Firebase project settings
const projectId = process.env.FIREBASE_PROJECT_ID; 

// Check for the required environment variables
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is not set in environment variables.');
}
if (!projectId) {
   throw new Error('FIREBASE_PROJECT_ID is not set in environment variables.');
}

// Decode the Base64 service account key from environment variables
const serviceAccountJson = Buffer.from(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
  'base64'
).toString('utf8');

const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${projectId}.appspot.com` // Important for Firebase Storage
  });
}

// Export the initialized services
const adminDb = admin.firestore();
const adminStorage = admin.storage();

export { admin, adminDb, adminStorage };
## 4. All Controllers (src/controllers/)
All controller files have been converted to ES Modules and their imports have been fixed.

authController.js
JavaScript

// src/controllers/authController.js (Corrected)
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const generateToken = (userId, type) => {
  return jwt.sign({ userId, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

export const register = async (req, res, next) => {
  try {
    const { email, password, name, type } = req.body;
    const existingUser = await adminDb.collection('users').where('email', '==', email).get();
    if (!existingUser.empty) {
      return res.status(409).json({ success: false, message: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userData = {
      email,
      password: hashedPassword,
      name,
      type, // 'contractor' or 'designer'
      createdAt: new Date(),
      isVerified: false, // Could be used for email verification later
    };

    const userRef = await adminDb.collection('users').add(userData);
    const token = generateToken(userRef.id, userData.type);
    
    // Omit password from the returned user object
    const { password: _, ...userToReturn } = userData;

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: { id: userRef.id, ...userToReturn }
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userQuery = await adminDb.collection('users').where('email', '==', email).limit(1).get();
    if (userQuery.empty) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    const isValidPassword = await bcrypt.compare(password, userData.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    await userDoc.ref.update({ lastLogin: new Date() });
    const token = generateToken(userDoc.id, userData.type);
    
    const { password: _, ...userToReturn } = userData;
    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: { id: userDoc.id, ...userToReturn }
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res) => {
  // req.user is populated by the authenticateToken middleware
  res.json({ success: true, user: req.user });
};