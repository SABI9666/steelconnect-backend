// Enhanced adminController.js - Add profile review functions
import { adminDb } from '../config/firebase.js';
import { sendEmail } from '../utils/emailService.js';

// Get all pending profile reviews
export const getPendingProfileReviews = async (req, res) => {
    try {
        console.log('Fetching pending profile reviews...');
        const snapshot = await adminDb.collection('profile_reviews')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .get();
        
        const reviews = [];
        for (const doc of snapshot.docs) {
            const reviewData = doc.data();
            
            // Get full user data
            let userData = null;
            try {
                const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for review: ${reviewData.userId}`);
            }
            
            reviews.push({
                _id: doc.id,
                id: doc.id,
                ...reviewData,
                user: userData
            });
        }
        
        res.json({
            success: true,
            data: reviews
        });
    } catch (error) {
        console.error('Error fetching pending profile reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile reviews',
            error: error.message
        });
    }
};

// Get all profile reviews (with status filter)
export const getAllProfileReviews = async (req, res) => {
    try {
        const { status } = req.query;
        console.log('Fetching profile reviews with status:', status);
        
        let query = adminDb.collection('profile_reviews');
        
        if (status && status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        
        const reviews = [];
        for (const doc of snapshot.docs) {
            const reviewData = doc.data();
            
            // Get full user data
            let userData = null;
            try {
                const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for review: ${reviewData.userId}`);
            }
            
            reviews.push({
                _id: doc.id,
                id: doc.id,
                ...reviewData,
                user: userData
            });
        }
        
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
};

// Get single profile review details
export const getProfileReviewById = async (req, res) => {
    try {
        const { reviewId } = req.params;
        console.log(`Fetching profile review details for ID: ${reviewId}`);
        
        const doc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        const reviewData = doc.data();
        
        // Get full user data
        let userData = null;
        try {
            const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
            if (userDoc.exists) {
                const { password, ...userInfo } = userDoc.data();
                userData = { id: userDoc.id, ...userInfo };
            }
        } catch (userError) {
            console.warn(`Could not fetch user data for review: ${reviewData.userId}`);
        }
        
        const review = {
            _id: doc.id,
            id: doc.id,
            ...reviewData,
            user: userData
        };
        
        res.json({
            success: true,
            data: {
                review: review
            }
        });
    } catch (error) {
        console.error('Error fetching profile review details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile review details',
            error: error.message
        });
    }
};

// Approve profile
export const approveProfile = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { notes } = req.body;
        const adminUser = req.user;
        
        console.log(`Approving profile review: ${reviewId}`);
        
        // Get review data
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        const reviewData = reviewDoc.data();
        
        // Update review status
        await adminDb.collection('profile_reviews').doc(reviewId).update({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminUser.email,
            reviewNotes: notes || 'Profile approved by admin'
        });
        
        // Update user status
        await adminDb.collection('users').doc(reviewData.userId).update({
            profileStatus: 'approved',
            canAccess: true,
            approvedAt: new Date().toISOString(),
            approvedBy: adminUser.email
        });
        
        // Send approval email to user
        try {
            await sendEmail({
                to: reviewData.userEmail,
                subject: 'Profile Approved - Welcome to SteelConnect!',
                html: `
                    <h2>Profile Approved!</h2>
                    <p>Dear ${reviewData.userName},</p>
                    <p>Congratulations! Your profile has been approved by our admin team.</p>
                    <p>You now have full access to your SteelConnect ${reviewData.userType} portal.</p>
                    <p>You can now:</p>
                    <ul>
                        ${reviewData.userType === 'designer' ? `
                            <li>Browse and quote on available projects</li>
                            <li>Manage your submitted quotes</li>
                            <li>Communicate with clients</li>
                        ` : `
                            <li>Post new projects</li>
                            <li>Review and approve quotes</li>
                            <li>Use AI cost estimation tools</li>
                            <li>Manage approved projects</li>
                        `}
                    </ul>
                    ${notes ? `<p><strong>Admin Note:</strong> ${notes}</p>` : ''}
                    <p>Welcome to the SteelConnect community!</p>
                    <br>
                    <p>The SteelConnect Team</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send approval email:', emailError);
            // Don't fail the request if email fails
        }
        
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
};

// Reject profile
export const rejectProfile = async (req, res) => {
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
        
        console.log(`Rejecting profile review: ${reviewId}`);
        
        // Get review data
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Profile review not found'
            });
        }
        
        const reviewData = reviewDoc.data();
        
        // Update review status
        await adminDb.collection('profile_reviews').doc(reviewId).update({
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminUser.email,
            reviewNotes: reason,
            rejectionReason: reason
        });
        
        // Update user status
        await adminDb.collection('users').doc(reviewData.userId).update({
            profileStatus: 'rejected',
            canAccess: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminUser.email
        });
        
        // Send rejection email to user
        try {
            await sendEmail({
                to: reviewData.userEmail,
                subject: 'Profile Review Update - SteelConnect',
                html: `
                    <h2>Profile Review Update</h2>
                    <p>Dear ${reviewData.userName},</p>
                    <p>Thank you for submitting your profile for review. After careful consideration, we need you to make some updates before we can approve your profile.</p>
                    <p><strong>Reason for rejection:</strong></p>
                    <p>${reason}</p>
                    <p>Please log in to your account and update your profile with the necessary changes. Once updated, your profile will be automatically resubmitted for review.</p>
                    <p>If you have any questions, please don't hesitate to contact our support team.</p>
                    <br>
                    <p>The SteelConnect Team</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send rejection email:', emailError);
            // Don't fail the request if email fails
        }
        
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
};

// Get profile statistics
export const getProfileStats = async (req, res) => {
    try {
        console.log('Fetching profile statistics...');
        
        const [pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
            adminDb.collection('profile_reviews').where('status', '==', 'pending').get(),
            adminDb.collection('profile_reviews').where('status', '==', 'approved').get(),
            adminDb.collection('profile_reviews').where('status', '==', 'rejected').get()
        ]);
        
        // Get user type breakdown for pending reviews
        const pendingDesigners = [];
        const pendingContractors = [];
        
        pendingSnapshot.docs.forEach(doc => {
            const reviewData = doc.data();
            if (reviewData.userType === 'designer') {
                pendingDesigners.push(reviewData);
            } else if (reviewData.userType === 'contractor') {
                pendingContractors.push(reviewData);
            }
        });
        
        const stats = {
            total: pendingSnapshot.size + approvedSnapshot.size + rejectedSnapshot.size,
            pending: pendingSnapshot.size,
            approved: approvedSnapshot.size,
            rejected: rejectedSnapshot.size,
            pendingDesigners: pendingDesigners.length,
            pendingContractors: pendingContractors.length
        };
        
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
};
