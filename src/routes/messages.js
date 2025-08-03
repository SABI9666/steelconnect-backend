// src/routes/messages.js

import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to ALL routes in this file.
// No one can access messaging endpoints without a valid token.
router.use(authenticateToken);

// GET /api/messages
// Retrieves all conversations for the logged-in user.
router.get('/', getConversations);

// POST /api/messages/find
// Finds an existing conversation or creates a new one.
router.post('/find', findOrCreateConversation);

// GET /api/messages/:conversationId/messages
// Retrieves all messages for a specific conversation.
router.get('/:conversationId/messages', getMessages);

// POST /api/messages/:conversationId/messages
// Sends a new message in a specific conversation.
router.post('/:conversationId/messages', sendMessage);

export default router;