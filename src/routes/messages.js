// src/routes/messages.js - FINAL FIXED VERSION
import express from 'express';
import { adminDb } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js'; // Use same as your other routes
import { NotificationService } from './notifications.js'; // Import the notification service

const router = express.Router();

// All message routes are protected
router.use(authenticateToken);

router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// FIXED message sending with proper notification creation
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId || req.user.id; // Handle both auth formats

    console.log(`📤 Sending message: User ${userId} (${req.user.name}) in conversation ${conversationId}`);

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
      console.error(`❌ Conversation ${conversationId} not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found' 
      });
    }
    
    const conversationData = { id: conversationId, ...conversationDoc.data() };
    
    // Check if user is authorized
    if (!conversationData.participantIds || !conversationData.participantIds.includes(userId)) {
      console.error(`❌ User ${userId} not authorized for conversation ${conversationId}`);
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

    console.log(`✅ Message saved: ${messageRef.id}`);

    // Create notification using NotificationService (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`📢 Creating notifications for message ${messageRef.id}...`);
        
        // Get participant details for notification service
        const participants = await getParticipantDetails(conversationData.participantIds);
        const enrichedConversationData = {
          ...conversationData,
          participants
        };

        // Use the NotificationService to create notifications
        await NotificationService.notifyNewMessage(newMessage, enrichedConversationData);
        
        console.log(`✅ Notifications created for message ${messageRef.id}`);
        
      } catch (notificationError) {
        console.error(`❌ Failed to create notifications for message ${messageRef.id}:`, notificationError);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to get participant details (copy from messageController.js)
const getParticipantDetails = async (participantIds) => {
    const participantPromises = participantIds.map(id => adminDb.collection('users').doc(id).get());
    const participantDocs = await Promise.all(participantPromises);

    return participantDocs.map(doc => {
        if (!doc.exists) return { id: doc.id, name: 'Unknown User' };
        const { name, type } = doc.data();
        return { id: doc.id, name, type };
    });
};

export default router;
