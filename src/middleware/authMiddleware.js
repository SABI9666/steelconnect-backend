import jwt from 'jsonwebtoken';

/**
 * Verifies the JWT token from the Authorization header.
 * If valid, it attaches the decoded user payload to req.user.
 * Use this for any route that requires a logged-in user.
 */
export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization token is required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        req.user = decoded; // Add decoded payload (e.g., userId, email, type) to the request object
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

/**
 * Checks if the user has admin privileges.
 * This middleware must be used *after* the authMiddleware.
 */
export const isAdmin = (req, res, next) => {
    // authMiddleware is expected to have already run and attached req.user
    if (!req.user || (req.user.type !== 'admin' && req.user.role !== 'admin')) {
        return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
    }
    next();
};
