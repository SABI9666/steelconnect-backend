// src/routes/admin.js - Complete Admin Routes with Profile Management
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

// === DASHBOARD ENDPOINT ===
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
            inactiveUsers: 0,
            completedEstimations: 0,
            pendingEstimations: 0,
            approvedProfiles: 0,
            rejectedProfiles: 0
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
            
            // Profile status statistics
            if (userData.profileStatus === 'approved') stats.approvedProfiles++;
            if (userData.profileStatus === 'rejected') stats.rejectedProfiles++;
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
            
            estimationsSnapshot.forEach(doc => {
                const estimationData = doc.data();
                if (estimationData.status === 'completed') stats.completedEstimations++;
                else if (estimationData.status === 'pending') stats.pendingEstimations++;
            });
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

// === USERS MANAGEMENT ===
router.get('/users', async (req, res) => {
    try {
        const { type, status, page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('users');
        
        // Apply filters
        if (type && type !== 'all') {
            query = query.where('type', '==', type);
        }
        
        // Order by creation date
        query = query.orderBy('createdAt', 'desc');
        
        const usersSnapshot = await query.get();
        const users = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            // Apply status filter after fetching (since canAccess isn't always indexed)
            const isActive = userData.canAccess !== false;
            if (status && ((status === 'active' && !isActive) || (status === 'inactive' && isActive))) {
                return;
            }
            
            users.push({
                _id: doc.id,
                id: doc.id,
                name: userData.name,
                email: userData.email,
                type: userData.type,
                isActive: isActive,
                profileCompleted: userData.profileCompleted || false,
                profileStatus: userData.profileStatus || 'incomplete',
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin,
                company: userData.companyName || userData.company,
                ...userWithoutPassword
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedUsers = users.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedUsers,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(users.length / limit),
                totalUsers: users.length,
                hasNext: endIndex < users.length,
                hasPrev: startIndex > 0
            }
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

// Enhanced user status update
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        const adminUser = req.user;

        console.log(`${isActive ? 'Activating' : 'Deactivating'} user ${userId} by ${adminUser.email}`);

        // Update both canAccess and isActive fields
        await adminDb.collection('users').doc(userId).update({
            canAccess: isActive,
            isActive: isActive,
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

// Delete user
router.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get user data first for logging
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        console.log(`Deleting user: ${userData.email} by ${req.user.email}`);

        await adminDb.collection('users').doc(userId).delete();

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: error.message
        });
    }
});

// === PROFILE REVIEWS MANAGEMENT ===
router.get('/profile-reviews', async (req, res) => {
    try {
        const { status = 'all', type = 'all', page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .where('profileCompleted', '==', true);
            
        // Add status filter if specified
        if (status !== 'all') {
            query = query.where('profileStatus', '==', status);
        }
        
        query = query.orderBy('submittedAt', 'desc');

        const usersSnapshot = await query.get();
        const reviews = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            
            // Apply type filter after fetching
            if (type !== 'all' && userData.type !== type) {
                return;
            }
            
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
                company: userData.companyName || userData.company,
                user: {
                    id: doc.id,
                    ...userWithoutPassword
                }
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedReviews = reviews.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedReviews,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(reviews.length / limit),
                totalReviews: reviews.length,
                hasNext: endIndex < reviews.length,
                hasPrev: startIndex > 0
            }
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

// Get profile files for viewing
router.get('/profile-reviews/:reviewId/files', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userDoc = await adminDb.collection('users').doc(reviewId).get();

        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const uploadedFiles = userData.uploadedFiles || [];

        res.json({
            success: true,
            data: {
                files: uploadedFiles
            }
        });

    } catch (error) {
        console.error('Error fetching profile files:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile files',
            error: error.message
        });
    }
});

// Download profile file
router.get('/profile-reviews/:reviewId/files/:fileName/download', async (req, res) => {
    try {
        const { reviewId, fileName } = req.params;
        
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();
        const uploadedFiles = userData.uploadedFiles || [];
        const file = uploadedFiles.find(f => f.name === fileName);

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', file.type || 'application/octet-stream');

        // Redirect to the file URL
        res.redirect(file.url);

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
});

// NEW: Update profile review status (for approve/reject via status endpoint)
router.patch('/profile-reviews/:reviewId/status', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { status, reason, notes } = req.body;

        console.log(`Updating profile review status: ${reviewId} to ${status}`);

        // Get user data first for logging
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        if (status === 'approved') {
            await adminDb.collection('users').doc(reviewId).update({
                profileStatus: 'approved',
                canAccess: true,
                isActive: true,
                approvedAt: new Date().toISOString(),
                approvedBy: req.user.email,
                reviewedAt: new Date().toISOString(),
                reviewedBy: req.user.email,
                reviewNotes: notes || 'Profile approved by admin'
            });

            console.log(`Profile approved: ${userData.email} by ${req.user.email}`);

            res.json({
                success: true,
                message: 'Profile approved successfully'
            });

        } else if (status === 'rejected') {
            if (!reason || reason.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required'
                });
            }

            await adminDb.collection('users').doc(reviewId).update({
                profileStatus: 'rejected',
                canAccess: false,
                isActive: false,
                rejectionReason: reason,
                rejectedAt: new Date().toISOString(),
                rejectedBy: req.user.email,
                reviewedAt: new Date().toISOString(),
                reviewedBy: req.user.email,
                reviewNotes: reason
            });

            console.log(`Profile rejected: ${userData.email} by ${req.user.email}, reason: ${reason}`);

            res.json({
                success: true,
                message: 'Profile rejected successfully'
            });

        } else if (status === 'pending') {
            await adminDb.collection('users').doc(reviewId).update({
                profileStatus: 'pending',
                reviewedAt: new Date().toISOString(),
                reviewedBy: req.user.email,
                reviewNotes: notes || 'Profile set back to pending review'
            });

            res.json({
                success: true,
                message: 'Profile status updated to pending'
            });

        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Use "approved", "rejected", or "pending"'
            });
        }

    } catch (error) {
        console.error('Error updating profile review status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile review status',
            error: error.message
        });
    }
});

