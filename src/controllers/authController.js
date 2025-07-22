const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const generateToken = (userId, type) => {
  return jwt.sign({ userId, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const register = async (req, res, next) => {
  try {
    const { email, password, name, type } = req.body;
    const existingUser = await db.collection('users').where('email', '==', email).get();
    if (!existingUser.empty) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userData = {
      email,
      password: hashedPassword,
      name,
      type, // 'contractor', 'designer', or 'admin'
      createdAt: new Date(),
      isVerified: false,
    };

    const userRef = await db.collection('users').add(userData);
    const token = generateToken(userRef.id, userData.type);
    
    const { password: _, ...userToReturn } = userData;
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: { id: userRef.id, ...userToReturn }
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userQuery = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userQuery.empty) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    const isValidPassword = await bcrypt.compare(password, userData.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    await userDoc.ref.update({ lastLogin: new Date() });
    const token = generateToken(userDoc.id, userData.type);
    
    const { password: _, ...userToReturn } = userData;
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: userDoc.id, ...userToReturn }
    });
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res) => {
  res.json({ success: true, user: req.user });
};

module.exports = { register, login, getProfile };