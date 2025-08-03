/ src/routes/quotes.js

import express from 'express';
import {
  createQuote,
  getQuotesForJob,
  getQuotesByUser,
  getQuoteById,
  approveQuote,
  deleteQuote
} from '../controllers/quotecontroller.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// POST /api/quotes
// Creates a new quote. Protected for designers only.
// This route is configured to accept up to 5 file uploads in the 'attachments' field.
// This configuration fixes the "Unexpected field" error.
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5),
  createQuote
);

// GET /api/quotes/job/:jobId
// Gets all quotes for a specific job (for the contractor).
router.get('/job/:jobId', authenticateToken, getQuotesForJob);

// GET /api/quotes/user/:userId
// Gets all quotes submitted by the logged-in designer.
router.get('/user/:userId', authenticateToken, getQuotesByUser);

// GET /api/quotes/:id
// Gets a single quote by its ID.
router.get('/:id', authenticateToken, getQuoteById);

// PUT /api/quotes/:id/approve
// Approves a quote (for the contractor).
router.put('/:id/approve', authenticateToken, approveQuote);

// DELETE /api/quotes/:id
// Deletes a quote (for the designer who created it).
router.delete('/:id', authenticateToken, isDesigner, deleteQuote);

export default router;