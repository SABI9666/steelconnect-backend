import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token is required for authentication.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key');

    // --- FIX: Looks for 'decoded.userId' to correctly read the token payload ---
    if (!decoded || !decoded.userId) {
      return res.status(403).json({ success: false, message: 'Token is malformed or invalid.' });
    }
    const userDoc = await adminDb.collection('users').doc(decoded.userId).get();

    if (!userDoc.exists) {
      return res.status(401).json({ success: false, message: 'User associated with this token not found.' });
    }

    const userData = userDoc.data();
    // Attach user information to the request object
    req.user = {
      id: userDoc.id,
      email: userData.email,
      name: userData.name,
      type: userData.type,
    };

    next();
  } catch (error) {
    console.error("Authentication Error:", error.message);
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

export const isContractor = (req, res, next) => {
    if (req.user && req.user.type === 'contractor') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Access denied. Contractor role required.' });
    }
};