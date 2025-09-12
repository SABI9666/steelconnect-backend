// src/routes/messages.js - COMPLETE FINAL WORKING VERSION with blocking functionality
import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotificationService } from './notifications.js'; // Import from your working notifications file
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Helper function to get participant details (replicated from controller)
const getParticipantDetails = async (participantIds) => {
    try {
        const participantPromises = participantIds.map(id => adminDb.collection('users').doc(id).get());
        const participantDocs = await Promise.all(participantPromises);

        return participantDocs.map(doc => {
            if (!doc.exists) return { id: doc.id, name: 'Unknown User' };
            const { name, type } = doc.data();
            return { id: doc.id, name, type };
        });
    } catch (error) {
        console.error('Error fetching participant details:', error);
        return [];
    }
};

// NEW: Middleware to check if user is blocked from sending messages
const checkUserBlocked = async (req, res, next) => {
    try {
        const senderId = req.user.userId || req.user.id;
        
        console.log(`[MESSAGE-BLOCK-CHECK] Checking block status for user: ${senderId}`);
        
        // Check if user is blocked
        const userDoc = await adminDb.collection('users').doc(senderId).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            console.log(`[MESSAGE-BLOCK-CHECK] User data:`, {
                email: userData.email,
                isBlocked: userData.isBlocked,
                canSendMessages: userData.canSendMessages,
                blockedReason: userData.blockedReason
            });
            
            if (userData.isBlocked === true || userData.canSendMessages === false) {
                console.log(`[MESSAGE-BLOCK] User ${senderId} (${userData.email}) is blocked from sending messages`);
                return res.status(403).json({
                    success: false,
                    message: 'Your account has been restricted from sending messages. Please contact support for assistance.',
                    blocked: true,
                    reason: userData.blockedReason || 'Account restricted by administrator',
                    code: 'MESSAGING_RESTRICTED'
                });
            }
        }
        
        console.log(`[MESSAGE-BLOCK-CHECK] User ${senderId} is allowed to send messages`);
        next();
    } catch (error) {
        console.error('Error checking user blocked status:', error);
        // Continue anyway to avoid breaking the flow if there's an error
        next();
    }
};

// All message routes are protected
router.use(authenticateToken);

// Standard routes using controller functions
router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// ENHANCED MESSAGE SENDING - Complete working version with blocking check
router.post('/:conversationId/messages', checkUserBlocked, async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const { text } = req.body;
        const senderId = req.user.userId || req.user.id; // Handle both auth formats

        console.log(`[MESSAGE-ROUTE] Sending message: User ${senderId} (${req.user.name}) in conversation ${conversationId}`);

        // Validate input
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.log(`[MESSAGE-ROUTE] Invalid text input:`, text);
            return res.status(400).json({ 
                success: false, 
                message: 'Message text is required and cannot be empty' 
            });
        }

        // Get conversation and validate access
        const convoRef = adminDb.collection('conversations').doc(conversationId);
        const convoDoc = await convoRef.get();

        if (!convoDoc.exists) {
            console.log(`[MESSAGE-ROUTE] Conversation ${conversationId} not found`);
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }

        const conversationData = convoDoc.data();
        
        if (!conversationData.participantIds || !conversationData.participantIds.includes(senderId)) {
            console.log(`[MESSAGE-ROUTE] User ${senderId} not authorized for conversation ${conversationId}`);
            return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
        }

        // Create message object with proper timestamp
        const messageTimestamp = new Date();
        const newMessage = {
            text: text.trim(),
            senderId,
            senderName: req.user.name,
            createdAt: messageTimestamp
        };
        
        console.log(`[MESSAGE-ROUTE] Saving message to subcollection...`);
        
        // Save message to subcollection (CRITICAL: This must match where getMessages reads from)
        const messagesCollectionRef = convoRef.collection('messages');
        const messageRef = await messagesCollectionRef.add(newMessage);

        // Update conversation metadata
        await convoRef.update({ 
            lastMessage: text.trim().substring(0, 100),
            updatedAt: messageTimestamp,
            lastMessageBy: req.user.name
        });

        console.log(`[MESSAGE-ROUTE] Message saved with ID: ${messageRef.id}`);

        const messageResponse = { id: messageRef.id, ...newMessage };

        // Send success response FIRST (critical for frontend)
        res.status(201).json({ 
            success: true, 
            message: 'Message sent successfully', 
            data: messageResponse 
        });

        // NOTIFICATION CREATION - After response sent (non-blocking)
        setImmediate(async () => {
            try {
                console.log(`[NOTIFICATION] Creating message notifications for conversation ${conversationId}...`);
                
                // Get participant details for notification
                console.log(`[NOTIFICATION] Fetching participant details for:`, conversationData.participantIds);
                const participants = await getParticipantDetails(conversationData.participantIds);
                console.log(`[NOTIFICATION] Retrieved participants:`, participants.map(p => `${p.name} (${p.id})`));
                
                // Validate we have participants
                if (!participants || participants.length === 0) {
                    console.error(`[NOTIFICATION] No participants found for conversation ${conversationId}`);
                    return;
                }
                
                // Get job title for context
                let jobTitle = 'Unknown Project';
                if (conversationData.jobId) {
                    try {
                        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
                        if (jobDoc.exists) {
                            jobTitle = jobDoc.data().title;
                        }
                    } catch (jobError) {
                        console.warn(`[NOTIFICATION] Could not fetch job title:`, jobError.message);
                    }
                }
                console.log(`[NOTIFICATION] Job title: ${jobTitle}`);

                // Prepare enriched conversation data for notification service
                const enrichedConversationData = {
                    id: conversationId,
                    participants,
                    jobTitle,
                    ...conversationData
                };

                console.log(`[NOTIFICATION] Calling NotificationService.notifyNewMessage...`);
                console.log(`[NOTIFICATION] Notification data:`, {
                    messageId: messageResponse.id,
                    senderName: messageResponse.senderName,
                    text: messageResponse.text.substring(0, 30) + '...',
                    participantCount: participants.length,
                    recipientIds: participants.filter(p => p.id !== senderId).map(p => ({ id: p.id, name: p.name }))
                });
                
                // Create notification using your existing working service
                if (NotificationService && typeof NotificationService.notifyNewMessage === 'function') {
                    await NotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
                    console.log(`[NOTIFICATION] Message notifications created successfully`);
                } else {
                    console.warn(`[NOTIFICATION] NotificationService not available or method missing`);
                }
                
            } catch (notificationError) {
                console.error(`[NOTIFICATION] Failed to create message notifications:`, notificationError);
                console.error(`[NOTIFICATION] Error details:`, {
                    name: notificationError.name,
                    message: notificationError.message,
                    stack: notificationError.stack?.split('\n').slice(0, 3) // First 3 lines of stack
                });
                // Don't fail the message send if notifications fail - just log the error
            }
        });

    } catch (error) {
        console.error('[MESSAGE-ROUTE] Error in message sending route:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// NEW: Get user's blocking status
router.get('/user/status', async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
        res.json({
            success: true,
            data: {
                canSendMessages: userData.canSendMessages !== false,
                isBlocked: userData.isBlocked || false,
                blockedReason: userData.blockedReason || null,
                blockedAt: userData.blockedAt || null,
                blockedBy: userData.blockedBy || null
            }
        });
        
    } catch (error) {
        console.error('Error fetching user message status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user status'
        });
    }
});

