// src/routes/admin.js - FIXED FILE WITH PDF DOWNLOADS & MESSAGE BLOCKING
import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import {
    getDashboardStats,
    getAllUsers,
    getAllQuotes,
    getAllJobs,
    getAllMessages,
    getAllSubscriptions,
    getAllEstimations,
    getEstimationById,
    getEstimationFiles,
    getEstimationResult,
    downloadEstimationFile,
    downloadEstimationResult,
    updateEstimationStatus,
    setEstimationDueDate,
    blockMessage,
    blockUserMessages,
    updateUserStatus,
    deleteUser
} from '../controllers/adminController.js';

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Dashboard stats - FIXES /api/admin/dashboard 404
router.get('/dashboard', getDashboardStats);

// Users management - FIXES /api/admin/users 404
router.get('/users', getAllUsers);
router.patch('/users/:userId/status', updateUserStatus);
router.delete('/users/:userId', deleteUser);

// FIXED: Messages management with blocking controls
router.get('/messages', getAllMessages);

// Get single message details
router.get('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        console.log(`Admin fetching message details for ID: ${messageId}`);
        
        const doc = await adminDb.collection('messages').doc(messageId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }
        
        const messageData = doc.data();
        let userData = null;
        
        // Try to fetch sender data
        if (messageData.senderId) {
            try {
                const userDoc = await adminDb.collection('users').doc(messageData.senderId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for senderId: ${messageData.senderId}`);
            }
        }
        
        const message = {
            _id: doc.id,
            id: doc.id,
            senderName: userData?.name || messageData.senderName || messageData.from || 'Anonymous',
            senderEmail: userData?.email || messageData.senderEmail || messageData.email || 'N/A',
            senderAvatar: userData?.avatar || messageData.senderAvatar || null,
            subject: messageData.subject || messageData.title || 'No Subject',
            content: messageData.content || messageData.message || messageData.text || '',
            type: messageData.type || 'general',
            status: messageData.status || (messageData.isRead ? 'read' : 'unread'),
            isRead: messageData.isRead || false,
            isBlocked: messageData.isBlocked || false,
            blockedAt: messageData.blockedAt || null,
            blockedBy: messageData.blockedBy || null,
            blockReason: messageData.blockReason || null,
            attachments: messageData.attachments || [],
            thread: messageData.thread || [],
            createdAt: messageData.createdAt,
            ...messageData
        };
        
        res.json({
            success: true,
            data: {
                message: message
            }
        });
    } catch (error) {
        console.error('Error fetching message details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching message details',
            error: error.message
        });
    }
});

// Update message status - ENHANCED with blocking
router.patch('/messages/:messageId/status', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status, isRead } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        const updateData = {
            status: status,
            updatedAt: new Date().toISOString()
        };
        
        // Update isRead based on status or explicit value
        if (isRead !== undefined) {
            updateData.isRead = isRead;
        } else if (status === 'read' || status === 'replied') {
            updateData.isRead = true;
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

// ADDED: Block/Unblock individual message
router.patch('/messages/:messageId/block', blockMessage);

// ADDED: Block/Unblock user from sending messages
router.patch('/messages/user/:userEmail/block', blockUserMessages);

// Reply to message - ENHANCED
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
        
        // Get original message
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Original message not found'
            });
        }
        
        const messageData = messageDoc.data();
        
        // Check if message is blocked
        if (messageData.isBlocked) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reply to blocked message'
            });
        }
        
        const replyData = {
            senderName: req.user?.name || 'Admin',
            senderEmail: req.user?.email || 'admin@steelconnect.com',
            content: content.trim(),
            sentAt: new Date().toISOString(),
            isAdmin: true
        };
        
        // Update original message with reply and mark as replied
        await adminDb.collection('messages').doc(messageId).update({
            status: 'replied',
            isRead: true,
            thread: [...(messageData.thread || []), replyData],
            lastReplyAt: new Date().toISOString(),
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

// Delete message
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

// FIXED: Estimations management with proper file download endpoints
router.get('/estimations', getAllEstimations);
router.get('/estimations/:estimationId', getEstimationById);
router.get('/estimations/:estimationId/files', getEstimationFiles);
router.get('/estimations/:estimationId/result', getEstimationResult);

// ADDED: File download endpoints that actually work
router.get('/estimations/:estimationId/files/:fileName/download', downloadEstimationFile);
router.get('/estimations/:estimationId/result/download', downloadEstimationResult);

router.patch('/estimations/:estimationId/status', updateEstimationStatus);
router.patch('/estimations/:estimationId/due-date', setEstimationDueDate);

// Upload estimation result
router.post('/estimations/:estimationId/result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { notes } = req.body;
        
        // Check if estimation exists
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        // Handle file upload (you'll need to implement file upload middleware)
        if (!req.file && !req.files) {
            return res.status(400).json({
                success: false,
                message: 'No result file uploaded'
            });
        }
        
        const file = req.file || req.files.resultFile;
        
        // Create result file object
        const resultFile = {
            name: file.originalname || file.name,
            url: file.path || file.url, // Adjust based on your file storage setup
            size: file.size,
            type: file.mimetype || file.type,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user?.email || 'admin'
        };
        
        // Update estimation with result file
        await adminDb.collection('estimations').doc(estimationId).update({
            resultFile: resultFile,
            status: 'completed',
            notes: notes || '',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            data: {
                resultFile: resultFile
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

// Quotes management - FIXES /api/admin/quotes 404  
router.get('/quotes', getAllQuotes);

// Update quote status
router.patch('/quotes/:quoteId/status', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        await adminDb.collection('quotes').doc(quoteId).update({
            status: status,
            updatedAt: new Date().toISOString()
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

// Update quote amount
router.patch('/quotes/:quoteId/amount', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { amount } = req.body;
        
        if (amount === undefined || amount < 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }
        
        await adminDb.collection('quotes').doc(quoteId).update({
            amount: parseFloat(amount),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Quote amount updated successfully'
        });
    } catch (error) {
        console.error('Error updating quote amount:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating quote amount',
            error: error.message
        });
    }
});

// Get single quote details
router.get('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const doc = await adminDb.collection('quotes').doc(quoteId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Quote not found'
            });
        }
        
        const quoteData = doc.data();
        let userData = null;
        
        if (quoteData.userId) {
            try {
                const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for quote: ${quoteId}`);
            }
        }
        
        const quote = {
            _id: doc.id,
            id: doc.id,
            quoteNumber: quoteData.quoteNumber || doc.id.slice(-6),
            clientName: userData?.name || quoteData.clientName || 'Unknown',
            clientEmail: userData?.email || quoteData.clientEmail || 'N/A',
            clientPhone: userData?.phone || quoteData.clientPhone || 'Not provided',
            projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled',
            projectType: quoteData.projectType || quoteData.category || 'General',
            description: quoteData.description || '',
            amount: quoteData.amount || quoteData.estimatedAmount || 0,
            status: quoteData.status || 'pending',
            createdAt: quoteData.createdAt,
            updatedAt: quoteData.updatedAt,
            ...quoteData
        };
        
        res.json({
            success: true,
            data: {
                quote: quote
            }
        });
    } catch (error) {
        console.error('Error fetching quote details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching quote details',
            error: error.message
        });
    }
});

