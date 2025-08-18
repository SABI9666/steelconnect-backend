import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- Debug Routes ---
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth routes are working!', 
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /test',
      'POST /register', 
      'POST /login',
      'POST /login/admin',
      'GET /profile',
      'PUT /profile',
      'PUT /change-password',
      'POST /logout'
    ]
  });
});

// Test route to check if admin login route exists
router.get('/login/admin', (req, res) => {
  res.json({ 
    message: 'Admin login route exists! Use POST method with email and password.',
    method: 'POST',
    requiredFields: ['email', 'password']
  });
});

// List all routes in this router
router.get('/routes', (req, res) => {
  const routes = [];
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      const path = middleware.route.path;
      const methods = Object.keys(middleware.route.methods);
      routes.push({ path, methods });
    }
  });
  res.json({ routes });
});

// --- Admin Login Route ---
router.post('/login/admin', async (req, res) => {
  try {
    console.log('🔐 Admin login attempt received');
    console.log('Request body:', { email: req.body.email, passwordLength: req.body.password?.length });
    
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ 
        error: 'Email and password are required.',
        success: false 
      });
    }

    console.log('Environment check:', {
      hasAdminEmail: !!process.env.ADMIN_EMAIL,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      hasJwtSecret: !!process.env.JWT_SECRET
    });

    // Method 1: Environment Variable Admin (Recommended for simple setup)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      console.log('🔍 Checking environment variable admin credentials');
      
      if (email.toLowerCase().trim() === adminEmail.toLowerCase() && password === adminPassword) {
        console.log('✅ Environment admin login successful');
        
        // Generate JWT token for admin
        const payload = {
          userId: 'admin',
          email: adminEmail,
          type: 'admin',
          name: 'Administrator',
          role: 'admin'
        };

        const token = jwt.sign(
          payload,
          process.env.JWT_SECRET || 'your_default_secret_key_change_in_production',
          { expiresIn: '24h' }
        );

        return res.status(200).json({
          message: 'Admin login successful',
          success: true,
          token: token,
          user: {
            id: 'admin',
            name: 'Administrator',
            email: adminEmail,
            type: 'admin',
            role: 'admin',
            loginAt: new Date().toISOString()
          }
        });
      } else {
        console.log('❌ Environment admin credentials mismatch');
        return res.status(401).json({ 
          error: 'Invalid admin credentials.',
          success: false 
        });
      }
    }

    console.log('🔍 No environment admin found, checking database...');

    // Method 2: Database Admin Check
    try {
      // Check for admin in users collection with admin type
      const usersRef = adminDb.collection('users');
      const userSnapshot = await usersRef
        .where('email', '==', email.toLowerCase().trim())
        .where('type', '==', 'admin')
        .limit(1)
        .get();
      
      if (!userSnapshot.empty) {
        console.log('✅ Found admin in users collection');
        const adminDoc = userSnapshot.docs[0];
        const adminData = adminDoc.data();

        // Verify password
        const isMatch = await bcrypt.compare(password, adminData.password);
        if (!isMatch) {
          console.log('❌ Database admin password mismatch');
          return res.status(401).json({ 
            error: 'Invalid admin credentials.',
            success: false 
          });
        }

        // Update last login
        await adminDoc.ref.update({
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Create JWT payload
        const payload = {
          userId: adminDoc.id,
          email: adminData.email,
          type: 'admin',
          name: adminData.name,
          role: 'admin'
        };

        const token = jwt.sign(
          payload,
          process.env.JWT_SECRET || 'your_default_secret_key_change_in_production',
          { expiresIn: '24h' }
        );

        return res.status(200).json({
          message: 'Admin login successful',
          success: true,
          token: token,
          user: {
            id: adminDoc.id,
            name: adminData.name,
            email: adminData.email,
            type: 'admin',
            role: 'admin',
            lastLoginAt: new Date().toISOString()
          }
        });
      }

      // Check admins collection
      const adminRef = adminDb.collection('admins');
      const adminSnapshot = await adminRef.where('email', '==', email.toLowerCase().trim()).limit(1).get();
      
      if (!adminSnapshot.empty) {
        console.log('✅ Found admin in admins collection');
        const adminDoc = adminSnapshot.docs[0];
        const adminData = adminDoc.data();

        // Verify password
        const isMatch = await bcrypt.compare(password, adminData.password);
        if (!isMatch) {
          console.log('❌ Admins collection password mismatch');
          return res.status(401).json({ 
            error: 'Invalid admin credentials.',
            success: false 
          });
        }

        // Update last login
        await adminDoc.ref.update({
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Create JWT payload
        const payload = {
          userId: adminDoc.id,
          email: adminData.email,
          type: 'admin',
          name: adminData.name || 'Administrator',
          role: 'admin'
        };

        const token = jwt.sign(
          payload,
          process.env.JWT_SECRET || 'your_default_secret_key_change_in_production',
          { expiresIn: '24h' }
        );

        return res.status(200).json({
          message: 'Admin login successful',
          success: true,
          token: token,
          user: {
            id: adminDoc.id,
            name: adminData.name || 'Administrator',
            email: adminData.email,
            type: 'admin',
            role: 'admin',
            lastLoginAt: new Date().toISOString()
          }
        });
      }

      console.log('❌ No admin found in database');
      return res.status(401).json({ 
        error: 'Invalid admin credentials.',
        success: false 
      });

    } catch (dbError) {
      console.error('Database error during admin login:', dbError);
      return res.status(500).json({ 
        error: 'Database error during admin authentication.',
        success: false 
      });
    }

  } catch (error) {
    console.error('ADMIN LOGIN ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred during admin login. Please try again.',
      success: false,
      details: error.message
    });
  }
});

