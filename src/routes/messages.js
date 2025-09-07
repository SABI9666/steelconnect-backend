import express from 'express';
import { adminDb } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';
import { NotificationService } from './notifications.js';

const router = express.Router();

// All message routes are protected and require a user to be logged in
router.use(authenticateToken);

router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// Enhanced message sending with debug logging
router.post('/:conversationId/messages', async (req, res, next) => {
  console.log('🔄 Message sending started:', { conversationId: req.params.conversationId, userId: req.user.userId });
  
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('❌ Validation failed: Empty text');
      return res.status(400).json({ 
        success: false, 
        error: 'Message text is required and cannot be empty' 
      });
    }

    if (!conversationId || typeof conversationId !== 'string') {
      console.log('❌ Validation failed: Invalid conversation ID');
      return res.status(400).json({ 
        success: false, 
        error: 'Valid conversation ID is required' 
      });
    }

    console.log(`📨 Sending message in conversation ${conversationId} by user ${userId}`);

    // Get conversation with enhanced error handling
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      console.error(`❌ Conversation ${conversationId} not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found. Please refresh and try again.' 
      });
    }
    
    const conversationData = { id: conversationId, ...conversationDoc.data() };
    console.log('💬 Conversation data loaded:', { 
      id: conversationData.id, 
      hasParticipants: !!conversationData.participants,
      participantCount: conversationData.participants?.length || 0
    });
    
    // Enhanced participants validation with automatic repair
    let participants = conversationData.participants;
    let wasRepaired = false;
    
    if (!participants || !Array.isArray(participants)) {
      console.error('⚠️ Invalid participants data, attempting to reconstruct from jobId and users');
      
      // Try to reconstruct participants from job and user data
      if (conversationData.jobId) {
        try {
          const [jobDoc, userDoc] = await Promise.all([
            adminDb.collection('jobs').doc(conversationData.jobId).get(),
            adminDb.collection('users').doc(userId).get()
          ]);
          
          if (jobDoc.exists && userDoc.exists) {
            const jobData = jobDoc.data();
            const userData = userDoc.data();
            
            console.log('🔍 Reconstructing participants from:', {
              jobId: conversationData.jobId,
              hasJobData: !!jobData,
              hasUserData: !!userData
            });
            
            // Try multiple ways to identify the contractor
            let contractorId = jobData?.contractorId || jobData?.userId || jobData?.createdBy;
            let contractorName = jobData?.posterName || jobData?.contractorName || 'Client';
            
            // If we still don't have contractorId, try to get it from the conversation participants
            if (!contractorId && conversationData.participants && Array.isArray(conversationData.participants)) {
              const existingContractor = conversationData.participants.find(p => p.type === 'contractor' || p.id !== userId);
              if (existingContractor?.id) {
                contractorId = existingContractor.id;
                contractorName = existingContractor.name || contractorName;
              }
            }
            
            // If still no contractor ID found, check if this is a self-conversation scenario
            if (!contractorId) {
              console.warn('⚠️ No contractor ID found, checking if this is a self-conversation');
              contractorId = userId;
              contractorName = userData?.name || 'User';
            }
            
            const designerId = userData?.id || userId;
            const designerName = userData?.name;
            
            console.log('🔧 Repair attempt data:', { contractorId, contractorName, designerId, designerName });
            
            // More lenient validation - we need at least valid IDs and names
            if (contractorId && designerId && contractorName && designerName) {
              // Ensure we don't have duplicate participants
              const participantMap = new Map();
              
              participantMap.set(contractorId, {
                id: contractorId,
                name: contractorName,
                type: contractorId === userId ? (userData?.type || 'contractor') : 'contractor'
              });
              
              // Only add designer as separate participant if different from contractor
              if (designerId !== contractorId) {
                participantMap.set(designerId, {
                  id: designerId,
                  name: designerName,
                  type: userData?.type || 'designer'
                });
              }
              
              participants = Array.from(participantMap.values());
              wasRepaired = true;
              console.log('✅ Successfully repaired conversation participants:', participants);
            } else {
              console.error('❌ Missing required data after all attempts:', { 
                contractorId, contractorName, designerId, designerName,
                jobData: Object.keys(jobData || {}),
                userData: Object.keys(userData || {})
              });
              throw new Error('Insufficient data to reconstruct conversation');
            }
          } else {
            throw new Error('Cannot find job or user data for reconstruction');
          }
        } catch (repairError) {
          console.error('❌ Failed to repair conversation:', repairError);
          return res.status(500).json({ 
            success: false, 
            error: 'Conversation data is corrupted and cannot be repaired. Please start a new conversation.' 
          });
        }
      } else {
        console.error('❌ No jobId found for conversation repair');
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
    
    console.log('👥 Valid participants:', validParticipants);
    
    if (validParticipants.length === 0) {
      console.error('❌ No valid participants found:', participants);
      return res.status(500).json({ 
        success: false, 
        error: 'Conversation has no valid participants. Please start a new conversation.' 
      });
    }

    // Check if user is a participant
    const isParticipant = validParticipants.some(p => p.id === userId);
    if (!isParticipant) {
      console.error(`❌ User ${userId} is not a participant in conversation ${conversationId}`);
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to send messages in this conversation' 
      });
    }

    // Get sender info with validation
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      console.error(`❌ User ${userId} not found`);
      return res.status(404).json({ 
        success: false, 
        error: 'User account not found. Please log in again.' 
      });
    }

    const userData = userDoc.data();
    if (!userData.name) {
      console.error(`❌ User ${userId} has no name`);
      return res.status(400).json({ 
        success: false, 
        error: 'User profile is incomplete. Please update your profile.' 
      });
    }

    console.log('👤 Sender info:', { userId, userName: userData.name });

    // Create message with trimmed text
    const messageData = {
      conversationId,
      senderId: userId,
      senderName: userData.name,
      text: text.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💾 Saving message to database...');
    
    // Add message to database
    const messageRef = await adminDb.collection('messages').add(messageData);
    const newMessage = { id: messageRef.id, ...messageData };

    console.log('✅ Message saved with ID:', messageRef.id);

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
      console.log('🔧 Adding repaired participants to conversation update');
    }

    console.log('💾 Updating conversation...');
    
    // Update conversation with safe data
    await adminDb.collection('conversations').doc(conversationId).update(conversationUpdateData);

    console.log(`✅ Message sent successfully: ${messageRef.id}`);

    // Send notification to other participants (non-blocking)
    setImmediate(async () => {
      try {
        console.log('🔔 Sending notifications...');
        
        // Use the valid participants for notifications
        const updatedConversationData = { 
          ...conversationData, 
          participants: validParticipants 
        };
        
        console.log('📧 Notification data:', {
          messageId: newMessage.id,
          sender: newMessage.senderName,
          participantCount: updatedConversationData.participants.length,
          recipients: updatedConversationData.participants.filter(p => p.id !== userId).map(p => p.name)
        });
        
        await NotificationService.notifyNewMessage(newMessage, updatedConversationData);
        console.log('✅ Message notification sent successfully');
      } catch (notificationError) {
        console.error('❌ Failed to send message notification:', notificationError);
        console.error('Notification error stack:', notificationError.stack);
        // Log but don't fail the message sending
      }
    });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('❌ Error sending message:', error);
    console.error('Error stack:', error.stack);
    
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