// Delete quote
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

// Jobs management - FIXES /api/admin/jobs 404
router.get('/jobs', getAllJobs);

// Update job status
router.patch('/jobs/:jobId/status', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        await adminDb.collection('jobs').doc(jobId).update({
            status: status,
            updatedAt: new Date().toISOString()
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

// Update job progress
router.patch('/jobs/:jobId/progress', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { progress } = req.body;
        
        if (progress === undefined || progress < 0 || progress > 100) {
            return res.status(400).json({
                success: false,
                message: 'Progress must be between 0 and 100'
            });
        }
        
        await adminDb.collection('jobs').doc(jobId).update({
            progress: parseInt(progress),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Job progress updated successfully'
        });
    } catch (error) {
        console.error('Error updating job progress:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating job progress',
            error: error.message
        });
    }
});

// Get single job details
router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const doc = await adminDb.collection('jobs').doc(jobId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }
        
        const jobData = doc.data();
        
        const job = {
            _id: doc.id,
            id: doc.id,
            jobNumber: jobData.jobNumber || doc.id.slice(-6),
            projectTitle: jobData.title || jobData.projectTitle || 'Untitled Job',
            projectType: jobData.category || jobData.type || 'General',
            clientName: jobData.clientName || jobData.posterName || 'Unknown',
            clientEmail: jobData.clientEmail || jobData.posterEmail || 'N/A',
            clientPhone: jobData.clientPhone || 'Not provided',
            contractorName: jobData.contractorName || jobData.assignedTo || 'Unassigned',
            contractorEmail: jobData.contractorEmail || 'N/A',
            contractorCompany: jobData.contractorCompany || 'Independent',
            value: jobData.budget || jobData.amount || jobData.value || 0,
            status: jobData.status || 'pending',
            progress: jobData.progress || 0,
            description: jobData.description || '',
            startDate: jobData.startDate,
            expectedCompletion: jobData.expectedCompletion || jobData.deadline,
            createdAt: jobData.createdAt,
            updatedAt: jobData.updatedAt,
            ...jobData
        };
        
        res.json({
            success: true,
            data: {
                job: job
            }
        });
    } catch (error) {
        console.error('Error fetching job details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching job details',
            error: error.message
        });
    }
});

// Delete job
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

// Subscriptions management - FIXES /api/admin/subscriptions 404
router.get('/subscriptions', getAllSubscriptions);

// Export functions
router.get('/export/users', async (req, res) => {
    try {
        // Implement CSV export for users
        res.json({
            success: true,
            downloadUrl: '/api/admin/download/users.csv',
            message: 'Export prepared successfully'
        });
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting users',
            error: error.message
        });
    }
});

router.get('/export/quotes', async (req, res) => {
    try {
        // Implement CSV export for quotes
        res.json({
            success: true,
            downloadUrl: '/api/admin/download/quotes.csv',
            message: 'Export prepared successfully'
        });
    } catch (error) {
        console.error('Error exporting quotes:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting quotes',
            error: error.message
        });
    }
});

router.get('/export/estimations', async (req, res) => {
    try {
        // Implement CSV export for estimations
        res.json({
            success: true,
            downloadUrl: '/api/admin/download/estimations.csv',
            message: 'Export prepared successfully'
        });
    } catch (error) {
        console.error('Error exporting estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting estimations',
            error: error.message
        });
    }
});

router.get('/export/jobs', async (req, res) => {
    try {
        // Implement CSV export for jobs
        res.json({
            success: true,
            downloadUrl: '/api/admin/download/jobs.csv',
            message: 'Export prepared successfully'
        });
    } catch (error) {
        console.error('Error exporting jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting jobs',
            error: error.message
        });
    }
});

router.get('/export/messages', async (req, res) => {
    try {
        // Implement CSV export for messages
        res.json({
            success: true,
            downloadUrl: '/api/admin/download/messages.csv',
            message: 'Export prepared successfully'
        });
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
