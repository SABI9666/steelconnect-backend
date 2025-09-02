// middleware/adminAuth.js
const adminAuth = (req, res, next) => {
    try {
        const user = req.user; // Set by the main auth middleware

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if user is an admin
        if (user.type !== 'admin' && user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Admin privileges required'
            });
        }

        // Check if admin account is active
        if (user.status === 'suspended' || user.status === 'banned') {
            return res.status(403).json({
                success: false,
                message: 'Admin account suspended. Please contact system administrator.'
            });
        }

        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

module.exports = adminAuth;