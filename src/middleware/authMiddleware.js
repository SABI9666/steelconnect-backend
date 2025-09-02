import jwt from 'jsonwebtoken';

/**
 * Verifies the JWT from the request header or a query parameter.
 * Attaches the decoded user payload to `req.user`.
 */
export const authenticateToken = (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Standard token from header
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        // Token from URL query parameter (for file downloads)
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ success: false, error: 'Authorization token is required.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        req.user = decoded; // Attach decoded user info to the request
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

/**
 * Checks if the authenticated user has admin privileges.
 * This MUST run after authenticateToken.
 */
export const isAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.type === 'admin')) {
        next(); // User is an admin, proceed
    } else {
        return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
    }
};

/**
 * Checks if the authenticated user is a contractor.
 * This MUST run after authenticateToken.
 */
export const isContractor = (req, res, next) => {
    if (req.user && req.user.type === 'contractor') {
        next();
    } else {
        return res.status(403).json({ success: false, error: 'Access denied. Contractor privileges required.' });
    }
};

/**
 * Checks if the authenticated user is a designer.
 * This MUST run after authenticateToken.
 */
export const isDesigner = (req, res, next) => {
    if (req.user && req.user.type === 'designer') {
        next();
    } else {
        return res.status(403).json({ success: false, error: 'Access denied. Designer privileges required.' });
    }
};
