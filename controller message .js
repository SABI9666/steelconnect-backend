const { db } = require('../config/firebase');
const { uploadToFirebase } = require('../middleware/upload');

// Create or get a conversation between two users for a specific job
const getOrCreateConversation = async (req, res, next) => {
    try {
        const { recipientId, jobId } = req.body;
        const members = [req.user.id, recipientId].sort(); // Sort to ensure consistent ID
        const conversationId = `${jobId}_${members[0]}_${members[1]}`;

        const conversationRef = db.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (conversationDoc.exists) {
            return res.json({ success: true, conversation: { id: conversationDoc.id, ...conversationDoc.data() } });
        } else {
            const newConversation = {
                members,
                jobId,
                createdAt: new Date(),
                lastMessageAt: new Date(),
            };
            await conversationRef.set(newConversation);
            return res.status(201).json({ success: true, conversation: { id: conversationId, ...newConversation }});
        }
    } catch (error) {
        next(error);
    }
};

const sendMessage = async (req, res, next) => {
    try {
        const { conversationId, text } = req.body;
        const conversationRef = db.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (!conversationDoc.exists || !conversationDoc.data().members.includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You are not a member of this conversation.' });
        }
        
        let attachment = null;
        if (req.file) {
            attachment = await uploadToFirebase(req.file, 'message-attachments');
        }

        if (!text && !attachment) {
            return res.status(400).json({ success: false, message: 'Message must include text or an attachment.' });
        }

        const messageData = {
            conversationId,
            senderId: req.user.id,
            text: text || '',
            attachment,
            createdAt: new Date(),
        };

        const messageRef = await conversationRef.collection('messages').add(messageData);
        await conversationRef.update({ lastMessageAt: new Date(), lastMessageText: text ? text.substring(0, 50) : 'File attachment' });

        res.status(201).json({ success: true, message: { id: messageRef.id, ...messageData } });
    } catch (error) {
        next(error);
    }
};

const getMessages = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const conversationRef = db.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (!conversationDoc.exists || !conversationDoc.data().members.includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const messagesSnapshot = await conversationRef.collection('messages').orderBy('createdAt', 'asc').get();
        const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, messages });
    } catch (error) {
        next(error);
    }
};

module.exports = { getOrCreateConversation, sendMessage, getMessages };