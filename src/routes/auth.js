import express from 'express';
import jwt from 'jsonwebtoken';
import { admin } from '../config/firebase.js';

const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth route is accessible',
    timestamp: new Date().toISOString()
  });
});

router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to get user from Firebase
    try {
      const user = await admin.auth().getUser(decoded.userId);
      
      res.json({
        success: true,
        user: {
          id: user.uid,
          name: user.displayName || 'Admin User',
          email: user.email || 'admin@steelconnect.com',
          role: user.customClaims?.role || 'admin'
        }
      });
    } catch (firebaseError) {
      // If user doesn't exist in Firebase, return token data
      res.json({
        success: true,
        user: {
          id: decoded.userId,
          name: 'Admin User',
          email: 'admin@steelconnect.com',
          role: 'admin'
        },
        note: 'User verified via JWT, not found in Firebase'
      });
    }
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// Manual admin user creation endpoint
router.post('/create-admin', async (req, res) => {
  try {
    console.log('🔧 Attempting to create admin user manually...');
    
    const auth = admin.auth();
    
    // First, try to get the user to see if it exists
    try {
      const existingUser = await auth.getUser('env_admin');
      return res.json({
        success: true,
        message: 'Admin user already exists',
        user: {
          uid: existingUser.uid,
          email: existingUser.email,
          displayName: existingUser.displayName
        }
      });
    } catch (notFoundError) {
      // User doesn't exist, create it
      console.log('User not found, creating...');
    }
    
    // Create the user
    const userRecord = await auth.createUser({
      uid: 'env_admin',
      email: 'admin@steelconnect.com',
      displayName: 'Environment Admin',
      emailVerified: true,
      password: 'AdminPass123!' // Change this!
    });
    
    console.log('✅ User created:', userRecord.uid);
    
    // Set custom claims
    await auth.setCustomUserClaims('env_admin', {
      role: 'admin',
      type: 'admin',
      createdAt: new Date().toISOString()
    });
    
    console.log('✅ Admin claims set');
    
    res.json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'unknown'
    });
  }
});

// Debug endpoint to check Firebase Auth status
router.get('/firebase-debug', async (req, res) => {
  try {
    const auth = admin.auth();
    
    // Try to list users (this will test if Auth is working)
    const listUsersResult = await auth.listUsers(1);
    
    res.json({
      success: true,
      message: 'Firebase Auth is working',
      projectId: admin.app().options.projectId,
      userCount: listUsersResult.users.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Firebase Auth error',
      details: error.message,
      code: error.code
    });
  }
});

// TEMPORARY LOGIN - REMOVE AFTER FIXING DEPENDENCIES
router.post('/login/admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Admin login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }
    
    // TEMPORARY: Simple email check (NO REAL AUTH FOR NOW)
    if (email !== 'admin@steelconnect.com') {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Generate JWT token with env_admin as userId
    const token = jwt.sign(
      { userId: 'env_admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('Admin login successful (temporary auth):', email);
    
    res.json({
      success: true,
      token,
      user: {
        id: 'env_admin',
        name: 'Admin User',
        email: 'admin@steelconnect.com',
        role: 'admin'
      },
      warning: 'Using temporary authentication'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

export default router;