// Approve profile (legacy endpoint - kept for backward compatibility)
router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { notes } = req.body;

        // Get user data first for potential email notification
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        // Update user profile status
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: notes || 'Profile approved by admin'
        });

        console.log(`Profile approved: ${userData.email} by ${req.user.email}`);

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

// Reject profile (legacy endpoint - kept for backward compatibility)
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

        // Get user data first for potential email notification
        const userDoc = await adminDb.collection('users').doc(reviewId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userData = userDoc.data();

        // Update user profile status
        await adminDb.collection('users').doc(reviewId).update({
            profileStatus: 'rejected',
            canAccess: false,
            isActive: false,
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason
        });

        console.log(`Profile rejected: ${userData.email} by ${req.user.email}, reason: ${reason}`);

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

// === JOBS MANAGEMENT ===
router.get('/jobs', async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('jobs');
        
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        query = query.orderBy('createdAt', 'desc');
        
        const jobsSnapshot = await query.get();
        const jobs = [];

        jobsSnapshot.forEach(doc => {
            const jobData = doc.data();
            jobs.push({
                _id: doc.id,
                id: doc.id,
                ...jobData
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedJobs = jobs.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedJobs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(jobs.length / limit),
                totalJobs: jobs.length,
                hasNext: endIndex < jobs.length,
                hasPrev: startIndex > 0
            }
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

// === QUOTES MANAGEMENT ===
router.get('/quotes', async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('quotes');
        
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        query = query.orderBy('createdAt', 'desc');
        
        const quotesSnapshot = await query.get();
        const quotes = [];

        quotesSnapshot.forEach(doc => {
            const quoteData = doc.data();
            quotes.push({
                _id: doc.id,
                id: doc.id,
                ...quoteData
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedQuotes = quotes.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedQuotes,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(quotes.length / limit),
                totalQuotes: quotes.length,
                hasNext: endIndex < quotes.length,
                hasPrev: startIndex > 0
            }
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

router.delete('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        await adminDb.collection('quotes').doc(quoteId).delete();

        res.json({
            success: true,
            message: 'Quote deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting quote',
            error: error.message
        });
    }
});

// === ESTIMATIONS MANAGEMENT ===
router.get('/estimations', async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('estimations');
        
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        query = query.orderBy('createdAt', 'desc');
        
        const estimationsSnapshot = await query.get();
        const estimations = [];

        estimationsSnapshot.forEach(doc => {
            const estimationData = doc.data();
            estimations.push({
                _id: doc.id,
                id: doc.id,
                ...estimationData
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedEstimations = estimations.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedEstimations,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(estimations.length / limit),
                totalEstimations: estimations.length,
                hasNext: endIndex < estimations.length,
                hasPrev: startIndex > 0
            }
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
        const { status, notes } = req.body;

        const updateData = {
            status: status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (notes) {
            updateData.adminNotes = notes;
        }

        if (status === 'in_progress') {
            updateData.startedAt = new Date().toISOString();
            updateData.startedBy = req.user.email;
        } else if (status === 'completed') {
            updateData.completedAt = new Date().toISOString();
            updateData.completedBy = req.user.email;
        }

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

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

// Download estimation file
router.get('/estimations/:estimationId/files/:fileName/download', async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        const files = estimationData.uploadedFiles || estimationData.files || [];
        const file = files.find(f => f.name === fileName || f.filename === fileName);

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Set download headers
        res.setHeader('Content-Disposition', `attachment; filename="${file.name || file.filename}"`);
        res.setHeader('Content-Type', file.type || file.mimetype || 'application/octet-stream');

        // Redirect to the file URL
        res.redirect(file.url);

    } catch (error) {
        console.error('Error downloading estimation file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading estimation file',
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

        // Validate file type (should be PDF for results)
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({
                success: false,
                message: 'Result file must be a PDF'
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

// Delete estimation
router.delete('/estimations/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        await adminDb.collection('estimations').doc(estimationId).delete();

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

// Assign estimation to admin
router.patch('/estimations/:estimationId/assign', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { assignedTo } = req.body;

        const updateData = {
            assignedTo: assignedTo || req.user.email,
            assignedAt: new Date().toISOString(),
            assignedBy: req.user.email,
            status: 'in_progress',
            updatedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        res.json({
            success: true,
            message: 'Estimation assigned successfully'
        });

    } catch (error) {
        console.error('Error assigning estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning estimation',
            error: error.message
        });
    }
});

// === MESSAGES MANAGEMENT ===
router.get('/messages', async (req, res) => {
    try {
        const { status = 'all', isRead = 'all', page = 1, limit = 10 } = req.query;
        
        let query = adminDb.collection('messages');
        
        // Apply filters
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        
        query = query.orderBy('createdAt', 'desc');
        
        const messagesSnapshot = await query.get();
        const messages = [];

        messagesSnapshot.forEach(doc => {
            const messageData = doc.data();
            
            // Apply isRead filter after fetching
            if (isRead !== 'all') {
                const messageIsRead = messageData.isRead === true;
                if ((isRead === 'true' && !messageIsRead) || (isRead === 'false' && messageIsRead)) {
                    return;
                }
            }
            
            messages.push({
                _id: doc.id,
                id: doc.id,
                ...messageData
            });
        });

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedMessages = messages.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: {
                messages: paginatedMessages
            },
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(messages.length / limit),
                totalMessages: messages.length,
                hasNext: endIndex < messages.length,
                hasPrev: startIndex > 0
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

        // Mark as read when viewed
        await adminDb.collection('messages').doc(messageId).update({
            isRead: true,
            readAt: new Date().toISOString(),
            readBy: req.user.email
        });

        res.json({
            success: true,
            data: {
                message: {
                    _id: messageDoc.id,
                    id: messageDoc.id,
                    ...messageDoc.data(),
                    isRead: true
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
        if (typeof isRead !== 'undefined') {
            updateData.isRead = isRead;
            if (isRead) {
                updateData.readAt = new Date().toISOString();
                updateData.readBy = req.user.email;
            }
        }

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

// Reply to message
router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { reply } = req.body;

        if (!reply || reply.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Reply content is required'
            });
        }

        // Get original message
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        const messageData = messageDoc.data();

        // Update original message with reply
        await adminDb.collection('messages').doc(messageId).update({
            adminReply: reply,
            repliedAt: new Date().toISOString(),
            repliedBy: req.user.email,
            status: 'replied',
            isRead: true,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Reply sent successfully'
        });

    } catch (error) {
        console.error('Error replying to message:', error);
        res.status(500).json({
            success: false,
            message: 'Error replying to message',
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

// === ANALYTICS & STATISTICS ===

// Get profile statistics
router.get('/profile-stats', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users')
            .where('type', 'in', ['designer', 'contractor'])
            .get();

        let total = 0, pending = 0, approved = 0, rejected = 0;
        let pendingDesigners = 0, pendingContractors = 0;
        let approvedDesigners = 0, approvedContractors = 0;

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
                    if (userData.type === 'designer') approvedDesigners++;
                    if (userData.type === 'contractor') approvedContractors++;
                } else if (status === 'rejected') {
                    rejected++;
                }
            }
        });

        res.json({
            success: true,
            data: { 
                total, 
                pending, 
                approved, 
                rejected, 
                pendingDesigners, 
                pendingContractors,
                approvedDesigners,
                approvedContractors
            }
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

// Get estimation statistics
router.get('/estimation-stats', async (req, res) => {
    try {
        const estimationsSnapshot = await adminDb.collection('estimations').get();

        let total = 0, pending = 0, inProgress = 0, completed = 0;
        let totalAmount = 0;

        estimationsSnapshot.forEach(doc => {
            const estimationData = doc.data();
            total++;
            
            const status = estimationData.status || 'pending';
            if (status === 'pending') pending++;
            else if (status === 'in_progress') inProgress++;
            else if (status === 'completed') {
                completed++;
                if (estimationData.estimatedAmount) {
                    totalAmount += parseFloat(estimationData.estimatedAmount);
                }
            }
        });

        res.json({
            success: true,
            data: {
                total,
                pending,
                inProgress,
                completed,
                totalAmount: totalAmount.toFixed(2)
            }
        });

    } catch (error) {
        console.error('Error fetching estimation statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation statistics',
            error: error.message
        });
    }
});

// Get recent activities
router.get('/recent-activities', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const activities = [];

        // Get recent user registrations
        try {
            const recentUsers = await adminDb.collection('users')
                .orderBy('createdAt', 'desc')
                .limit(parseInt(limit))
                .get();

            recentUsers.forEach(doc => {
                const userData = doc.data();
                activities.push({
                    type: 'user_registration',
                    description: `New ${userData.type} registered: ${userData.name}`,
                    timestamp: userData.createdAt,
                    userId: doc.id,
                    userEmail: userData.email
                });
            });
        } catch (e) { console.log('Error fetching recent users:', e.message); }

        // Get recent profile submissions
        try {
            const recentProfiles = await adminDb.collection('users')
                .where('profileCompleted', '==', true)
                .orderBy('submittedAt', 'desc')
                .limit(parseInt(limit))
                .get();

            recentProfiles.forEach(doc => {
                const userData = doc.data();
                activities.push({
                    type: 'profile_submission',
                    description: `Profile submitted for review: ${userData.name}`,
                    timestamp: userData.submittedAt,
                    userId: doc.id,
                    userEmail: userData.email
                });
            });
        } catch (e) { console.log('Error fetching recent profiles:', e.message); }

        // Get recent estimations
        try {
            const recentEstimations = await adminDb.collection('estimations')
                .orderBy('createdAt', 'desc')
                .limit(parseInt(limit))
                .get();

            recentEstimations.forEach(doc => {
                const estimationData = doc.data();
                activities.push({
                    type: 'estimation_request',
                    description: `New estimation request: ${estimationData.projectName || 'Unnamed project'}`,
                    timestamp: estimationData.createdAt,
                    estimationId: doc.id,
                    userEmail: estimationData.userEmail
                });
            });
        } catch (e) { console.log('Error fetching recent estimations:', e.message); }

        // Sort all activities by timestamp and limit
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const limitedActivities = activities.slice(0, parseInt(limit));

        res.json({
            success: true,
            data: limitedActivities
        });

    } catch (error) {
        console.error('Error fetching recent activities:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent activities',
            error: error.message
        });
    }
});

// Bulk operations for users
router.post('/users/bulk-action', async (req, res) => {
    try {
        const { action, userIds } = req.body;

        if (!action || !userIds || !Array.isArray(userIds)) {
            return res.status(400).json({
                success: false,
                message: 'Action and userIds array are required'
            });
        }

        const batch = adminDb.batch();
        const timestamp = new Date().toISOString();

        userIds.forEach(userId => {
            const userRef = adminDb.collection('users').doc(userId);
            
            if (action === 'activate') {
                batch.update(userRef, {
                    canAccess: true,
                    isActive: true,
                    statusUpdatedAt: timestamp,
                    statusUpdatedBy: req.user.email
                });
            } else if (action === 'deactivate') {
                batch.update(userRef, {
                    canAccess: false,
                    isActive: false,
                    statusUpdatedAt: timestamp,
                    statusUpdatedBy: req.user.email
                });
            } else if (action === 'delete') {
                batch.delete(userRef);
            }
        });

        await batch.commit();

        res.json({
            success: true,
            message: `Bulk ${action} completed for ${userIds.length} users`
        });

    } catch (error) {
        console.error('Error performing bulk action:', error);
        res.status(500).json({
            success: false,
            message: 'Error performing bulk action',
            error: error.message
        });
    }
});

// Export admin router
export default router;
        
