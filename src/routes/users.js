import express from 'express'; // Corrected
import { verifyToken } from './auth.js'; // Corrected: Added .js extension

const router = express.Router();

// GET /users - Get all users (public profiles)
router.get('/', (req, res) => {
  // Mock users data (public information only)
  const users = [
    {
      id: 'user-1',
      username: 'johndoe',
      fullName: 'John Doe',
      profilePicture: null,
      joinedAt: new Date('2024-01-01').toISOString(),
      isActive: true,
      stats: {
        quotesSubmitted: 5,
        messagesCount: 12,
        likesReceived: 8
      }
    },
    {
      id: 'user-2',
      username: 'jansmith',
      fullName: 'Jane Smith',
      profilePicture: null,
      joinedAt: new Date('2024-01-15').toISOString(),
      isActive: true,
      stats: {
        quotesSubmitted: 3,
        messagesCount: 8,
        likesReceived: 15
      }
    }
  ];

  // Filter by search query if provided
  const { search, active } = req.query;
  let filteredUsers = users;

  if (search) {
    filteredUsers = filteredUsers.filter(user =>
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.fullName.toLowerCase().includes(search.toLowerCase())
    );
  }

  if (active !== undefined) {
    const isActive = active === 'true';
    filteredUsers = filteredUsers.filter(user => user.isActive === isActive);
  }

  res.json({
    message: 'Users retrieved successfully',
    users: filteredUsers,
    total: filteredUsers.length,
    filters: { search, active }
  });
});

// GET /users/:id - Get specific user profile
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Mock user lookup
    const user = {
      id,
      username: 'johndoe',
      fullName: 'John Doe',
      email: 'john@example.com', // Only shown to user himself or admin
      profilePicture: null,
      bio: 'Love sharing inspiring quotes!',
      location: 'New York, USA',
      website: 'https://johndoe.com',
      joinedAt: new Date('2024-01-01').toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true,
      stats: {
        quotesSubmitted: 5,
        quotesApproved: 4,
        messagesCount: 12,
        likesReceived: 8,
        likesGiven: 15
      },
      badges: ['Early Adopter', 'Quote Master']
    };

    res.json({
      message: 'User profile retrieved successfully',
      user
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /users/:id - Update user profile (only own profile)
router.put('/:id', verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;

    // Check if user is updating their own profile
    if (id !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'You can only update your own profile'
      });
    }

    const { fullName, bio, location, website } = req.body;

    // Validate input
    if (website && !/^https?:\/\/.+/.test(website)) {
      return res.status(400).json({
        error: 'Website must be a valid URL starting with http:// or https://'
      });
    }

    // Update user profile in database here
    const updatedUser = {
      id,
      username: req.user.username,
      fullName: fullName || 'Updated Name',
      bio: bio || '',
      location: location || '',
      website: website || '',
      updatedAt: new Date().toISOString()
    };

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:id/quotes - Get user's quotes
router.get('/:id/quotes', (req, res) => {
  try {
    const { id } = req.params;

    // Mock user quotes
    const quotes = [
      
      {
        id: 1,
        text: 'The only way to do great work is to love what you do.',
        author: 'Steve Jobs',
        category: 'motivation',
        approved: true,
        likes: 25,
        createdAt: new Date('2024-01-01').toISOString()
      },
      {
        id: 2,
        text: 'Innovation distinguishes between a leader and a follower.',
        author: 'Steve Jobs',
        category: 'leadership',
        approved: false,
        likes: 0,
        createdAt: new Date('2024-01-15').toISOString()
      }
    ];

    res.json({
      message: `Quotes by user ${id}`,
      quotes,
      total: quotes.length,
      stats: {
        approved: quotes.filter(q => q.approved).length,
        pending: quotes.filter(q => !q.approved).length,
        totalLikes: quotes.reduce((sum, q) => sum + q.likes, 0)
      }
    });

  } catch (error) {
    console.error('Get user quotes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/:id/messages - Get user's messages (only own messages)
router.get('/:id/messages', verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.userId;

    // Check if user is accessing their own messages
    if (id !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'You can only access your own messages'
      });
    }

    // Mock user messages
    const messages = [
      {
        id: 1,
        content: 'Great quote collection!',
        recipientId: 'user-2',
        recipientName: 'Jane Smith',
        sentAt: new Date('2024-01-10').toISOString(),
        read: true
      },
      {
        id: 2,
        content: 'Thanks for sharing those inspiring quotes.',
        recipientId: 'user-3',
        recipientName: 'Bob Johnson',
        sentAt: new Date('2024-01-12').toISOString(),
        read: false
      }
    ];

    res.json({
      message: `Messages for user ${id}`,
      messages,
      total: messages.length,
      stats: {
        sent: messages.length,
        read: messages.filter(m => m.read).length,
        unread: messages.filter(m => !m.read).length
      }
    });

  } catch (error) {
    console.error('Get user messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;