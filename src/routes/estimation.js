// estimation.js - FIXED with proper file handling and imports
import express from 'express';
import multer from 'multer';
import { authenticateToken, isContractor, isAdmin } from '../middleware/authMiddleware.js';
import { 
  adminDb, 
  storage,
  FILE_UPLOAD_CONFIG 
} from '../config/firebase.js';
// FIXED: Import from the correct location
import { 
  uploadMultipleFilesToFirebase, 
  validateFileUpload, 
  deleteFileFromFirebase,
  getSignedDownloadUrl
} from '../utils/firebaseStorage.js';
import { sendEstimationResultNotification } from '../utils/emailService.js';

const router = express.Router();

// FIXED: Enhanced multer configuration for PDF uploads only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize || (15 * 1024 * 1024), // 15MB per file
    files: 10, // Maximum 10 files
    fieldSize: 1024 * 1024, // 1MB for form fields
    fields: 20 // Maximum number of non-file fields
  },
  fileFilter: (req, file, cb) => {
    console.log(`Processing estimation file: ${file.originalname}, MIME: ${file.mimetype}`);
    
    // FIXED: Handle missing MIME type
    if (!file.mimetype) {
      // Try to detect from extension
      const ext = (file.originalname || '').toLowerCase().split('.').pop();
      if (ext === 'pdf') {
        file.mimetype = 'application/pdf';
        console.log(`Auto-detected PDF MIME type for ${file.originalname}`);
      } else {
        return cb(new Error(`Could not determine file type for ${file.originalname}. Only PDF files are allowed.`), false);
      }
    }
    
    // Only allow PDF files for estimations
    if (file.mimetype !== 'application/pdf') {
      console.log(`Rejected estimation file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`Only PDF files are allowed for estimation requests. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    if (ext !== 'pdf') {
      console.log(`Rejected estimation file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`Only PDF files are allowed. File has extension: .${ext}`), false);
    }
    
    console.log(`Accepted estimation file: ${file.originalname}`);
    cb(null, true);
  }
});

// Error handling middleware for multer errors
const handleEstimationUploadError = (error, req, res, next) => {
  console.error('Estimation upload error:', error);
  
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum 15MB per PDF file allowed.',
          errorCode: 'FILE_SIZE_LIMIT'
        });
        
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 10 PDF files allowed.',
          errorCode: 'FILE_COUNT_LIMIT'
        });
        
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field in upload.',
          errorCode: 'UNEXPECTED_FILE'
        });
        
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${error.message}`,
          errorCode: 'UPLOAD_ERROR'
        });
    }
  }
  
  // Handle file type errors
  if (error.message.includes('Only PDF files are allowed') || 
      error.message.includes('Could not determine file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      errorCode: 'INVALID_FILE_TYPE'
    });
  }
  
  if (error.message.includes('Firebase upload failed') || error.message.includes('Failed to upload')) {
    return res.status(500).json({
      success: false,
      message: 'File upload to cloud storage failed. Please try again.',
      errorCode: 'STORAGE_ERROR'
    });
  }
  
  next(error);
};

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

