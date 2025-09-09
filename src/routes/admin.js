// src/routes/admin.js - Complete Admin routes with profile approval and dashboard
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, adminStorage } from '../config/firebase.js'; // Assuming adminStorage is exported from your firebase config
import { sendProfileApprovalEmail, sendEmail } from '../utils/emailService.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB file size limit
    },
});

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// ============= DASHBOARD ENDPOINTS =============

// Get admin dashboard data
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin fetching dashboard data...');
        
        // Asynchronously fetch all data
        const [
            usersSnapshot, 
            reviewsSnapshot, 
            jobsSnapshot, 
            quotesSnapshot, 
            messagesSnapshot, 
            estimationsSnapshot
        ] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('profile_reviews').where('status', '==', 'pending').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('estimations').get()
        ]);

        const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
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

        // Prepare dashboard data with real counts
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
                // Additional stats - now with real data
                totalJobs: jobsSnapshot.size,
                totalQuotes: quotesSnapshot.size,
                totalMessages: messagesSnapshot.size,
                totalEstimations: estimationsSnapshot.size,
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

// ============= PROFILE REVIEW ENDPOINTS =============

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
        
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        if (reviewData.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Profile review is not pending' });
        }
        
        const batch = adminDb.batch();
        const reviewRef = adminDb.collection('profile_reviews').doc(reviewId);
        const userRef = adminDb.collection('users').doc(reviewData.userId);

        batch.update(reviewRef, {
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminEmail,
            reviewNotes: notes || '',
            updatedAt: new Date().toISOString()
        });
        
        batch.update(userRef, {
            profileStatus: 'approved',
            canAccess: true,
            approvedAt: new Date().toISOString(),
            approvedBy: adminEmail,
            updatedAt: new Date().toISOString()
        });
        
        await batch.commit();

        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        const userData = userDoc.data();
        
        await sendProfileApprovalEmail(userData, reviewData.userType, notes).catch(emailError => {
            console.error('Failed to send approval email:', emailError);
        });
        
        console.log(`Profile approved: ${userData.email} (${reviewData.userType})`);
        
        res.json({ success: true, message: 'Profile approved successfully' });
        
    } catch (error) {
        console.error('Error approving profile:', error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

// Reject profile
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason, notes } = req.body;
        const adminEmail = req.user.email;
        
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }
        
        console.log(`Admin ${adminEmail} rejecting profile review ${reviewId}`);
        
        const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
        
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        if (reviewData.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Profile review is not pending' });
        }
        
        const batch = adminDb.batch();
        const reviewRef = adminDb.collection('profile_reviews').doc(reviewId);
        const userRef = adminDb.collection('users').doc(reviewData.userId);
        
        batch.update(reviewRef, {
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminEmail,
            rejectionReason: reason,
            reviewNotes: notes || '',
            updatedAt: new Date().toISOString()
        });
        
        batch.update(userRef, {
            profileStatus: 'rejected',
            canAccess: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminEmail,
            updatedAt: new Date().toISOString()
        });
        
        await batch.commit();

        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        const userData = userDoc.data();
        
        const emailHtml = `
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
                    
                    <p>Thank you for your understanding.</p>
                    <br>
                    <p>The SteelConnect Team</p>
                </div>
            </div>
        `;

        await sendEmail({ to: userData.email, subject: 'Profile Review Update - SteelConnect', html: emailHtml }).catch(emailError => {
            console.error('Failed to send rejection email:', emailError);
        });
        
        console.log(`Profile rejected: ${userData.email} (${reviewData.userType}) - Reason: ${reason}`);
        
        res.json({ success: true, message: 'Profile rejected successfully' });
        
    } catch (error) {
        console.error('Error rejecting profile:', error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// Bulk approve profiles
router.post('/profile-reviews/bulk-approve', async (req, res) => {
    try {
        const { reviewIds } = req.body;
        const adminEmail = req.user.email;
        
        if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Review IDs array is required' });
        }
        
        let approved = 0;
        let failed = 0;
        
        const promises = reviewIds.map(async (reviewId) => {
            try {
                const reviewDoc = await adminDb.collection('profile_reviews').doc(reviewId).get();
                
                if (!reviewDoc.exists || reviewDoc.data().status !== 'pending') {
                    failed++;
                    return;
                }
                
                const reviewData = reviewDoc.data();
                
                const batch = adminDb.batch();
                const reviewRef = adminDb.collection('profile_reviews').doc(reviewId);
                const userRef = adminDb.collection('users').doc(reviewData.userId);

                batch.update(reviewRef, {
                    status: 'approved',
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: adminEmail,
                    reviewNotes: 'Bulk approval',
                    updatedAt: new Date().toISOString()
                });
                
                batch.update(userRef, {
                    profileStatus: 'approved',
                    canAccess: true,
                    approvedAt: new Date().toISOString(),
                    approvedBy: adminEmail,
                    updatedAt: new Date().toISOString()
                });
                
                await batch.commit();
                
                const userDoc = await userRef.get();
                const userData = userDoc.data();
                
                await sendProfileApprovalEmail(userData, reviewData.userType, 'Your profile has been approved.').catch(emailError => {
                    console.error(`Failed to send bulk approval email for ${userData.email}:`, emailError);
                });
                
                approved++;
            } catch (error) {
                console.error(`Error approving profile ${reviewId}:`, error);
                failed++;
            }
        });
        
        await Promise.all(promises);

        console.log(`Bulk approval completed: ${approved} approved, ${failed} failed`);
        
        res.json({
            success: true,
            message: `Bulk approval completed: ${approved} approved, ${failed} failed`,
            approved,
            failed
        });
        
    } catch (error) {
        console.error('Error in bulk approval:', error);
        res.status(500).json({ success: false, message: 'Error in bulk approval' });
    }
});


// ============= USER MANAGEMENT ENDPOINTS =============

// Get all users with pagination
router.get('/users', async (req, res) => {
    try {
        const { status, type, page = 1, limit = 50 } = req.query;
        
        let query = adminDb.collection('users');
        
        if (status) query = query.where('profileStatus', '==', status);
        if (type && type !== 'admin') query = query.where('type', '==', type);
        
        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((page - 1) * limit)
            .get();
        
        const users = snapshot.docs.map(doc => {
            const { password, ...userWithoutPassword } = doc.data();
            return { id: doc.id, ...userWithoutPassword };
        });
        
        res.json({ success: true, data: users, total: users.length });
        
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

// Update user status (suspend/activate)
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, canAccess } = req.body;
        
        const updateData = {
            updatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email,
        };
        
        if (typeof isActive === 'boolean') updateData.isActive = isActive;
        if (typeof canAccess === 'boolean') updateData.canAccess = canAccess;
        
        await adminDb.collection('users').doc(userId).update(updateData);
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const action = canAccess ? 'activated' : 'suspended';
        console.log(`User ${userDoc.data().email} ${action} by admin ${req.user.email}`);
        
        res.json({ success: true, message: `User ${action} successfully` });
        
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        await adminDb.collection('users').doc(userId).delete();
        console.log(`User deleted: ${userDoc.data().email} by admin ${req.user.email}`);
        
        res.json({ success: true, message: 'User deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
});

// ============= JOBS MANAGEMENT ENDPOINTS =============

// Get all jobs
router.get('/jobs', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: jobs });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ success: false, message: 'Error fetching jobs' });
    }
});

