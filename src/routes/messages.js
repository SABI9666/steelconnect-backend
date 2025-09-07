// src/routes/messages.js - FIXED VERSION
import express from 'express';
import { adminDb } from '../config/firebase.js';
import {
  getConversations,
  findOrCreateConversation,
  getMessages,
  sendMessage // Import the fixed sendMessage function
} from '../controllers/messageController.js';
import { authenticateToken } from '../middleware/auth.js'; // Use same as your other routes

const router = express.Router();

// All message routes are protected
router.use(authenticateToken);

// Use the controller functions
router.get('/', getConversations);
router.post('/find', findOrCreateConversation);
router.get('/:conversationId/messages', getMessages);

// Use the fixed sendMessage function from controller
router.post('/:conversationId/messages', sendMessage);

export default router;
