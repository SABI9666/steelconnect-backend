import express from 'express';
import { verifyToken } from './auth.js'; // Make sure auth.js is in the same directory

const router = express.Router();

// --- Mock Database for Messages ---
// This simulates a collection of messages between various users in your system.
const mockMessages = [
  {
    id: 1,
    senderId: 'user-2',
    senderName: 'Jane Smith',
    recipientId: 'user-1', // A message sent TO user-1
    content: 'Great quote collection! I really enjoyed the one by Eleanor Roosevelt.',
    sentAt: new Date('2025-07-18T10:00:00Z').toISOString(),
    read: true
  },
  {
    id: 2,
    senderId: 'user-1', // A message sent FROM user-1
    recipientId: 'user-3',
    recipientName: 'Bob Johnson',
    content: 'Thanks for sharing those inspiring quotes with the team.',
    sentAt: new Date('2025-07-19T11:30:00Z').toISOString(),
    read: false
  },
  {
    id: 3,
    senderId: 'user-3',
    senderName: 'Bob Johnson',
    recipientId: 'user-1', // Another message sent TO user-1
    content: 'No problem! Glad you liked them. I have a few more I can send over.',
    sentAt: new Date('2025-07-19T14:00:00Z').toISOString(),
    read: false
  }
];


/**
 * @route   GET /messages
 * @desc    Get all messages for the logged-in user (both inbox and sent)
 * @access  Private
 */
router.get('/', verifyToken, (req, res) => {
  try {
    const currentUserId = req.user.userId;

    // Filter the mock database to find all messages where the logged-in user
    // is either the sender or the recipient.
    const userMessages = mockMessages.filter(
      msg => msg.senderId === currentUserId || msg.recipientId === currentUserId
    );

    res.json({
      message: `Messages retrieved for user ${currentUserId}`,
      messages: userMessages,
      total: userMessages.length
    });

  } catch (error) {
    console.error('Get all messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @route   POST /messages
 * @desc    Send a new message to another user
 * @access  Private
 */
router.post('/', verifyToken, (req, res) => {
  try {
    const { recipientId, content } = req.body;
    const senderId = req.user.userId;
    const senderName = req.user.username; // Assumes username is in the JWT token

    // Basic validation
    if (!recipientId || !content) {
      return res.status(400).json({ error: 'Recipient ID and content are required' });
    }

    const newMessage = {
      id: mockMessages.length + 1,
      senderId,
      senderName,
      recipientId,
      content,
      sentAt: new Date().toISOString(),
      read: false
    };

    // In a real application, you would save `newMessage` to a database.
    // For now, we'll just log it to the console to simulate creation.
    console.log('New message created:', newMessage);
    // mockMessages.push(newMessage); // You could optionally add it to the array

    res.status(201).json({
      message: 'Message sent successfully',
      sentMessage: newMessage
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   PUT /messages/:id/read
 * @desc    Mark a specific message as read
 * @access  Private
 */
router.put('/:id/read', verifyToken, (req, res) => {
    try {
        const messageId = parseInt(req.params.id, 10);
        const currentUserId = req.user.userId;

        const message = mockMessages.find(m => m.id === messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Security check: Only the recipient of the message can mark it as read.
        if (message.recipientId !== currentUserId) {
            return res.status(403).json({ error: 'You are not authorized to perform this action' });
        }
        
        // Update the message status
        message.read = true;

        res.json({
            message: `Message ${messageId} marked as read`,
            message: message
        });

    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;