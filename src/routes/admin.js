// src/routes/admin.js - COMPLETE FINAL MERGED VERSION WITH BUSINESS ANALYTICS
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import {
    uploadToFirebaseStorage,
    generateSignedUrl,
} from '../config/firebase.js';
import { sendEstimationResultNotification, sendProfileReviewNotification } from '../utils/emailService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Protect all admin routes with authentication and admin role checks
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD ---
// GET /api/admin/dashboard - Update dashboard to include proper support stats
router.get('/dashboard', async (req, res) => {
    try {
        // Existing stats
        const users = await adminDb.collection('users').get();
        const pendingReviews = await adminDb.collection('profile_reviews').where('status', '==', 'pending').get();
        const jobs = await adminDb.collection('jobs').get();
        const quotes = await adminDb.collection('quotes').get();
        const conversations = await adminDb.collection('conversations').get();

        // Support Ticket Stats
        const supportTicketsSnapshot = await adminDb.collection('support_tickets').get();

        let supportStats = {
            total: 0,
            open: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0,
            critical: 0
        };
        supportTicketsSnapshot.forEach(doc => {
            const data = doc.data();
            supportStats.total++;

            const status = data.ticketStatus || 'open';
            if (supportStats.hasOwnProperty(status)) {
                supportStats[status]++;
            }

            if (data.priority === 'Critical') {
                supportStats.critical++;
            }
        });
        
        // Business Analytics requests stats
        const analysisSnapshot = await adminDb.collection('analysis_requests').get();
        let analysisStats = {
            total: 0,
            pending: 0,
            completed: 0
        };

        analysisSnapshot.forEach(doc => {
            const data = doc.data();
            analysisStats.total++;
            if (data.vercelUrl) {
                analysisStats.completed++;
            } else {
                analysisStats.pending++;
            }
        });

        res.json({
            success: true,
            stats: {
                totalUsers: users.size,
                totalJobs: jobs.size,
                totalQuotes: quotes.size,
                totalConversations: conversations.size,
                pendingProfileReviews: pendingReviews.size,
                totalSupportTickets: supportStats.total,
                totalSupportMessages: supportStats.total,
                pendingSupportTickets: supportStats.open,
                criticalSupportTickets: supportStats.critical,
                totalAnalysisRequests: analysisStats.total,
                pendingAnalysisRequests: analysisStats.pending,
                completedAnalysisRequests: analysisStats.completed,
                totalBusinessAnalyticsRequests: analysisStats.total,
                pendingBusinessAnalyticsRequests: analysisStats.pending,
                completedBusinessAnalyticsRequests: analysisStats.completed
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
                canSendMessages: data.canSendMessages !== false,
                profileStatus: data.profileStatus || 'incomplete',
                createdAt: data.createdAt
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
            canAccess: isActive,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error("Update User Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// User blocking endpoint with proper error handling and logging
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

// --- PROFILE REVIEWS ---
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

            // Helper: extract storage path and generate fresh signed URL
            async function getFreshDocUrl(docData) {
                if (!docData) return null;
                // docData.url might be an object (from uploadToFirebaseStorage) or a string
                const storedUrl = docData.url;
                let storagePath = docData.path || null;

                if (storedUrl && typeof storedUrl === 'object') {
                    // uploadToFirebaseStorage returned an object - extract path
                    storagePath = storedUrl.path || storagePath;
                }

                if (storagePath) {
                    try {
                        const freshUrl = await generateSignedUrl(storagePath, 60); // 1 hour
                        return freshUrl;
                    } catch (urlError) {
                        console.warn(`Failed to generate signed URL for path: ${storagePath}`, urlError.message);
                    }
                }

                // Fallback: if url is a string (old format), return it as-is
                if (typeof storedUrl === 'string') return storedUrl;
                // If url is an object with a nested url string, try that
                if (storedUrl && typeof storedUrl.url === 'string') return storedUrl.url;

                return null;
            }

            // Build documents array with fresh signed URLs
            const documents = [];

            if (userData?.resume) {
                const freshUrl = await getFreshDocUrl(userData.resume);
                if (freshUrl) {
                    documents.push({
                        filename: userData.resume.filename || 'Resume',
                        url: freshUrl,
                        type: 'resume'
                    });
                }
            }

            if (userData?.certificates && Array.isArray(userData.certificates)) {
                for (const cert of userData.certificates) {
                    const freshUrl = await getFreshDocUrl(cert);
                    if (freshUrl) {
                        documents.push({
                            filename: cert.filename || 'Certificate',
                            url: freshUrl,
                            type: 'certificate'
                        });
                    }
                }
            }

            if (userData?.businessLicense) {
                const freshUrl = await getFreshDocUrl(userData.businessLicense);
                if (freshUrl) {
                    documents.push({
                        filename: userData.businessLicense.filename || 'Business License',
                        url: freshUrl,
                        type: 'license'
                    });
                }
            }

            if (userData?.insurance) {
                const freshUrl = await getFreshDocUrl(userData.insurance);
                if (freshUrl) {
                    documents.push({
                        filename: userData.insurance.filename || 'Insurance',
                        url: freshUrl,
                        type: 'insurance'
                    });
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
                    documents: documents
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

        // Get user details for email
        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();

            // Send approval email notification
            sendProfileReviewNotification(userData, 'approved')
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Profile approval notification sent to ${userData.email}`);
                    }
                })
                .catch(error => {
                    console.error(`Failed to send profile approval email:`, error);
                });
        }

        res.json({ success: true, message: 'Profile approved successfully. User has been notified via email.' });
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
        // Get user details for email
        const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();

            // Send rejection email notification
            sendProfileReviewNotification(userData, 'rejected', fullComment)
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Profile rejection notification sent to ${userData.email}`);
                    }
                })
                .catch(error => {
                    console.error(`Failed to send profile rejection email:`, error);
                });
        }
        res.json({ success: true, message: 'Profile rejected. The user has been notified via email with your feedback.' });
    } catch (error) {
        console.error("Reject Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// --- USER CONVERSATIONS MANAGEMENT ---
router.get('/conversations', async (req, res) => {
    try {
        console.log('[ADMIN-CONVERSATIONS] Fetching all user conversations...');

        const snapshot = await adminDb.collection('conversations')
            .orderBy('updatedAt', 'desc')
            .get();

        const conversations = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Get participant details
            const participants = [];
            if (data.participantIds && data.participantIds.length > 0) {
                for (const participantId of data.participantIds) {
                    try {
                        const userDoc = await adminDb.collection('users').doc(participantId).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            participants.push({
                                id: participantId,
                                name: userData.name || 'Unknown',
                                email: userData.email || 'Unknown',
                                type: userData.type || 'Unknown'
                            });
                        }
                    } catch (userError) {
                        console.error(`Error fetching participant ${participantId}:`, userError);
                    }
                }
            }

            // Get job details if exists
            let jobDetails = null;
            if (data.jobId) {
                try {
                    const jobDoc = await adminDb.collection('jobs').doc(data.jobId).get();
                    if (jobDoc.exists) {
                        const jobData = jobDoc.data();
                        jobDetails = {
                            id: data.jobId,
                            title: jobData.title || 'Unknown Job',
                            description: jobData.description || '',
                            budget: jobData.budget || null
                        };
                    }
                } catch (jobError) {
                    console.error(`Error fetching job ${data.jobId}:`, jobError);
                }
            }

            // Get message count
            const messagesSnapshot = await adminDb.collection('conversations')
                .doc(doc.id)
                .collection('messages')
                .get();

            const conversation = {
                _id: doc.id,
                participants: participants,
                participantNames: participants.map(p => p.name).join(', '),
                participantEmails: participants.map(p => p.email).join(', '),
                jobDetails: jobDetails,
                lastMessage: data.lastMessage || 'No messages',
                lastMessageBy: data.lastMessageBy || 'Unknown',
                messageCount: messagesSnapshot.size,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                status: data.status || 'active'
            };

            conversations.push(conversation);
        }

        console.log(`[ADMIN-CONVERSATIONS] Returning ${conversations.length} conversations`);
        res.json({ success: true, conversations });

    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversations:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversations' });
    }
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        console.log(`[ADMIN-CONVERSATIONS] Fetching messages for conversation ${conversationId}`);

        // Get conversation details first
        const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
        if (!conversationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const conversationData = conversationDoc.data();

        // Get participant details
        const participants = [];
        if (conversationData.participantIds) {
            for (const participantId of conversationData.participantIds) {
                try {
                    const userDoc = await adminDb.collection('users').doc(participantId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        participants.push({
                            id: participantId,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'Unknown',
                            type: userData.type || 'Unknown'
                        });
                    }
                } catch (userError) {
                    console.error(`Error fetching participant ${participantId}:`, userError);
                }
            }
        }

        // Get messages
        let messagesQuery = adminDb.collection('conversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit));

        if (offset > 0) {
            messagesQuery = messagesQuery.offset(parseInt(offset));
        }

        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => {
            const messageData = doc.data();
            const sender = participants.find(p => p.id === messageData.senderId);

            return {
                _id: doc.id,
                text: messageData.text,
                senderId: messageData.senderId,
                senderName: messageData.senderName || (sender ? sender.name : 'Unknown'),
                senderEmail: sender ? sender.email : 'Unknown',
                senderType: sender ? sender.type : 'Unknown',
                createdAt: messageData.createdAt,
                readBy: messageData.readBy || {}
            };
        }).reverse(); // Show oldest first

        res.json({
            success: true,
            conversation: {
                id: conversationId,
                participants: participants,
                jobId: conversationData.jobId,
                createdAt: conversationData.createdAt,
                updatedAt: conversationData.updatedAt
            },
            messages: messages,
            totalMessages: messagesSnapshot.size,
            hasMore: messagesSnapshot.size === parseInt(limit)
        });

    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversation messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversation messages' });
    }
});

router.post('/conversations/search', async (req, res) => {
    try {
        const { query, type = 'all' } = req.body;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }

        console.log(`[ADMIN-CONVERSATIONS] Searching conversations for: ${query}`);

        // Find users matching the search query
        const usersSnapshot = await adminDb.collection('users')
            .where('email', '>=', query.toLowerCase())
            .where('email', '<=', query.toLowerCase() + '\uf8ff')
            .get();

        const nameSearchSnapshot = await adminDb.collection('users')
            .where('name', '>=', query)
            .where('name', '<=', query + '\uf8ff')
            .get();

        // Combine results and remove duplicates
        const userIds = new Set();
        const matchedUsers = [];

        [...usersSnapshot.docs, ...nameSearchSnapshot.docs].forEach(doc => {
            if (!userIds.has(doc.id)) {
                userIds.add(doc.id);
                const userData = doc.data();
                if (type === 'all' || userData.type === type) {
                    matchedUsers.push({
                        id: doc.id,
                        name: userData.name,
                        email: userData.email,
                        type: userData.type
                    });
                }
            }
        });

        if (matchedUsers.length === 0) {
            return res.json({ success: true, conversations: [], message: 'No users found matching the search query' });
        }

        // Find conversations involving these users
        const conversations = [];
        const userIdsList = Array.from(userIds);

        for (const userId of userIdsList) {
            const conversationsSnapshot = await adminDb.collection('conversations')
                .where('participantIds', 'array-contains', userId)
                .get();

            for (const doc of conversationsSnapshot.docs) {
                if (!conversations.find(c => c._id === doc.id)) {
                    const data = doc.data();

                    const participants = [];
                    for (const participantId of data.participantIds) {
                        const participant = matchedUsers.find(u => u.id === participantId) ||
                            await getUserById(participantId);
                        if (participant) {
                            participants.push(participant);
                        }
                    }

                    conversations.push({
                        _id: doc.id,
                        participants: participants,
                        participantNames: participants.map(p => p.name).join(', '),
                        lastMessage: data.lastMessage || 'No messages',
                        updatedAt: data.updatedAt,
                        createdAt: data.createdAt
                    });
                }
            }
        }

        conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({ success: true, conversations, matchedUsers });

    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error searching conversations:', error);
        res.status(500).json({ success: false, message: 'Error searching conversations' });
    }
});

// Helper function to get user by ID
async function getUserById(userId) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            return {
                id: userId,
                name: userData.name || 'Unknown',
                email: userData.email || 'Unknown',
                type: userData.type || 'Unknown'
            };
        }
    } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
    }
    return null;
}

