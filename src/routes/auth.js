import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Test endpoint (ADD THIS - needed by admin panel)
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Auth route is accessible',
    timestamp: new Date().toISOString()
  });
});

// Verify token endpoint (ADD THIS - needed by admin panel)
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
    
    // Check if it's environment admin
    if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
      return res.json({
        success: true,
        user: {
          _id: 'env_admin',
          name: 'Environment Admin',
          email: process.env.ADMIN_EMAIL || 'admin@steelconnect.com',
          role: 'admin',
          type: 'admin'
        }
      });
    }
    
    // Check Firebase for regular users
    const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
    
    if (!userDoc.exists) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      user: {
        _id: userDoc.id,
        name: userData.name,
        email: userData.email,
        role: userData.role || userData.type, // Support both fields
        type: userData.type
      }
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// --- Your existing Admin Login Route (KEEP AS IS) ---
router.post('/login/admin', async (req, res) => {
    try {
        console.log('--- ADMIN LOGIN ATTEMPT ---');
        const { email, password } = req.body;

        if (!email || !password) {
            console.log('❌ Login failed: Missing email or password.');
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        console.log(`Step 1: Received login request for email: ${email}`);

        // Method 1: Environment Variable Admin (Backup)
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (adminEmail && adminPassword && email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
            console.log('✅ Success via environment variable admin.');
            const payload = {
                userId: 'env_admin',
                email: adminEmail,
                type: 'admin',
                name: 'Environment Admin',
                role: 'admin'
            };
            const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '24h' });
            return res.status(200).json({
                message: 'Admin login successful',
                success: true,
                token: token,
                user: { 
                    _id: 'env_admin', // Change 'id' to '_id' for admin panel compatibility
                    name: 'Environment Admin', 
                    email: adminEmail, 
                    type: 'admin', 
                    role: 'admin' 
                }
            });
        }
        console.log('Step 2: Not an environment variable admin. Checking Firestore...');

        // Method 2: Database Admin Check
        if (!adminDb) {
            console.error('❌ FATAL: adminDb is not available! Check firebase.js initialization.');
            return res.status(500).json({ error: 'Database service is not available.' });
        }

        console.log('Step 3: Querying the "users" collection...');
        const usersRef = adminDb.collection('users');
        const userSnapshot = await usersRef
            .where('email', '==', email.toLowerCase().trim())
            .where('type', '==', 'admin')
            .limit(1)
            .get();

        console.log(`Step 4: Firestore query completed. Found ${userSnapshot.size} matching document(s).`);
        if (userSnapshot.empty) {
            console.log('❌ Login failed: No user found in Firestore with that email and type="admin".');
            return res.status(401).json({ error: 'Invalid admin credentials.' });
        }

        console.log('Step 5: User document found. Checking password...');
        const adminDoc = userSnapshot.docs[0];
        const adminData = adminDoc.data();

        const isMatch = await bcrypt.compare(password, adminData.password);
        if (!isMatch) {
            console.log('❌ Login failed: Password does not match.');
            return res.status(401).json({ error: 'Invalid admin credentials.' });
        }

        console.log('✅ Step 6: Password matches! Login successful.');
        const payload = {
            userId: adminDoc.id,
            email: adminData.email,
            type: 'admin',
            name: adminData.name,
            role: 'admin'
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '24h' });
        return res.status(200).json({
            message: 'Admin login successful',
            success: true,
            token: token,
            user: { 
                _id: adminDoc.id, // Change 'id' to '_id' for admin panel compatibility
                name: adminData.name, 
                email: adminData.email, 
                type: 'admin', 
                role: 'admin' 
            }
        });

    } catch (error) {
        console.error('🔴 CATASTROPHIC ERROR in /login/admin route:', error);
        res.status(500).json({
            error: 'A server error occurred during admin login.',
            details: error.message
        });
    }
});

// --- Your existing Regular User Registration (KEEP AS IS) ---
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, type } = req.body;

        if (!email || !password || !name || !type) {
            return res.status(400).json({ error: 'Email, password, name, and type are required.' });
        }
        if (type !== 'contractor' && type !== 'designer') {
            return res.status(400).json({ error: 'User type must be either "contractor" or "designer".' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        const existingUser = await adminDb.collection('users').where('email', '==', email.toLowerCase()).get();
        if (!existingUser.empty) {
            return res.status(409).json({ error: 'User with this email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            name: name.trim(),
            type,
            role: type, // Add role field for admin panel compatibility
            status: 'active',
            isActive: true, // Add isActive field for admin panel compatibility
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            subscription: { status: 'inactive', endDate: null }
        };

        const userRef = await adminDb.collection('users').add(newUser);
        const { password: _, ...userToReturn } = newUser;

        const payload = { userId: userRef.id, email: newUser.email, type: newUser.type, name: newUser.name };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '7d' });

        res.status(201).json({
            message: 'User registered successfully.',
            success: true,
            token,
            user: { _id: userRef.id, ...userToReturn } // Change 'id' to '_id'
        });

    } catch (error) {
        console.error('REGISTRATION ERROR:', error);
        res.status(500).json({ error: 'An error occurred during registration.' });
    }
});

// --- Your existing Regular User Login (KEEP AS IS) ---
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const userSnapshot = await adminDb.collection('users')
            .where('email', '==', email.toLowerCase().trim())
            .where('type', 'in', ['contractor', 'designer'])
            .limit(1)
            .get();

        if (userSnapshot.empty) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();

        if (userData.status === 'suspended') {
            return res.status(403).json({ error: 'Your account has been suspended.' });
        }

        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const payload = { userId: userDoc.id, email: userData.email, type: userData.type, name: userData.name };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'your_secret', { expiresIn: '7d' });

        res.status(200).json({
            message: 'Login successful',
            success: true,
            token: token,
            user: {
                _id: userDoc.id, // Change 'id' to '_id' for admin panel compatibility
                name: userData.name,
                email: userData.email,
                type: userData.type,
                role: userData.role || userData.type // Support both fields
            }
        });

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ error: 'An error occurred during login.' });
    }
});

// Change password endpoint (ADD THIS - useful for admin panel)
router.patch('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    // Environment admin cannot change password
    if (decoded.userId === 'env_admin') {
      return res.status(400).json({
        success: false,
        error: 'Environment admin password cannot be changed via API'
      });
    }
    
    // Get user from Firebase
    const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDoc.data();
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password in Firebase
    await adminDb.collection('users').doc(decoded.userId).update({
      password: hashedNewPassword,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Password changed for user:', decoded.email);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

export default router;
