// Complete corrected admin.js routes
import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// Dashboard endpoint
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);

        // Get basic statistics
        const stats = {
            totalUsers: 0,
            contractors: 0,
            designers: 0,
            totalJobs: 0,
            totalQuotes: 0,
            totalEstimations: 0,
            totalMessages: 0,
            totalSubscriptions: 0,
            pendingReviews: 0
        };

        // Get user statistics
        const usersSnapshot = await adminDb.collection('users').get();
        stats.totalUsers = usersSnapshot.size;
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') stats.contractors++;
            if (userData.type === 'designer') stats.designers++;
        });

        // Get profile review statistics
        const profileReviewsSnapshot = await adminDb.collection('users')
            .where('profileCompleted', '==', true)
            .where('profileStatus', '==', 'pending')
            .get();
        stats.pendingReviews = profileReviewsSnapshot.size;

        res.json({
            success: true,
            data: {
                stats,
                adminUser: req.user.email,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard data',
            error: error.message
        });
    }
});

// Profile Reviews Management Routes
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('Fetching all profile reviews...');

        // Get all users with completed profiles
        const usersSnapshot = await adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .where('profileCompleted', '==', true)
            .orderBy('submittedAt', 'desc')
            .get();

        const reviews = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            reviews.push({
                _id: doc.id,
                id: doc.id,
                userId: doc.id,
                userEmail: userData.email,
                userName: userData.name,
                userType: userData.type,
                status: userData.profileStatus || 'pending',
                createdAt: userData.submittedAt || userData.createdAt,
                reviewedAt: userData.reviewedAt,
                reviewedBy: userData.reviewedBy,
                reviewNotes: userData.reviewNotes || userData.rejectionReason,
                user: {
                    id: doc.id,
                    ...userWithoutPassword
                }
            });
        });

        console.log(`Found ${reviews.length} profile reviews`);

        res.json({
            success: true,
            data: reviews
        });

    } catch (error) {
        console.error('Error fetching profile reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile reviews',
            error: error.message
        });
    }
});

// Get pending profile reviews only
router.get('/profile-reviews/pending', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users')
            .where('profileStatus', '==', 'pending')
            .where('profileCompleted', '==', true)
            .orderBy('submittedAt', 'desc')
            .get();

        const reviews = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            reviews.push({
                _id: doc.id,
                id: doc.id,
                userId: doc.id,
                userEmail: userData.email,
                userName: userData.name,
                userType: userData.type,
                status: 'pending',
                createdAt: userData.submittedAt || userData.createdAt,
                user: {
                    id: doc.id,
                    ...userWithoutPassword
                }
            });
        });

        res.json({
            success: true,
            data: reviews
        });

    } catch (error) {
        console.error('Error fetching pending reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending reviews',
            error: error.message
        });
    }
});

// Get specific profile review
router.get('/profile-reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
        console.log(`Fetching profile review: ${reviewId}`);

        const userDoc = await adminDb.collection('users').doc(reviewId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }

        const userData = userDoc.data();
        const { password, ...userWithoutPassword } = userData;

        const review = {
            _id: userDoc.id,
            id: userDoc.id,
            userId: userDoc.id,
            userEmail: userData.email,
            userName: userData.name,
            userType: userData.type,
            status: userData.profileStatus || 'pending',
            createdAt: userData.submittedAt || userData.createdAt,
            reviewedAt: userData.reviewedAt,
            reviewedBy: userData.reviewedBy,
            reviewNotes: userData.reviewNotes || userData.rejectionReason,
            user: {
                id: userDoc.id,
                ...userWithoutPassword
            }
        };

        res.json({
            success: true,
            data: {
                review: review
            }
        });

    } catch (error) {
        console.error('Error fetching profile review:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile review details',
            error: error.message
        });
    }
});

