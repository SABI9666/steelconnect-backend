const jwt = require('jsonwebtoken');
const { db } = require('../config/firebase');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userDoc = await db.collection('users').doc(decoded.userId).get();

    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const userData = userDoc.data();
    req.user = {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      type: userData.type,
      isVerified: userData.isVerified
    };

    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.type !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const isContractor = (req, res, next) => {
  if (req.user.type !== 'contractor') {
    return res.status(403).json({ success: false, message: 'Contractor access required' });
  }
  next();
};

const isDesigner = (req, res, next) => {
  if (req.user.type !== 'designer') {
    return res.status(403).json({ success: false, message: 'Designer access required' });
  }
  next();
};

module.exports = {
  authenticateToken,
  isAdmin,
  isContractor,
  isDesigner
};