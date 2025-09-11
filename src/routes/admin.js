// src/routes/admin.js - Complete, corrected, and merged admin routes file.
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
        const pendingReviews = await adminDb.collection('users').where('profileCompleted', '==', true).where('profileStatus', '==', 'pending').get();
        const jobs = await adminDb.collection('jobs').get();
        const quotes = await adminDb.collection('quotes').get();
        res.json({ success: true, stats: { totalUsers: users.size, totalJobs: jobs.size, totalQuotes: quotes.size, pendingProfileReviews: pendingReviews.size } });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data' });
    }
});

// --- USER MANAGEMENT ---
// Admin can view all users.
router.get('/users', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { _id: doc.id, name: data.name, email: data.email, role: data.type, isActive: data.isActive !== false };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

// Admin can activate/deactivate users. Deactivated users cannot log in.
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        // The 'canAccess' flag is checked by the login system to block login.
        await adminDb.collection('users').doc(req.params.userId).update({ isActive: isActive, canAccess: isActive });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error("Update User Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// --- ENHANCED PROFILE REVIEW ---
// Get a list of all profiles submitted for review with detailed user data for the list view.
router.get('/profile-reviews', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').where('profileCompleted', '==', true).orderBy('submittedAt', 'desc').get();
        const reviews = snapshot.docs.map(doc => {
            const userData = doc.data();
            return {
                _id: doc.id,
                status: userData.profileStatus || 'pending',
                user: {
                    name: userData.name,
                    email: userData.email,
                    type: userData.type,
                    phone: userData.phone,
                    company: userData.company,
                    address: userData.address,
                    businessLicense: userData.businessLicense,
                    certifications: userData.certifications,
                    insurance: userData.insurance,
                    resume: userData.resume,
                    profileData: userData.profileData
                },
                reviewNotes: userData.rejectionReason,
                submittedAt: userData.submittedAt,
                files: {
                    resume: userData.resume,
                    certifications: userData.certifications || [],
                    businessLicense: userData.businessLicense,
                    insurance: userData.insurance
                }
            };
        });
        res.json({ success: true, reviews });
    } catch (error) {
        console.error("Fetch Profile Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews' });
    }
});

// Get the full, detailed profile for a single user under review.
router.get('/profile-reviews/:reviewId/details', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.reviewId).get();
        if (!userDoc.exists) return res.status(404).json({ success: false, message: 'Profile not found' });

        const userData = userDoc.data();
        res.json({
            success: true,
            profile: {
                ...userData,
                _id: userDoc.id
            }
        });
    } catch (error) {
        console.error("Get Profile Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile details' });
    }
});


// Approve a profile with optional admin comments.
router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { adminComments } = req.body;
        const updateData = {
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            rejectionReason: null,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email
        };

        if (adminComments) {
            updateData.adminComments = adminComments;
        }

        await adminDb.collection('users').doc(req.params.reviewId).update(updateData);
        res.json({ success: true, message: 'Profile approved successfully' });
    } catch (error) {
        console.error("Approve Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

// Reject a profile with a required reason. User can still log in to see the reason and make corrections.
router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason, adminComments } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

        const updateData = {
            profileStatus: 'rejected',
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email
        };

        if (adminComments) {
            updateData.adminComments = adminComments;
        }

        await adminDb.collection('users').doc(req.params.reviewId).update(updateData);
        res.json({ success: true, message: 'Profile rejected. The user can still log in to make corrections.' });
    } catch (error) {
        console.error("Reject Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// --- ENHANCED ESTIMATION MANAGEMENT ---
// Get all estimations with file details.
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                projectName: data.projectName,
                projectDescription: data.projectDescription,
                userEmail: data.userEmail,
                userName: data.userName,
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile,
                createdAt: data.createdAt,
                completedAt: data.completedAt
            };
        });
        res.json({ success: true, estimations });
    } catch (error) {
        console.error("Fetch Estimations Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
});


// Get the list of files for a single estimation (useful for a detail view).
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


// Download a specific estimation file uploaded by a user.
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
        // In a real app, you might generate a signed URL here for secure, temporary access.
        // For this implementation, we return the stored public URL.
        res.json({ success: true, file: { url: file.url, name: file.name, downloadUrl: file.url } });
    } catch (error) {
        console.error("Download Estimation File Error:", error);
        res.status(500).json({ success: false, message: 'Error creating file download link' });
    }
});


// Upload/edit the estimation result file.
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

// Admin can delete an estimation record.
router.delete('/estimations/:id', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.id).delete();
        res.json({ success: true, message: `Estimation deleted successfully.` });
    } catch (e) { res.status(500).json({ success: false, message: `Error deleting estimation` }); }
});


// --- ENHANCED MESSAGE MANAGEMENT ---
// Get all messages with full content details.
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
                attachments: data.attachments || []
            };
        });
        res.json({ success: true, messages });
    } catch (error) {
        console.error("Fetch Messages Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

// Get specific message details and mark it as read by admin.
router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) return res.status(404).json({ success: false, message: 'Message not found' });

        const messageData = messageDoc.data();

        // Mark as read by admin
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

// Update message status (e.g., 'in-progress', 'resolved').
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

// Admin replies to a message.
router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { replyContent, subject } = req.body;
        if (!replyContent) return res.status(400).json({ success: false, message: 'Reply content is required' });

        const originalMessageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!originalMessageDoc.exists) return res.status(404).json({ success: false, message: 'Original message not found' });

        const originalMessage = originalMessageDoc.data();

        // Create the reply message record
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

        // Update the original message status to 'replied'
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

// Admin can delete a message record.
router.delete('/messages/:id', async (req, res) => {
    try {
        await adminDb.collection('messages').doc(req.params.id).delete();
        res.json({ success: true, message: `Message deleted successfully.` });
    } catch (e) { res.status(500).json({ success: false, message: `Error deleting message` }); }
});


// --- GENERAL CONTENT MANAGEMENT (JOBS, QUOTES) ---
// Generic function to create GET (all) and DELETE endpoints for collections.
const createAdminCrudEndpoints = (collectionName) => {
    // Get all items in a collection
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            res.json({ success: true, [collectionName]: items });
        } catch (e) { res.status(500).json({ success: false, message: `Error fetching ${collectionName}` }); }
    });

    // Delete a specific item from a collection
    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: `${collectionName.slice(0, -1)} deleted successfully.` });
        } catch (e) { res.status(500).json({ success: false, message: `Error deleting item` }); }
    });
};

// Create endpoints for Jobs and Quotes
createAdminCrudEndpoints('jobs');
createAdminCrudEndpoints('quotes');

export default router;
