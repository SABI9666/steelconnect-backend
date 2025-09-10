// src/routes/admin.js - Complete Admin Dashboard Routes
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, adminStorage } from '../config/firebase.js';
import { sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg', 'image/png', 'image/gif', 'text/plain',
            'application/zip', 'application/x-rar-compressed'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Helper function to upload file to Firebase Storage
async function uploadToFirebaseStorage(file, path) {
    try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(path);
        
        const stream = fileRef.createWriteStream({
            metadata: { contentType: file.mimetype },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', async () => {
                try {
                    await fileRef.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
            stream.end(file.buffer);
        });
    } catch (error) {
        throw error;
    }
}

// === DASHBOARD ===
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);
        
        // Get basic statistics
        const [usersSnapshot, jobsSnapshot, quotesSnapshot, estimationsSnapshot, messagesSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('estimations').get(),
            adminDb.collection('messages').get()
        ]);

        // Count user types
        let contractors = 0, designers = 0, pendingReviews = 0;
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') contractors++;
            if (userData.type === 'designer') designers++;
            if (userData.profileCompleted && userData.profileStatus === 'pending') {
                pendingReviews++;
            }
        });

        const stats = {
            totalUsers: usersSnapshot.size,
            totalContractors: contractors,
            totalDesigners: designers,
            totalJobs: jobsSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            totalMessages: messagesSnapshot.size,
            pendingReviews: pendingReviews,
            activeSubscriptions: 0 // Placeholder
        };

        res.json({
            success: true,
            stats,
            adminUser: req.user.email
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

// === USER MANAGEMENT ===
router.get('/users', async (req, res) => {
    try {
        const { role, status } = req.query;
        let query = adminDb.collection('users');
        
        if (role) query = query.where('type', '==', role);
        
        const usersSnapshot = await query.orderBy('createdAt', 'desc').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return {
                _id: doc.id,
                id: doc.id,
                ...userData,
                isActive: userData.canAccess !== false,
            };
        });

        // Filter by profile status if requested
        let filteredUsers = users;
        if (status === 'approved') {
            filteredUsers = users.filter(u => u.profileStatus === 'approved');
        } else if (status === 'pending') {
            filteredUsers = users.filter(u => u.profileStatus === 'pending');
        } else if (status === 'rejected') {
            filteredUsers = users.filter(u => u.profileStatus === 'rejected');
        } else if (status === 'incomplete') {
            filteredUsers = users.filter(u => !u.profileCompleted);
        }

        res.json({ success: true, data: filteredUsers });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

router.get('/users/:userId', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const { password, ...userData } = userDoc.data();
        res.json({
            success: true,
            user: { _id: userDoc.id, id: userDoc.id, ...userData }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user details',
            error: error.message
        });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        await adminDb.collection('users').doc(req.params.userId).update({
            canAccess: isActive,
            statusUpdatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email
        });
        
        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status',
            error: error.message
        });
    }
});

router.post('/users/:userId/toggle-status', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const currentStatus = userDoc.data().canAccess !== false;
        const newStatus = !currentStatus;

        await adminDb.collection('users').doc(req.params.userId).update({
            canAccess: newStatus,
            statusUpdatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email
        });

        res.json({
            success: true,
            message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle user status',
            error: error.message
        });
    }
});

// === JOBS MANAGEMENT ===
router.get('/jobs', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = jobsSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, data: jobs });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching jobs',
            error: error.message
        });
    }
});

router.get('/jobs/:jobId', async (req, res) => {
    try {
        const jobDoc = await adminDb.collection('jobs').doc(req.params.jobId).get();
        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        res.json({
            success: true,
            job: { _id: jobDoc.id, id: jobDoc.id, ...jobDoc.data() }
        });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching job details',
            error: error.message
        });
    }
});

router.patch('/jobs/:jobId/status', async (req, res) => {
    try {
        const { status } = req.body;
        await adminDb.collection('jobs').doc(req.params.jobId).update({
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });

        res.json({ success: true, message: 'Job status updated successfully' });
    } catch (error) {
        console.error('Error updating job status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update job status',
            error: error.message
        });
    }
});

// === QUOTES MANAGEMENT ===
router.get('/quotes', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching quotes',
            error: error.message
        });
    }
});

router.get('/quotes/:quoteId', async (req, res) => {
    try {
        const quoteDoc = await adminDb.collection('quotes').doc(req.params.quoteId).get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        res.json({
            success: true,
            quote: { _id: quoteDoc.id, id: quoteDoc.id, ...quoteDoc.data() }
        });
    } catch (error) {
        console.error('Error fetching quote:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching quote details',
            error: error.message
        });
    }
});

// === ESTIMATIONS MANAGEMENT ===
router.get('/estimations', async (req, res) => {
    try {
        const estimationsSnapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = estimationsSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, data: estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimations',
            error: error.message
        });
    }
});

router.put('/estimations/:estimationId/status', async (req, res) => {
    try {
        const { status } = req.body;
        await adminDb.collection('estimations').doc(req.params.estimationId).update({
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });

        res.json({ success: true, message: 'Estimation status updated successfully' });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update estimation status',
            error: error.message
        });
    }
});