// Get job by ID
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) return res.status(404).json({ success: false, message: 'Job not found' });
        res.json({ success: true, data: { id: jobDoc.id, ...jobDoc.data() } });
    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({ success: false, message: 'Error fetching job' });
    }
});

// Update job status
router.patch('/jobs/:jobId/status', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

        await adminDb.collection('jobs').doc(jobId).update({
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });
        console.log(`Job ${jobId} status updated to ${status} by ${req.user.email}`);
        res.json({ success: true, message: 'Job status updated successfully' });
    } catch (error) {
        console.error('Error updating job status:', error);
        res.status(500).json({ success: false, message: 'Error updating job status' });
    }
});

// Delete job
router.delete('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) return res.status(404).json({ success: false, message: 'Job not found' });
        await adminDb.collection('jobs').doc(jobId).delete();
        console.log(`Job ${jobId} deleted by admin ${req.user.email}`);
        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ success: false, message: 'Error deleting job' });
    }
});

// ============= QUOTES MANAGEMENT ENDPOINTS =============

// Get all quotes
router.get('/quotes', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
});

// Delete quote
router.delete('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
        if (!quoteDoc.exists) return res.status(404).json({ success: false, message: 'Quote not found' });
        await adminDb.collection('quotes').doc(quoteId).delete();
        console.log(`Quote ${quoteId} deleted by admin ${req.user.email}`);
        res.json({ success: true, message: 'Quote deleted successfully' });
    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).json({ success: false, message: 'Error deleting quote' });
    }
});