router.get('/conversations/stats', async (req, res) => {
    try {
        const conversationsSnapshot = await adminDb.collection('conversations').get();
        const totalConversations = conversationsSnapshot.size;

        let totalMessages = 0;
        let activeConversations = 0;
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const doc of conversationsSnapshot.docs) {
            const data = doc.data();

            const messagesSnapshot = await doc.ref.collection('messages').get();
            totalMessages += messagesSnapshot.size;

            if (data.updatedAt && new Date(data.updatedAt) > last7Days) {
                activeConversations++;
            }
        }

        res.json({
            success: true,
            stats: {
                totalConversations,
                totalMessages,
                activeConversations,
                averageMessagesPerConversation: totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0
            }
        });

    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversation stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversation statistics' });
    }
});

// --- MESSAGE MANAGEMENT ---
router.get('/messages', async (req, res) => {
    try {
        console.log('[ADMIN-MESSAGES] Fetching messages with user block status...');

        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];

        const userBlockStatusCache = new Map();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const senderEmail = data.senderEmail || data.from;

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
        console.log('Fetching estimations with user details...');

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

        try {
            // Generate secure signed URL for admin access
            const signedUrl = await generateSignedUrl(file.path, 15, 'attachment');

            res.json({
                success: true,
                file: {
                    url: signedUrl,
                    name: file.name || file.originalname,
                    downloadUrl: signedUrl
                }
            });
        } catch (error) {
            console.error("Error generating signed URL:", error);
            // Fallback to direct URL if available
            res.json({
                success: true,
                file: {
                    url: file.url,
                    name: file.name || file.originalname,
                    downloadUrl: file.url
                }
            });
        }
    } catch (error) {
        console.error("Download Estimation File Error:", error);
        res.status(500).json({ success: false, message: 'Error creating file download link' });
    }
});

