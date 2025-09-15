// estimation.js - Updated for multiple PDF uploads (up to 10 files, 15MB each)
import express from 'express';
import multer from 'multer';
import { authenticateToken, isContractor, isAdmin } from '../middleware/authMiddleware.js';
import { 
  adminDb, 
  adminStorage, 
  uploadMultipleFilesToFirebase, 
  validateFileUpload, 
  deleteFileFromFirebase,
  FILE_UPLOAD_CONFIG 
} from '../config/firebase.js';
import { sendEstimationResultNotification } from '../utils/emailService.js';

const router = express.Router();

// Enhanced multer configuration for multiple PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize, // 15MB per file
    files: FILE_UPLOAD_CONFIG.maxFiles, // Maximum 10 files
    fieldSize: 1024 * 1024 // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error(`Only PDF files are allowed. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'pdf') {
      return cb(new Error(`Only PDF files are allowed. File extension: .${ext}`), false);
    }
    
    cb(null, true);
  }
});

// Get all estimations (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('Admin estimations list requested by:', req.user?.email);
    
    const snapshot = await adminDb.collection('estimations')
      .orderBy('createdAt', 'desc')
      .get();
    
    const estimations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        _id: doc.id,
        id: doc.id,
        ...data,
        // Add file statistics
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ? 
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0
      };
    });
    
    console.log(`Found ${estimations.length} estimations for admin`);
    
    res.json({
      success: true,
      estimations: estimations
    });
  } catch (error) {
    console.error('Error fetching estimations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimations',
      error: error.message
    });
  }
});

// Enhanced estimation submission with multiple PDF support
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
  try {
    console.log('Estimation submission by contractor:', req.user?.email);
    console.log('Files received:', req.files?.length || 0);
    
    const { projectTitle, description, contractorName, contractorEmail } = req.body;
    const files = req.files;

    // Validate required fields
    if (!projectTitle || !description || !contractorName || !contractorEmail) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: projectTitle, description, contractorName, contractorEmail'
      });
    }

    // Validate files using our enhanced validation
    try {
      validateFileUpload(files, FILE_UPLOAD_CONFIG.maxFiles);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }
    
    console.log(`Processing ${files.length} PDF files for estimation`);
    console.log('File details:', files.map(f => ({
      name: f.originalname,
      size: `${(f.size / (1024 * 1024)).toFixed(2)}MB`,
      type: f.mimetype
    })));

    // Upload files to Firebase Storage with enhanced error handling
    let uploadedFiles = [];
    try {
      uploadedFiles = await uploadMultipleFilesToFirebase(
        files, 
        FILE_UPLOAD_CONFIG.uploadPaths.estimations, 
        req.user.userId
      );
      
      console.log(`✅ Successfully uploaded ${uploadedFiles.length} files`);
    } catch (uploadError) {
      console.error('❌ File upload failed:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'File upload failed',
        error: uploadError.message
      });
    }

    // Create estimation document with enhanced metadata
    const estimationData = {
      projectTitle,
      description,
      contractorName,
      contractorEmail,
      contractorId: req.user.userId,
      uploadedFiles,
      fileCount: uploadedFiles.length,
      totalFileSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submissionMetadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        timestamp: new Date().toISOString()
      }
    };

    const estimationRef = await adminDb.collection('estimations').add(estimationData);
    
    console.log(`✅ Estimation created with ID: ${estimationRef.id}`);
    
    // Prepare response (don't expose file URLs for security)
    const responseData = {
      id: estimationRef.id,
      projectTitle,
      description,
      contractorName,
      contractorEmail,
      fileCount: uploadedFiles.length,
      totalFileSize: estimationData.totalFileSize,
      uploadedFiles: uploadedFiles.map(f => ({
        name: f.originalname,
        size: f.size,
        type: f.mimetype,
        uploadedAt: f.uploadedAt
      })),
      status: 'pending',
      createdAt: estimationData.createdAt
    };
    
    res.status(201).json({
      success: true,
      message: `Estimation request submitted successfully with ${uploadedFiles.length} PDF files`,
      estimationId: estimationRef.id,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error submitting estimation:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting estimation request',
      error: error.message
    });
  }
});

// Get contractor's estimations with file information
router.get('/contractor/:contractorEmail', authenticateToken, async (req, res) => {
  try {
    const { contractorEmail } = req.params;
    
    console.log(`Estimations requested for contractor: ${contractorEmail} by user: ${req.user?.email}`);
    
    // Check authorization
    if (req.user.type !== 'admin' && req.user.email !== contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const snapshot = await adminDb.collection('estimations')
      .where('contractorEmail', '==', contractorEmail)
      .orderBy('createdAt', 'desc')
      .get();

    const estimations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        _id: doc.id,
        id: doc.id,
        ...data,
        // Add file statistics for frontend display
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ? 
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0
      };
    });

    console.log(`Found ${estimations.length} estimations for contractor ${contractorEmail}`);

    res.json({
      success: true,
      estimations: estimations
    });

  } catch (error) {
    console.error('Error fetching contractor estimations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimations',
      error: error.message
    });
  }
});

