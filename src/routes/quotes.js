// src/routes/quotes.js - FIXED with proper file handling for contractors
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  approveQuote, 
  deleteQuote
} from '../controllers/quoteController.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { 
  upload, 
  handleUploadError, 
  validateFileRequirements, 
  logUploadDetails, 
  validatePDFFiles 
} from '../middleware/upload.js';

const router = express.Router();

// FIXED: Enhanced quote creation with multiple file support
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5), // Support up to 5 files
  handleUploadError,
  validateFileRequirements,
  logUploadDetails,
  validatePDFFiles,
  createQuote
);

// GET all quotes for a specific job (for the contractor who posted it)
router.get('/job/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.userId;
    
    console.log(`Quotes requested for job ${jobId} by user ${req.user.email}`);
    
    // First check if the user is the job poster (contractor)
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const jobData = jobDoc.data();
    
    // Check if user is the contractor who posted the job or admin
    const isAuthorized = jobData.posterId === userId || req.user.type === 'admin';
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only the job poster can view quotes for this job.'
      });
    }
    
    // Get all quotes for this job
    const quotesSnapshot = await adminDb.collection('quotes')
      .where('jobId', '==', jobId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const quotes = quotesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        fileCount: data.attachments?.length || 0,
        hasAttachments: (data.attachments?.length || 0) > 0,
        attachmentCount: data.attachments?.length || 0
      };
    });
    
    console.log(`Found ${quotes.length} quotes for job ${jobId}`);
    
    res.json({
      success: true,
      quotes: quotes,
      data: quotes,
      jobInfo: {
        id: jobId,
        title: jobData.title,
        status: jobData.status,
        posterName: jobData.posterName
      }
    });
    
  } catch (error) {
    console.error('Error fetching quotes for job:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quotes',
      error: error.message
    });
  }
});

// GET all quotes submitted by a specific user (designer)
router.get('/user/:userId', authenticateToken, getQuotesByUser);

// GET a single quote by its ID with file access
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    console.log(`Quote ${id} requested by user ${req.user.email}`);
    
    const quoteDoc = await adminDb.collection('quotes').doc(id).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    const quoteData = quoteDoc.data();
    
    // Get job data to check authorization
    const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
    const jobData = jobDoc.exists ? jobDoc.data() : null;
    
    // Check authorization - quote creator, job poster, or admin can access
    const isAuthorized = userId === quoteData.designerId || 
                        userId === jobData?.posterId ||
                        req.user.type === 'admin';
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      quote: {
        id: id,
        ...quoteData,
        fileCount: quoteData.attachments?.length || 0,
        hasAttachments: (quoteData.attachments?.length || 0) > 0,
        attachmentCount: quoteData.attachments?.length || 0
      }
    });
    
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quote',
      error: error.message
    });
  }
});

// FIXED: Get files for a specific quote (accessible by both designer and contractor)
router.get('/:quoteId/files', authenticateToken, async (req, res) => {
  try {
    const { quoteId } = req.params;
    const userId = req.user.userId;
    
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
    
    // Get job data to check if user is the contractor
    const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
    const jobData = jobDoc.exists ? jobDoc.data() : null;
    
    // FIXED: Check authorization - designer, contractor, or admin can access
    const isAuthorized = userId === quoteData.designerId || 
                        userId === jobData?.posterId ||
                        req.user.type === 'admin';
    
    if (!isAuthorized) {
      console.log(`Access denied for user ${req.user.email} (${userId}). Job poster: ${jobData?.posterId}, Designer: ${quoteData.designerId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const files = quoteData.attachments || [];
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    console.log(`Returning ${files.length} files for quote ${quoteId}`);

    res.json({
      success: true,
      files: files.map(file => ({
        name: file.name || file.originalname || 'Unknown File',
        originalname: file.originalname || file.name || 'Unknown File',
        url: file.url || file.downloadURL,
        downloadUrl: file.url || file.downloadURL,
        size: file.size || 0,
        type: file.type || file.mimetype || 'application/octet-stream',
        mimetype: file.mimetype || file.type || 'application/octet-stream',
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

// FIXED: Download specific file from a quote (accessible by both designer and contractor)
router.get('/:quoteId/files/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { quoteId, fileName } = req.params;
    const userId = req.user.userId;
    
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
    
    // Get job data to check if user is the contractor
    const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
    const jobData = jobDoc.exists ? jobDoc.data() : null;
    
    // Check authorization
    const isAuthorized = userId === quoteData.designerId || 
                        userId === jobData?.posterId ||
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
        originalname: file.originalname || file.name,
        url: file.url || file.downloadURL,
        downloadUrl: file.url || file.downloadURL,
        size: file.size || 0,
        type: file.type || file.mimetype || 'application/octet-stream',
        mimetype: file.mimetype || file.type || 'application/octet-stream'
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

// FIXED: Get quote details with all information including files
router.get('/:quoteId/details', authenticateToken, async (req, res) => {
  try {
    const { quoteId } = req.params;
    const userId = req.user.userId;
    
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found'
      });
    }
    
    const quoteData = quoteDoc.data();
    
    // Get job data to check authorization
    const jobDoc = await adminDb.collection('jobs').doc(quoteData.jobId).get();
    const jobData = jobDoc.exists ? jobDoc.data() : null;
    
    // Check authorization - designer, contractor, or admin
    const isAuthorized = userId === quoteData.designerId || 
                        userId === jobData?.posterId ||
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
    
    // Format job details
    let job = null;
    if (jobData) {
      job = {
        id: quoteData.jobId,
        title: jobData.title,
        description: jobData.description,
        budget: jobData.budget,
        posterName: jobData.posterName,
        status: jobData.status
      };
    }
    
    res.json({
      success: true,
      quote: {
        id: quoteId,
        ...quoteData,
        designer: designer,
        job: job,
        attachments: (quoteData.attachments || []).map(file => ({
          name: file.name || file.originalname || 'Unknown File',
          originalname: file.originalname || file.name || 'Unknown File',
          url: file.url || file.downloadURL,
          downloadUrl: file.url || file.downloadURL,
          size: file.size || 0,
          type: file.type || file.mimetype || 'application/octet-stream',
          mimetype: file.mimetype || file.type || 'application/octet-stream',
          uploadedAt: file.uploadedAt
        })),
        fileCount: quoteData.attachments?.length || 0,
        hasAttachments: (quoteData.attachments?.length || 0) > 0,
        attachmentCount: quoteData.attachments?.length || 0
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

    // Check authorization - only job poster can approve quotes
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized - only job poster can approve quotes' });
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