// UPDATED: Secure result upload with contractor metadata and email notification
router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });
        // Get estimation details first
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }

        const estData = estDoc.data();

        // Create secure file path
        const filePath = `estimation-results/${req.params.estimationId}/${req.file.originalname}`;

        // Add contractor metadata for secure access control
        const uploadMetadata = {
            contractorEmail: estData.contractorEmail,
            contractorId: estData.contractorId,
            estimationId: req.params.estimationId,
            uploadedBy: req.user.email,
            fileType: 'estimation_result'
        };

        console.log(`[ADMIN-UPLOAD] Uploading result for estimation ${req.params.estimationId} with metadata:`, uploadMetadata);

        // Use the updated secure upload function
        const uploadedFile = await uploadToFirebaseStorage(req.file, filePath, uploadMetadata);
        const resultFileData = {
            path: filePath,
            url: uploadedFile.url,
            name: req.file.originalname,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.email
        };
        const updateData = {
            resultFile: resultFileData,
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: req.user.email
        };
        await adminDb.collection('estimations').doc(req.params.estimationId).update(updateData);

        console.log(`[ADMIN-UPLOAD] Result uploaded successfully for estimation ${req.params.estimationId}`);

        // Get contractor details for email
        let contractor = null;
        if (estData.contractorId) {
            try {
                const contractorDoc = await adminDb.collection('users').doc(estData.contractorId).get();
                if (contractorDoc.exists) {
                    contractor = contractorDoc.data();
                }
            } catch (error) {
                console.error('Error fetching contractor:', error);
            }
        }

        // If contractor not found by ID, try by email
        if (!contractor && estData.contractorEmail) {
            try {
                const contractorQuery = await adminDb.collection('users')
                    .where('email', '==', estData.contractorEmail)
                    .limit(1)
                    .get();

                if (!contractorQuery.empty) {
                    contractor = contractorQuery.docs[0].data();
                }
            } catch (error) {
                console.error('Error fetching contractor by email:', error);
            }
        }

        // Send email notification to contractor
        if (contractor && contractor.email) {
            console.log(`[ADMIN-UPLOAD] Sending email notification to contractor: ${contractor.email}`);

            const estimationData = {
                _id: req.params.estimationId,
                projectName: estData.projectTitle || estData.projectName,
                projectTitle: estData.projectTitle || estData.projectName,
                createdAt: estData.createdAt
            };

            sendEstimationResultNotification(contractor, estimationData, resultFileData)
                .then((result) => {
                    if (result && result.success) {
                        console.log(`✅ Estimation result notification sent successfully to ${contractor.email}`);

                        // Log email sent in the estimation document
                        adminDb.collection('estimations').doc(req.params.estimationId).update({
                            emailSent: true,
                            emailSentAt: new Date().toISOString(),
                            emailMessageId: result.messageId
                        }).catch(err => console.error('Error updating email status:', err));
                    } else {
                        console.error(`❌ Failed to send estimation notification to ${contractor.email}:`, result?.error || 'Unknown error');
                    }
                })
                .catch(error => {
                    console.error(`❌ Failed to send estimation notification email to ${contractor.email}:`, error?.message || error);
                });
        } else {
            console.warn('[ADMIN-UPLOAD] No contractor email found for estimation notification');
        }

        res.json({
            success: true,
            message: 'Estimation result uploaded successfully and notification sent to contractor'
        });
    } catch (error) {
        console.error("[ADMIN-UPLOAD] Upload Estimation Result Error:", error);
        res.status(500).json({ success: false, message: 'Error uploading result', error: error.message });
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

// --- ENHANCED QUOTES MANAGEMENT ---
router.get('/quotes', async (req, res) => {
    try {
        console.log('Fetching quotes with detailed information...');

        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Get designer details
            let designer = null;
            if (data.designerId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(data.designerId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        designer = {
                            _id: userDoc.id,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'Unknown',
                            type: userData.type || 'Unknown'
                        };
                    }
                } catch (userError) {
                    console.error(`Error fetching designer ${data.designerId}:`, userError);
                }
            }

            // Get job details
            let job = null;
            if (data.jobId) {
                try {
                    const jobDoc = await adminDb.collection('jobs').doc(data.jobId).get();
                    if (jobDoc.exists) {
                        const jobData = jobDoc.data();
                        job = {
                            _id: jobDoc.id,
                            title: jobData.title || 'Unknown Job',
                            budget: jobData.budget || 'N/A',
                            posterName: jobData.posterName || 'Unknown'
                        };
                    }
                } catch (jobError) {
                    console.error(`Error fetching job ${data.jobId}:`, jobError);
                }
            }

            // Get contractor details
            let contractor = null;
            if (data.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(data.contractorId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        contractor = {
                            _id: userDoc.id,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'Unknown',
                            type: userData.type || 'Unknown'
                        };
                    }
                } catch (userError) {
                    console.error(`Error fetching contractor ${data.contractorId}:`, userError);
                }
            }

            const quote = {
                _id: doc.id,
                jobId: data.jobId,
                jobTitle: data.jobTitle || (job ? job.title : 'Unknown Job'),
                designerId: data.designerId,
                designerName: data.designerName || (designer ? designer.name : 'Unknown'),
                contractorId: data.contractorId,
                quoteAmount: data.quoteAmount,
                timeline: data.timeline,
                description: data.description,
                status: data.status || 'submitted',
                attachments: data.attachments || [],
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                approvedAt: data.approvedAt,
                rejectedAt: data.rejectedAt,
                // Additional details for admin view
                designer: designer,
                contractor: contractor,
                job: job,
                userEmail: designer ? designer.email : data.designerEmail,
                clientEmail: contractor ? contractor.email : data.contractorEmail
            };

            quotes.push(quote);
        }

        console.log(`Returning ${quotes.length} quotes with file details`);
        res.json({ success: true, quotes });
    } catch (error) {
        console.error("Enhanced Fetch Quotes Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
});

