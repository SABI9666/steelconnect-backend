// src/routes/quotes.js - UPDATED with download support
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  updateQuote, // Added updateQuote
  approveQuote, 
  deleteQuote 
} from '../controllers/quotecontroller.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { NotificationService } from '../services/NotificationService.js';
import { getSignedDownloadUrl } from '../utils/firebaseStorage.js';

const router = express.Router();

// Enhanced quote creation with notifications
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5),
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
  updateQuote
);

// NEW: Download quote attachment
router.get('/:id/attachments/:attachmentIndex/download', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId, attachmentIndex } = req.params;
    const userId = req.user.userId;
    const userType = req.user.type;

    console.log(`Download request for quote ${quoteId}, attachment ${attachmentIndex} by user ${userId}`);

    // Get quote data
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    const quoteData = quoteDoc.data();

    // Authorization check - either the designer who submitted or contractor who posted the job
    let hasAccess = false;
    
    if (quoteData.designerId === userId) {
      hasAccess = true; // Designer who submitted the quote
    } else if (userType === 'contractor') {
      // Check if user is the contractor who posted the job
      const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
      if (jobDoc.exists && jobDoc.data().posterId === userId) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if attachments exist
    const attachments = quoteData.attachments || [];
    const index = parseInt(attachmentIndex);
    
    if (index < 0 || index >= attachments.length) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const attachment = attachments[index];
    
    // FIXED: Handle different attachment URL formats
    let downloadUrl;
    if (attachment.url && attachment.url.startsWith('http')) {
      // Direct public URL - return as is
      downloadUrl = attachment.url;
    } else if (attachment.path) {
      // Firebase Storage path - generate signed URL
      try {
        downloadUrl = await getSignedDownloadUrl(attachment.path);
      } catch (error) {
        console.error('Error generating signed URL:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to generate download URL' 
        });
      }
    } else {
      return res.status(404).json({ 
        success: false, 
        error: 'Attachment file not accessible' 
      });
    }

    console.log(`Generated download URL for quote ${quoteId}, attachment ${index}`);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      filename: attachment.name || attachment.originalname || `attachment_${index}`,
      size: attachment.size,
      mimetype: attachment.mimetype || attachment.type
    });

  } catch (error) {
    console.error('Error in quote attachment download:', error);
    res.status(500).json({ success: false, error: 'Download failed' });
  }
});

// NEW: Get quote attachments list
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
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const attachments = quoteData.attachments || [];
    
    // Return attachment list with download URLs
    const attachmentList = attachments.map((attachment, index) => ({
      index: index,
      name: attachment.name || attachment.originalname || `attachment_${index}`,
      size: attachment.size,
      mimetype: attachment.mimetype || attachment.type,
      uploadedAt: attachment.uploadedAt,
      downloadUrl: `/api/quotes/${quoteId}/attachments/${index}/download`
    }));

    res.json({
      success: true,
      attachments: attachmentList,
      count: attachments.length
    });

  } catch (error) {
    console.error('Error getting quote attachments:', error);
    res.status(500).json({ success: false, error: 'Failed to get attachments' });
  }
});

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
