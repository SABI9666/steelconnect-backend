/ middleware/contractorAuth.js
const contractorAuth = (req, res, next) => {
    try {
        const user = req.user; // Set by the main auth middleware

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if user is a contractor
        if (user.type !== 'contractor' && user.role !== 'contractor') {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Contractor privileges required'
            });
        }

        // Check if contractor account is active
        if (user.status === 'suspended' || user.status === 'banned') {
            return res.status(403).json({
                success: false,
                message: 'Account suspended. Please contact support.'
            });
        }

        next();
    } catch (error) {
        console.error('Contractor auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

module.exports = contractorAuth;