// Get quote files endpoint
router.get('/quotes/:quoteId/files', async (req, res) => {
    try {
        console.log(`Fetching files for quote ${req.params.quoteId}`);

        const quoteDoc = await adminDb.collection('quotes').doc(req.params.quoteId).get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        const quoteData = quoteDoc.data();
        const attachments = quoteData.attachments || [];

        // Add additional metadata for admin view with secure URLs
        const filesWithMetadata = [];

        for (let index = 0; index < attachments.length; index++) {
            const file = attachments[index];
            let secureUrl = file.url || file.downloadURL;

            // Generate signed URL if file has path
            if (file.path) {
                try {
                    secureUrl = await generateSignedUrl(file.path, 60, 'attachment');
                } catch (error) {
                    console.log(`Could not generate signed URL for ${file.name}, using original URL`);
                }
            }

            filesWithMetadata.push({
                index: index,
                name: file.name || file.originalname || `Attachment ${index + 1}`,
                url: secureUrl,
                size: file.size || 0,
                uploadedAt: file.uploadedAt || quoteData.createdAt,
                type: file.mimetype || getFileTypeFromName(file.name || file.originalname || '')
            });
        }

        res.json({
            success: true,
            files: filesWithMetadata,
            quoteInfo: {
                id: req.params.quoteId,
                jobTitle: quoteData.jobTitle,
                designerName: quoteData.designerName,
                quoteAmount: quoteData.quoteAmount,
                status: quoteData.status
            }
        });

    } catch (error) {
        console.error("Fetch Quote Files Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching quote files' });
    }
});

// Get quote details with all information
router.get('/quotes/:quoteId/details', async (req, res) => {
    try {
        const quoteDoc = await adminDb.collection('quotes').doc(req.params.quoteId).get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }

        const quoteData = quoteDoc.data();

        // Get designer details
        let designer = null;
        if (quoteData.designerId) {
            try {
                const userDoc = await adminDb.collection('users').doc(quoteData.designerId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    designer = {
                        id: userDoc.id,
                        name: userData.name,
                        email: userData.email,
                        type: userData.type,
                        phone: userData.phone,
                        company: userData.companyName
                    };
                }
            } catch (error) {
                console.error('Error fetching designer details:', error);
            }
        }

        // Get job details
        let job = null;
        if (quoteData.jobId) {
            try {
                const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
                if (jobDoc.exists) {
                    const jobData = jobDoc.data();
                    job = {
                        id: jobDoc.id,
                        title: jobData.title,
                        description: jobData.description,
                        budget: jobData.budget,
                        posterName: jobData.posterName,
                        status: jobData.status
                    };
                }
            } catch (error) {
                console.error('Error fetching job details:', error);
            }
        }

        res.json({
            success: true,
            quote: {
                id: req.params.quoteId,
                ...quoteData,
                designer: designer,
                job: job,
                attachments: quoteData.attachments || []
            }
        });

    } catch (error) {
        console.error("Get Quote Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching quote details' });
    }
});

// Helper function to determine file type from filename
function getFileTypeFromName(filename) {
    if (!filename) return 'unknown';

    const ext = filename.toLowerCase().split('.').pop();
    const typeMap = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'txt': 'text/plain',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png'
    };

    return typeMap[ext] || 'application/octet-stream';
}

