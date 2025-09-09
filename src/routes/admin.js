// COMPLETE PROFILE REVIEW SYSTEM FIX
// Replace your existing admin route handlers with these

import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// === PROFILE REVIEW ROUTES ===

// Get all profile reviews (pending and completed)
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('🔍 [ADMIN] Fetching profile reviews...');
        
        // Get all users with profile data
        const usersSnapshot = await adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .orderBy('createdAt', 'desc')
            .get();
        
        const reviews = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            // Only include users who have submitted profiles
            if (userData.profileCompleted === true) {
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
                    profileData: userData,
                    user: {
                        id: doc.id,
                        name: userData.name,
                        email: userData.email,
                        type: userData.type,
                        profileStatus: userData.profileStatus,
                        ...userWithoutPassword
                    }
                });
            }
        });
        
        console.log(`✅ [ADMIN] Found ${reviews.length} profile reviews`);
        
        res.json({
            success: true,
            data: reviews
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching profile reviews:', error);
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
        console.log('🔍 [ADMIN] Fetching pending profile reviews...');
        
        const usersSnapshot = await adminDb.collection('users')
            .where('profileStatus', '==', 'pending')
            .where('profileCompleted', '==', true)
            .orderBy('createdAt', 'desc')
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
                profileData: userData,
                user: {
                    id: doc.id,
                    name: userData.name,
                    email: userData.email,
                    type: userData.type,
                    ...userWithoutPassword
                }
            });
        });
        
        console.log(`✅ [ADMIN] Found ${reviews.length} pending reviews`);
        
        res.json({
            success: true,
            data: reviews
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching pending reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending profile reviews',
            error: error.message
        });
    }
});

// Get specific profile review
router.get('/profile-reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
        console.log(`🔍 [ADMIN] Fetching profile review: ${reviewId}`);
        
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
            profileData: userData,
            user: {
                id: userDoc.id,
                name: userData.name,
                email: userData.email,
                type: userData.type,
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
        console.error('❌ [ADMIN] Error fetching profile review:', error);
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
        
        console.log(`✅ [ADMIN] Approving profile: ${reviewId}`);
        
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
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
        
        console.log(`✅ [ADMIN] Profile approved for: ${userData.email}`);
        
        res.json({
            success: true,
            message: 'Profile approved successfully'
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error approving profile:', error);
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
        
        console.log(`❌ [ADMIN] Rejecting profile: ${reviewId}`);
        
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
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
        
        console.log(`❌ [ADMIN] Profile rejected for: ${userData.email}`);
        
        res.json({
            success: true,
            message: 'Profile rejected successfully'
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error rejecting profile:', error);
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
        console.log('📊 [ADMIN] Fetching profile statistics...');
        
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
        
        console.log('📊 [ADMIN] Profile stats:', stats);
        
        res.json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching profile statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile statistics',
            error: error.message
        });
    }
});

// === DEBUG & TESTING ROUTES ===

// Debug route to check profile system
router.get('/debug/profiles', async (req, res) => {
    try {
        console.log('🐛 [DEBUG] Checking profile system...');
        
        // Get all users
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
        
        console.log('🐛 [DEBUG] Profile system breakdown:', userBreakdown);
        
        res.json({
            success: true,
            data: {
                message: 'Profile system debug complete',
                breakdown: userBreakdown,
                recommendations: generateRecommendations(userBreakdown)
            }
        });
        
    } catch (error) {
        console.error('❌ [DEBUG] Error in profile debug:', error);
        res.status(500).json({
            success: false,
            message: 'Debug failed',
            error: error.message
        });
    }
});

// Create test users for testing profile reviews
router.post('/debug/create-test-users', async (req, res) => {
    try {
        console.log('🧪 [TEST] Creating test users...');
        
        const testUsers = [
            {
                name: 'John Designer Test',
                email: `john.designer.test.${Date.now()}@example.com`,
                type: 'designer',
                profileCompleted: true,
                profileStatus: 'pending',
                canAccess: false,
                createdAt: new Date().toISOString(),
                submittedAt: new Date().toISOString(),
                skills: ['AutoCAD', 'Revit', 'Structural Analysis'],
                experience: '5 years in structural engineering',
                education: 'Masters in Civil Engineering'
            },
            {
                name: 'Jane Contractor Test',
                email: `jane.contractor.test.${Date.now()}@example.com`,
                type: 'contractor',
                profileCompleted: true,
                profileStatus: 'pending',
                canAccess: false,
                createdAt: new Date().toISOString(),
                submittedAt: new Date().toISOString(),
                companyName: 'Test Construction LLC',
                businessType: 'Construction',
                yearEstablished: 2015
            }
        ];
        
        const createdUsers = [];
        
        for (const userData of testUsers) {
            const userRef = await adminDb.collection('users').add(userData);
            createdUsers.push({
                id: userRef.id,
                email: userData.email,
                name: userData.name,
                type: userData.type
            });
            
            console.log(`✅ [TEST] Created test user: ${userData.name} (${userRef.id})`);
        }
        
        res.json({
            success: true,
            message: `Created ${createdUsers.length} test users`,
            data: createdUsers
        });
        
    } catch (error) {
        console.error('❌ [TEST] Error creating test users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create test users',
            error: error.message
        });
    }
});

// Helper function to generate recommendations
function generateRecommendations(breakdown) {
    const recommendations = [];
    
    if (breakdown.profileCompleted === 0) {
        recommendations.push({
            type: 'warning',
            message: 'No users have completed their profiles yet',
            action: 'Create test users or check profile completion workflow'
        });
    }
    
    if (breakdown.byProfileStatus.pending === 0) {
        recommendations.push({
            type: 'info',
            message: 'No pending profile reviews',
            action: 'This is normal if all profiles have been reviewed'
        });
    } else if (breakdown.byProfileStatus.pending > 0) {
        recommendations.push({
            type: 'action',
            message: `${breakdown.byProfileStatus.pending} profiles need review`,
            action: 'Review pending profiles to give users access'
        });
    }
    
    if (breakdown.byType.admin > 0 && breakdown.byType.admin === breakdown.total) {
        recommendations.push({
            type: 'warning',
            message: 'Only admin users found',
            action: 'Regular users need to register as designers or contractors'
        });
    }
    
    return recommendations;
}

export default router;
