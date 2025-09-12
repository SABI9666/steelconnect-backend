// src/routes/admin.js - Complete fixed admin routes file with blocking and comments
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

// NEW: User blocking endpoint
router.post('/users/block-user', async (req, res) => {
    try {
        const { email, blocked, reason } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'User email is required' 
            });
        }

        // Find user by email
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
            
        if (userQuery.empty) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const userDoc = userQuery.docs[0];
        const userId = userDoc.id;
        
        // Update user's blocked status
        const updateData = {
            isBlocked: blocked,
            blockedReason: reason || null,
            blockedAt: blocked ? new Date().toISOString() : null,
            blockedBy: blocked ? req.user.email : null,
            canSendMessages: !blocked, // Explicitly control message sending
            updatedAt: new Date().toISOString()
        };
        
        if (!blocked) {
            // When unblocking, remove blocked fields
            updateData.blockedReason = null;
            updateData.blockedAt = null;
            updateData.blockedBy = null;
        }

        await adminDb.collection('users').doc(userId).update(updateData);
        
        // Also update all messages from this user to reflect the new status
        const messagesQuery = await adminDb.collection('messages')
            .where('senderEmail', '==', email)
            .get();
            
        const batch = adminDb.batch();
        messagesQuery.docs.forEach(doc => {
            batch.update(doc.ref, {
                senderBlocked: blocked,
                updatedAt: new Date().toISOString()
            });
        });
        
        await batch.commit();
        
        res.json({ 
            success: true, 
            message: `User ${blocked ? 'blocked' : 'unblocked'} successfully` 
        });
        
    } catch (error) {
        console.error('Error blocking/unblocking user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user block status' 
        });
    }
});

// --- FIXED PROFILE REVIEWS ---
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('Fetching profile reviews...');
        
        // Get profile reviews from the correct collection
        const reviewsSnapshot = await adminDb.collection('profile_reviews')
            .orderBy('createdAt', 'desc')
            .get();
        
        console.log(`Found ${reviewsSnapshot.size} profile review documents`);
        
        const reviews = [];
        
        for (const reviewDoc of reviewsSnapshot.docs) {
            const reviewData = reviewDoc.data();
            console.log(`Processing review for user: ${reviewData.userEmail}`);
            
            // Get the actual user data
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
            
            // Construct the review object with proper structure
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
                    // Include profile data and documents
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
        
        console.log(`Returning ${reviews.length} processed reviews`);
        res.json({ success: true, reviews });
        
    } catch (error) {
        console.error("Fetch Profile Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews' });
    }
});

router.get('/profile-reviews/:reviewId/details', async (req, res) => {
    try {
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        // Get the actual user data
        let userData = null;
        if (reviewData.userId) {
            const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
            if (userDoc.exists) {
                userData = userDoc.data();
            }
        }
        
        res.json({
            success: true,
            profile: {
                _id: req.params.reviewId,
                ...reviewData,
                userData: userData
            }
        });
    } catch (error) {
        console.error("Get Profile Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile details' });
    }
});

// UPDATED: Profile review approval with better comment handling
router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { adminComments } = req.body;
        
        // Get the review to find the user ID
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        // Update the user document with admin comments
        const userUpdateData = {
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            rejectionReason: null,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        // Store admin comments in user profile (visible to user)
        if (adminComments && adminComments.trim()) {
            userUpdateData.adminComments = adminComments.trim();
            userUpdateData.hasAdminComments = true;
        }

        // Update both the user and the review
        await adminDb.collection('users').doc(reviewData.userId).update(userUpdateData);
        await adminDb.collection('profile_reviews').doc(req.params.reviewId).update({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: adminComments || '',
            adminComments: adminComments || null // Store in review for admin reference
        });
        
        res.json({ success: true, message: 'Profile approved successfully. User can see your comments in their profile.' });
    } catch (error) {
        console.error("Approve Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

// UPDATED: Profile review rejection with better comment handling  
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason, adminComments } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }

        // Get the review to find the user ID
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        // Update the user document with admin comments (visible to user)
        const userUpdateData = {
            profileStatus: 'rejected',
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        // Store admin comments in user profile (visible to user) - use reason as the comment
        const fullComment = adminComments ? `${reason}\n\nAdditional Comments: ${adminComments}` : reason;
        userUpdateData.adminComments = fullComment.trim();
        userUpdateData.hasAdminComments = true;

        // Update both the user and the review
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

// --- FIXED ESTIMATION MANAGEMENT ---
router.get('/estimations', async (req, res) => {
    try {
        console.log('Fetching estimations with user details...');
        
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Try to get user details by contractorId or contractorEmail
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
            
            // If no user found by ID, try to find by email
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
                user: user, // This will now contain full user details or null
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile,
                createdAt: data.createdAt,
                completedAt: data.completedAt,
                description: data.description
            };
            
            estimations.push(estimation);
        }
        
        console.log(`Returning ${estimations.length} estimations with user details`);
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

router.get('/estimations/:estimationId/download/:fileIndex', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });

        const files = estDoc.data().uploadedFiles || [];
        const fileIndex = parseInt(req.params.fileIndex);

        if (fileIndex >= files.length || fileIndex < 0) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const file = files[fileIndex];
        res.json({ success: true, file: { url: file.url, name: file.name, downloadUrl: file.url } });
    } catch (error) {
        console.error("Download Estimation File Error:", error);
        res.status(500).json({ success: false, message: 'Error creating file download link' });
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

// --- MESSAGE MANAGEMENT ---
router.get('/messages', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                senderEmail: data.senderEmail || data.from,
                senderName: data.senderName || data.fromName,
                recipientEmail: data.recipientEmail || data.to,
                recipientName: data.recipientName || data.toName,
                subject: data.subject,
                content: data.content || data.message,
                messageType: data.messageType || 'general',
                status: data.status || 'unread',
                createdAt: data.createdAt,
                readAt: data.readAt,
                attachments: data.attachments || [],
                senderBlocked: data.senderBlocked || false
            };
        });
        res.json({ success: true, messages });
    } catch (error) {
        console.error("Fetch Messages Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) return res.status(404).json({ success: false, message: 'Message not found' });

        const messageData = messageDoc.data();

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