// --- SUPPORT TICKET MANAGEMENT ---

// GET /api/admin/support-messages - Get all support messages/tickets
router.get('/support-messages', async (req, res) => {
    try {
        const { status = 'all', priority = 'all', page = 1, limit = 20 } = req.query;

        console.log(`[ADMIN-SUPPORT] Fetching support messages - status: ${status}, priority: ${priority}`);

        let query = adminDb.collection('support_tickets').orderBy('createdAt', 'desc');

        if (status !== 'all') {
            query = query.where('ticketStatus', '==', status);
        }

        if (priority !== 'all') {
            query = query.where('priority', '==', priority);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const snapshot = await query.limit(parseInt(limit)).offset(offset).get();

        const supportMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const statsSnapshot = await adminDb.collection('support_tickets').get();
        const stats = {
            total: statsSnapshot.size,
            open: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0,
            high_priority: 0,
            critical: 0,
            unassigned: 0
        };

        statsSnapshot.forEach(doc => {
            const data = doc.data();
            const ticketStatus = data.ticketStatus || 'open';
            if (stats.hasOwnProperty(ticketStatus)) {
                stats[ticketStatus]++;
            }
            if (data.priority === 'High') stats.high_priority++;
            if (data.priority === 'Critical') stats.critical++;
            if (!data.assignedTo) stats.unassigned++;
        });

        res.json({
            success: true,
            messages: supportMessages,
            stats,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: supportMessages.length,
                hasNext: supportMessages.length === parseInt(limit)
            }
        });
        console.log(`[ADMIN-SUPPORT] Retrieved ${supportMessages.length} support messages`);
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error fetching support messages:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch support messages.' });
    }
});

// GET /api/admin/support-messages/:ticketId - Get specific support ticket details
router.get('/support-messages/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const ticketDoc = await adminDb.collection('support_tickets').doc(ticketId).get();

        if (!ticketDoc.exists) {
            return res.status(404).json({ success: false, message: 'Support ticket not found.' });
        }

        res.json({
            success: true,
            ticket: { id: ticketDoc.id, ...ticketDoc.data() }
        });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error fetching ticket details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch ticket details.' });
    }
});

