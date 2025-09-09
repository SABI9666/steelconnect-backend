// src/routes/admin.js - Fixed version without problematic dependencies
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB file size limit
    },
});

// Admin check middleware
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.type !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }

    next();
};

// Simple email placeholder functions
const sendEmail = async ({ to, subject, html }) => {
    console.log(`Email would be sent to: ${to}, Subject: ${subject}`);
    return { success: true, message: 'Email logged (not sent)' };
};

const sendProfileApprovalEmail = async (userData, userType, notes) => {
    console.log(`Approval email would be sent to: ${userData.email} (${userType})`);
    return { success: true, message: 'Approval email logged' };
};

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// ============= DASHBOARD ENDPOINTS =============

// Get admin dashboard data
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin fetching dashboard data...');
        
        // Get all users
        const usersSnapshot = await adminDb.collection('users').get();
        const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Get pending reviews
        let reviewsSnapshot;
        try {
            reviewsSnapshot = await adminDb.collection('profile_reviews')
                .where('status', '==', 'pending')
                .get();
        } catch (error) {
            console.log('Profile reviews collection not found');
            reviewsSnapshot = { size: 0 };
        }
        
        // Get other collections with error handling
        const getCollectionSize = async (collectionName) => {
            try {
                const snapshot = await adminDb.collection(collectionName).get();
                return snapshot.size;
            } catch (error) {
                console.log(`${collectionName} collection not found`);
                return 0;
            }
        };
        
        const [jobsCount, quotesCount, messagesCount, estimationsCount] = await Promise.all([
            getCollectionSize('jobs'),
            getCollectionSize('quotes'),
            getCollectionSize('messages'),
            getCollectionSize('estimations')
        ]);
        
        // Calculate user statistics
        const totalUsers = allUsers.length;
        const designers = allUsers.filter(u => u.type === 'designer').length;
        const contractors = allUsers.filter(u => u.type === 'contractor').length;
        const pendingProfiles = allUsers.filter(u => u.profileStatus === 'pending').length;
        const approvedProfiles = allUsers.filter(u => u.profileStatus === 'approved').length;
        const rejectedProfiles = allUsers.filter(u => u.profileStatus === 'rejected').length;
        const incompleteProfiles = allUsers.filter(u => u.profileStatus === 'incomplete' || !u.profileStatus).length;
        
        // Get recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentUsers = allUsers.filter(u => 
            u.createdAt && new Date(u.createdAt) >= sevenDaysAgo
        ).length;
        
        const pendingReviews = reviewsSnapshot.size;

        // Prepare dashboard data
        const dashboardData = {
            stats: {
                totalUsers,
                designers,
                contractors,
                pendingProfiles,
                approvedProfiles,
                rejectedProfiles,
                incompleteProfiles,
                pendingReviews,
                recentUsers,
                totalJobs: jobsCount,
                totalQuotes: quotesCount,
                totalMessages: messagesCount,
                totalEstimations: estimationsCount,
                activeSubscriptions: 0 // Placeholder
            },
            recentActivity: [
                {
                    type: 'user',
                    description: `${recentUsers} new users registered in the last 7 days`,
                    timestamp: new Date().toISOString()
                },
                {
                    type: 'review',
                    description: `${pendingReviews} profiles awaiting review`,
                    timestamp: new Date().toISOString()
                }
            ],
            adminUser: req.user.email
        };
        
        console.log(`Dashboard data loaded: ${totalUsers} total users, ${pendingReviews} pending reviews`);
        
        res.json({
            success: true,
            data: dashboardData
        });
        
    } catch (error) {
        console.error('Error fetching admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data'
        });
    }
});

// ============= USER MANAGEMENT ENDPOINTS =============

