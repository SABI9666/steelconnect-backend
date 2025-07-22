import express from 'express';
import { verifyToken } from './auth.js';

const router = express.Router();

// GET /quotes - Get all approved quotes
router.get('/', (req, res) => {
  // Mock quotes data
  const quotes = [
    {
      id: 1,
      text: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      category: 'motivation',
      submittedBy: 'user1',
      approved: true,
      createdAt: new Date('2024-01-01').toISOString(),
      likes: 25
    },
    {
      id: 2,
      text: 'Life is what happens to you while you are busy making other plans.',
      author: 'John Lennon',
      category: 'life',
      submittedBy: 'user2',
      approved: true,
      createdAt: new Date('2024-01-02').toISOString(),
      likes: 18
    },
    {
      id: 3,
      text: 'The future belongs to those who believe in the beauty of their dreams.',
      author: 'Eleanor Roosevelt',
      category: 'dreams',
      submittedBy: 'user3',
      approved: true,
      createdAt: new Date('2024-01-03').toISOString(),
      likes: 32
    }
  ];
  
  // Filter by category if provided
  const { category, author } = req.query;
  let filteredQuotes = quotes;
  
  if (category) {
    filteredQuotes = filteredQuotes.filter(q => 
      q.category.toLowerCase() === category.toLowerCase()
    );
  }
  
  if (author) {
    filteredQuotes = filteredQuotes.filter(q => 
      q.author.toLowerCase().includes(author.toLowerCase())
    );
  }
  
  res.json({
    message: 'Quotes retrieved successfully',
    quotes: filteredQuotes,
    total: filteredQuotes.length,
    filters: { category, author }
  });
});

// POST /quotes - Submit a new quote
router.post('/', verifyToken, (req, res) => {
  try {
    const { text, author, category } = req.body;
    const submittedBy = req.user.username;
    
    // Validation
    if (!text || !author) {
      return res.status(400).json({ 
        error: 'Quote text and author are required' 
      });
    }
    
    if (text.trim().length < 10) {
      return res.status(400).json({ 
        error: 'Quote text must be at least 10 characters long' 
      });
    }
    
    // Create new quote (save to database here)
    const newQuote = {
      id: Date.now(),
      text: text.trim(),
      author: author.trim(),
      category: category?.trim() || 'general',
      submittedBy,
      approved: false, // Requires admin approval
      createdAt: new Date().toISOString(),
      likes: 0
    };
    
    res.status(201).json({
      message: 'Quote submitted successfully and is pending approval',
      quote: newQuote
    });
    
  } catch (error) {
    console.error('Submit quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /quotes/:id - Get specific quote
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Mock quote lookup
    const quote = {
      id: parseInt(id),
      text: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      category: 'motivation',
      submittedBy: 'user1',
      approved: true,
      createdAt: new Date().toISOString(),
      likes: 25
    };
    
    res.json({
      message: 'Quote retrieved successfully',
      quote
    });
    
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /quotes/:id/like - Like a quote
router.post('/:id/like', verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Update like count in database here
    // Check if user already liked this quote
    
    res.json({
      message: `Quote ${id} liked successfully`,
      quoteId: id,
      liked: true,
      newLikeCount: Math.floor(Math.random() * 50) + 1 // Mock like count
    });
    
  } catch (error) {
    console.error('Like quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /quotes/:id/like - Unlike a quote
router.delete('/:id/like', verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // Remove like from database here
    
    res.json({
      message: `Quote ${id} unliked successfully`,
      quoteId: id,
      liked: false,
      newLikeCount: Math.floor(Math.random() * 50) + 1 // Mock like count
    });
    
  } catch (error) {
    console.error('Unlike quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /quotes/random - Get a random quote
router.get('/random', (req, res) => {
  const randomQuotes = [
    {
      id: Math.floor(Math.random() * 1000),
      text: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      category: 'motivation'
    },
    {
      id: Math.floor(Math.random() * 1000),
      text: 'Life is what happens to you while you are busy making other plans.',
      author: 'John Lennon',
      category: 'life'
    },
    {
      id: Math.floor(Math.random() * 1000),
      text: 'The future belongs to those who believe in the beauty of their dreams.',
      author: 'Eleanor Roosevelt',
      category: 'dreams'
    }
  ];
  
  const randomQuote = randomQuotes[Math.floor(Math.random() * randomQuotes.length)];
  
  res.json({
    message: 'Random quote retrieved successfully',
    quote: randomQuote
  });
});

// GET /quotes/categories - Get all categories
router.get('/categories', (req, res) => {
  const categories = [
    'motivation',
    'life',
    'love',
    'success',
    'wisdom',
    'dreams',
    'inspiration',
    'happiness',
    'friendship',
    'general'
  ];
  
  res.json({
    message: 'Categories retrieved successfully',
    categories
  });
});

export default router;