// POST /api/admin/support-messages/:ticketId/respond - Respond to support ticket
router.post('/support-messages/:ticketId/respond', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { adminResponse, internalNote, status } = req.body;
        const adminUser = req.user;
        console.log(`[ADMIN-SUPPORT] Admin ${adminUser.name || adminUser.email} responding to ticket ${ticketId}`);
        if (!adminResponse || !adminResponse.trim()) {
            return res.status(400).json({ success: false, message: 'Admin response is required.' });
        }
        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();
        if (!ticketDoc.exists) {
            return res.status(404).json({ success: false, message: 'Support ticket not found.' });
        }
        const ticketData = ticketDoc.data();
        // Create response object with proper timestamp
        const responseData = {
            message: adminResponse.trim(),
            responderName: adminUser.name || adminUser.email,
            responderEmail: adminUser.email,
            responderType: 'admin',
            createdAt: new Date().toISOString(),
            isRead: false
        };
        // Update ticket with response and status
        const updateData = {
            ticketStatus: status || 'in_progress',
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: adminUser.name || adminUser.email,
            // Add response to responses array
            responses: ticketData.responses ? [...ticketData.responses, responseData] : [responseData]
        };
        // Add internal note if provided
        if (internalNote && internalNote.trim()) {
            const noteData = {
                note: internalNote.trim(),
                adminName: adminUser.name || adminUser.email,
                adminEmail: adminUser.email,
                createdAt: new Date().toISOString()
            };
            updateData.internalNotes = ticketData.internalNotes ? [...ticketData.internalNotes, noteData] : [noteData];
        }
        await ticketRef.update(updateData);
        // CREATE USER NOTIFICATION
        try {
            const notificationData = {
                userId: ticketData.userId || ticketData.senderEmail,
                title: 'Support Response',
                message: `Your support ticket "${ticketData.subject}" has received a response from our support team.`,
                type: 'support',
                metadata: {
                    action: 'support_response',
                    ticketId: ticketId,
                    ticketSubject: ticketData.subject,
                    adminResponse: adminResponse.substring(0, 100) + (adminResponse.length > 100 ? '...' : ''),
                    responseFrom: adminUser.name || 'Support Team'
                },
                isRead: false,
                seen: false,
                deleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            // Save notification to database
            const notificationRef = adminDb.collection('notifications').doc();
            await notificationRef.set(notificationData);
            console.log(`✅ Support response notification created for user: ${ticketData.senderEmail}`);
        } catch (notificationError) {
            console.error('Error creating support response notification:', notificationError);
            // Don't fail the response if notification fails
        }
        res.json({
            success: true,
            message: 'Response sent successfully and user has been notified.',
            ticketId,
            newStatus: status || 'in_progress'
        });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error responding to support ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to send response to support ticket.' });
    }
});

// PATCH /api/admin/support-messages/:ticketId/status - Update support ticket status
router.patch('/support-messages/:ticketId/status', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status, internalNote, notifyUser } = req.body;
        const adminUser = req.user;
        console.log(`[ADMIN-SUPPORT] Updating ticket ${ticketId} status to ${status}`);
        const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }
        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();
        if (!ticketDoc.exists) {
            return res.status(404).json({ success: false, message: 'Support ticket not found.' });
        }
        const ticketData = ticketDoc.data();
        const updateData = {
            ticketStatus: status,
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: adminUser.name || adminUser.email
        };
        if (status === 'resolved' || status === 'closed') {
            updateData.resolvedAt = new Date().toISOString();
            updateData.resolvedBy = adminUser.name || adminUser.email;
        }
        // Add internal note if provided
        if (internalNote && internalNote.trim()) {
            const noteData = {
                note: internalNote.trim(),
                adminName: adminUser.name || adminUser.email,
                adminEmail: adminUser.email,
                createdAt: new Date().toISOString()
            };
            updateData.internalNotes = ticketData.internalNotes ? [...ticketData.internalNotes, noteData] : [noteData];
        }
        await ticketRef.update(updateData);
        // Create notification if user should be notified
        if (notifyUser) {
            try {
                const statusMessages = {
                    'open': 'reopened',
                    'in_progress': 'being worked on',
                    'resolved': 'resolved',
                    'closed': 'closed'
                };
                const notificationData = {
                    userId: ticketData.userId || ticketData.senderEmail,
                    title: 'Support Ticket Status Update',
                    message: `Your support ticket "${ticketData.subject}" status has been updated to: ${statusMessages[status]}.`,
                    type: 'support',
                    metadata: {
                        action: 'support_status_update',
                        ticketId: ticketId,
                        ticketSubject: ticketData.subject,
                        newStatus: status,
                        statusMessage: statusMessages[status],
                        updatedBy: adminUser.name || 'Support Team'
                    },
                    isRead: false,
                    seen: false,
                    deleted: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const notificationRef = adminDb.collection('notifications').doc();
                await notificationRef.set(notificationData);
                console.log(`✅ Status update notification created for user: ${ticketData.senderEmail}`);
            } catch (notificationError) {
                console.error('Error creating status update notification:', notificationError);
            }
        }
        res.json({
            success: true,
            message: `Support ticket status updated successfully to ${status}.`,
            ticketId,
            newStatus: status
        });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error updating support ticket status:', error);
        res.status(500).json({ success: false, message: 'Failed to update support ticket status.' });
    }
});

