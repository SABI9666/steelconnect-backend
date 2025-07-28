// src/controllers/messageController.js (Corrected)
import { adminDb } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Get or create a conversation for a specific job between the current user and another user
export const getOrCreateConversation = async (req, res, next) => {
    try {
        const { recipientId, jobId } = req.body;
        const members = [req.user.id, recipientId].sort(); // Sort IDs for a consistent conversation ID
        
        // Create a predictable ID based on the job and members
        const conversationId = `${jobId}_${members[0]}_${members[1]}`;

        const conversationRef = adminDb.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (conversationDoc.exists) {
            return res.json({ success: true, data: { id: conversationDoc.id, ...conversationDoc.data() } });
        } else {
            const newConversation = {
                members,
                jobId,
                createdAt: new Date(),
                lastMessageAt: new Date(),
            };
            await conversationRef.set(newConversation);
            return res.status(201).json({ success: true, data: { id: conversationId, ...newConversation }});
        }
    } catch (error) {
        next(error);
    }
};

// Send a message within a conversation
export const sendMessage = async (req, res, next) => {
    try {
        const { conversationId, text } = req.body;
        const conversationRef = adminDb.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (!conversationDoc.exists || !conversationDoc.data().members.includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You are not a member of this conversation.' });
        }
        
        let attachmentUrl = null;
        if (req.file) {
            // The 'upload' middleware provides req.file; uploadToFirebase handles the rest
            attachmentUrl = await uploadToFirebase(req.file, 'message-attachments');
        }

        if (!text && !attachmentUrl) {
            return res.status(400).json({ success: false, message: 'A message must contain text or an attachment.' });
        }

        const messageData = {
            conversationId,
            senderId: req.user.id,
            text: text || '',
            attachment: attachmentUrl, // This will be the public URL
            createdAt: new Date(),
        };

        const messageRef = await conversationRef.collection('messages').add(messageData);
        await conversationRef.update({ 
            lastMessageAt: new Date(), 
            lastMessageText: text ? text.substring(0, 50) : 'File Attachment' 
        });

        res.status(201).json({ success: true, data: { id: messageRef.id, ...messageData } });
    } catch (error) {
        next(error);
    }
};

// Get all messages for a specific conversation
export const getMessages = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const conversationRef = adminDb.collection('conversations').doc(conversationId);
        const conversationDoc = await conversationRef.get();

        if (!conversationDoc.exists || !conversationDoc.data().members.includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view this conversation.' });
        }

        const messagesSnapshot = await conversationRef.collection('messages').orderBy('createdAt', 'asc').get();
        const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, data: messages });
    } catch (error) {
        next(error);
    }
};