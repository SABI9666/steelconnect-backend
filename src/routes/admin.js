// src/routes/admin.js - COMPLETE FIXED VERSION with working message control
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Protect all admin routes with authentication and admin role checks
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD ---
router.get('/dashboard', async (req, res) => {
    try {
        const users = await adminDb.collection('users').get();
        const pendingReviews = await adminDb.collection('profile_reviews').where('status', '==', 'pending').get();
        const jobs = await adminDb.collection('jobs').get();
        const quotes = await adminDb.collection('quotes').get();
        res.json({ 
            success: true, 
            stats: { 
                totalUsers: users.size, 
                totalJobs: jobs.size, 
                totalQuotes: quotes.size, 
                pendingProfileReviews: pendingReviews.size 
            } 
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data' });
    }
});

// --- USER MANAGEMENT ---
router.get('/users', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                _id: doc.id, 
                name: data.name, 
                email: data.email, 
                role: data.type, 
                isActive: data.isActive !== false,
                isBlocked: data.isBlocked || false,
                canSendMessages: data.canSendMessages !== false
            };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        await adminDb.collection('users').doc(req.params.userId).update({ 
            isActive: isActive, 
            canAccess: isActive 
        });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error("Update User Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// FIXED: User blocking endpoint with proper error handling and logging
router.post('/users/block-user', async (req, res) => {
    try {
        const { email, blocked, reason } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'User email is required' 
            });
        }

        console.log(`[ADMIN-BLOCK] ${blocked ? 'Blocking' : 'Unblocking'} user: ${email}, Reason: ${reason}`);

        // Find user by email
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
            
        if (userQuery.empty) {
            return res.status(404).json({ 
                success: false, 
                message: `User with email ${email} not found` 
            });
        }

        const userDoc = userQuery.docs[0];
        const userId = userDoc.id;
        const currentData = userDoc.data();
        
        console.log(`[ADMIN-BLOCK] Found user: ${userId} - ${currentData.name}`);
        
        // Update user's blocked status with explicit boolean values
        const updateData = {
            isBlocked: Boolean(blocked),
            canSendMessages: !Boolean(blocked),
            blockedReason: blocked ? (reason || 'Blocked by administrator') : null,
            blockedAt: blocked ? new Date().toISOString() : null,
            blockedBy: blocked ? (req.user.email || req.user.name) : null,
            updatedAt: new Date().toISOString()
        };
        
        console.log(`[ADMIN-BLOCK] Updating user ${userId} with data:`, updateData);

        await adminDb.collection('users').doc(userId).update(updateData);
        
        // Update all messages from this user to reflect block status
        const messagesQuery = await adminDb.collection('messages')
            .where('senderEmail', '==', email)
            .get();
        
        if (!messagesQuery.empty) {
            const batch = adminDb.batch();
            messagesQuery.docs.forEach(doc => {
                batch.update(doc.ref, {
                    senderBlocked: Boolean(blocked),
                    blockedUpdatedAt: new Date().toISOString()
                });
            });
            await batch.commit();
            console.log(`[ADMIN-BLOCK] Updated ${messagesQuery.size} messages for user ${email}`);
        }
        
        res.json({ 
            success: true, 
            message: `User ${email} has been ${blocked ? 'blocked' : 'unblocked'} successfully. ${blocked ? 'They cannot send messages.' : 'They can now send messages.'}` 
        });
        
    } catch (error) {
        console.error('[ADMIN-BLOCK] Error blocking/unblocking user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user block status',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// --- PROFILE REVIEWS (keeping existing code) ---
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('Fetching profile reviews...');
        
        const reviewsSnapshot = await adminDb.collection('profile_reviews')
            .orderBy('createdAt', 'desc')
            .get();
        
        console.log(`Found ${reviewsSnapshot.size} profile review documents`);
        
        const reviews = [];
        
        for (const reviewDoc of reviewsSnapshot.docs) {
            const reviewData = reviewDoc.data();
            
            let userData = null;
            if (reviewData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
                    if (userDoc.exists) {
                        userData = userDoc.data();
                    }
                } catch (userError) {
                    console.error(`Error fetching user ${reviewData.userId}:`, userError);
                }
            }
            
            const review = {
                _id: reviewDoc.id,
                status: reviewData.status || 'pending',
                submittedAt: reviewData.createdAt,
                reviewNotes: reviewData.reviewNotes || '',
                adminComments: reviewData.adminComments || null,
                user: {
                    name: userData?.name || reviewData.userName || 'Unknown',
                    email: userData?.email || reviewData.userEmail || 'Unknown',
                    type: userData?.type || reviewData.userType || 'Unknown',
                    phone: userData?.phone || '',
                    company: userData?.companyName || '',
                    address: userData?.address || '',
                    adminComments: userData?.adminComments || null,
                    documents: [
                        ...(userData?.resume ? [{
                            filename: userData.resume.filename || 'Resume',
                            url: userData.resume.url,
                            type: 'resume'
                        }] : []),
                        ...(userData?.certificates || []).map(cert => ({
                            filename: cert.filename || 'Certificate',
                            url: cert.url,
                            type: 'certificate'
                        })),
                        ...(userData?.businessLicense ? [{
                            filename: userData.businessLicense.filename || 'Business License',
                            url: userData.businessLicense.url,
                            type: 'license'
                        }] : []),
                        ...(userData?.insurance ? [{
                            filename: userData.insurance.filename || 'Insurance',
                            url: userData.insurance.url,
                            type: 'insurance'
                        }] : [])
                    ]
                }
            };
            
            reviews.push(review);
        }
        
        res.json({ success: true, reviews });
        
    } catch (error) {
        console.error("Fetch Profile Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews' });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { adminComments } = req.body;
        
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        const userUpdateData = {
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            rejectionReason: null,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        if (adminComments && adminComments.trim()) {
            userUpdateData.adminComments = adminComments.trim();
            userUpdateData.hasAdminComments = true;
        }

        await adminDb.collection('users').doc(reviewData.userId).update(userUpdateData);
        await adminDb.collection('profile_reviews').doc(req.params.reviewId).update({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: adminComments || '',
            adminComments: adminComments || null
        });
        
        res.json({ success: true, message: 'Profile approved successfully. User can see your comments in their profile.' });
    } catch (error) {
        console.error("Approve Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason, adminComments } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }

        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        const userUpdateData = {
            profileStatus: 'rejected',
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        const fullComment = adminComments ? `${reason}\n\nAdditional Comments: ${adminComments}` : reason;
        userUpdateData.adminComments = fullComment.trim();
        userUpdateData.hasAdminComments = true;

        await adminDb.collection('users').doc(reviewData.userId).update(userUpdateData);
        await adminDb.collection('profile_reviews').doc(req.params.reviewId).update({
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason,
            adminComments: adminComments || null
        });

        res.json({ success: true, message: 'Profile rejected. The user can see your feedback in their profile and can resubmit after corrections.' });
    } catch (error) {
        console.error("Reject Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// --- FIXED MESSAGE MANAGEMENT ---
router.get('/messages', async (req, res) => {
    try {
        console.log('[ADMIN-MESSAGES] Fetching messages with user block status...');
        
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];
        
        // Create a map to cache user block status
        const userBlockStatusCache = new Map();
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const senderEmail = data.senderEmail || data.from;
            
            // Check if sender is blocked (with caching)
            let senderBlocked = false;
            if (senderEmail && !userBlockStatusCache.has(senderEmail)) {
                try {
                    const userQuery = await adminDb.collection('users')
                        .where('email', '==', senderEmail)
                        .limit(1)
                        .get();
                    
                    if (!userQuery.empty) {
                        const userData = userQuery.docs[0].data();
                        senderBlocked = userData.isBlocked === true || userData.canSendMessages === false;
                        userBlockStatusCache.set(senderEmail, senderBlocked);
                    } else {
                        userBlockStatusCache.set(senderEmail, false);
                    }
                } catch (userError) {
                    console.error('[ADMIN-MESSAGES] Error checking user block status:', userError);
                    userBlockStatusCache.set(senderEmail, false);
                }
            } else {
                senderBlocked = userBlockStatusCache.get(senderEmail) || false;
            }
            
            const message = {
                _id: doc.id,
                senderEmail: senderEmail,
                senderName: data.senderName || data.fromName || 'Unknown',
                recipientEmail: data.recipientEmail || data.to || 'admin@steelconnect.com',
                recipientName: data.recipientName || data.toName || 'Admin',
                subject: data.subject || 'No Subject',
                content: data.content || data.message || '',
                messageType: data.messageType || 'general',
                status: senderBlocked ? 'blocked' : (data.status || 'unread'),
                createdAt: data.createdAt,
                readAt: data.readAt || null,
                attachments: data.attachments || [],
                senderBlocked: senderBlocked,
                adminRead: data.adminRead || false,
                adminReadAt: data.adminReadAt || null,
                adminReadBy: data.adminReadBy || null
            };
            
            messages.push(message);
        }
        
        console.log(`[ADMIN-MESSAGES] Returning ${messages.length} messages`);
        res.json({ success: true, messages });
    } catch (error) {
        console.error("[ADMIN-MESSAGES] Fetch Messages Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// FIXED: Mark message as read endpoint (was missing)
router.patch('/messages/:messageId/read', async (req, res) => {
    try {
        console.log(`[ADMIN-MESSAGES] Marking message ${req.params.messageId} as read by ${req.user.email}`);
        
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        await adminDb.collection('messages').doc(req.params.messageId).update({
            adminRead: true,
            adminReadAt: new Date().toISOString(),
            adminReadBy: req.user.email,
            status: 'read'
        });

        console.log(`[ADMIN-MESSAGES] Message ${req.params.messageId} marked as read`);
        res.json({
            success: true,
            message: 'Message marked as read'
        });
    } catch (error) {
        console.error("[ADMIN-MESSAGES] Mark Message as Read Error:", error);
        res.status(500).json({ success: false, message: 'Error marking message as read' });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) return res.status(404).json({ success: false, message: 'Message not found' });

        const messageData = messageDoc.data();

        // Auto-mark as read when viewed
        await adminDb.collection('messages').doc(req.params.messageId).update({
            adminRead: true,
            adminReadAt: new Date().toISOString(),
            adminReadBy: req.user.email
        });

        res.json({
            success: true,
            message: {
                _id: messageDoc.id,
                ...messageData
            }
        });
    } catch (error) {
        console.error("Get Message Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching message details' });
    }
});

router.patch('/messages/:messageId/status', async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        const updateData = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (adminNotes) {
            updateData.adminNotes = adminNotes;
        }

        await adminDb.collection('messages').doc(req.params.messageId).update(updateData);
        res.json({ success: true, message: 'Message status updated successfully' });
    } catch (error) {
        console.error("Update Message Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating message status' });
    }
});

router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { replyContent, subject } = req.body;
        if (!replyContent) return res.status(400).json({ success: false, message: 'Reply content is required' });

        const originalMessageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!originalMessageDoc.exists) return res.status(404).json({ success: false, message: 'Original message not found' });

        const originalMessage = originalMessageDoc.data();

        const replyData = {
            senderEmail: req.user.email,
            senderName: req.user.name || 'Admin',
            recipientEmail: originalMessage.senderEmail,
            recipientName: originalMessage.senderName,
            subject: subject || `Re: ${originalMessage.subject}`,
            content: replyContent,
            messageType: 'admin_reply',
            status: 'sent',
            createdAt: new Date().toISOString(),
            originalMessageId: req.params.messageId
        };

        await adminDb.collection('messages').add(replyData);

        await adminDb.collection('messages').doc(req.params.messageId).update({
            status: 'replied',
            repliedAt: new Date().toISOString(),
            repliedBy: req.user.email
        });

        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error("Reply to Message Error:", error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
    }
});

router.delete('/messages/:id', async (req, res) => {
    try {
        await adminDb.collection('messages').doc(req.params.id).delete();
        res.json({ success: true, message: `Message deleted successfully.` });
    } catch (e) { 
        res.status(500).json({ success: false, message: `Error deleting message` }); 
    }
});

// --- ESTIMATION MANAGEMENT ---
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            let user = null;
            
            if (data.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(data.contractorId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        user = {
                            _id: userDoc.id,
                            name: userData.name,
                            email: userData.email,
                            type: userData.type,
                            phone: userData.phone,
                            company: userData.companyName,
                            isActive: userData.isActive,
                            createdAt: userData.createdAt
                        };
                    }
                } catch (userError) {
                    console.error(`Error fetching user by ID ${data.contractorId}:`, userError);
                }
            }
            
            if (!user && data.contractorEmail) {
                try {
                    const userSnapshot = await adminDb.collection('users')
                        .where('email', '==', data.contractorEmail)
                        .limit(1)
                        .get();
                    
                    if (!userSnapshot.empty) {
                        const userDoc = userSnapshot.docs[0];
                        const userData = userDoc.data();
                        user = {
                            _id: userDoc.id,
                            name: userData.name,
                            email: userData.email,
                            type: userData.type,
                            phone: userData.phone,
                            company: userData.companyName,
                            isActive: userData.isActive,
                            createdAt: userData.createdAt
                        };
                    }
                } catch (emailError) {
                    console.error(`Error fetching user by email ${data.contractorEmail}:`, emailError);
                }
            }
            
            const estimation = {
                _id: doc.id,
                projectName: data.projectTitle || data.projectName,
                projectDescription: data.description || data.projectDescription,
                userEmail: data.contractorEmail,
                userName: data.contractorName,
                user: user,
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile,
                createdAt: data.createdAt,
                completedAt: data.completedAt,
                description: data.description
            };
            
            estimations.push(estimation);
        }
        
        res.json({ success: true, estimations });
    } catch (error) {
        console.error("Fetch Estimations Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
});

router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, files: estDoc.data().uploadedFiles || [] });
    } catch (error) {
        console.error("Fetch Estimation Files Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimation files' });
    }
});