// NEW: Check if user can send messages (quick endpoint for frontend)
router.get('/can-send', async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.json({
                success: true,
                canSend: false,
                reason: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        const canSend = userData.canSendMessages !== false && userData.isBlocked !== true;
        
        res.json({
            success: true,
            canSend: canSend,
            reason: canSend ? null : (userData.blockedReason || 'Account restricted')
        });
        
    } catch (error) {
        console.error('Error checking if user can send messages:', error);
        res.json({
            success: true,
            canSend: true, // Default to allowing if there's an error
            reason: null
        });
    }
});

// NEW: Get blocked users list (for admin or debugging)
router.get('/blocked-users', async (req, res) => {
    try {
        // Only allow admins to access this endpoint
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }
        
        const blockedUsersSnapshot = await adminDb.collection('users')
            .where('isBlocked', '==', true)
            .get();
        
        const blockedUsers = blockedUsersSnapshot.docs.map(doc => {
            const userData = doc.data();
            return {
                id: doc.id,
                name: userData.name,
                email: userData.email,
                blockedAt: userData.blockedAt,
                blockedBy: userData.blockedBy,
                blockedReason: userData.blockedReason
            };
        });
        
        res.json({
            success: true,
            blockedUsers: blockedUsers,
            count: blockedUsers.length
        });
        
    } catch (error) {
        console.error('Error fetching blocked users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching blocked users'
        });
    }
});

// NEW: Mark message as read
router.patch('/:conversationId/messages/:messageId/read', async (req, res) => {
    try {
        const { conversationId, messageId } = req.params;
        const userId = req.user.userId || req.user.id;
        
        // Verify user has access to this conversation
        const convoRef = adminDb.collection('conversations').doc(conversationId);
        const convoDoc = await convoRef.get();
        
        if (!convoDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        
        const conversationData = convoDoc.data();
        if (!conversationData.participantIds || !conversationData.participantIds.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Mark message as read
        const messageRef = convoRef.collection('messages').doc(messageId);
        const messageDoc = await messageRef.get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }
        
        // Update read status
        const readByField = `readBy.${userId}`;
        await messageRef.update({
            [readByField]: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Message marked as read'
        });
        
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking message as read'
        });
    }
});

// NEW: Get conversation statistics
router.get('/:conversationId/stats', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.userId || req.user.id;
        
        // Verify user has access to this conversation
        const convoRef = adminDb.collection('conversations').doc(conversationId);
        const convoDoc = await convoRef.get();
        
        if (!convoDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        
        const conversationData = convoDoc.data();
        if (!conversationData.participantIds || !conversationData.participantIds.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Get message statistics
        const messagesSnapshot = await convoRef.collection('messages').get();
        const totalMessages = messagesSnapshot.size;
        
        let messagesBySender = {};
        messagesSnapshot.docs.forEach(doc => {
            const messageData = doc.data();
            const senderId = messageData.senderId;
            messagesBySender[senderId] = (messagesBySender[senderId] || 0) + 1;
        });
        
        res.json({
            success: true,
            stats: {
                totalMessages: totalMessages,
                messagesBySender: messagesBySender,
                participantCount: conversationData.participantIds.length,
                lastActivity: conversationData.updatedAt,
                createdAt: conversationData.createdAt
            }
        });
        
    } catch (error) {
        console.error('Error getting conversation stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting conversation statistics'
        });
    }
});

export default router;
