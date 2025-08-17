import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { admin, adminDb } from '../config/firebase.js'; // <-- CORRECT IMPORT

const router = express.Router();

// JWT Secret (MUST be set as an environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET;
const SETUP_KEY = process.env.ADMIN_SETUP_KEY;

// Hash password utility
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Compare password utility
const comparePassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      type: user.type 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// 🔧 ADMIN SETUP ROUTE - Use this to create/reset admin user
router.post('/setup/admin', async (req, res) => {
  try {
    const { email, password, setupKey } = req.body;
    
    // Security check - only allow setup with the special key from env
    if (setupKey !== SETUP_KEY) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid setup key' 
      });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if admin already exists
    const adminRef = adminDb.collection('users');
    const existingAdmin = await adminRef
      .where('email', '==', email)
      .where('type', '==', 'admin')
      .get();

    if (!existingAdmin.empty) {
      console.log('🔄 Admin user already exists, updating password...');
      
      // Update existing admin
      const adminDoc = existingAdmin.docs[0];
      const hashedPassword = await hashPassword(password);
      
      await adminDoc.ref.update({
        password: hashedPassword,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ Admin password updated successfully');
      return res.json({
        success: true,
        message: 'Admin user updated successfully',
        email: email
      });
    }

    // Create new admin user
    console.log('🔄 Creating new admin user...');
    const hashedPassword = await hashPassword(password);
    
    const adminUser = {
      email: email,
      password: hashedPassword,
      type: 'admin',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await adminRef.add(adminUser);
    console.log('✅ Admin user created with ID:', docRef.id);

    res.json({
      success: true,
      message: 'Admin user created successfully',
      email: email,
      id: docRef.id
    });

  } catch (error) {
    console.error('❌ Error in admin setup:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔐 ADMIN LOGIN ROUTE
router.post('/login/admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 Admin login attempt:', { 
      email, 
      passwordExists: !!password,
      timestamp: new Date().toISOString()
    });

    // Validate input
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query database for admin user
    console.log('🔍 Querying database for admin user...');
    const adminRef = adminDb.collection('users');
    const adminQuery = await adminRef
      .where('email', '==', email)
      .where('type', '==', 'admin')
      .get();

    console.log('🔍 Database query result:', { 
      empty: adminQuery.empty, 
      size: adminQuery.size 
    });

    if (adminQuery.empty) {
      console.log('❌ Admin user not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const adminDoc = adminQuery.docs[0];
    const adminData = adminDoc.data();
    
    console.log('🔍 Found user:', {
      id: adminDoc.id,
      email: adminData.email,
      type: adminData.type,
      isActive: adminData.isActive,
      hasPassword: !!adminData.password
    });

    // Check if account is active
    if (adminData.isActive === false) {
      console.log('❌ Admin account is inactive');
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    // Compare passwords
    console.log('🔍 Comparing passwords...');
    const isPasswordValid = await comparePassword(password, adminData.password);
    console.log('🔍 Password match result:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Password does not match for admin user');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const user = {
      id: adminDoc.id,
      email: adminData.email,
      type: adminData.type
    };

    const token = generateToken(user);

    // Update last login
    await adminDoc.ref.update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Admin login successful');

    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        type: user.type
      }
    });

  } catch (error) {
    console.error('❌ Error in admin login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔓 REGULAR USER LOGIN (if needed)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Query for regular user
    const userRef = adminDb.collection('users');
    const userQuery = await userRef
      .where('email', '==', email)
      .where('type', '==', 'user')
      .get();

    if (userQuery.empty) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();

    if (userData.isActive === false) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    const isPasswordValid = await comparePassword(password, userData.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = {
      id: userDoc.id,
      email: userData.email,
      type: userData.type
    };

    const token = generateToken(user);

    await userDoc.ref.update({
      lastLogin: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: user
    });

  } catch (error) {
    console.error('❌ Error in user login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 🔑 MIDDLEWARE - Verify JWT Token
export const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// 🔑 MIDDLEWARE - Verify Admin
export const verifyAdmin = (req, res, next) => {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// 📊 GET CURRENT USER INFO
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userDoc = await adminDb.collection('users').doc(req.user.id).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();
    
    res.json({
      success: true,
      user: {
        id: userDoc.id,
        email: userData.email,
        type: userData.type,
        isActive: userData.isActive,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin
      }
    });
  } catch (error) {
    console.error('❌ Error getting user info:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 🚪 LOGOUT (Optional - mainly for token blacklisting if implemented)
router.post('/logout', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;