// POST /api/admin/support-messages/:ticketId/internal-note - Add internal note
router.post('/support-messages/:ticketId/internal-note', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { note } = req.body;
        const adminUser = req.user;
        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, message: 'Note content is required.' });
        }
        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();
        if (!ticketDoc.exists) {
            return res.status(404).json({ success: false, message: 'Support ticket not found.' });
        }
        const ticketData = ticketDoc.data();
        const noteData = {
            note: note.trim(),
            adminName: adminUser.name || adminUser.email,
            adminEmail: adminUser.email,
            createdAt: new Date().toISOString()
        };
        const updateData = {
            internalNotes: ticketData.internalNotes ? [...ticketData.internalNotes, noteData] : [noteData],
            updatedAt: new Date().toISOString(),
            lastUpdatedBy: adminUser.name || adminUser.email
        };
        await ticketRef.update(updateData);
        res.json({
            success: true,
            message: 'Internal note added successfully.',
            ticketId
        });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error adding internal note:', error);
        res.status(500).json({ success: false, message: 'Failed to add internal note.' });
    }
});

// DELETE /api/admin/support-messages/:ticketId - Delete support ticket
router.delete('/support-messages/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const adminUser = req.user;
        console.log(`[ADMIN-SUPPORT] Admin ${adminUser.name || adminUser.email} deleting ticket ${ticketId}`);

        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).json({ success: false, message: 'Support ticket not found.' });
        }

        await ticketRef.delete();
        res.json({ success: true, message: 'Support ticket deleted successfully.' });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error deleting support ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to delete support ticket.' });
    }
});

// POST /api/admin/support-messages/:ticketId/assign - Assign ticket to admin
router.post('/support-messages/:ticketId/assign', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { assignToId, assignToName } = req.body;
        const adminUser = req.user;

        if (!assignToId || !assignToName) {
            return res.status(400).json({ success: false, message: 'assignToId and assignToName are required.' });
        }

        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        await ticketRef.update({
            assignedTo: assignToId,
            assignedToName: assignToName,
            assignedAt: new Date(),
            assignedBy: adminUser.name || adminUser.email,
            ticketStatus: 'in_progress',
            updatedAt: new Date()
        });

        res.json({ success: true, message: `Ticket assigned to ${assignToName} successfully.` });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error assigning ticket:', error);
        res.status(500).json({ success: false, message: 'Failed to assign ticket.' });
    }
});

// GET /api/admin/support-stats - Get support system statistics
router.get('/support-stats', async (req, res) => {
    try {
        const statsSnapshot = await adminDb.collection('support_tickets').get();
        const stats = {
            total: statsSnapshot.size,
            open: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0,
            by_priority: { Low: 0, Medium: 0, High: 0, Critical: 0 },
        };

        statsSnapshot.forEach(doc => {
            const data = doc.data();
            const status = data.ticketStatus || 'open';
            if (stats.hasOwnProperty(status)) stats[status]++;
            if (data.priority && stats.by_priority.hasOwnProperty(data.priority)) {
                stats.by_priority[data.priority]++;
            }
        });

        res.json({ success: true, stats });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error fetching support stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch support statistics.' });
    }
});

// POST /api/admin/support-messages/bulk-action - Perform bulk actions on tickets
router.post('/support-messages/bulk-action', async (req, res) => {
    try {
        const { ticketIds, action, status } = req.body;
        if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
            return res.status(400).json({ success: false, message: 'ticketIds array is required.' });
        }

        const batch = adminDb.batch();
        ticketIds.forEach(ticketId => {
            const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
            if (action === 'delete') {
                batch.delete(ticketRef);
            } else if (action === 'update_status' && status) {
                batch.update(ticketRef, { ticketStatus: status, updatedAt: new Date() });
            }
        });

        await batch.commit();
        res.json({ success: true, message: `Bulk action '${action}' performed successfully.` });
    } catch (error) {
        console.error('[ADMIN-SUPPORT] Error performing bulk action:', error);
        res.status(500).json({ success: false, message: 'Failed to perform bulk action.' });
    }
});

// === BUSINESS ANALYTICS PORTAL ROUTES ===
// GET /api/admin/business-analytics/requests - Get all business analytics requests
router.get('/business-analytics/requests', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('analysis_requests')
            .orderBy('createdAt', 'desc')
            .get();
        const requests = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Get contractor details
            let contractorInfo = {
                name: data.contractorName || 'Unknown',
                email: data.contractorEmail || 'Unknown'
            };
            
            if (data.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(data.contractorId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        contractorInfo = {
                            name: userData.name || data.contractorName,
                            email: userData.email || data.contractorEmail
                        };
                    }
                } catch (error) {
                    console.error('Error fetching contractor details:', error);
                }
            }
            
            requests.push({
                _id: doc.id,
                contractorId: data.contractorId,
                contractorName: contractorInfo.name,
                contractorEmail: contractorInfo.email,
                dataType: data.dataType || 'Production Update',
                frequency: data.frequency || 'Daily',
                description: data.description || '',
                googleSheetUrl: data.googleSheetUrl,
                vercelUrl: data.vercelUrl || null,
                status: data.vercelUrl ? 'completed' : 'pending',
                adminNotes: data.adminNotes || '',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            });
        }
        
        res.json({
            success: true,
            requests: requests
        });
    } catch (error) {
        console.error('[ADMIN-BUSINESS-ANALYTICS] Error fetching requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch business analytics requests'
        });
    }
});

