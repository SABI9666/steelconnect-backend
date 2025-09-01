import jwt from 'jsonwebtoken';

// Middleware for ANY authenticated user
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token is required.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded; // Adds { userId, name, email, type, role } to the request
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};

// Middleware for Admins ONLY
export const isAdmin = (req, res, next) => {
    authenticate(req, res, () => { // Uses the general authenticate function first
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        next();
    });
};