// Enhanced result upload (Admin only)
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
  try {
    const { estimationId } = req.params;
    const { amount, notes } = req.body;
    const file = req.file;

    console.log(`Admin ${req.user?.email} uploading result for estimation ${estimationId}`);
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Result file is required'
      });
    }
    
    // Validate file type (PDF only for results)
    if (file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        message: 'Result file must be a PDF'
      });
    }
    
    // Check file size
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `Result file size (${sizeMB}MB) exceeds 15MB limit`
      });
    }
    
    // Check if estimation exists
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }
    
    // Upload result file
    const uploadedFiles = await uploadMultipleFilesToFirebase(
      [file], 
      FILE_UPLOAD_CONFIG.uploadPaths.results, 
      estimationId
    );
    
    const resultFile = uploadedFiles[0];
    
    // Update estimation with result
    const updateData = {
      resultFile,
      status: 'completed',
      notes: notes || '',
      completedAt: new Date().toISOString(),
      completedBy: req.user.email,
      updatedAt: new Date().toISOString()
    };

    if (amount && !isNaN(parseFloat(amount))) {
      updateData.estimatedAmount = parseFloat(amount);
    }
    
    await adminDb.collection('estimations').doc(estimationId).update(updateData);
    
    console.log(`✅ Result uploaded for estimation ${estimationId}`);

    // Send email notification to contractor
    try {
      const estimationData = estimationDoc.data();
      await sendEstimationResultNotification(
        { name: estimationData.contractorName, email: estimationData.contractorEmail },
        { id: estimationId, title: estimationData.projectTitle, amount: updateData.estimatedAmount }
      );
      console.log(`📧 Email notification sent successfully to ${estimationData.contractorEmail}`);
    } catch (emailError) {
      console.error(`❌ Failed to send estimation result email for ${estimationId}:`, emailError.message);
    }
    
    res.json({
      success: true,
      message: 'Estimation result uploaded successfully',
      data: {
        resultFile: {
          name: resultFile.originalname,
          size: resultFile.size,
          type: resultFile.mimetype,
          uploadedAt: resultFile.uploadedAt
        },
        estimatedAmount: updateData.estimatedAmount
      }
    });

  } catch (error) {
    console.error('❌ Error uploading estimation result:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading estimation result',
      error: error.message
    });
  }
});

// Get files for specific estimation
router.get('/:estimationId/files', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const estimationData = estimationDoc.data();
    
    // Check authorization
    if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const files = estimationData.uploadedFiles || [];
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

    res.json({
      success: true,
      files: files,
      fileCount: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    });

  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
});

// Enhanced file download with proper authorization
router.get('/:estimationId/files/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { estimationId, fileName } = req.params;
    
    console.log(`File download requested: ${fileName} from estimation ${estimationId} by ${req.user.email}`);
    
    // Get estimation to check authorization
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }
    const estimationData = estimationDoc.data();
    
    // Check authorization
    if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Find the file in uploadedFiles
    const file = estimationData.uploadedFiles?.find(f => f.originalname === fileName);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`✅ Redirecting to file URL for download: ${fileName}`);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalname}"`);
    res.setHeader('Content-Type', file.mimetype || 'application/pdf');
    
    // Redirect to the file URL
    res.redirect(file.url);

  } catch (error) {
    console.error('❌ Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
});

// Bulk download all files for an estimation
router.get('/:estimationId/files/download-all', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    
    console.log(`Bulk download requested for estimation ${estimationId} by ${req.user.email}`);
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }
    
    const estimationData = estimationDoc.data();
    
    // Check authorization
    if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const files = estimationData.uploadedFiles || [];
    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No files found for this estimation'
      });
    }
    
    // For now, return the list of file URLs for frontend to handle bulk download
    // In production, you might want to create a ZIP file
    res.json({
      success: true,
      message: `${files.length} files available for download`,
      files: files.map(file => ({
        name: file.originalname,
        url: file.url,
        size: file.size,
        type: file.mimetype
      }))
    });

  } catch (error) {
    console.error('❌ Error in bulk download:', error);
    res.status(500).json({
      success: false,
      message: 'Error preparing bulk download',
      error: error.message
    });
  }
});

// Delete estimation (enhanced with file cleanup)
router.delete('/:estimationId', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const estimationData = estimationDoc.data();
    
    // Check authorization
    if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only allow deletion if status is pending
    if (estimationData.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete estimation that is not pending'
      });
    }

    // Delete associated files from Firebase Storage
    if (estimationData.uploadedFiles && estimationData.uploadedFiles.length > 0) {
      console.log(`Deleting ${estimationData.uploadedFiles.length} files from storage`);
      
      for (const file of estimationData.uploadedFiles) {
        try {
          await deleteFileFromFirebase(file.path || file.filename);
        } catch (fileDeleteError) {
          console.error(`Failed to delete file ${file.originalname}:`, fileDeleteError);
          // Continue with other files even if one fails
        }
      }
    }

    // Delete the estimation document
    await adminDb.collection('estimations').doc(estimationId).delete();

    console.log(`Estimation ${estimationId} and associated files deleted by ${req.user?.email}`);

    res.json({
      success: true,
      message: 'Estimation and associated files deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting estimation:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting estimation',
      error: error.message
    });
  }
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 15MB per file allowed.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
      });
    }
  }
  
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

export default router;
