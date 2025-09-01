import jwt from 'jsonwebtoken';

/**
 * Middleware to authenticate users using a JWT.
 * It checks for a valid token in the Authorization header.
 */
export const authenticate = (req, res, next) => {
    // Look for the token in the Authorization header.
    const authHeader = req.headers.authorization;

    // If the header is missing or doesn't start with "Bearer ", the user is unauthorized.
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authorization token is required.' 
        });
    }

    // Extract the token from the header (format: "Bearer <token>").
    const token = authHeader.split(' ')[1];

    try {
        // Verify the token using the secret key.
        // This will throw an error if the token is invalid or expired.
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_default_secret_key_change_in_production');
        
        // If the token is valid, add the decoded user payload to the request object.
        // This makes the user's information (like ID and email) available to the route handlers.
        req.user = decoded; 
        
        // Pass control to the next middleware or the route handler.
        next();
    } catch (error) {
        // If verification fails, the token is invalid or expired.
        console.error('❌ JWT Verification Error:', error.message);
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token.' 
        });
    }
};

/**
 * Middleware to check if the authenticated user is an admin.
 * This should be used *after* the `authenticate` middleware.
 */
export const isAdmin = (req, res, next) => {
    // The `authenticate` middleware should have already run and added `req.user`.
    if (!req.user || (req.user.type !== 'admin' && req.user.role !== 'admin')) {
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.' 
        });
    }
    next();
};

