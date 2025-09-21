// src/routes/support.js - Complete Support System Routes with All Fixes
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

// Submit support request with enhanced file handling
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
                    name: file.name || file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    url: file.url || file.downloadURL,
                    uploadedAt: new Date().toISOString()
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

        // Create the support ticket document
        const supportTicket = {
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
            responses: [], // Initialize empty responses array
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            
            // Additional metadata
            metadata: {
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.connection.remoteAddress,
                source: 'web_app',
                category: 'user_support',
                action: 'support_request_created'
            },
            
            // Admin fields
            lastResponseAt: null,
            resolvedAt: null,
            assignedTo: null,
            assignedToName: null,
            assignedAt: null,
            assignedBy: null,
            tags: [],
            internalNotes: []
        };

        // Save to support_tickets collection
        const supportRef = adminDb.collection('support_tickets').doc(ticketId);
        await supportRef.set(supportTicket);

        console.log(`[SUPPORT] Support ticket ${ticketId} created successfully`);

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
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
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

// Get user's support tickets with enhanced response tracking
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
            
            // Remove sensitive admin-only fields but keep responses for conversation history
            const { internalNotes, assignedTo, metadata, ...publicData } = ticketData;
            
            // Process responses to mark admin responses as unread if user hasn't seen them
            let processedResponses = [];
            if (ticketData.responses && Array.isArray(ticketData.responses)) {
                processedResponses = ticketData.responses.map(response => ({
                    ...response,
                    // Mark admin responses as unread by default (user needs to mark as read)
                    isRead: response.responderType === 'user' ? true : (response.isRead || false)
                }));
            }
            
            tickets.push({
                id: doc.id,
                ...publicData,
                responses: processedResponses,
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

// Get specific ticket details with enhanced file handling
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
            console.warn(`[SUPPORT] Access denied for user ${userId} on ticket ${ticketId}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied.'
            });
        }

        // Remove admin-only fields but keep responses for conversation history
        const { internalNotes, assignedTo, metadata, ...publicData } = ticketData;
        
        // Process attachments to ensure proper URLs
        let processedAttachments = [];
        if (ticketData.attachments && Array.isArray(ticketData.attachments)) {
            processedAttachments = ticketData.attachments.map((attachment, index) => ({
                ...attachment,
                index,
                name: attachment.originalName || attachment.filename || attachment.name || `Attachment ${index + 1}`,
                size: attachment.size || 0,
                uploadedAt: attachment.uploadedAt || ticketData.createdAt
            }));
        }
        
        // Process responses with proper timestamps
        let processedResponses = [];
        if (ticketData.responses && Array.isArray(ticketData.responses)) {
            processedResponses = ticketData.responses.map(response => ({
                ...response,
                createdAt: response.createdAt || new Date().toISOString()
            }));
        }
        
        console.log(`[SUPPORT] Fetched details for ticket ${ticketId} for user ${userId}`);
        
        res.json({
            success: true,
            ticket: {
                id: ticketDoc.id,
                ...publicData,
                attachments: processedAttachments,
                responses: processedResponses,
                // Keep only safe metadata
                source: metadata?.source || 'web_app'
            }
        });

    } catch (error) {
        console.error(`[SUPPORT] Error fetching ticket ${req.params.ticketId}:`, error);
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

        // Create response with proper timestamp and user info
        const response = {
            message: message.trim(),
            responderId: userId,
            responderName: req.user.name,
            responderEmail: req.user.email || req.user.id, // Fallback for email
            responderType: 'user',
            createdAt: new Date().toISOString(), // Use ISO string for consistency
            isRead: false // Track if user has read admin responses
        };

        // Update ticket with new response
        const currentResponses = ticketData.responses || [];
        const updatedResponses = [...currentResponses, response];

        await ticketRef.update({
            responses: updatedResponses,
            updatedAt: new Date().toISOString(),
            ticketStatus: 'waiting_admin_response', // Status indicating admin needs to reply
            lastResponseAt: new Date().toISOString(),
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
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
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

// Get support ticket files
router.get('/ticket/:ticketId/files', async (req, res) => {
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

        const attachments = ticketData.attachments || [];

        res.json({
            success: true,
            files: attachments.map((attachment, index) => ({
                index,
                name: attachment.originalName || attachment.filename || attachment.name || `Attachment ${index + 1}`,
                url: attachment.url,
                size: attachment.size || 0,
                mimetype: attachment.mimetype || 'application/octet-stream',
                uploadedAt: attachment.uploadedAt || ticketData.createdAt
            }))
        });

    } catch (error) {
        console.error('Error fetching support ticket files:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket files.'
        });
    }
});

// Mark admin responses as read
router.patch('/ticket/:ticketId/mark-responses-read', async (req, res) => {
    try {
        const { ticketId } = req.params;
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

        // Mark all admin responses as read
        const updatedResponses = (ticketData.responses || []).map(response => {
            if (response.responderType === 'admin') {
                return { ...response, isRead: true, readAt: new Date().toISOString() };
            }
            return response;
        });

        await ticketRef.update({
            responses: updatedResponses,
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Admin responses marked as read.'
        });

    } catch (error) {
        console.error('[SUPPORT] Error marking responses as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark responses as read.'
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'support',
        timestamp: new Date().toISOString(),
        status: 'operational'
    });
});

export default router;
