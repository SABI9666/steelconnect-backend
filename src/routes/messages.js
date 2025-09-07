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

// Enhanced message sending with robust error handling and data validation
router.post('/:conversationId/messages', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message text is required and cannot be empty' 
      });
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid conversation ID is required' 
      });
    }

    console.log(`Sending message in conversation ${conversationId} by user ${userId}`);

    // Get conversation with enhanced error handling
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      console.error(`Conversation ${conversationId} not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found. Please refresh and try again.' 
      });
    }
    
    const conversationData = { id: conversationId, ...conversationDoc.data() };
    
    // Enhanced participants validation with automatic repair
    let participants = conversationData.participants;
    let wasRepaired = false;
    
    if (!participants || !Array.isArray(participants)) {
      console.error('Invalid participants data, attempting to reconstruct from jobId and users');
      
      // Try to reconstruct participants from job and user data
      if (conversationData.jobId) {
        try {
          const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
          const userDoc = await adminDb.collection('users').doc(userId).get();
          
          if (jobDoc.exists && userDoc.exists) {
            const jobData = jobDoc.data();
            const userData = userDoc.data();
            
            // Safely reconstruct participants array with null checks
            const contractorId = jobData.contractorId || jobData.userId;
            const contractorName = jobData.posterName || 'Client';
            const designerId = userData.id || userId;
            const designerName = userData.name;
            
            // Only proceed if we have valid data
            if (contractorId && contractorName && designerId && designerName) {
              participants = [
                {
                  id: contractorId,
                  name: contractorName,
                  type: 'contractor'
                },
                {
                  id: designerId,
                  name: designerName,
                  type: userData.type || 'designer'
                }
              ];
              
              wasRepaired = true;
              console.log('Successfully repaired conversation participants');
            } else {
              throw new Error('Insufficient data to reconstruct conversation');
            }
          } else {
            throw new Error('Cannot find job or user data for reconstruction');
          }
        } catch (repairError) {
          console.error('Failed to repair conversation:', repairError);
          return res.status(500).json({ 
            success: false, 
            error: 'Conversation data is corrupted and cannot be repaired. Please start a new conversation.' 
          });
        }
      } else {
        return res.status(500).json({ 
          success: false, 
          error: 'Conversation data is corrupted and cannot be repaired. Please start a new conversation.' 
        });
      }
    }

    // Validate participants array structure
    const validParticipants = participants.filter(p => {
      return p && 
             typeof p === 'object' && 
             p.id && 
             typeof p.id === 'string' && 
             p.name && 
             typeof p.name === 'string';
    });
    
    if (validParticipants.length === 0) {
      console.error('No valid participants found:', participants);
      return res.status(500).json({ 
        success: false, 
        error: 'Conversation has no valid participants. Please start a new conversation.' 
      });
    }

    // Check if user is a participant
    const isParticipant = validParticipants.some(p => p.id === userId);
    if (!isParticipant) {
      console.error(`User ${userId} is not a participant in conversation ${conversationId}`);
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to send messages in this conversation' 
      });
    }

    // Get sender info with validation
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error(`User ${userId} not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'User account not found. Please log in again.' 
      });
    }

    const userData = userDoc.data();
    if (!userData.name) {
      console.error(`User ${userId} has no name`);
      return res.status(400).json({ 
        success: false, 
        error: 'User profile is incomplete. Please update your profile.' 
      });
    }

    // Create message with trimmed text
    const messageData = {
      conversationId,
      senderId: userId,
      senderName: userData.name,
      text: text.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add message to database
    const messageRef = await adminDb.collection('messages').add(messageData);
    const newMessage = { id: messageRef.id, ...messageData };

    // Prepare conversation update data
    const conversationUpdateData = {
      lastMessage: text.trim().substring(0, 100), // Truncate for storage
      lastMessageBy: userData.name,
      lastMessageAt: new Date(),
      updatedAt: new Date()
    };

    // Only update participants if they were repaired and are valid
    if (wasRepaired && validParticipants.length > 0) {
      // Double-check that all participant objects are valid before updating
      const safeParticipants = validParticipants.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type || 'user'
      }));
      
      conversationUpdateData.participants = safeParticipants;
      conversationUpdateData.repairedAt = new Date();
    }

    // Update conversation with safe data
    await adminDb.collection('conversations').doc(conversationId).update(conversationUpdateData);

    console.log(`Message sent successfully: ${messageRef.id}`);

    // Send notification to other participants (non-blocking)
    setImmediate(async () => {
      try {
        // Use the valid participants for notifications
        const updatedConversationData = { 
          ...conversationData, 
          participants: validParticipants 
        };
        
        await NotificationService.notifyNewMessage(newMessage, updatedConversationData);
        console.log('Message notification sent successfully');
      } catch (notificationError) {
        console.error('Failed to send message notification:', notificationError);
        // Log but don't fail the message sending
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Failed to send message';
    let statusCode = 500;
    
    if (error.code === 'permission-denied') {
      errorMessage = 'You do not have permission to perform this action';
      statusCode = 403;
    } else if (error.code === 'not-found') {
      errorMessage = 'The conversation or user was not found';
      statusCode = 404;
    } else if (error.code === 'invalid-argument') {
      errorMessage = 'Invalid message data provided';
      statusCode = 400;
    } else if (error.message && error.message.includes('ignoreUndefinedProperties')) {
      errorMessage = 'Conversation data structure is invalid. Please start a new conversation.';
      statusCode = 500;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
