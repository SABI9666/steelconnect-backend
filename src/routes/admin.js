import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Import Firebase (adjust path as needed)
let db;
try {
    const { db: firebaseDb } = await import('../config/firebase.js');
    db = firebaseDb;
    console.log('✅ Firebase connected for admin routes');
} catch (error) {
    console.error('❌ Firebase connection failed in admin routes:', error);
}

// Middleware to verify admin access
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            error: 'Authorization token is required.' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        // Check if the user has the 'admin' role
        if (decoded.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Access denied. Admin privileges required.' 
            });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token.' 
        });
    }
};

// GET /api/admin/dashboard
router.get('/dashboard', verifyAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        // Get counts from Firebase collections
        const usersPromise = db.collection('users').get();
        const messagesPromise = db.collection('messages').get();
        const quotesPromise = db.collection('quotes').get();

        const [usersSnapshot, messagesSnapshot, quotesSnapshot] = await Promise.all([
            usersPromise, 
            messagesPromise, 
            quotesPromise
        ]);

        res.json({ 
            success: true,
            stats: {
                totalUsers: usersSnapshot.size,
                totalMessages: messagesSnapshot.size,
                totalQuotes: quotesSnapshot.size
            }
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load dashboard data' 
        });
    }
});

// GET /api/admin/users - Get all users
router.get('/users', verifyAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const userData = doc.data();
            // Don't send password in response
            const { password, ...userWithoutPassword } = userData;
            return { 
                id: doc.id, 
                ...userWithoutPassword,
                status: userData.status || 'active' // Default status if not set
            };
        });

        res.json({ 
            success: true,
            users 
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load user data' 
        });
    }
});

// PUT /api/admin/users/:id/status - Update user status
router.put('/users/:id/status', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status. Must be "active" or "suspended"' 
            });
        }

        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        await db.collection('users').doc(id).update({
            status: status,
            updatedAt: new Date().toISOString()
        });

        res.json({ 
            success: true,
            message: `User status updated to ${status}`,
            userId: id,
            newStatus: status
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update user status' 
        });
    }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        // Check if user exists
        const userDoc = await db.collection('users').doc(id).get();
        if (!userDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Delete user
        await db.collection('users').doc(id).delete();

        res.json({ 
            success: true,
            message: 'User deleted successfully',
            deletedUserId: id
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete user' 
        });
    }
});

// GET /api/admin/messages - Get all messages for moderation
router.get('/messages', verifyAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        const messagesSnapshot = await db.collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
            
        const messages = messagesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ 
            success: true,
            messages 
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load messages' 
        });
    }
});

// DELETE /api/admin/messages/:id - Delete message
router.delete('/messages/:id', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        await db.collection('messages').doc(id).delete();

        res.json({ 
            success: true,
            message: 'Message deleted successfully',
            deletedMessageId: id
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete message' 
        });
    }
});

// GET /api/admin/quotes - Get all quotes for approval
router.get('/quotes', verifyAdmin, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        const quotesSnapshot = await db.collection('quotes')
            .orderBy('createdAt', 'desc')
            .get();
            
        const quotes = quotesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ 
            success: true,
            quotes 
        });
    } catch (error) {
        console.error('Get quotes error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load quotes' 
        });
    }
});

// PUT /api/admin/quotes/:id/approve - Approve quote
router.put('/quotes/:id/approve', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        await db.collection('quotes').doc(id).update({
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email
        });

        res.json({ 
            success: true,
            message: 'Quote approved successfully',
            approvedQuoteId: id
        });
    } catch (error) {
        console.error('Approve quote error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to approve quote' 
        });
    }
});

// PUT /api/admin/quotes/:id/reject - Reject quote
router.put('/quotes/:id/reject', verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!db) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database connection not available' 
            });
        }

        await db.collection('quotes').doc(id).update({
            status: 'rejected',
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            rejectionReason: reason || 'No reason provided'
        });

        res.json({ 
            success: true,
            message: 'Quote rejected',
            rejectedQuoteId: id,
            reason: reason || 'No reason provided'
        });
    } catch (error) {
        console.error('Reject quote error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to reject quote' 
        });
    }
});

// GET /api/admin/system-stats - Get system statistics
router.get('/system-stats', verifyAdmin, (req, res) => {
    try {
        res.json({
            success: true,
            stats: {
                serverUptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('System stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get system stats' 
        });
    }
});

export default router;
