import express from 'express';
import { adminDb } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All message routes are protected
router.use(authenticateToken);

// Get all conversations for user - simplified query
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Simple query - get all conversations and filter in code
    const conversationsSnapshot = await adminDb.collection('conversations')
      .orderBy('updatedAt', 'desc')
      .get();

    const conversations = [];
    
    conversationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      // Check if user is participant
      if (data.participants && Array.isArray(data.participants)) {
        const isParticipant = data.participants.some(p => 
          p && p.id === userId
        );
        if (isParticipant) {
          conversations.push({
            id: doc.id,
            ...data
          });
        }
      }
    });

    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

// Find or create conversation
router.post('/find', async (req, res) => {
  try {
    const { jobId, recipientId } = req.body;
    const userId = req.user.userId;

    // First try to find existing conversation
    const existingConversation = await adminDb.collection('conversations')
      .where('jobId', '==', jobId)
      .get();

    if (!existingConversation.empty) {
      const conversation = existingConversation.docs[0];
      return res.json({ 
        success: true, 
        data: conversation.id
      });
    }

    // Get job and user data
    const [jobDoc, userDoc, recipientDoc] = await Promise.all([
      adminDb.collection('jobs').doc(jobId).get(),
      adminDb.collection('users').doc(userId).get(),
      adminDb.collection('users').doc(recipientId).get()
    ]);

    if (!jobDoc.exists || !userDoc.exists || !recipientDoc.exists) {
      return res.status(404).json({ success: false, error: 'Required data not found' });
    }

    const jobData = jobDoc.data();
    const userData = userDoc.data();
    const recipientData = recipientDoc.data();

    // Create new conversation
    const conversationData = {
      jobId,
      jobTitle: jobData.title,
      participants: [
        {
          id: userId,
          name: userData.name,
          type: userData.type
        },
        {
          id: recipientId,
          name: recipientData.name,
          type: recipientData.type
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: '',
      lastMessageBy: '',
      lastMessageAt: null
    };

    const conversationRef = await adminDb.collection('conversations').add(conversationData);

    res.json({ 
      success: true, 
      data: conversationRef.id 
    });

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to create conversation' });
  }
});

// Get messages for a conversation
router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    // Verify user is participant
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const conversationData = conversationDoc.data();
    const isParticipant = conversationData.participants?.some(p => p.id === userId);
    
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Get messages
    const messagesSnapshot = await adminDb.collection('messages')
      .where('conversationId', '==', conversationId)
      .orderBy('createdAt', 'asc')
      .get();

    const messages = messagesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toISOString ? doc.data().createdAt.toISOString() : doc.data().createdAt
    }));

    res.json({ success: true, data: messages });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// Send message - simplified version
router.post('/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const userId = req.user.userId;

    console.log(`Attempting to send message: ${text} in conversation: ${conversationId} by user: ${userId}`);

    // Validate input
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message text is required' 
      });
    }

    // Get conversation and verify participation
    const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Conversation not found' 
      });
    }

    const conversationData = conversationDoc.data();
    
    // Check if user is participant (simple check)
    let isParticipant = false;
    if (conversationData.participants && Array.isArray(conversationData.participants)) {
      isParticipant = conversationData.participants.some(p => p && p.id === userId);
    }

    if (!isParticipant) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to send messages in this conversation' 
      });
    }

    // Get user data
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const userData = userDoc.data();

    // Create message
    const messageData = {
      conversationId,
      senderId: userId,
      senderName: userData.name,
      text: text.trim(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('Saving message to database:', messageData);

    // Save message
    const messageRef = await adminDb.collection('messages').add(messageData);
    
    console.log('Message saved with ID:', messageRef.id);

    // Update conversation
    await adminDb.collection('conversations').doc(conversationId).update({
      lastMessage: text.trim().substring(0, 100),
      lastMessageBy: userData.name,
      lastMessageAt: new Date(),
      updatedAt: new Date()
    });

    console.log('Conversation updated successfully');

    // Return the created message
    const newMessage = {
      id: messageRef.id,
      ...messageData,
      createdAt: messageData.createdAt.toISOString()
    };

    console.log('Returning message:', newMessage);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message',
      details: error.message
    });
  }
});

export default router;
