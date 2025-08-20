import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
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
    
    // TEMPORARY: Find user by email only (NO PASSWORD CHECK)
    // THIS IS INSECURE - ONLY FOR TESTING
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // TEMPORARY: Check if user is admin (SKIP PASSWORD FOR NOW)
    if (user.role !== 'admin' && user.type !== 'admin') {
      console.log('User is not admin:', email, 'Role:', user.role);
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('Admin login successful (NO PASSWORD CHECK):', email);
    
    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      warning: 'Password check disabled - fix bcryptjs dependency'
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