router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });

        const filePath = `estimations/results/${req.params.estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);

        const updateData = {
            resultFile: {
                url: fileUrl,
                name: req.file.originalname,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.email
            },
            status: 'completed',
            completedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(req.params.estimationId).update(updateData);
        res.json({ success: true, message: 'Estimation result uploaded successfully' });
    } catch (error) {
        console.error("Upload Estimation Result Error:", error);
        res.status(500).json({ success: false, message: 'Error uploading result' });
    }
});

router.delete('/estimations/:id', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.id).delete();
        res.json({ success: true, message: `Estimation deleted successfully.` });
    } catch (e) { 
        res.status(500).json({ success: false, message: `Error deleting estimation` }); 
    }
});

// --- GENERAL CONTENT MANAGEMENT (JOBS, QUOTES) ---
const createAdminCrudEndpoints = (collectionName) => {
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            res.json({ success: true, [collectionName]: items });
        } catch (e) { 
            res.status(500).json({ success: false, message: `Error fetching ${collectionName}` }); 
        }
    });

    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: `${collectionName.slice(0, -1)} deleted successfully.` });
        } catch (e) { 
            res.status(500).json({ success: false, message: `Error deleting item` }); 
        }
    });
};

// Create endpoints for Jobs and Quotes
createAdminCrudEndpoints('jobs');
createAdminCrudEndpoints('quotes');

export default router;
