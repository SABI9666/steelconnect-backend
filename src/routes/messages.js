// src/routes/messages.js - COMPLETE WORKING VERSION
import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotificationService } from './notifications.js'; // Same import as jobs.js
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Helper function to get participant details
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

// Standard routes using controller functions
router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// ENHANCED MESSAGE SENDING - Following exact jobs.js pattern
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const senderId = req.user.userId;

    console.log(`📤 [MESSAGE] Sending message: User ${senderId} (${req.user.name}) in conversation ${conversationId}`);

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log(`❌ [MESSAGE] Invalid text input:`, text);
      return res.status(400).json({ 
        success: false, 
        message: 'Message text is required and cannot be empty' 
      });
    }

    // Get conversation and validate access
    const convoRef = adminDb.collection('conversations').doc(conversationId);
    const convoDoc = await convoRef.get();

    if (!convoDoc.exists) {
      console.log(`❌ [MESSAGE] Conversation ${conversationId} not found`);
      return res.status(404).json({ success: false, message: 'Conversation not found.' });
    }

    const conversationData = convoDoc.data();
    
    if (!conversationData.participantIds.includes(senderId)) {
      console.log(`❌ [MESSAGE] User ${senderId} not authorized for conversation ${conversationId}`);
      return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
    }

    // Create message object
    const newMessage = {
      text: text.trim(),
      senderId,
      senderName: req.user.name,
      createdAt: new Date()
    };
    
    console.log(`💾 [MESSAGE] Saving message to subcollection...`);
    
    // Save message to subcollection (CRITICAL: matches getMessages path)
    const messagesCollectionRef = convoRef.collection('messages');
    const messageRef = await messagesCollectionRef.add(newMessage);

    // Update conversation metadata
    await convoRef.update({ 
        lastMessage: text.trim().substring(0, 100),
        updatedAt: new Date(),
        lastMessageBy: req.user.name
    });

    console.log(`✅ [MESSAGE] Message saved with ID: ${messageRef.id}`);

    const messageResponse = { id: messageRef.id, ...newMessage };

    // Send success response FIRST (following jobs.js pattern)
    res.status(201).json({ 
      success: true, 
      message: 'Message sent successfully', 
      data: messageResponse 
    });

    // NOTIFICATION HANDLING AFTER RESPONSE (like jobs.js does)
    try {
      console.log(`🔔 [NOTIFICATION] Creating message notifications for conversation ${conversationId}...`);
      
      // Get participant details for notification
      console.log(`👥 [NOTIFICATION] Fetching participant details for:`, conversationData.participantIds);
      const participants = await getParticipantDetails(conversationData.participantIds);
      console.log(`👥 [NOTIFICATION] Retrieved participants:`, participants.map(p => `${p.name} (${p.id})`));
      
      // Get job title for context
      let jobTitle = 'Unknown Project';
      if (conversationData.jobId) {
        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
        if (jobDoc.exists) {
          jobTitle = jobDoc.data().title;
        }
      }
      console.log(`📋 [NOTIFICATION] Job title: ${jobTitle}`);

      // Prepare enriched conversation data for notification service
      const enrichedConversationData = {
        id: conversationId,
        participants,
        jobTitle,
        ...conversationData
      };

      console.log(`🚀 [NOTIFICATION] Calling NotificationService.notifyNewMessage...`);
      console.log(`📊 [NOTIFICATION] Notification data:`, {
        messageId: messageResponse.id,
        senderName: messageResponse.senderName,
        text: messageResponse.text.substring(0, 30) + '...',
        participantCount: participants.length,
        recipients: participants.filter(p => p.id !== senderId).map(p => p.name)
      });
      
      // Create notification for all participants except sender (SAME AS JOBS)
      await NotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
      
      console.log(`✅ [NOTIFICATION] Message notifications sent successfully`);
      
    } catch (notificationError) {
      console.error(`❌ [NOTIFICATION] Failed to send message notifications:`, notificationError);
      console.error(`🔍 [NOTIFICATION] Error details:`, {
        name: notificationError.name,
        message: notificationError.message,
        stack: notificationError.stack?.split('\n')[0] // First line of stack
      });
      // Don't fail the message send if notifications fail - just log the error (SAME AS JOBS)
    }

  } catch (error) {
    console.error('❌ [MESSAGE] Error in message sending route:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
