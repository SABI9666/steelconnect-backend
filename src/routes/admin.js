// Complete admin.js routes with all management features
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/jpeg',
            'image/png',
            'image/gif',
            'text/plain',
            'application/zip',
            'application/x-rar-compressed'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(isAdmin);

// Dashboard endpoint
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user.email);

        const stats = {
            totalUsers: 0,
            contractors: 0,
            designers: 0,
            totalJobs: 0,
            totalQuotes: 0,
            totalEstimations: 0,
            totalMessages: 0,
            pendingReviews: 0,
            activeUsers: 0,
            inactiveUsers: 0
        };

        // Get user statistics
        const usersSnapshot = await adminDb.collection('users').get();
        stats.totalUsers = usersSnapshot.size;
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') stats.contractors++;
            if (userData.type === 'designer') stats.designers++;
            if (userData.canAccess !== false) stats.activeUsers++;
            else stats.inactiveUsers++;
        });

        // Get profile review statistics
        const profileReviewsSnapshot = await adminDb.collection('users')
            .where('profileCompleted', '==', true)
            .where('profileStatus', '==', 'pending')
            .get();
        stats.pendingReviews = profileReviewsSnapshot.size;

        // Get other collection statistics
        try {
            const jobsSnapshot = await adminDb.collection('jobs').get();
            stats.totalJobs = jobsSnapshot.size;
        } catch (e) { console.log('Jobs collection not found'); }

        try {
            const quotesSnapshot = await adminDb.collection('quotes').get();
            stats.totalQuotes = quotesSnapshot.size;
        } catch (e) { console.log('Quotes collection not found'); }

        try {
            const estimationsSnapshot = await adminDb.collection('estimations').get();
            stats.totalEstimations = estimationsSnapshot.size;
        } catch (e) { console.log('Estimations collection not found'); }

        try {
            const messagesSnapshot = await adminDb.collection('messages').get();
            stats.totalMessages = messagesSnapshot.size;
        } catch (e) { console.log('Messages collection not found'); }

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

// USERS MANAGEMENT
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            users.push({
                _id: doc.id,
                id: doc.id,
                name: userData.name,
                email: userData.email,
                type: userData.type,
                isActive: userData.canAccess !== false,
                profileCompleted: userData.profileCompleted || false,
                profileStatus: userData.profileStatus || 'incomplete',
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin,
                company: userData.companyName || userData.company,
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
            user: {
                _id: userDoc.id,
                id: userDoc.id,
                ...userWithoutPassword
            }
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user',
            error: error.message
        });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        const adminUser = req.user;

        console.log(`${isActive ? 'Activating' : 'Deactivating'} user ${userId} by ${adminUser.email}`);

        await adminDb.collection('users').doc(userId).update({
            canAccess: isActive,
            statusUpdatedAt: new Date().toISOString(),
            statusUpdatedBy: adminUser.email
        });

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });

    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user status',
            error: error.message
        });
    }
});

// JOBS MANAGEMENT
router.get('/jobs', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = [];

        jobsSnapshot.forEach(doc => {
            const jobData = doc.data();
            jobs.push({
                _id: doc.id,
                id: doc.id,
                ...jobData
            });
        });

        res.json({
            success: true,
            data: jobs
        });

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
        const { jobId } = req.params;
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        res.json({
            success: true,
            job: {
                _id: jobDoc.id,
                id: jobDoc.id,
                ...jobDoc.data()
            }
        });

    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching job',
            error: error.message
        });
    }
});

router.patch('/jobs/:jobId/status', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status } = req.body;

        await adminDb.collection('jobs').doc(jobId).update({
            status: status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });

        res.json({
            success: true,
            message: 'Job status updated successfully'
        });

    } catch (error) {
        console.error('Error updating job status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating job status',
            error: error.message
        });
    }
});

router.delete('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        await adminDb.collection('jobs').doc(jobId).delete();

        res.json({
            success: true,
            message: 'Job deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting job',
            error: error.message
        });
    }
});

// QUOTES MANAGEMENT
router.get('/quotes', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];

        quotesSnapshot.forEach(doc => {
            const quoteData = doc.data();
            quotes.push({
                _id: doc.id,
                id: doc.id,
                ...quoteData
            });
        });

        res.json({
            success: true,
            data: quotes
        });

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
        const { quoteId } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();

        if (!quoteDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Quote not found'
            });
        }

        res.json({
            success: true,
            quote: {
                _id: quoteDoc.id,
                id: quoteDoc.id,
                ...quoteDoc.data()
            }
        });

    } catch (error) {
        console.error('Error fetching quote:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching quote',
            error: error.message
        });
    }
});

router.patch('/quotes/:quoteId/status', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { status } = req.body;

        await adminDb.collection('quotes').doc(quoteId).update({
            status: status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });

        res.json({
            success: true,
            message: 'Quote status updated successfully'
        });

    } catch (error) {
        console.error('Error updating quote status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating quote status',
            error: error.message
        });
    }
});

// ESTIMATIONS MANAGEMENT WITH FILE HANDLING
router.get('/estimations', async (req, res) => {
    try {
        const estimationsSnapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];

        estimationsSnapshot.forEach(doc => {
            const estimationData = doc.data();
            estimations.push({
                _id: doc.id,
                id: doc.id,
                ...estimationData
            });
        });

        res.json({
            success: true,
            data: estimations
        });

    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimations',
            error: error.message
        });
    }
});

