import express from 'express';
import { adminDb, adminStorage } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All message routes are protected and require a user to be logged in
router.use(authenticateToken);

router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);
router.post('/:conversationId/messages', sendMessage);

export default router;