router.post('/estimations/:estimationId/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { notes } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }

        // Check if estimation exists
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Upload result file
        const timestamp = Date.now();
        const filename = `estimation-results/${estimationId}/${timestamp}-${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filename);

        const resultFile = {
            name: req.file.originalname,
            url: fileUrl,
            size: req.file.size,
            type: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.email
        };

        // Update estimation with result
        const updateData = {
            resultFile,
            status: 'completed',
            notes: notes || '',
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            completedBy: req.user.email
        };

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            data: resultFile
        });

    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading estimation result',
            error: error.message
        });
    }
});

router.delete('/estimations/:estimationId', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        await adminDb.collection('estimations').doc(req.params.estimationId).delete();
        
        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting estimation',
            error: error.message
        });
    }
});

// === MESSAGES MANAGEMENT ===
router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = messagesSnapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages',
            error: error.message
        });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Mark as read when admin views it
        if (!messageDoc.data().isRead) {
            await messageDoc.ref.update({
                isRead: true,
                status: 'read',
                readAt: new Date().toISOString(),
                readBy: req.user.email
            });
        }

        res.json({
            success: true,
            data: { _id: messageDoc.id, id: messageDoc.id, ...messageDoc.data() }
        });
    } catch (error) {
        console.error('Error fetching message:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching message',
            error: error.message
        });
    }
});

router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { reply } = req.body;
        if (!reply || reply.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Reply content cannot be empty'
            });
        }

        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const messageData = messageDoc.data();

        // Send email reply to the original sender
        try {
            await sendEmail({
                to: messageData.senderEmail,
                subject: `Re: ${messageData.subject || 'Your message to SteelConnect'}`,
                html: `
                    <h3>Reply from SteelConnect Admin</h3>
                    <p>Dear ${messageData.senderName},</p>
                    <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0;">
                        ${reply.replace(/\n/g, '<br>')}
                    </div>
                    <hr style="margin: 20px 0;">
                    <p><strong>Your original message:</strong></p>
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px;">
                        ${messageData.message.replace(/\n/g, '<br>')}
                    </div>
                    <br>
                    <p>Best regards,<br>The SteelConnect Team</p>
                `
            });
        } catch (emailError) {
            console.error('Failed to send email reply:', emailError);
            // Continue with updating the message status even if email fails
        }

        // Update message status
        await adminDb.collection('messages').doc(req.params.messageId).update({
            status: 'replied',
            isRead: true,
            isReplied: true,
            repliedAt: new Date().toISOString(),
            repliedBy: req.user.email,
            adminReply: reply
        });

        res.json({
            success: true,
            message: 'Reply sent successfully'
        });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send reply',
            error: error.message
        });
    }
});

router.post('/messages/:messageId/block', async (req, res) => {
    try {
        const { block } = req.body;
        const updateData = {
            isBlocked: !!block,
            blockedAt: block ? new Date().toISOString() : null,
            blockedBy: block ? req.user.email : null
        };

        await adminDb.collection('messages').doc(req.params.messageId).update(updateData);
        
        res.json({
            success: true,
            message: `Message ${block ? 'blocked' : 'unblocked'} successfully`
        });
    } catch (error) {
        console.error('Error updating message block status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update block status',
            error: error.message
        });
    }
});

router.delete('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        await adminDb.collection('messages').doc(req.params.messageId).delete();
        
        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting message',
            error: error.message
        });
    }
});

router.post('/messages/mark-all-read', async (req, res) => {
    try {
        const unreadMessages = await adminDb.collection('messages')
            .where('isRead', '==', false)
            .get();

        const batch = adminDb.batch();
        unreadMessages.docs.forEach(doc => {
            batch.update(doc.ref, {
                isRead: true,
                status: 'read',
                readAt: new Date().toISOString(),
                readBy: req.user.email
            });
        });

        await batch.commit();

        res.json({
            success: true,
            message: `${unreadMessages.size} messages marked as read`
        });
    } catch (error) {
        console.error('Error marking all messages as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all messages as read',
            error: error.message
        });
    }
});

// === PROFILE REVIEWS MANAGEMENT ===
router.get('/profile-reviews', async (req, res) => {
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
});

router.get('/profile-reviews/:reviewId', async (req, res) => {
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
            data: { review: review }
        });
    } catch (error) {
        console.error('Error fetching profile review details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile review details',
            error: error.message
        });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
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
});

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
});

// === EXPORT FUNCTIONS ===
router.get('/export/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return userData;
        });

        // Convert to CSV format
        const csvHeaders = 'Name,Email,Type,Status,Profile Status,Created At,Last Login\n';
        const csvData = users.map(user => 
            `"${user.name || ''}","${user.email || ''}","${user.type || ''}","${user.canAccess !== false ? 'Active' : 'Inactive'}","${user.profileStatus || 'Incomplete'}","${user.createdAt || ''}","${user.lastLogin || 'Never'}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
        res.send(csvHeaders + csvData);
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting users',
            error: error.message
        });
    }
});

router.get('/export/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').get();
        const messages = messagesSnapshot.docs.map(doc => doc.data());

        const csvHeaders = 'Sender Name,Sender Email,Subject,Type,Status,Created At,Is Read,Is Blocked\n';
        const csvData = messages.map(msg => 
            `"${msg.senderName || ''}","${msg.senderEmail || ''}","${msg.subject || ''}","${msg.type || ''}","${msg.status || ''}","${msg.createdAt || ''}","${msg.isRead ? 'Yes' : 'No'}","${msg.isBlocked ? 'Yes' : 'No'}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=messages-export.csv');
        res.send(csvHeaders + csvData);
    } catch (error) {
        console.error('Error exporting messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting messages',
            error: error.message
        });
    }
});

export default router;