// POST /api/admin/business-analytics/upload-report - Upload HTML report for business analytics
router.post('/business-analytics/upload-report', upload.single('reportFile'), async (req, res) => {
    try {
        const { requestId, reportUrl, adminNotes } = req.body;
        
        if (!requestId) {
            return res.status(400).json({
                success: false,
                message: 'Request ID is required'
            });
        }

        let finalReportUrl = reportUrl;

        // If a file was uploaded, handle it
        if (req.file) {
            try {
                // Create secure file path for HTML report
                const filePath = `business-analytics-reports/${requestId}/${req.file.originalname}`;
                
                // Upload metadata
                const uploadMetadata = {
                    requestId: requestId,
                    uploadedBy: req.user.email,
                    fileType: 'business_analytics_report',
                    uploadedAt: new Date().toISOString()
                };

                console.log(`[ADMIN-BUSINESS-ANALYTICS] Uploading report for request ${requestId}`);

                // Use the existing secure upload function
                const uploadedFile = await uploadToFirebaseStorage(req.file, filePath, uploadMetadata);
                finalReportUrl = uploadedFile.url;
                
            } catch (uploadError) {
                console.error('[ADMIN-BUSINESS-ANALYTICS] File upload error:', uploadError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload report file'
                });
            }
        }

        if (!finalReportUrl) {
            return res.status(400).json({
                success: false,
                message: 'Either report URL or report file is required'
            });
        }

        // Validate URL format if provided
        if (reportUrl) {
            try {
                new URL(reportUrl);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid URL format'
                });
            }
        }

        // Update the business analytics request
        const updateData = {
            vercelUrl: finalReportUrl,
            adminNotes: adminNotes || '',
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };
        
        await adminDb.collection('analysis_requests').doc(requestId).update(updateData);
        
        // Get the request details for notification
        const requestDoc = await adminDb.collection('analysis_requests').doc(requestId).get();
        const requestData = requestDoc.data();
        
        // Create notification for contractor
        if (requestData.contractorId || requestData.contractorEmail) {
            const notificationData = {
                userId: requestData.contractorId || requestData.contractorEmail,
                title: 'Business Analytics Report Ready',
                message: 'Your business analytics report has been completed and is ready to view.',
                type: 'business_analytics',
                metadata: {
                    action: 'analytics_completed',
                    requestId: requestId,
                    dataType: requestData.dataType
                },
                isRead: false,
                seen: false,
                createdAt: new Date().toISOString()
            };
            
            await adminDb.collection('notifications').add(notificationData);
        }
        
        res.json({
            success: true,
            message: 'Business analytics report uploaded successfully',
            reportUrl: finalReportUrl
        });
        
    } catch (error) {
        console.error('[ADMIN-BUSINESS-ANALYTICS] Error uploading report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload business analytics report'
        });
    }
});

// DELETE /api/admin/business-analytics/request/:requestId - Delete business analytics request
router.delete('/business-analytics/request/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        await adminDb.collection('analysis_requests').doc(requestId).delete();
        res.json({
            success: true,
            message: 'Business analytics request deleted successfully'
        });
    } catch (error) {
        console.error('[ADMIN-BUSINESS-ANALYTICS] Error deleting request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete business analytics request'
        });
    }
});

// GET /api/admin/business-analytics/stats - Get business analytics statistics
router.get('/business-analytics/stats', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('analysis_requests').get();
        let stats = {
            total: 0,
            pending: 0,
            completed: 0
        };
        
        snapshot.forEach(doc => {
            const data = doc.data();
            stats.total++;
            if (data.vercelUrl) {
                stats.completed++;
            } else {
                stats.pending++;
            }
        });
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('[ADMIN-BUSINESS-ANALYTICS] Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch business analytics statistics'
        });
    }
});

// --- GENERAL CONTENT MANAGEMENT ---
router.get('/jobs', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
        res.json({ success: true, jobs: items });
    } catch (e) {
        res.status(500).json({ success: false, message: `Error fetching jobs` });
    }
});

router.delete('/jobs/:id', async (req, res) => {
    try {
        await adminDb.collection('jobs').doc(req.params.id).delete();
        res.json({ success: true, message: `Job deleted successfully.` });
    } catch (e) {
        res.status(500).json({ success: false, message: `Error deleting item` });
    }
});

router.delete('/quotes/:id', async (req, res) => {
    try {
        await adminDb.collection('quotes').doc(req.params.id).delete();
        res.json({ success: true, message: `Quote deleted successfully.` });
    } catch (e) {
        res.status(500).json({ success: false, message: `Error deleting item` });
    }
});

export default router;
