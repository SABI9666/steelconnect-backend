// messageController.js - FIXED VERSION
import { adminDb } from '../config/firebase.js';
import { NotificationService } from '../services/notificationService.js'; // Import directly

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

// Get all conversations for the logged-in user, now with participant details
export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const snapshot = await adminDb.collection('conversations')
      .where('participantIds', 'array-contains', userId)
      .orderBy('updatedAt', 'desc')
      .get();
    
    // Enrich conversations with participant and job details
    const conversationsPromises = snapshot.docs.map(async (doc) => {
        const conversationData = doc.data();
        
        // Fetch participant details
        const participants = await getParticipantDetails(conversationData.participantIds);
        
        // Fetch job title
        let jobTitle = 'Job no longer available';
        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
        if (jobDoc.exists) {
            jobTitle = jobDoc.data().title;
        }

        return { 
            id: doc.id, 
            ...conversationData, 
            participants, // Add full participant objects
            jobTitle      // Add job title
        };
    });

    const conversations = await Promise.all(conversationsPromises);
    res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    console.error('Error in getConversations:', error);
    next(error);
  }
};

// Start a new conversation or get an existing one, now returning full details
export const findOrCreateConversation = async (req, res, next) => {
  try {
    const { jobId, recipientId } = req.body;
    const initiatorId = req.user.userId;

    // Prevent user from starting a conversation with themselves
    if(initiatorId === recipientId) {
        return res.status(400).json({ success: false, message: 'You cannot start a conversation with yourself.' });
    }

    const query = adminDb.collection('conversations')
      .where('jobId', '==', jobId)
      .where('participantIds', 'array-contains', initiatorId);
      
    const snapshot = await query.get();
    
    let existingConversationDoc = null;
    snapshot.forEach(doc => {
        if (doc.data().participantIds.includes(recipientId)) {
            existingConversationDoc = doc;
        }
    });

    // If conversation exists, fetch its details and return it
    if (existingConversationDoc) {
        const conversationData = existingConversationDoc.data();
        const participants = await getParticipantDetails(conversationData.participantIds);
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        const jobTitle = jobDoc.exists ? jobDoc.data().title : 'Job no longer available';

        const enrichedConversation = {
             id: existingConversationDoc.id, 
             ...conversationData,
             participants,
             jobTitle
        };
      return res.status(200).json({ success: true, data: enrichedConversation });
    }

    // If conversation does not exist, create a new one
    const newConversation = {
      jobId,
      participantIds: [initiatorId, recipientId],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: 'Conversation started.'
    };
    const docRef = await adminDb.collection('conversations').add(newConversation);
    
    // Enrich the new conversation data before sending it back
    const participants = await getParticipantDetails(newConversation.participantIds);
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    const jobTitle = jobDoc.exists ? jobDoc.data().title : 'Job no longer available';
    
    res.status(201).json({ 
        success: true, 
        data: { 
            id: docRef.id, 
            ...newConversation, 
            participants,
            jobTitle
        } 
    });

  } catch (error) {
    console.error('Error in findOrCreateConversation:', error);
    next(error);
  }
};

// Get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    const convoDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!convoDoc.exists || !convoDoc.data().participantIds.includes(userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view these messages.' });
    }
    
    const messagesSnapshot = await adminDb.collection('conversations').doc(conversationId).collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
      
    const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('Error in getMessages:', error);
    next(error);
  }
};

// FIXED: Send a new message with proper notification handling
export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const senderId = req.user.userId;

    console.log(`📤 Sending message: User ${senderId} (${req.user.name}) in conversation ${conversationId}`);

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Message text is required and cannot be empty' 
      });
    }

    const convoRef = adminDb.collection('conversations').doc(conversationId);
    const convoDoc = await convoRef.get();

    if (!convoDoc.exists || !convoDoc.data().participantIds.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
    }

    const conversationData = convoDoc.data();

    const newMessage = {
      text: text.trim(),
      senderId,
      senderName: req.user.name,
      createdAt: new Date()
    };
    
    // Add the message as a sub-document and update the parent conversation
    const messagesCollectionRef = convoRef.collection('messages');
    const messageRef = await messagesCollectionRef.add(newMessage);

    // Update conversation metadata
    await convoRef.update({ 
        lastMessage: text.trim().substring(0, 100),
        updatedAt: new Date(),
        lastMessageBy: req.user.name
    });

    console.log(`✅ Message saved: ${messageRef.id}`);

    const messageResponse = { id: messageRef.id, ...newMessage };

    // FIXED: Create notification synchronously to ensure it happens
    try {
      console.log(`🔔 Creating message notifications for conversation ${conversationId}...`);
      
      // Get participant details for notification
      const participants = await getParticipantDetails(conversationData.participantIds);
      
      // Get job title for context
      let jobTitle = 'Unknown Project';
      if (conversationData.jobId) {
        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
        if (jobDoc.exists) {
          jobTitle = jobDoc.data().title;
        }
      }

      const enrichedConversationData = {
        id: conversationId,
        participants,
        jobTitle,
        ...conversationData
      };

      // Create notification for all participants except sender
      await NotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
      
      console.log(`✅ Message notifications created successfully`);
      
    } catch (notificationError) {
      console.error(`❌ Failed to create message notifications:`, notificationError);
      // Don't fail the message send if notification fails
    }

    res.status(201).json({ 
      success: true, 
      message: 'Message sent successfully', 
      data: messageResponse 
    });

  } catch (error) {
    console.error('Error in sendMessage:', error);
    next(error);
  }
};
