// src/routes/messages.js - FOLLOWING JOBS PATTERN
import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage as sendMessageController
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotificationService } from './notifications.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Helper function to get participant details (same as in messageController)
const getParticipantDetails = async (participantIds) => {
    const participantPromises = participantIds.map(id => adminDb.collection('users').doc(id).get());
    const participantDocs = await Promise.all(participantPromises);

    return participantDocs.map(doc => {
        if (!doc.exists) return { id: doc.id, name: 'Unknown User' };
        const { name, type } = doc.data();
        return { id: doc.id, name, type };
    });
};

// All message routes are protected
router.use(authenticateToken);

// Standard routes
router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// Enhanced message sending with notifications (following jobs pattern)
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const senderId = req.user.userId;

    console.log(`Sending message: User ${senderId} (${req.user.name}) in conversation ${conversationId}`);

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message text is required and cannot be empty' 
      });
    }

    const convoRef = adminDb.collection('conversations').doc(conversationId);
    const convoDoc = await convoRef.get();

    if (!convoDoc.exists) {
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const conversationData = convoDoc.data();
    
    if (!conversationData.participantIds.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
    }

    const newMessage = {
      text: text.trim(),
      senderId,
      senderName: req.user.name,
      createdAt: new Date()
    };
    
    // Add the message as a sub-document
    const messagesCollectionRef = convoRef.collection('messages');
    const messageRef = await messagesCollectionRef.add(newMessage);

    // Update conversation metadata
    await convoRef.update({ 
        lastMessage: text.trim().substring(0, 100),
        updatedAt: new Date(),
        lastMessageBy: req.user.name
    });

    console.log(`Message saved with ID: ${messageRef.id}`);

    const messageResponse = { id: messageRef.id, ...newMessage };

    // Send success response first (like in jobs)
    res.status(201).json({ 
      success: true, 
      message: 'Message sent successfully', 
      data: messageResponse 
    });

    // Send notifications after successful response (following jobs pattern)
    try {
      console.log(`Creating message notifications for conversation ${conversationId}...`);
      
      // Get participant details for notification
      const participants = await getParticipantDetails(conversationData.participantIds);
      console.log(`Retrieved participants:`, participants.map(p => `${p.name} (${p.id})`));
      
      // Get job title for context
      let jobTitle = 'Unknown Project';
      if (conversationData.jobId) {
        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
        if (jobDoc.exists) {
          jobTitle = jobDoc.data().title;
        }
      }

      // Prepare enriched conversation data for notification service
      const enrichedConversationData = {
        id: conversationId,
        participants,
        jobTitle,
        ...conversationData
      };

      // Create notification for all participants except sender
      await NotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
      
      console.log(`Message notifications sent successfully`);
      
    } catch (notificationError) {
      console.error(`Failed to send message notifications:`, notificationError);
      // Don't fail the message send if notifications fail - just log the error
    }

  } catch (error) {
    console.error('Error in message sending:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
