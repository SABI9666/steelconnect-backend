import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token is required for authentication.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userDoc = await adminDb.collection('users').doc(decoded.userId).get();

    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User associated with this token not found.' });
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
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.type === 'admin') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Admin access is required.' });
  }
};

export const isContractor = (req, res, next) => {
  if (req.user && req.user.type === 'contractor') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Contractor access is required.' });
  }
};

export const isDesigner = (req, res, next) => {
  if (req.user && req.user.type === 'designer') {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Designer access is required.' });
  }
};