// Approve profile
router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { notes } = req.body;
        const adminUser = req.user;

        console.log(`Approving profile: ${reviewId} by ${adminUser.email}`);

        const userDoc = await adminDb.collection('users').doc(reviewId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user status
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'approved',
            canAccess: true,
            approvedAt: new Date().toISOString(),
            approvedBy: adminUser.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminUser.email,
            reviewNotes: notes || 'Profile approved by admin'
        });

        console.log(`Profile approved for user: ${reviewId}`);

        res.json({
            success: true,
            message: 'Profile approved successfully'
        });

    } catch (error) {
        console.error('Error approving profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving profile',
            error: error.message
        });
    }
});

// Reject profile
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason } = req.body;
        const adminUser = req.user;

        if (!reason || reason.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        console.log(`Rejecting profile: ${reviewId} by ${adminUser.email}`);

        const userDoc = await adminDb.collection('users').doc(reviewId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user status
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'rejected',
            canAccess: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminUser.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminUser.email,
            reviewNotes: reason
        });

        console.log(`Profile rejected for user: ${reviewId}`);

        res.json({
            success: true,
            message: 'Profile rejected successfully'
        });

    } catch (error) {
        console.error('Error rejecting profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting profile',
            error: error.message
        });
    }
});

// Get profile statistics
router.get('/profile-stats', async (req, res) => {
    try {
        console.log('Fetching profile statistics...');

        const usersSnapshot = await adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .get();

        let total = 0;
        let pending = 0;
        let approved = 0;
        let rejected = 0;
        let pendingDesigners = 0;
        let pendingContractors = 0;

        usersSnapshot.forEach(doc => {
            const userData = doc.data();

            // Only count users who have completed their profile
            if (userData.profileCompleted === true) {
                total++;
                const status = userData.profileStatus || 'pending';

                if (status === 'pending') {
                    pending++;
                    if (userData.type === 'designer') pendingDesigners++;
                    if (userData.type === 'contractor') pendingContractors++;
                } else if (status === 'approved') {
                    approved++;
                } else if (status === 'rejected') {
                    rejected++;
                }
            }
        });

        const stats = {
            total,
            pending,
            approved,
            rejected,
            pendingDesigners,
            pendingContractors
        };

        console.log('Profile stats:', stats);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        console.error('Error fetching profile statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile statistics',
            error: error.message
        });
    }
});

// Debug profile system
router.get('/debug/profiles', async (req, res) => {
    try {
        console.log('Running profile system debug...');

        const allUsersSnapshot = await adminDb.collection('users').get();

        const userBreakdown = {
            total: allUsersSnapshot.size,
            byType: {},
            byProfileStatus: {},
            profileCompleted: 0,
            profileNotCompleted: 0,
            sampleUsers: []
        };

        allUsersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...safeUserData } = userData;

            // Count by type
            const userType = userData.type || 'unknown';
            userBreakdown.byType[userType] = (userBreakdown.byType[userType] || 0) + 1;

            // Count by profile status
            const profileStatus = userData.profileStatus || 'none';
            userBreakdown.byProfileStatus[profileStatus] = (userBreakdown.byProfileStatus[profileStatus] || 0) + 1;

            // Count profile completion
            if (userData.profileCompleted === true) {
                userBreakdown.profileCompleted++;
            } else {
                userBreakdown.profileNotCompleted++;
            }

            // Add sample users (first 5)
            if (userBreakdown.sampleUsers.length < 5) {
                userBreakdown.sampleUsers.push({
                    id: doc.id,
                    name: userData.name,
                    email: userData.email,
                    type: userData.type,
                    profileCompleted: userData.profileCompleted,
                    profileStatus: userData.profileStatus,
                    canAccess: userData.canAccess
                });
            }
        });

        console.log('Profile system breakdown:', userBreakdown);

        res.json({
            success: true,
            data: {
                message: 'Profile system debug complete',
                breakdown: userBreakdown
            }
        });

    } catch (error) {
        console.error('Error in profile debug:', error);
        res.status(500).json({
            success: false,
            message: 'Debug failed',
            error: error.message
        });
    }
});

// Basic users endpoint for compatibility
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            users.push({
                _id: doc.id,
                id: doc.id,
                ...userWithoutPassword
            });
        });

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

export default router;
