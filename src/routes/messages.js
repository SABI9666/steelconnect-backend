// src/routes/messages.js - MINIMAL FIX (Keep your auth files unchanged)
import express from 'express';
import { adminDb } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js'; // Use YOUR existing auth.js

const router = express.Router();

// All message routes are protected
router.use(authenticateToken);

router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// FIXED message sending - consistent with messageController storage
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId || req.user.id; // Handle both auth formats

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message text is required and cannot be empty' 
      });
    }

    // Get conversation and verify access
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found' 
      });
    }
    
    const conversationData = conversationDoc.data();
    
    // Check if user is authorized
    if (!conversationData.participantIds || !conversationData.participantIds.includes(userId)) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to send messages in this conversation' 
      });
    }

    // Create message - STORE IN SUBCOLLECTION (same as messageController.js getMessages)
    const messageData = {
      text: text.trim(),
      senderId: userId,
      senderName: req.user.name,
      createdAt: new Date()
    };

    // Store in subcollection - CRITICAL: This must match where getMessages reads from
    const messageRef = await adminDb
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')  // SUBCOLLECTION - same as messageController
      .add(messageData);

    const newMessage = { id: messageRef.id, ...messageData };

    // Update conversation
    await adminDb.collection('conversations').doc(conversationId).update({
      lastMessage: text.trim().substring(0, 100),
      lastMessageBy: req.user.name,
      updatedAt: new Date()
    });

    // Create notification (non-blocking)
    setImmediate(async () => {
      try {
        const recipientIds = conversationData.participantIds.filter(id => id !== userId);
        
        if (recipientIds.length > 0) {
          const messagePreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
          
          // Create notifications for each recipient
          for (const recipientId of recipientIds) {
            const notification = {
              userId: recipientId,
              type: 'message',
              message: `New message from ${req.user.name}: "${messagePreview}"`,
              metadata: {
                messageId: messageRef.id,
                conversationId: conversationId,
                senderId: userId,
                action: 'new_message'
              },
              isRead: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await adminDb.collection('notifications').add(notification);
          }
        }
      } catch (notificationError) {
        console.error('Failed to send notification:', notificationError);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
