import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

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
    // This assumes you have authentication middleware that adds user info to req
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authorization token required.',
        success: false 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
      
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

// --- Update User Profile ---
router.put('/profile', async (req, res) => {
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
      const { name, email } = req.body;

      if (!name && !email) {
        return res.status(400).json({ 
          error: 'At least one field (name or email) is required for update.',
          success: false 
        });
      }

      const updateData = {
        updatedAt: new Date().toISOString()
      };

      if (name) {
        updateData.name = name.trim();
      }

      if (email) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ 
            error: 'Please provide a valid email address.',
            success: false 
          });
        }

        // Check if email is already taken by another user
        const existingUser = await adminDb.collection('users')
          .where('email', '==', email.toLowerCase())
          .get();
        
        if (!existingUser.empty && existingUser.docs[0].id !== decoded.userId) {
          return res.status(409).json({ 
            error: 'Email is already taken by another user.',
            success: false 
          });
        }

        updateData.email = email.toLowerCase().trim();
      }

      // Update user document
      await adminDb.collection('users').doc(decoded.userId).update(updateData);

      // Get updated user data
      const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
      const userData = userDoc.data();
      const { password, ...userProfile } = userData;

      res.status(200).json({
        message: 'Profile updated successfully.',
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
    console.error('PROFILE UPDATE ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred while updating profile.',
      success: false 
    });
  }
});

// --- Change Password ---
router.put('/change-password', async (req, res) => {
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
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          error: 'Current password and new password are required.',
          success: false 
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ 
          error: 'New password must be at least 6 characters long.',
          success: false 
        });
      }

      // Get user document
      const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          error: 'User not found.',
          success: false 
        });
      }

      const userData = userDoc.data();

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, userData.password);
      if (!isMatch) {
        return res.status(401).json({ 
          error: 'Current password is incorrect.',
          success: false 
        });
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await adminDb.collection('users').doc(decoded.userId).update({
        password: hashedNewPassword,
        updatedAt: new Date().toISOString()
      });

      res.status(200).json({
        message: 'Password changed successfully.',
        success: true
      });

    } catch (jwtError) {
      return res.status(401).json({ 
        error: 'Invalid or expired token.',
        success: false 
      });
    }

  } catch (error) {
    console.error('CHANGE PASSWORD ERROR:', error);
    res.status(500).json({ 
      error: 'An error occurred while changing password.',
      success: false 
    });
  }
});

// --- Logout (Optional - mainly for token blacklisting if implemented) ---
router.post('/logout', async (req, res) => {
  try {
    // In a JWT-based system, logout is typically handled client-side by removing the token
    // However, you can implement token blacklisting here if needed
    
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