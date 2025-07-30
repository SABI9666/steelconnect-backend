import { adminDb } from '../config/firebase.js';

// Get all conversations for the logged-in user
export const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const snapshot = await adminDb.collection('conversations')
      .where('participantIds', 'array-contains', userId)
      .orderBy('updatedAt', 'desc')
      .get();
    
    const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
};

// Start a new conversation or get an existing one
export const findOrCreateConversation = async (req, res, next) => {
  try {
    const { jobId, recipientId } = req.body;
    const initiatorId = req.user.id;

    const query = adminDb.collection('conversations')
      .where('jobId', '==', jobId)
      .where('participantIds', 'array-contains', initiatorId);
      
    const snapshot = await query.get();
    
    let existingConversation = null;
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.participantIds.includes(recipientId)) {
            existingConversation = { id: doc.id, ...data };
        }
    });

    if (existingConversation) {
      return res.status(200).json({ success: true, data: existingConversation });
    }

    const newConversation = {
      jobId,
      participantIds: [initiatorId, recipientId],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: 'Conversation started.'
    };
    const docRef = await adminDb.collection('conversations').add(newConversation);
    res.status(201).json({ success: true, data: { id: docRef.id, ...newConversation } });

  } catch (error) {
    next(error);
  }
};

// Get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

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
    next(error);
  }
};

// Send a new message
export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;
    const senderId = req.user.id;
    const senderType = req.user.type;

    const convoRef = adminDb.collection('conversations').doc(conversationId);
    const convoDoc = await convoRef.get();

    if (!convoDoc.exists || !convoDoc.data().participantIds.includes(senderId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
    }

    // --- PERMISSION LOGIC ---
    if (senderType === 'designer') {
      const { jobId } = convoDoc.data();
      const designerId = senderId;
      const quoteQuery = await adminDb.collection('quotes')
        .where('jobId', '==', jobId)
        .where('quoterId', '==', designerId)
        .limit(1).get();
      
      if (quoteQuery.empty || quoteQuery.docs[0].data().status !== 'approved') {
        return res.status(403).json({ success: false, message: 'You can only message after your quote is approved.' });
      }
    }

    const newMessage = {
      text,
      senderId,
      createdAt: new Date()
    };
    
    await adminDb.collection('conversations').doc(conversationId).collection('messages').add(newMessage);
    await convoRef.update({ 
        lastMessage: text,
        updatedAt: new Date() 
    });

    res.status(201).json({ success: true, message: 'Message sent.', data: newMessage });
  } catch (error) {
    next(error);
  }
};