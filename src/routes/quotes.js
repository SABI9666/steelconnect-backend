// src/routes/quotes.js - Updated with file access support
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  approveQuote, 
  deleteQuote
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

// GET a single quote by its ID with file access
router.get('/:id', authenticateToken, getQuoteById);

// NEW: Get files for a specific quote
router.get('/:quoteId/files', authenticateToken, async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    console.log(`Files requested for quote: ${quoteId} by user: ${req.user?.email}`);
    
    // Get quote data
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    const quoteData = quoteDoc.data();
    
    // Check authorization - only quote creator, job poster, or admin can access files
    const isAuthorized = req.user.userId === quoteData.designerId || 
                        req.user.userId === quoteData.contractorId ||
                        req.user.type === 'admin';
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const files = quoteData.attachments || [];
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    res.json({
      success: true,
      files: files.map(file => ({
        name: file.name || file.originalname || 'Unknown File',
        url: file.url,
        size: file.size || 0,
        type: file.type || file.mimetype || 'application/octet-stream',
        uploadedAt: file.uploadedAt || quoteData.createdAt
      })),
      fileCount: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      quoteInfo: {
        id: quoteId,
        jobTitle: quoteData.jobTitle,
        designerName: quoteData.designerName,
        quoteAmount: quoteData.quoteAmount,
        status: quoteData.status
      }
    });

  } catch (error) {
    console.error('Error fetching quote files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quote files',
      error: error.message
    });
  }
});

// NEW: Download specific file from a quote
router.get('/:quoteId/files/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { quoteId, fileName } = req.params;
    
    console.log(`File download requested: ${fileName} from quote ${quoteId} by ${req.user.email}`);
    
    // Get quote data
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }

    const quoteData = quoteDoc.data();
    
    // Check authorization
    const isAuthorized = req.user.userId === quoteData.designerId || 
                        req.user.userId === quoteData.contractorId ||
                        req.user.type === 'admin';
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find the file in attachments
    const file = quoteData.attachments?.find(f => 
      (f.name === fileName) || (f.originalname === fileName)
    );
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`Providing download URL for quote file: ${fileName}`);
    
    // Return the download URL
    res.json({
      success: true,
      file: {
        name: file.name || file.originalname,
        url: file.url,
        downloadUrl: file.url,
        size: file.size || 0,
        type: file.type || file.mimetype || 'application/octet-stream'
      }
    });

  } catch (error) {
    console.error('Error providing quote file download:', error);
    res.status(500).json({
      success: false,
      message: 'Error providing file download',
      error: error.message
    });
  }
});

// NEW: Get quote details with all information including files
router.get('/:quoteId/details', authenticateToken, async (req, res) => {
  try {
    const { quoteId } = req.params;
    
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    const quoteData = quoteDoc.data();
    
    // Check authorization
    const isAuthorized = req.user.userId === quoteData.designerId || 
                        req.user.userId === quoteData.contractorId ||
                        req.user.type === 'admin';
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Get designer details if available
    let designer = null;
    if (quoteData.designerId) {
      try {
        const userDoc = await adminDb.collection('users').doc(quoteData.designerId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          designer = {
            id: userDoc.id,
            name: userData.name,
            email: userData.email,
            type: userData.type,
            phone: userData.phone,
            company: userData.companyName
          };
        }
      } catch (error) {
        console.error('Error fetching designer details:', error);
      }
    }
    
    // Get job details if available
    let job = null;
    if (quoteData.jobId) {
      try {
        const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          job = {
            id: jobDoc.id,
            title: jobData.title,
            description: jobData.description,
            budget: jobData.budget,
            posterName: jobData.posterName,
            status: jobData.status
          };
        }
      } catch (error) {
        console.error('Error fetching job details:', error);
      }
    }
    
    res.json({
      success: true,
      quote: {
        id: quoteId,
        ...quoteData,
        designer: designer,
        job: job,
        attachments: quoteData.attachments || [],
        fileCount: quoteData.attachments?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching quote details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quote details',
      error: error.message
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
