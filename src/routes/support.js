// src/routes/support.js - Complete Support System Routes
import express from 'express';
import multer from 'multer';
import { adminDb } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadMultipleFilesToFirebase } from '../utils/firebaseStorage.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Maximum 5 files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, JPG, PNG, DOC, DOCX, and TXT files are allowed.'));
        }
    }
});

// All support routes require authentication
router.use(authenticateToken);

// Submit support request
router.post('/submit', upload.array('attachments', 5), async (req, res) => {
    try {
        const { subject, priority, message, userType, userName, userEmail } = req.body;
        const userId = req.user.userId || req.user.id;
        const files = req.files || [];

        console.log(`[SUPPORT] New support request from ${userName} (${userEmail})`);

        // Validate required fields
        if (!subject || !priority || !message) {
            return res.status(400).json({
                success: false,
                message: 'Subject, priority, and message are required.'
            });
        }

        // Validate priority level
        const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid priority level.'
            });
        }

        // Process file uploads if any
        let attachments = [];
        if (files && files.length > 0) {
            try {
                const uploadedFiles = await uploadMultipleFilesToFirebase(files, `support/${userId}`);
                attachments = uploadedFiles.map(file => ({
                    originalName: file.originalname || file.name,
                    filename: file.filename || file.name,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: file.url || file.downloadURL,
                    uploadedAt: new Date()
                }));
                
                console.log(`[SUPPORT] Uploaded ${attachments.length} files for support request`);
            } catch (uploadError) {
                console.error('[SUPPORT] File upload error:', uploadError);
                // Continue with the request even if file upload fails
                console.warn('[SUPPORT] Continuing without file attachments due to upload error');
            }
        }

        // Create support ticket ID
        const ticketId = `SUP-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        // Create the support message document for admin messages collection
        const supportMessage = {
            ticketId,
            subject: `[${priority}] ${subject}`,
            content: message,
            message,
            priority,
            senderName: userName,
            senderEmail: userEmail,
            userType,
            userId,
            attachments,
            status: 'unread',
            ticketStatus: 'open',
            type: 'support',
            createdAt: new Date(),
            updatedAt: new Date(),
            
            // Additional metadata for admin dashboard
            metadata: {
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress,
                source: 'web_app',
                category: 'user_support',
                action: 'support_request_created'
            }
        };

        // Save to messages collection (so admin can see it in their message dashboard)
        const messageRef = adminDb.collection('messages').doc();
        await messageRef.set(supportMessage);

        console.log(`[SUPPORT] Support ticket ${ticketId} created in messages collection`);

        // Also save to a dedicated support_tickets collection for better organization
        const supportTicket = {
            ...supportMessage,
            messageId: messageRef.id,
            responses: [],
            lastResponseAt: null,
            resolvedAt: null,
            assignedTo: null,
            assignedToName: null,
            assignedAt: null,
            assignedBy: null,
            tags: [],
            internalNotes: []
        };

        const supportRef = adminDb.collection('support_tickets').doc(ticketId);
        await supportRef.set(supportTicket);

        console.log(`[SUPPORT] Support ticket ${ticketId} created in support_tickets collection`);

        // Create notifications for admins
        try {
            const adminUsers = await adminDb.collection('users')
                .where('role', '==', 'admin')
                .get();

            if (!adminUsers.empty) {
                const batch = adminDb.batch();
                
                adminUsers.forEach(adminDoc => {
                    const notificationRef = adminDb.collection('notifications').doc();
                    const notification = {
                        userId: adminDoc.id,
                        title: `New ${priority} Priority Support Request`,
                        message: `${userName} (${userType}) needs help: ${subject}`,
                        type: 'support',
                        metadata: {
                            action: 'support_request_created',
                            ticketId,
                            messageId: messageRef.id,
                            userId,
                            userName,
                            userEmail,
                            priority,
                            subject: subject.substring(0, 100),
                            attachmentCount: attachments.length
                        },
                        isRead: false,
                        seen: false,
                        deleted: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    batch.set(notificationRef, notification);
                });

                await batch.commit();
                console.log(`[SUPPORT] Admin notifications created for ticket ${ticketId}`);
            } else {
                console.warn('[SUPPORT] No admin users found for notifications');
            }
            
        } catch (notificationError) {
            console.error('[SUPPORT] Failed to create admin notifications:', notificationError);
            // Don't fail the request if notifications fail - just log the error
        }

        // Send success response
        res.status(201).json({
            success: true,
            message: 'Support request submitted successfully. You will receive a response within 24 hours.',
            data: {
                ticketId,
                messageId: messageRef.id,
                status: 'submitted',
                estimatedResponseTime: '24 hours',
                attachmentCount: attachments.length,
                priority
            }
        });

        console.log(`[SUPPORT] Support request ${ticketId} processed successfully`);

    } catch (error) {
        console.error('[SUPPORT] Error submitting support request:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to submit support request. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get user's support tickets
router.get('/my-tickets', async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        
        const ticketsSnapshot = await adminDb.collection('support_tickets')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const tickets = [];
        ticketsSnapshot.forEach(doc => {
            const ticketData = doc.data();
            // Remove sensitive admin-only fields
            const { internalNotes, assignedTo, metadata, ...publicData } = ticketData;
            tickets.push({
                id: doc.id,
                ...publicData,
                // Keep only safe metadata
                source: metadata?.source || 'web_app'
            });
        });

        res.json({
            success: true,
            tickets,
            count: tickets.length
        });

    } catch (error) {
        console.error('[SUPPORT] Error fetching user tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support tickets.'
        });
    }
});

// Get specific ticket details
router.get('/ticket/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const userId = req.user.userId || req.user.id;

        const ticketDoc = await adminDb.collection('support_tickets').doc(ticketId).get();
        
        if (!ticketDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found.'
            });
        }

        const ticketData = ticketDoc.data();
        
        // Verify user owns this ticket
        if (ticketData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Remove admin-only fields but keep responses for conversation history
        const { internalNotes, assignedTo, metadata, ...publicData } = ticketData;

        res.json({
            success: true,
            ticket: {
                id: ticketDoc.id,
                ...publicData,
                // Keep only safe metadata
                source: metadata?.source || 'web_app'
            }
        });

    } catch (error) {
        console.error('[SUPPORT] Error fetching ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket details.'
        });
    }
});

// Add response to ticket (user can respond to admin replies)
router.post('/ticket/:ticketId/respond', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { message } = req.body;
        const userId = req.user.userId || req.user.id;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Response message is required.'
            });
        }

        // Get the ticket
        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found.'
            });
        }

        const ticketData = ticketDoc.data();
        
        // Verify user owns this ticket
        if (ticketData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Add response to the ticket
        const response = {
            message: message.trim(),
            responderId: userId,
            responderName: req.user.name,
            responderType: 'user',
            createdAt: new Date()
        };

        await ticketRef.update({
            responses: adminDb.FieldValue.arrayUnion(response),
            updatedAt: new Date(),
            ticketStatus: 'waiting_admin_response',
            lastResponseAt: new Date(),
            lastResponseBy: req.user.name
        });

        // Create notification for admins about user response
        try {
            const adminUsers = await adminDb.collection('users')
                .where('role', '==', 'admin')
                .get();

            if (!adminUsers.empty) {
                const batch = adminDb.batch();
                
                adminUsers.forEach(adminDoc => {
                    const notificationRef = adminDb.collection('notifications').doc();
                    const notification = {
                        userId: adminDoc.id,
                        title: `User Response - ${ticketData.subject}`,
                        message: `${req.user.name} responded to support ticket: ${message.substring(0, 100)}...`,
                        type: 'support',
                        metadata: {
                            action: 'user_response',
                            ticketId,
                            userId,
                            userName: req.user.name,
                            subject: ticketData.subject,
                            responsePreview: message.substring(0, 150)
                        },
                        isRead: false,
                        seen: false,
                        deleted: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    batch.set(notificationRef, notification);
                });

                await batch.commit();
                console.log(`[SUPPORT] Admin notifications created for user response on ticket ${ticketId}`);
            }
            
        } catch (notificationError) {
            console.error('[SUPPORT] Failed to create admin notifications for user response:', notificationError);
        }

        res.json({
            success: true,
            message: 'Response added successfully.',
            response
        });

    } catch (error) {
        console.error('[SUPPORT] Error adding response:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add response.'
        });
    }
});

// Get support statistics for user
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        
        const ticketsSnapshot = await adminDb.collection('support_tickets')
            .where('userId', '==', userId)
            .get();

        const stats = {
            total: ticketsSnapshot.size,
            open: 0,
            in_progress: 0,
            waiting_admin_response: 0,
            resolved: 0,
            closed: 0
        };

        ticketsSnapshot.forEach(doc => {
            const data = doc.data();
            const status = data.ticketStatus || 'open';
            if (stats.hasOwnProperty(status)) {
                stats[status]++;
            }
        });

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('[SUPPORT] Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support statistics.'
        });
    }
});

// Search user's tickets
router.get('/search', async (req, res) => {
    try {
        const { query, status, priority } = req.query;
        const userId = req.user.userId || req.user.id;

        if (!query || query.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 3 characters long.'
            });
        }

        let ticketsQuery = adminDb.collection('support_tickets')
            .where('userId', '==', userId);

        // Apply filters
        if (status && status !== 'all') {
            ticketsQuery = ticketsQuery.where('ticketStatus', '==', status);
        }

        if (priority && priority !== 'all') {
            ticketsQuery = ticketsQuery.where('priority', '==', priority);
        }

        const ticketsSnapshot = await ticketsQuery
            .orderBy('createdAt', 'desc')
            .get();

        const tickets = [];
        const searchTerm = query.toLowerCase();

        ticketsSnapshot.forEach(doc => {
            const ticketData = doc.data();
            
            // Search in subject and message content
            const searchableContent = `${ticketData.subject} ${ticketData.message}`.toLowerCase();
            
            if (searchableContent.includes(searchTerm)) {
                const { internalNotes, assignedTo, metadata, ...publicData } = ticketData;
                tickets.push({
                    id: doc.id,
                    ...publicData,
                    source: metadata?.source || 'web_app'
                });
            }
        });

        res.json({
            success: true,
            tickets,
            count: tickets.length,
            query
        });

    } catch (error) {
        console.error('[SUPPORT] Error searching tickets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search support tickets.'
        });
    }
});

// Update ticket (limited updates allowed by user)
router.patch('/ticket/:ticketId', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { subject, message } = req.body; // Only allow updating subject and message
        const userId = req.user.userId || req.user.id;

        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found.'
            });
        }

        const ticketData = ticketDoc.data();
        
        // Verify user owns this ticket
        if (ticketData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Only allow updates if ticket is still open
        if (ticketData.ticketStatus !== 'open') {
            return res.status(400).json({
                success: false,
                message: 'Cannot update ticket after it has been processed.'
            });
        }

        const updateData = {
            updatedAt: new Date()
        };

        if (subject && subject.trim()) {
            updateData.subject = `[${ticketData.priority}] ${subject.trim()}`;
        }

        if (message && message.trim()) {
            updateData.message = message.trim();
        }

        await ticketRef.update(updateData);

        res.json({
            success: true,
            message: 'Support ticket updated successfully.'
        });

    } catch (error) {
        console.error('[SUPPORT] Error updating ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update support ticket.'
        });
    }
});

// Close/Cancel ticket (user can close their own ticket)
router.post('/ticket/:ticketId/close', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { reason } = req.body;
        const userId = req.user.userId || req.user.id;

        const ticketRef = adminDb.collection('support_tickets').doc(ticketId);
        const ticketDoc = await ticketRef.get();

        if (!ticketDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found.'
            });
        }

        const ticketData = ticketDoc.data();
        
        // Verify user owns this ticket
        if (ticketData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Add closure response
        const closureResponse = {
            message: reason ? `Ticket closed by user. Reason: ${reason}` : 'Ticket closed by user.',
            responderId: userId,
            responderName: req.user.name,
            responderType: 'user',
            createdAt: new Date()
        };

        await ticketRef.update({
            ticketStatus: 'closed',
            closedAt: new Date(),
            closedBy: req.user.name,
            responses: adminDb.FieldValue.arrayUnion(closureResponse),
            updatedAt: new Date()
        });

        // Notify admins about ticket closure
        try {
            const adminUsers = await adminDb.collection('users')
                .where('role', '==', 'admin')
                .get();

            if (!adminUsers.empty) {
                const batch = adminDb.batch();
                
                adminUsers.forEach(adminDoc => {
                    const notificationRef = adminDb.collection('notifications').doc();
                    const notification = {
                        userId: adminDoc.id,
                        title: `Support Ticket Closed - ${ticketData.subject}`,
                        message: `${req.user.name} closed their support ticket${reason ? `: ${reason}` : '.'}`,
                        type: 'support',
                        metadata: {
                            action: 'ticket_closed_by_user',
                            ticketId,
                            userId,
                            userName: req.user.name,
                            reason
                        },
                        isRead: false,
                        seen: false,
                        deleted: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    batch.set(notificationRef, notification);
                });

                await batch.commit();
            }
            
        } catch (notificationError) {
            console.error('[SUPPORT] Failed to create admin notifications for ticket closure:', notificationError);
        }

        res.json({
            success: true,
            message: 'Support ticket closed successfully.'
        });

    } catch (error) {
        console.error('[SUPPORT] Error closing ticket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to close support ticket.'
        });
    }
});

// Get ticket conversation/history
router.get('/ticket/:ticketId/conversation', async (req, res) => {
    try {
        const { ticketId } = req.params;
        const userId = req.user.userId || req.user.id;

        const ticketDoc = await adminDb.collection('support_tickets').doc(ticketId).get();
        
        if (!ticketDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Support ticket not found.'
            });
        }

        const ticketData = ticketDoc.data();
        
        // Verify user owns this ticket
        if (ticketData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Return conversation history
        const conversation = {
            ticketId,
            subject: ticketData.subject,
            status: ticketData.ticketStatus,
            priority: ticketData.priority,
            createdAt: ticketData.createdAt,
            responses: ticketData.responses || [],
            lastResponseAt: ticketData.lastResponseAt,
            originalMessage: ticketData.message,
            attachments: ticketData.attachments || []
        };

        res.json({
            success: true,
            conversation
        });

    } catch (error) {
        console.error('[SUPPORT] Error fetching ticket conversation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket conversation.'
        });
    }
});

export default router;