// ============= ESTIMATIONS MANAGEMENT ENDPOINTS =============

// Get all estimations
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
});

// Generate a secure download URL for an estimation file
router.post('/estimations/generate-download-url', async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) {
            return res.status(400).json({ success: false, message: 'File path is required.' });
        }

        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        };

        const [url] = await adminStorage.bucket().file(filePath).getSignedUrl(options);
        res.json({ success: true, url });

    } catch (error) {
        console.error('Error generating download URL:', error);
        res.status(500).json({ success: false, message: 'Could not generate download URL.' });
    }
});

// Upload a result file for an estimation
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const adminEmail = req.user.email;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Result file is required.' });
        }

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }

        const bucket = adminStorage.bucket();
        const filePath = `estimations/results/${estimationId}/${Date.now()}-${req.file.originalname}`;
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype },
        });

        const resultFile = {
            name: req.file.originalname,
            path: filePath,
            size: req.file.size,
            type: req.file.mimetype,
            uploadedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(estimationId).update({
            resultFile,
            status: 'completed',
            updatedAt: new Date().toISOString(),
            updatedBy: adminEmail,
        });

        console.log(`Result uploaded for estimation ${estimationId} by ${adminEmail}`);
        res.json({ success: true, message: 'Result file uploaded successfully.', data: resultFile });

    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({ success: false, message: 'Error uploading result file.' });
    }
});


// Delete estimation
router.delete('/estimations/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        
        // Optional: Delete associated files from storage
        const estimationData = estimationDoc.data();
        const filesToDelete = [...(estimationData.uploadedFiles || []), estimationData.resultFile].filter(Boolean);
        for (const file of filesToDelete) {
            if (file.path) {
                await adminStorage.bucket().file(file.path).delete().catch(err => console.error(`Failed to delete storage file ${file.path}:`, err));
            }
        }

        await adminDb.collection('estimations').doc(estimationId).delete();
        console.log(`Estimation ${estimationId} deleted by admin ${req.user.email}`);
        res.json({ success: true, message: 'Estimation deleted successfully' });
    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({ success: false, message: 'Error deleting estimation' });
    }
});


// ============= MESSAGES MANAGEMENT ENDPOINTS =============

// Get all messages
router.get('/messages', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// Reply to message
router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const adminEmail = req.user.email;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Reply content is required' });
        }

        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const messageData = messageDoc.data(); // Corrected this line

        const replyData = {
            originalMessageId: messageId,
            senderName: 'Admin',
            senderEmail: adminEmail,
            recipientEmail: messageData.senderEmail || messageData.email,
            content: content,
            type: 'admin_reply',
            isRead: false,
            createdAt: new Date().toISOString()
        };

        await adminDb.collection('messages').add(replyData);
        await adminDb.collection('messages').doc(messageId).update({
            status: 'replied',
            repliedAt: new Date().toISOString(),
            repliedBy: adminEmail,
            updatedAt: new Date().toISOString()
        });

        console.log(`Reply sent to message ${messageId} by ${adminEmail}`);
        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
    }
});


// Delete message
router.delete('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        await adminDb.collection('messages').doc(messageId).delete();
        console.log(`Message ${messageId} deleted by admin ${req.user.email}`);
        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ success: false, message: 'Error deleting message' });
    }
});

// ============= ADDITIONAL ADMIN ENDPOINTS =============

// Get system health check
router.get('/health', async (req, res) => {
    try {
        await adminDb.collection('_health').limit(1).get();
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
