// src/routes/admin.js - Complete Admin routes with profile approval
import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { sendProfileApprovalEmail, sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Get all pending profile reviews
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('Admin fetching profile reviews...');
        
        const snapshot = await adminDb.collection('profile_reviews')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        
        const reviews = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`Found ${reviews.length} pending profile reviews`);
        
        res.json({
            success: true,
            data: reviews
        });
    } catch (error) {
        console.error('Error fetching profile reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile reviews'
        });
    }
});

// Get specific profile review
router.get('/profile-reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                id: reviewDoc.id,
                ...reviewDoc.data()
            }
        });
    } catch (error) {
        console.error('Error fetching profile review:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile review'
        });
    }
});

// Approve profile
router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { notes } = req.body;
        const adminEmail = req.user.email;
        
        console.log(`Admin ${adminEmail} approving profile review ${reviewId}`);
        
        // Get the review
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        const reviewData = reviewDoc.data();
        
        if (reviewData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Profile review is not pending'
            });
        }
        
        // Update the review
        await adminDb.collection('profile_reviews').doc(reviewId).update({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminEmail,
            reviewNotes: notes || '',
            updatedAt: new Date().toISOString()
        });
        
        // Update the user's profile status
        await adminDb.collection('users').doc(reviewData.userId).update({
            profileStatus: 'approved',
            canAccess: true,
            approvedAt: new Date().toISOString(),
            approvedBy: adminEmail,
            updatedAt: new Date().toISOString()
        });
        
        // Get user data for email
        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        const userData = userDoc.data();
        
        // Send approval email
        try {
            await sendProfileApprovalEmail(userData, reviewData.userType, notes);
        } catch (emailError) {
            console.error('Failed to send approval email:', emailError);
        }
        
        console.log(`Profile approved: ${userData.email} (${reviewData.userType})`);
        
        res.json({
            success: true,
            message: 'Profile approved successfully'
        });
        
    } catch (error) {
        console.error('Error approving profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving profile'
        });
    }
});

// Reject profile
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason, notes } = req.body;
        const adminEmail = req.user.email;
        
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }
        
        console.log(`Admin ${adminEmail} rejecting profile review ${reviewId}`);
        
        // Get the review
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        const reviewData = reviewDoc.data();
        
        if (reviewData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Profile review is not pending'
            });
        }
        
        // Update the review
        await adminDb.collection('profile_reviews').doc(reviewId).update({
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminEmail,
            rejectionReason: reason,
            reviewNotes: notes || '',
            updatedAt: new Date().toISOString()
        });
        
        // Update the user's profile status
        await adminDb.collection('users').doc(reviewData.userId).update({
            profileStatus: 'rejected',
            canAccess: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminEmail,
            updatedAt: new Date().toISOString()
        });
        
        // Get user data for email
        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        const userData = userDoc.data();
        
        // Send rejection email
        try {
            await sendEmail({
                to: userData.email,
                subject: 'Profile Review Update - SteelConnect',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center;">
                            <h1>Profile Review Update</h1>
                        </div>
                        <div style="padding: 30px;">
                            <h2>Dear ${userData.name},</h2>
                            <p>Thank you for submitting your ${reviewData.userType} profile for review.</p>
                            <p>After careful consideration, we need you to make some updates to your profile before we can approve it.</p>
                            
                            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <h3 style="margin-top: 0; color: #856404;">Required Updates:</h3>
                                <p style="margin-bottom: 0;"><strong>${reason}</strong></p>
                                ${notes ? `<p style="margin-top: 15px; margin-bottom: 0;"><em>Additional Notes:</em> ${notes}</p>` : ''}
                            </div>
                            
                            <p>Please log in to your account and update your profile with the requested information. Once updated, your profile will be automatically resubmitted for review.</p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://steelconnect.com/login" style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                                    Update Profile
                                </a>
                            </div>
                            
                            <p>If you have any questions, please don't hesitate to contact our support team.</p>
                            <p>Thank you for your understanding.</p>
                            <br>
                            <p>The SteelConnect Team</p>
                        </div>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Failed to send rejection email:', emailError);
        }
        
        console.log(`Profile rejected: ${userData.email} (${reviewData.userType}) - Reason: ${reason}`);
        
        res.json({
            success: true,
            message: 'Profile rejected successfully'
        });
        
    } catch (error) {
        console.error('Error rejecting profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting profile'
        });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const { status, type, page = 1, limit = 50 } = req.query;
        
        let query = adminDb.collection('users');
        
        if (status) {
            query = query.where('profileStatus', '==', status);
        }
        
        if (type) {
            query = query.where('type', '==', type);
        }
        
        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();
        
        const users = snapshot.docs.map(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            return {
                id: doc.id,
                ...userWithoutPassword
            };
        });
        
        res.json({
            success: true,
            data: users,
            total: users.length
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users'
        });
    }
});

// Get user by ID
router.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        const { password, ...userWithoutPassword } = userData;
        
        res.json({
            success: true,
            data: {
                id: userDoc.id,
                ...userWithoutPassword
            }
        });
        
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user'
        });
    }
});

// Update user status (suspend/activate)
router.put('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { canAccess, reason } = req.body;
        const adminEmail = req.user.email;
        
        if (typeof canAccess !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'canAccess must be boolean'
            });
        }
        
        const updateData = {
            canAccess,
            updatedAt: new Date().toISOString(),
            statusUpdatedBy: adminEmail,
            statusUpdatedAt: new Date().toISOString()
        };
        
        if (reason) {
            updateData.statusReason = reason;
        }
        
        await adminDb.collection('users').doc(userId).update(updateData);
        
        // Get user data for logging
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();
        
        console.log(`User ${userData.email} ${canAccess ? 'activated' : 'suspended'} by admin ${adminEmail}`);
        
        res.json({
            success: true,
            message: `User ${canAccess ? 'activated' : 'suspended'} successfully`
        });
        
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user status'
        });
    }
});

// Get admin dashboard stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        console.log('Admin fetching dashboard stats...');
        
        // Get user stats
        const usersSnapshot = await adminDb.collection('users').get();
        const allUsers = usersSnapshot.docs.map(doc => doc.data());
        
        const userStats = {
            total: allUsers.length,
            designers: allUsers.filter(u => u.type === 'designer').length,
            contractors: allUsers.filter(u => u.type === 'contractor').length,
            pending: allUsers.filter(u => u.profileStatus === 'pending').length,
            approved: allUsers.filter(u => u.profileStatus === 'approved').length,
            rejected: allUsers.filter(u => u.profileStatus === 'rejected').length
        };
        
        // Get pending reviews count
        const reviewsSnapshot = await adminDb.collection('profile_reviews')
            .where('status', '==', 'pending')
            .get();
        
        const pendingReviews = reviewsSnapshot.size;
        
        // Get recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentUsersSnapshot = await adminDb.collection('users')
            .where('createdAt', '>=', thirtyDaysAgo.toISOString())
            .get();
        
        const recentUsers = recentUsersSnapshot.size;
        
        res.json({
            success: true,
            data: {
                users: userStats,
                pendingReviews,
                recentUsers,
                lastUpdated: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard stats'
        });
    }
});

export default router;
