// src/routes/quotes.js - COMPLETE UPDATED with download support and error handling
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  updateQuote,
  approveQuote, 
  deleteQuote 
} from '../controllers/quoteController.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { upload, handleUploadError, validateFileRequirements, logUploadDetails } from '../middleware/upload.js';
import { NotificationService } from '../services/NotificationService.js';
import { getSignedDownloadUrl } from '../utils/firebaseStorage.js';

const router = express.Router();

// Enhanced quote creation with notifications and proper error handling
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5),
  handleUploadError,
  validateFileRequirements,
  logUploadDetails,
  async (req, res, next) => {
    try {
      // Store original res.json to intercept the response
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

// UPDATE a quote (for designers to edit their submitted quotes)
router.put(
  '/:id',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5),
  handleUploadError,
  validateFileRequirements,
  logUploadDetails,
  updateQuote
);

// FIXED: Download quote attachment with comprehensive error handling
router.get('/:id/attachments/:attachmentIndex/download', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId, attachmentIndex } = req.params;
    const userId = req.user.userId;
    const userType = req.user.type;

    console.log(`Download request for quote ${quoteId}, attachment ${attachmentIndex} by user ${userId}`);

    // FIXED: Validate attachmentIndex parameter
    if (attachmentIndex === undefined || attachmentIndex === 'undefined' || attachmentIndex === null) {
      console.log('Invalid attachment index provided');
      return res.status(400).json({ 
        success: false, 
        error: 'Attachment index is required and must be a valid number' 
      });
    }

    const index = parseInt(attachmentIndex);
    if (isNaN(index) || index < 0) {
      console.log('Attachment index must be a valid non-negative number');
      return res.status(400).json({ 
        success: false, 
        error: 'Attachment index must be a valid non-negative number' 
      });
    }

    // Get quote data
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      console.log('Quote not found');
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const quoteData = quoteDoc.data();
    console.log(`Quote found: ${quoteData.jobTitle || 'Untitled'} by ${quoteData.designerName}`);

    // Authorization check - either the designer who submitted or contractor who posted the job
    let hasAccess = false;
    
    if (quoteData.designerId === userId) {
      hasAccess = true; // Designer who submitted the quote
      console.log('Access granted: Quote submitter');
    } else if (userType === 'contractor') {
      // Check if user is the contractor who posted the job
      const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
      if (jobDoc.exists && jobDoc.data().posterId === userId) {
        hasAccess = true;
        console.log('Access granted: Job poster');
      }
    }

    if (!hasAccess) {
      console.log('Access denied for user');
      return res.status(403).json({ success: false, error: 'Access denied to this attachment' });
    }

    // Check if attachments exist
    const attachments = quoteData.attachments || [];
    console.log(`Found ${attachments.length} attachments`);
    
    if (attachments.length === 0) {
      return res.status(404).json({ success: false, error: 'No attachments found for this quote' });
    }
    
    if (index >= attachments.length) {
      console.log(`Attachment index ${index} out of range (max: ${attachments.length - 1})`);
      return res.status(404).json({ 
        success: false, 
        error: `Attachment index ${index} not found. Available indices: 0-${attachments.length - 1}` 
      });
    }

    const attachment = attachments[index];
    console.log(`Attachment details:`, {
      name: attachment.name || attachment.originalname,
      size: attachment.size,
      mimetype: attachment.mimetype || attachment.type,
      hasUrl: !!attachment.url,
      hasPath: !!attachment.path
    });
    
    // Handle different attachment URL formats
    let downloadUrl;
    let filename = attachment.name || attachment.originalname || `attachment_${index}`;
    
    if (attachment.url && attachment.url.startsWith('http')) {
      // Direct public URL - return as is
      downloadUrl = attachment.url;
      console.log('Using direct URL for download');
    } else if (attachment.path) {
      // Firebase Storage path - generate signed URL
      try {
        console.log(`Generating signed URL for path: ${attachment.path}`);
        downloadUrl = await getSignedDownloadUrl(attachment.path);
        console.log('Signed URL generated successfully');
      } catch (error) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to generate secure download URL. Please try again later.' 
        });
      }
    } else {
      console.log('No valid URL or path found for attachment');
      return res.status(404).json({ 
        success: false, 
        error: 'Attachment file is not accessible. The file may have been moved or deleted.' 
      });
    }

    console.log(`Download URL prepared for quote ${quoteId}, attachment ${index}`);

    // Return comprehensive response with all necessary data
    res.json({
      success: true,
      downloadUrl: downloadUrl,
      filename: filename,
      originalName: attachment.originalname || attachment.name,
      size: attachment.size || 0,
      mimetype: attachment.mimetype || attachment.type || 'application/octet-stream',
      uploadedAt: attachment.uploadedAt,
      expiresIn: 3600000, // 1 hour in milliseconds
      message: 'Download URL generated successfully'
    });

  } catch (error) {
    console.error('Error in quote attachment download:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while preparing download. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// FIXED: Get quote attachments list with better error handling
router.get('/:id/attachments', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId } = req.params;
    const userId = req.user.userId;
    const userType = req.user.type;

    console.log(`Attachments list request for quote ${quoteId} by user ${userId}`);

    // Get quote data
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const quoteData = quoteDoc.data();

    // Authorization check
    let hasAccess = false;
    
    if (quoteData.designerId === userId) {
      hasAccess = true;
    } else if (userType === 'contractor') {
      const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
      if (jobDoc.exists && jobDoc.data().posterId === userId) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Access denied to quote attachments' });
    }

    const attachments = quoteData.attachments || [];
    console.log(`Found ${attachments.length} attachments for quote ${quoteId}`);
    
    // Return attachment list with proper indexing and metadata
    const attachmentList = attachments.map((attachment, index) => {
      const filename = attachment.name || attachment.originalname || `attachment_${index}`;
      
      return {
        index: index,
        name: filename,
        originalName: attachment.originalname || attachment.name,
        size: attachment.size || 0,
        mimetype: attachment.mimetype || attachment.type || 'application/octet-stream',
        uploadedAt: attachment.uploadedAt,
        downloadUrl: `/api/quotes/${quoteId}/attachments/${index}/download`,
        hasFile: !!(attachment.url || attachment.path)
      };
    });

    res.json({
      success: true,
      attachments: attachmentList,
      count: attachments.length,
      quoteId: quoteId,
      message: attachments.length > 0 ? 'Attachments loaded successfully' : 'No attachments found'
    });

  } catch (error) {
    console.error('Error getting quote attachments:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to load attachments. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced quote approval with notifications
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId } = req.params;
    const { jobId } = req.body;
    const userId = req.user.userId;

    console.log(`Processing quote approval: ${quoteId} for job: ${jobId} by user: ${userId}`);

    // Validate required parameters
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'Job ID is required for quote approval' });
    }

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
      return res.status(403).json({ success: false, error: 'You are not authorized to approve quotes for this job' });
    }

    // Check if job is still open
    if (jobData.status !== 'open') {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot approve quote. Job is already ${jobData.status}` 
      });
    }

    // Check if quote is still submitted
    if (quoteData.status !== 'submitted') {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot approve quote. Quote is already ${quoteData.status}` 
      });
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
      message: 'Quote approved successfully',
      data: {
        quoteId: quoteId,
        jobId: jobId,
        approvedAmount: quoteData.quoteAmount,
        designerName: quoteData.designerName
      }
    });

  } catch (error) {
    console.error('Error approving quote:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to approve quote. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE a quote
router.delete('/:id', authenticateToken, deleteQuote);

export default router;