// FIXED: Enhanced estimation submission with proper file validation
router.post('/contractor/submit', 
  authenticateToken, 
  isContractor, 
  upload.array('files', 10), 
  handleEstimationUploadError,
  async (req, res) => {
    try {
      console.log('=== ESTIMATION SUBMISSION ===');
      console.log('Contractor:', req.user?.email);
      console.log('Body:', req.body);
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

      // Validate files are present
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one PDF file is required for estimation requests.'
        });
      }

      console.log(`Processing ${files.length} PDF files for estimation`);
      console.log('File details:', files.map(f => ({
        name: f.originalname,
        size: `${(f.size / (1024 * 1024)).toFixed(2)}MB`,
        type: f.mimetype
      })));

      // Additional file validation
      for (const file of files) {
        if (!file.mimetype || file.mimetype !== 'application/pdf') {
          return res.status(400).json({
            success: false,
            message: `File "${file.originalname}" must be a PDF. Only PDF files are allowed.`
          });
        }
        
        if (file.size > (15 * 1024 * 1024)) {
          return res.status(400).json({
            success: false,
            message: `File "${file.originalname}" exceeds 15MB size limit.`
          });
        }
      }

      // Upload files to Firebase Storage
      let uploadedFiles = [];
      try {
        uploadedFiles = await uploadMultipleFilesToFirebase(
          files, 
          'estimation-files',
          req.user.userId
        );
        
        console.log(`Successfully uploaded ${uploadedFiles.length} files`);
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'File upload failed',
          error: uploadError.message
        });
      }

      // Create estimation document
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
      
      console.log(`Estimation created with ID: ${estimationRef.id}`);
      
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
          name: f.originalname || f.name,
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
      console.error('Error submitting estimation:', error);
      res.status(500).json({
        success: false,
        message: 'Error submitting estimation request',
        error: error.message
      });
    }
  }
);

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
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ? 
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0
      };
    });

    console.log(`Found ${estimations.length} estimations for contractor ${contractorEmail}`);

    res.json({
      success: true,
      estimations: estimations,
      data: estimations
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
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), handleEstimationUploadError, async (req, res) => {
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
      'estimation-results', 
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
    
    console.log(`Result uploaded for estimation ${estimationId}`);

    // Send email notification to contractor if available
    try {
      const estimationData = estimationDoc.data();
      if (sendEstimationResultNotification) {
        await sendEstimationResultNotification(
          { name: estimationData.contractorName, email: estimationData.contractorEmail },
          { id: estimationId, title: estimationData.projectTitle, amount: updateData.estimatedAmount }
        );
        console.log(`Email notification sent successfully to ${estimationData.contractorEmail}`);
      }
    } catch (emailError) {
      console.error(`Failed to send estimation result email for ${estimationId}:`, emailError.message);
    }
    
    res.json({
      success: true,
      message: 'Estimation result uploaded successfully',
      data: {
        resultFile: {
          name: resultFile.originalname || resultFile.name,
          size: resultFile.size,
          type: resultFile.mimetype,
          uploadedAt: resultFile.uploadedAt
        },
        estimatedAmount: updateData.estimatedAmount
      }
    });

  } catch (error) {
    console.error('Error uploading estimation result:', error);
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
    const resultFile = estimationData.resultFile;
    const allFiles = [...files];
    
    // Add result file if exists
    if (resultFile) {
      allFiles.push({
        ...resultFile,
        isResult: true,
        name: resultFile.name || resultFile.originalname || 'Estimation Result'
      });
    }

    const totalSize = allFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    res.json({
      success: true,
      files: allFiles.map(file => ({
        name: file.name || file.originalname || 'Unknown File',
        url: file.url || file.downloadURL,
        downloadUrl: file.url || file.downloadURL,
        size: file.size || 0,
        type: file.type || file.mimetype || 'application/pdf',
        uploadedAt: file.uploadedAt,
        isResult: file.isResult || false
      })),
      fileCount: allFiles.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      estimationInfo: {
        id: estimationId,
        projectTitle: estimationData.projectTitle,
        status: estimationData.status,
        contractorName: estimationData.contractorName
      }
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

// FIXED: File download with proper authorization
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
    
    // Find the file in uploadedFiles or resultFile
    let file = null;
    
    // Check in uploaded files
    if (estimationData.uploadedFiles) {
      file = estimationData.uploadedFiles.find(f => 
        (f.originalname === fileName) || (f.name === fileName)
      );
    }
    
    // Check result file if not found in uploaded files
    if (!file && estimationData.resultFile) {
      const resultFile = estimationData.resultFile;
      if ((resultFile.originalname === fileName) || (resultFile.name === fileName) || 
          fileName === 'Estimation Result' || fileName.includes('result')) {
        file = resultFile;
      }
    }
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`Providing download URL for file: ${fileName}`);
    
    // Return the download URL
    res.json({
      success: true,
      file: {
        name: file.originalname || file.name,
        url: file.url || file.downloadURL,
        downloadUrl: file.url || file.downloadURL,
        size: file.size,
        type: file.type || file.mimetype || 'application/pdf'
      }
    });

  } catch (error) {
    console.error('Error providing file download:', error);
    res.status(500).json({
      success: false,
      message: 'Error providing file download',
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
          console.error(`Failed to delete file ${file.originalname || file.name}:`, fileDeleteError);
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

export default router;