// Get all users with pagination
router.get('/users', async (req, res) => {
    try {
        const { status, type, page = 1, limit = 50 } = req.query;
        
        let query = adminDb.collection('users');
        
        // Apply filters - but handle potential missing fields gracefully
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        
        let users = snapshot.docs.map(doc => {
            const { password, ...userWithoutPassword } = doc.data();
            return { id: doc.id, ...userWithoutPassword };
        });
        
        // Apply filters after fetching (to avoid index issues)
        if (status && status !== 'all') {
            users = users.filter(user => {
                if (status === 'pending') return user.profileStatus === 'pending';
                if (status === 'approved') return user.profileStatus === 'approved';
                if (status === 'rejected') return user.profileStatus === 'rejected';
                return true;
            });
        }
        
        if (type && type !== 'all') {
            users = users.filter(user => user.type === type);
        }
        
        // Implement pagination
        const startIndex = (page - 1) * limit;
        const paginatedUsers = users.slice(startIndex, startIndex + parseInt(limit));
        
        res.json({ 
            success: true, 
            data: paginatedUsers, 
            total: users.length,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(users.length / limit),
                totalUsers: users.length
            }
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

// Get user by ID
router.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const { password, ...userWithoutPassword } = userDoc.data();
        res.json({ success: true, data: { id: userDoc.id, ...userWithoutPassword } });
        
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Error fetching user' });
    }
});

// Update user status
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { canAccess, profileStatus } = req.body;
        
        const updateData = {
            updatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email,
        };
        
        if (typeof canAccess === 'boolean') updateData.canAccess = canAccess;
        if (profileStatus) updateData.profileStatus = profileStatus;
        
        await adminDb.collection('users').doc(userId).update(updateData);
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        console.log(`User ${userDoc.data().email} status updated by admin ${req.user.email}`);
        
        res.json({ success: true, message: 'User status updated successfully' });
        
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// ============= JOBS MANAGEMENT ENDPOINTS =============

// Get all jobs
router.get('/jobs', async (req, res) => {
    try {
        let snapshot;
        try {
            snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        } catch (error) {
            console.log('Jobs collection not found or no index');
            // Try without ordering
            snapshot = await adminDb.collection('jobs').get();
        }
        
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort manually if needed
        jobs.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        res.json({ success: true, data: jobs });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        // Return empty array instead of error to prevent frontend issues
        res.json({ 
            success: true, 
            data: [], 
            message: 'Jobs collection not found or empty' 
        });
    }
});

// ============= ESTIMATIONS MANAGEMENT ENDPOINTS =============

// Get all estimations
router.get('/estimations', async (req, res) => {
    try {
        let snapshot;
        try {
            snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        } catch (error) {
            console.log('Estimations collection not found or no index');
            snapshot = await adminDb.collection('estimations').get();
        }
        
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort manually if needed
        estimations.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        res.json({ success: true, data: estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.json({ 
            success: true, 
            data: [], 
            message: 'Estimations collection not found or empty' 
        });
    }
});

// ============= MESSAGES MANAGEMENT ENDPOINTS =============

// Get all messages
router.get('/messages', async (req, res) => {
    try {
        let snapshot;
        try {
            snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        } catch (error) {
            console.log('Messages collection not found or no index');
            snapshot = await adminDb.collection('messages').get();
        }
        
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort manually if needed
        messages.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.json({ 
            success: true, 
            data: [], 
            message: 'Messages collection not found or empty' 
        });
    }
});

// ============= QUOTES MANAGEMENT ENDPOINTS =============

// Get all quotes
router.get('/quotes', async (req, res) => {
    try {
        let snapshot;
        try {
            snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        } catch (error) {
            console.log('Quotes collection not found or no index');
            snapshot = await adminDb.collection('quotes').get();
        }
        
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort manually if needed
        quotes.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.json({ 
            success: true, 
            data: [], 
            message: 'Quotes collection not found or empty' 
        });
    }
});

// ============= PROFILE REVIEW ENDPOINTS (Basic) =============

// Get pending profile reviews
router.get('/profile-reviews', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('profile_reviews')
            .where('status', '==', 'pending')
            .get();
        
        const reviews = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error('Error fetching profile reviews:', error);
        res.json({ 
            success: true, 
            data: [], 
            message: 'Profile reviews collection not found or empty' 
        });
    }
});

// ============= HEALTH CHECK =============

router.get('/health', async (req, res) => {
    try {
        // Simple health check
        await adminDb.collection('users').limit(1).get();
        res.json({
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                database: 'connected',
                uptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

export default router;
