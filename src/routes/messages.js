// src/routes/messages.js - FIXED VERSION with temporary notification service
import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// TEMPORARY NOTIFICATION SERVICE - Remove the incorrect import and use this instead
class TempNotificationService {
  static async notifyNewMessage(messageData, conversationData) {
    try {
      console.log('📬 Creating message notification...');
      
      if (!conversationData.participants || conversationData.participants.length === 0) {
        console.warn('No participants found for message notification');
        return;
      }

      // Find recipients (everyone except the sender)
      const recipients = conversationData.participants.filter(p => p.id !== messageData.senderId);
      
      if (recipients.length === 0) {
        console.warn('No recipients found for message notification');
        return;
      }

      const notifications = [];

      // Create notifications for each recipient
      recipients.forEach(recipient => {
        const preview = messageData.text.length > 50 
          ? messageData.text.substring(0, 50) + '...'
          : messageData.text;

        notifications.push({
          userId: recipient.id,
          title: `New message from ${messageData.senderName}`,
          message: preview,
          type: 'message',
          metadata: {
            action: 'message_received',
            messageId: messageData.id,
            conversationId: conversationData.id,
            senderId: messageData.senderId,
            senderName: messageData.senderName,
            jobTitle: conversationData.jobTitle || 'Project Discussion',
            preview: preview
          },
          isRead: false,
          seen: false,
          deleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      // Delivery confirmation to sender
      notifications.push({
        userId: messageData.senderId,
        title: 'Message Delivered',
        message: `Your message has been delivered to ${recipients.map(r => r.name).join(', ')}`,
        type: 'message',
        metadata: {
          action: 'message_delivered',
          messageId: messageData.id,
          conversationId: conversationData.id,
          recipientCount: recipients.length,
          recipients: recipients.map(r => ({ id: r.id, name: r.name }))
        },
        isRead: false,
        seen: false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Save all notifications to database
      const batch = adminDb.batch();
      notifications.forEach(notification => {
        const notificationRef = adminDb.collection('notifications').doc();
        batch.set(notificationRef, notification);
      });
      await batch.commit();

      console.log(`✅ Message notifications sent to ${recipients.length} recipients`);
    } catch (error) {
      console.error('❌ Error in message notifications:', error);
      throw error;
    }
  }
}

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

// Middleware to check if user is blocked from sending messages
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

// ENHANCED MESSAGE SENDING with working notification system
router.post('/:conversationId/messages', checkUserBlocked, async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const { text } = req.body;
        const senderId = req.user.userId || req.user.id;

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
        
        // Save message to subcollection
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

                console.log(`[NOTIFICATION] Calling TempNotificationService.notifyNewMessage...`);
                
                // Create notification using temporary service
                await TempNotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
                console.log(`[NOTIFICATION] Message notifications created successfully`);
                
            } catch (notificationError) {
                console.error(`[NOTIFICATION] Failed to create message notifications:`, notificationError);
                console.error(`[NOTIFICATION] Error details:`, {
                    name: notificationError.name,
                    message: notificationError.message,
                    stack: notificationError.stack?.split('\n').slice(0, 3)
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

// Get user's blocking status
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

// Check if user can send messages (quick endpoint for frontend)
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

export default router;
