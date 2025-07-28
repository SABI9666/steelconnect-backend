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