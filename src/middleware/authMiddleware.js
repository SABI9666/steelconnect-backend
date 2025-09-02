import jwt from 'jsonwebtoken';

// This function decodes the token and attaches the user payload to the request.
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // This is a more appropriate error for a missing token
        return res.status(401).json({ success: false, error: 'Authorization token is required.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token not found.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        req.user = decoded; // Attach decoded user info to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

// This function checks if the authenticated user has admin privileges.
export const isAdmin = (req, res, next) => {
    // It checks the req.user object that was set by authenticateToken
    if (req.user && (req.user.role === 'admin' || req.user.type === 'admin')) {
        next(); // User is an admin, proceed
    } else {
        return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
    }
};

// Middleware to check if the user is a contractor
export const isContractor = (req, res, next) => {
    if (req.user && req.user.type === 'contractor') {
        next();
    } else {
        return res.status(403).json({ success: false, error: 'Access denied. Contractor privileges required.' });
    }
};