// --- User Registration ---
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, type } = req.body;

    // Validation
    if (!email || !password || !name || !type) {
      return res.status(400).json({ 
        error: 'Email, password, name, and type are required.',
        success: false 
      });
    }

    if (type !== 'contractor' && type !== 'designer') {
      return res.status(400).json({ 
        error: 'User type must be either "contractor" or "designer".',
        success: false 
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Please provide a valid email address.',
        success: false 
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long.',
        success: false 
      });
    }

    // Check if user already exists
    const existingUser = await adminDb.collection('users').where('email', '==', email.toLowerCase()).get();
    if (!existingUser.empty) {
      return res.status(409).json({ 
        error: 'User with this email already exists.',
        success: false 
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user object
    const newUser = {
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name: name.trim(),
      type,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true
    };

    // Save user to database
    const userRef = await adminDb.collection('users').add(newUser);
    
    // Remove password from response
    const { password: _, ...userToReturn } = newUser;

    // Generate JWT token
    const payload = {
      userId: userRef.id,
      email: newUser.email,
      type: newUser.type,
      name: newUser.name
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your_default_secret_key_change_in_production',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully.',
      success: true,
      token,
      user: { 
        id: userRef.id, 
        ...userToReturn 
      }
    });

  } catch (error) {
    console.error('REGISTRATION ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred during registration. Please try again.',
      success: false 
    });
  }
});

// --- User Login ---
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required.',
        success: false 
      });
    }

    // Find user by email
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', email.toLowerCase().trim()).limit(1).get();
    
    if (userSnapshot.empty) {
      return res.status(401).json({ 
        error: 'Invalid credentials.',
        success: false 
      });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    // Check if user is active
    if (userData.isActive === false) {
      return res.status(401).json({ 
        error: 'Account is deactivated. Please contact support.',
        success: false 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid credentials.',
        success: false 
      });
    }

    // Update last login
    await userDoc.ref.update({
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // Create JWT payload (flat structure for middleware compatibility)
    const payload = {
      userId: userDoc.id,
      email: userData.email,
      type: userData.type,
      name: userData.name
    };
    
    // Generate JWT token
    const token = jwt.sign(
      payload, 
      process.env.JWT_SECRET || 'your_default_secret_key_change_in_production', 
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      success: true,
      token: token,
      user: {
        id: userDoc.id,
        name: userData.name,
        email: userData.email,
        type: userData.type,
        createdAt: userData.createdAt,
        lastLoginAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred during login. Please try again.',
      success: false 
    });
  }
});

// --- Get Current User Profile ---
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authorization token required.',
        success: false 
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
      
      // Handle admin profile
      if (decoded.userId === 'admin' || decoded.type === 'admin') {
        return res.status(200).json({
          success: true,
          user: {
            id: decoded.userId,
            name: decoded.name,
            email: decoded.email,
            type: 'admin',
            role: 'admin'
          }
        });
      }
      
      // Get fresh user data from database
      const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          error: 'User not found.',
          success: false 
        });
      }

      const userData = userDoc.data();
      const { password, ...userProfile } = userData;

      res.status(200).json({
        success: true,
        user: {
          id: userDoc.id,
          ...userProfile
        }
      });

    } catch (jwtError) {
      return res.status(401).json({ 
        error: 'Invalid or expired token.',
        success: false 
      });
    }

  } catch (error) {
    console.error('PROFILE ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred while fetching profile.',
      success: false 
    });
  }
});

// Other routes remain the same...
router.put('/profile', async (req, res) => {
  res.json({ message: 'Profile update route - implementation same as before' });
});

router.put('/change-password', async (req, res) => {
  res.json({ message: 'Change password route - implementation same as before' });
});

router.post('/logout', async (req, res) => {
  try {
    res.status(200).json({
      message: 'Logout successful. Please remove the token from client storage.',
      success: true
    });
  } catch (error) {
    console.error('LOGOUT ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred during logout.',
      success: false 
    });
  }
});

export default router;
