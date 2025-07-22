import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Username, email, and password are required' 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters long' 
      });
    }
    
    // Check if user already exists (implement database check here)
    // const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    // if (existingUser) {
    //   return res.status(400).json({ error: 'User already exists' });
    // }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user (implement database save here)
    const newUser = {
      username,
      email,
      password: hashedPassword,
      fullName: fullName || username,
      role: 'user',
      createdAt: new Date(),
      isActive: true
    };
    
    // Save to database
    // const savedUser = await User.create(newUser);
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: 'user-id', // replace with actual user ID
        username,
        email,
        role: 'user'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        username,
        email,
        fullName: fullName || username,
        role: 'user'
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username and password are required' 
      });
    }
    
    // Find user (implement database query here)
    // const user = await User.findOne({ 
    //   $or: [{ username }, { email: username }] 
    // });
    
    // Mock user for demonstration
    const user = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      password: '$2b$10$hash...', // This should be the actual hashed password from database
      fullName: 'Test User',
      role: 'user',
      isActive: true
    };
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }
    
    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', verifyToken, (req, res) => {
  // For JWT tokens, logout is typically handled on the client side
  // by removing the token from storage. You could implement a token blacklist
  // here if needed for enhanced security.
  
  res.json({ message: 'Logged out successfully' });
});

// GET /auth/profile
router.get('/profile', verifyToken, (req, res) => {
  // Return user profile information
  res.json({
    message: 'User profile',
    user: {
      userId: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// PUT /auth/profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const userId = req.user.userId;
    
    // Validate input
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Update user profile (implement database update here)
    // const updatedUser = await User.findByIdAndUpdate(
    //   userId,
    //   { fullName, email },
    //   { new: true }
    // );
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        userId,
        username: req.user.username,
        email: email || req.user.email,
        fullName: fullName || req.user.fullName,
        role: req.user.role
      }
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /auth/change-password
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;
    
    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'New password must be at least 6 characters long' 
      });
    }
    
    // Get user from database
    // const user = await User.findById(userId);
    // if (!user) {
    //   return res.status(404).json({ error: 'User not found' });
    // }
    
    // Verify current password
    // const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    // if (!isCurrentPasswordValid) {
    //   return res.status(401).json({ error: 'Current password is incorrect' });
    // }
    
    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password in database
    // await User.findByIdAndUpdate(userId, { password: hashedNewPassword });
    
    res.json({ message: 'Password changed successfully' });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/refresh-token
router.post('/refresh-token', verifyToken, (req, res) => {
  // Generate new token with extended expiry
  const newToken = jwt.sign(
    { 
      userId: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );
  
  res.json({
    message: 'Token refreshed successfully',
    token: newToken
  });
});

// Export the verifyToken middleware so it can be used in other routes
export { verifyToken };

export default router;

