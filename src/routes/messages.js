// src/routes/messages.js - SIMPLE FIXED VERSION
import express from 'express';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage // Use the fixed sendMessage function from controller
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js'; // Update this path if needed

const router = express.Router();

// All message routes are protected
router.use(authenticateToken);

// Use the controller functions directly - they handle everything including notifications
router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);
router.post('/:conversationId/messages', sendMessage); // This now includes notification handling

export default router;
