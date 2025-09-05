import express from 'express';
import { adminDb } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotificationService } from './notifications.js';

const router = express.Router();

// All message routes are protected and require a user to be logged in
router.use(authenticateToken);

router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// Fixed message sending with proper error handling and notifications
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    console.log(`Sending message in conversation ${conversationId} by user ${userId}`);

    // Get conversation info first with better error handling
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    
    const conversationData = { id: conversationId, ...conversationDoc.data() };
    
    // Check if participants array exists and user is participant
    if (!conversationData.participants || !Array.isArray(conversationData.participants)) {
      console.error('Conversation participants data is invalid:', conversationData.participants);
      return res.status(500).json({ 
        success: false, 
        error: 'Conversation data is corrupted. Please try again.' 
      });
    }

    const isParticipant = conversationData.participants.some(p => p && p.id === userId);
    if (!isParticipant) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to send messages in this conversation' 
      });
    }

    // Get sender info
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const userData = userDoc.data();

    const messageData = {
      conversationId,
      senderId: userId,
      senderName: userData.name,
      text,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const messageRef = await adminDb.collection('messages').add(messageData);
    const newMessage = { id: messageRef.id, ...messageData };

    // Update conversation with last message info
    await adminDb.collection('conversations').doc(conversationId).update({
      lastMessage: text,
      lastMessageBy: userData.name,
      lastMessageAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`Message sent successfully: ${messageRef.id}`);

    // Send notification to other participants
    try {
      await NotificationService.notifyNewMessage(newMessage, conversationData);
      console.log('Message notification sent successfully');
    } catch (notificationError) {
      console.error('Failed to send message notification:', notificationError);
      // Don't fail the message sending if notification fails
    }

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
      details: error.message 
    });
  }
});

export default router;
