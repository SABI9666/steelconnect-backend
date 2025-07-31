import express from 'express';
import { adminDb } from '../config/firebase.js';

// Corrected import path for the controller
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  approveQuote, 
  deleteQuote 
} from '../controllers/quoteController.js'; 

import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// POST a new quote for a job
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5), // Allows up to 5 attachments
  createQuote
);

// GET all quotes for a specific job (for the contractor who posted it)
router.get('/job/:jobId', authenticateToken, getQuotesForJob);

// GET all quotes submitted by a specific user (designer)
router.get('/user/:userId', authenticateToken, getQuotesByUser);

// GET a single quote by its ID
router.get('/:id', authenticateToken, getQuoteById);

// PUT to approve a quote
router.put('/:id/approve', authenticateToken, approveQuote);

// DELETE a quote
router.delete('/:id', authenticateToken, deleteQuote);

export default router;