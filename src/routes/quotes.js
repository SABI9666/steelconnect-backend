// src/routes/quotes.js - Updated with multiple file upload support
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  approveQuote, 
  deleteQuote,
  updateQuote
} from '../controllers/quotecontroller.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { 
  upload, 
  handleUploadError, 
  validateFileRequirements, 
  logUploadDetails, 
  validatePDFFiles 
} from '../middleware/upload.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// Enhanced quote creation with multiple file support
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5), // Support up to 5 files with field name 'attachments'
  handleUploadError,
  validateFileRequirements,
  logUploadDetails,
  validatePDFFiles,
  async (req, res, next) => {
    try {
      console.log('=== QUOTE CREATION REQUEST ===');
      console.log('User:', req.user.email);
      console.log('Body:', req.body);
      console.log('Files:', req.files?.length || 0);
      console.log('==============================');

      // Store original response function
      const originalJson = res.json;
      
      res.json = function(data) {
        // Call original response first
        originalJson.call(this, data);
        
        // If quote creation was successful, send notifications
        if (data.success && this.statusCode === 201) {
          (async () => {
            try {
              const quoteData = data.data;
              const { jobId } = req.body;
              
              // Get job data for notification
              const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
              if (jobDoc.exists) {
                const jobData = { id: jobId, ...jobDoc.data() };
                
                // Send notification using enhanced service
                await NotificationService.notifyQuoteSubmitted(quoteData, jobData);
                console.log('Quote submission notification sent successfully');
              }
            } catch (notificationError) {
              console.error('Failed to send quote submission notification:', notificationError);
            }
          })();
        }
      };
      
      // Call the original createQuote controller
      await createQuote(req, res, next);
      
    } catch (error) {
      console.error('Error in quote creation route:', error);
      next(error);
    }
  }
);

// GET all quotes for a specific job (for the contractor who posted it)
router.get('/job/:jobId', authenticateToken, getQuotesForJob);

// GET all quotes submitted by a specific user (designer)
router.get('/user/:userId', authenticateToken, getQuotesByUser);

// GET a single quote by its ID
router.get('/:id', authenticateToken, getQuoteById);

// Enhanced quote update with file support
router.put(
  '/:id', 
  authenticateToken, 
  isDesigner,
  upload.array('attachments', 5), // Allow file uploads in updates too
  handleUploadError,
  validatePDFFiles,
  logUploadDetails,
  updateQuote
);

// Enhanced quote approval with notifications
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId } = req.params;
    const { jobId } = req.body;
    const userId = req.user.userId;

    console.log(`Processing quote approval: ${quoteId} for job: ${jobId} by user: ${userId}`);

    // Get quote info
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }
    const quoteData = { id: quoteId, ...quoteDoc.data() };

    // Get job info
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    const jobData = { id: jobId, ...jobDoc.data() };

    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get all quotes for this job before updating (for rejection notifications)
    const allQuotesQuery = await adminDb.collection('quotes')
      .where('jobId', '==', jobId)
      .where('status', '==', 'submitted')
      .get();

    console.log(`Found ${allQuotesQuery.docs.length} quotes to process for job ${jobId}`);

    // Start a batch operation
    const batch = adminDb.batch();

    // Update the approved quote
    const quoteRef = adminDb.collection('quotes').doc(quoteId);
    batch.update(quoteRef, {
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date()
    });

    // Update the job
    const jobRef = adminDb.collection('jobs').doc(jobId);
    batch.update(jobRef, {
      status: 'assigned',
      assignedTo: quoteData.designerId,
      assignedToName: quoteData.designerName,
      approvedAmount: quoteData.quoteAmount,
      updatedAt: new Date()
    });

    // Reject all other quotes for this job
    allQuotesQuery.docs.forEach(doc => {
      if (doc.id !== quoteId) {
        batch.update(doc.ref, {
          status: 'rejected',
          rejectedAt: new Date(),
          updatedAt: new Date()
        });
      }
    });

    await batch.commit();
    console.log(`Quote approval batch operation completed for quote ${quoteId}`);

    // Send notifications using enhanced service
    try {
      // Notify the approved designer
      await NotificationService.notifyQuoteStatusChanged(quoteData, jobData, 'approved');
      console.log('Quote approval notification sent successfully');
      
      // Notify rejected designers
      for (const doc of allQuotesQuery.docs) {
        if (doc.id !== quoteId) {
          const rejectedQuoteData = { id: doc.id, ...doc.data() };
          await NotificationService.notifyQuoteStatusChanged(rejectedQuoteData, jobData, 'rejected');
        }
      }
      console.log('Quote rejection notifications sent successfully');
    } catch (notificationError) {
      console.error('Failed to send quote approval notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Quote approved successfully'
    });

  } catch (error) {
    console.error('Error approving quote:', error);
    res.status(500).json({ success: false, error: 'Failed to approve quote' });
  }
});

// DELETE a quote
router.delete('/:id', authenticateToken, deleteQuote);

export default router;
