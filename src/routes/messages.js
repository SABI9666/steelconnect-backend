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

// Enhanced message sending with notifications
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    // Get conversation info first
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    const conversationData = { id: conversationId, ...conversationDoc.data() };

    // Check if user is participant
    const isParticipant = conversationData.participants.some(p => p.id === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized to send messages in this conversation' });
    }

    // Store original res.json to intercept the response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Call original response first
      originalJson.call(this, data);
      
      // If message sending was successful, send notifications
      if (data.success && this.statusCode === 201) {
        (async () => {
          try {
            const messageData = data.data;
            
            // Send notification to other participants
            await NotificationService.notifyNewMessage(messageData, conversationData);
            console.log('Message notification sent successfully');
          } catch (notificationError) {
            console.error('Failed to send message notification:', notificationError);
          }
        })();
      }
    };
    
    // Call the original sendMessage controller
    await sendMessage(req, res, next);
    
  } catch (error) {
    next(error);
  }
});

export default router;