router.get('/estimations/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        res.json({
            success: true,
            estimation: {
                _id: estimationDoc.id,
                id: estimationDoc.id,
                ...estimationDoc.data()
            }
        });

    } catch (error) {
        console.error('Error fetching estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation',
            error: error.message
        });
    }
});

router.patch('/estimations/:estimationId/status', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status } = req.body;

        await adminDb.collection('estimations').doc(estimationId).update({
            status: status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        });

        res.json({
            success: true,
            message: 'Estimation status updated successfully'
        });

    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating estimation status',
            error: error.message
        });
    }
});

// Get estimation files
router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        const files = estimationData.uploadedFiles || estimationData.files || [];

        res.json({
            success: true,
            data: {
                files: files
            }
        });

    } catch (error) {
        console.error('Error fetching estimation files:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation files',
            error: error.message
        });
    }
});

// Upload estimation result
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { amount, notes } = req.body;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }

        console.log(`Uploading estimation result for: ${estimationId}`);

        // Upload file to Firebase Storage
        const filePath = `estimations/results/${estimationId}_${Date.now()}_${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);

        const resultData = {
            resultFile: {
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                url: fileUrl,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.email
            },
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        if (amount) {
            resultData.estimatedAmount = parseFloat(amount);
        }

        if (notes) {
            resultData.adminNotes = notes;
        }

        await adminDb.collection('estimations').doc(estimationId).update(resultData);

        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            data: {
                resultFile: resultData.resultFile,
                estimatedAmount: resultData.estimatedAmount
            }
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

// MESSAGES MANAGEMENT WITH CONTROLS
router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];

        messagesSnapshot.forEach(doc => {
            const messageData = doc.data();
            messages.push({
                _id: doc.id,
                id: doc.id,
                ...messageData
            });
        });

        res.json({
            success: true,
            data: {
                messages: messages
            }
        });

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
        const { messageId } = req.params;
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();

        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        res.json({
            success: true,
            data: {
                message: {
                    _id: messageDoc.id,
                    id: messageDoc.id,
                    ...messageDoc.data()
                }
            }
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

router.patch('/messages/:messageId/status', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status, isRead } = req.body;

        const updateData = {
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (status) updateData.status = status;
        if (typeof isRead !== 'undefined') updateData.isRead = isRead;

        await adminDb.collection('messages').doc(messageId).update(updateData);

        res.json({
            success: true,
            message: 'Message status updated successfully'
        });

    } catch (error) {
        console.error('Error updating message status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating message status',
            error: error.message
        });
    }
});

router.patch('/messages/:messageId/block', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { block, reason } = req.body;

        const updateData = {
            isBlocked: block,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (block) {
            updateData.blockedAt = new Date().toISOString();
            updateData.blockedBy = req.user.email;
            updateData.blockReason = reason || 'Blocked by admin';
            updateData.status = 'blocked';
        } else {
            updateData.blockedAt = null;
            updateData.blockedBy = null;
            updateData.blockReason = null;
            updateData.status = 'active';
        }

        await adminDb.collection('messages').doc(messageId).update(updateData);

        res.json({
            success: true,
            message: `Message ${block ? 'blocked' : 'unblocked'} successfully`
        });

    } catch (error) {
        console.error('Error blocking/unblocking message:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating message block status',
            error: error.message
        });
    }
});

router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Reply content is required'
            });
        }

        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const messageData = messageDoc.data();
        
        // Add reply to message thread
        const reply = {
            content: content.trim(),
            sentAt: new Date().toISOString(),
            sentBy: req.user.email,
            senderName: req.user.name || 'Admin',
            senderType: 'admin'
        };

        const updatedThread = messageData.thread || [];
        updatedThread.push(reply);

        await adminDb.collection('messages').doc(messageId).update({
            thread: updatedThread,
            status: 'replied',
            isRead: true,
            lastReply: reply,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Reply sent successfully'
        });

    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending reply',
            error: error.message
        });
    }
});

router.delete('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        await adminDb.collection('messages').doc(messageId).delete();

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

// PROFILE REVIEWS MANAGEMENT
router.get('/profile-reviews', async (req, res) => {
    try {
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

// Get single profile review details
router.get('/profile-reviews/:reviewId', async (req, res) => {
    try {
        const { reviewId } = req.params;
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
            data: { review }
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

        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'approved',
            canAccess: true,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: notes || 'Profile approved by admin'
        });

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

        if (!reason || reason.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'rejected',
            canAccess: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason
        });

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
        const usersSnapshot = await adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .get();

        let total = 0, pending = 0, approved = 0, rejected = 0;
        let pendingDesigners = 0, pendingContractors = 0;

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
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

        res.json({
            success: true,
            data: { total, pending, approved, rejected, pendingDesigners, pendingContractors }
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

// Debug endpoint for profile system
router.get('/debug/profiles', async (req, res) => {
    try {
        const allUsersSnapshot = await adminDb.collection('users').get();
        const userBreakdown = {
            total: allUsersSnapshot.size,
            byType: {},
            byProfileStatus: {},
            profileCompleted: 0,
            profileNotCompleted: 0
        };

        allUsersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userType = userData.type || 'unknown';
            userBreakdown.byType[userType] = (userBreakdown.byType[userType] || 0) + 1;
            
            const profileStatus = userData.profileStatus || 'none';
            userBreakdown.byProfileStatus[profileStatus] = (userBreakdown.byProfileStatus[profileStatus] || 0) + 1;
            
            if (userData.profileCompleted === true) {
                userBreakdown.profileCompleted++;
            } else {
                userBreakdown.profileNotCompleted++;
            }
        });

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

export default router;
