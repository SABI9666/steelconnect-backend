// estimation.js - Complete updated version with secure file access and download functionality
import express from 'express';
import multer from 'multer';
import { authenticateToken, isContractor, isAdmin } from '../middleware/authMiddleware.js';
import { 
  adminDb, 
  storage,
  uploadMultipleFilesToFirebase, 
  uploadToFirebaseStorage,
  validateFileUpload, 
  deleteFileFromFirebase,
  generateSignedUrl,
  validateContractorAccess,
  createSecureDownloadLink,
  getFileMetadata,
  batchDeleteFiles,
  FILE_UPLOAD_CONFIG 
} from '../config/firebase.js';
import { sendEstimationResultNotification } from '../utils/emailService.js';

const router = express.Router();

// Enhanced multer configuration for multiple PDF uploads (large files + high qty)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize, // 50MB per file (large drawings/blueprints)
    files: FILE_UPLOAD_CONFIG.maxFiles, // Maximum 20 files (bulk estimation support)
    fieldSize: 1024 * 1024 // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files for estimations
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
    console.log('[ADMIN] Estimations list requested by:', req.user?.email);
    
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
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0,
        // Add convenience flags
        hasResult: !!(data.resultFile && data.resultFile.path),
        hasFiles: !!(data.uploadedFiles && data.uploadedFiles.length > 0)
      };
    });
    
    console.log(`[ADMIN] Found ${estimations.length} estimations`);
    
    res.json({
      success: true,
      estimations: estimations
    });
  } catch (error) {
    console.error('[ADMIN] Error fetching estimations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimations',
      error: error.message
    });
  }
});

// Enhanced estimation submission with multiple PDF support and secure upload
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 20), async (req, res) => {
  try {
    console.log('[CONTRACTOR] Estimation submission by:', req.user?.email);
    console.log('[CONTRACTOR] Files received:', req.files?.length || 0);
    
    const { projectTitle, description, contractorName, contractorEmail } = req.body;
    const files = req.files;

    // Validate required fields
    if (!projectTitle || !description || !contractorName || !contractorEmail) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: projectTitle, description, contractorName, contractorEmail'
      });
    }

    // Validate contractor email matches authenticated user
    if (contractorEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: 'Contractor email must match your authenticated email'
      });
    }

    // Validate files using enhanced validation
    try {
      validateFileUpload(files, FILE_UPLOAD_CONFIG.maxFiles);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }
    
    console.log(`[CONTRACTOR] Processing ${files.length} PDF files for estimation`);
    console.log('[CONTRACTOR] File details:', files.map(f => ({
      name: f.originalname,
      size: `${(f.size / (1024 * 1024)).toFixed(2)}MB`,
      type: f.mimetype
    })));

    // Upload files to Firebase Storage with contractor metadata for security
    let uploadedFiles = [];
    try {
      // Add contractor metadata to each upload
      const uploadPromises = files.map(async (file, index) => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${index}_${file.originalname}`;
        const filePath = `estimation-files/${req.user.userId}/${fileName}`;
        
        const metadata = {
          contractorEmail: req.user.email,
          contractorId: req.user.userId,
          uploadedBy: req.user.userId,
          fileIndex: index,
          uploadBatch: timestamp
        };
        
        return uploadToFirebaseStorage(file, filePath, metadata);
      });
      
      uploadedFiles = await Promise.all(uploadPromises);
      console.log(`[CONTRACTOR] Successfully uploaded ${uploadedFiles.length} files with security metadata`);
    } catch (uploadError) {
      console.error('[CONTRACTOR] File upload failed:', uploadError);
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
      totalFileSize: uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submissionMetadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        timestamp: new Date().toISOString(),
        version: '2.0' // Track API version
      }
    };

    const estimationRef = await adminDb.collection('estimations').add(estimationData);
    
    console.log(`[CONTRACTOR] Estimation created with ID: ${estimationRef.id}`);
    
    // Prepare secure response (don't expose file URLs/paths)
    const responseData = {
      id: estimationRef.id,
      projectTitle,
      description,
      contractorName,
      contractorEmail,
      fileCount: uploadedFiles.length,
      totalFileSize: estimationData.totalFileSize,
      totalFileSizeMB: (estimationData.totalFileSize / (1024 * 1024)).toFixed(2),
      uploadedFiles: uploadedFiles.map(f => ({
        name: f.originalname || f.name,
        size: f.size,
        sizeMB: (f.size / (1024 * 1024)).toFixed(2),
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
    console.error('[CONTRACTOR] Error submitting estimation:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting estimation request',
      error: error.message
    });
  }
});

// Get contractor's estimations with comprehensive file information
router.get('/contractor/:contractorEmail', authenticateToken, async (req, res) => {
  try {
    const { contractorEmail } = req.params;
    
    console.log(`[CONTRACTOR] Estimations requested for: ${contractorEmail} by: ${req.user?.email}`);
    
    // Check authorization - contractor can only see their own estimations
    if (req.user.type !== 'admin' && req.user.email !== contractorEmail) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only view your own estimations'
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
        projectName: data.projectTitle || data.projectName,
        projectTitle: data.projectTitle,
        projectDescription: data.description || data.projectDescription,
        description: data.description,
        contractorName: data.contractorName,
        contractorEmail: data.contractorEmail,
        contractorId: data.contractorId,
        status: data.status || 'pending',
        uploadedFiles: data.uploadedFiles || [],
        resultFile: data.resultFile || null,
        estimatedAmount: data.estimatedAmount || null,
        notes: data.notes || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        completedAt: data.completedAt,
        completedBy: data.completedBy,
        // Add convenience flags for frontend
        hasResult: !!(data.resultFile && data.resultFile.path),
        resultAvailable: !!(data.resultFile && data.resultFile.path && data.status === 'completed'),
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ? 
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0,
        totalFileSizeMB: data.uploadedFiles ? 
          (data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) / (1024 * 1024)).toFixed(2) : '0.00'
      };
    });

    console.log(`[CONTRACTOR] Found ${estimations.length} estimations for contractor ${contractorEmail}`);

    res.json({
      success: true,
      estimations: estimations,
      data: estimations, // For backwards compatibility
      summary: {
        total: estimations.length,
        pending: estimations.filter(e => e.status === 'pending').length,
        completed: estimations.filter(e => e.status === 'completed').length,
        withResults: estimations.filter(e => e.hasResult).length
      }
    });

  } catch (error) {
    console.error('[CONTRACTOR] Error fetching contractor estimations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimations',
      error: error.message
    });
  }
});

// Get specific estimation details with full information
router.get('/:estimationId/details', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    console.log(`[ESTIMATION-DETAILS] Request for: ${estimationId} by: ${req.user.email}`);

    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const data = estimationDoc.data();

    // Check access permission
    const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
    const isAdmin = req.user.type === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this estimation'
      });
    }

    const estimation = {
      _id: estimationDoc.id,
      id: estimationDoc.id,
      projectName: data.projectTitle || data.projectName,
      projectTitle: data.projectTitle,
      projectDescription: data.description || data.projectDescription,
      description: data.description,
      contractorName: data.contractorName,
      contractorEmail: data.contractorEmail,
      contractorId: data.contractorId,
      status: data.status || 'pending',
      uploadedFiles: data.uploadedFiles || [],
      resultFile: data.resultFile || null,
      estimatedAmount: data.estimatedAmount || null,
      notes: data.notes || '',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: data.completedAt,
      completedBy: data.completedBy,
      // Enhanced flags
      hasResult: !!(data.resultFile && data.resultFile.path),
      resultAvailable: !!(data.resultFile && data.resultFile.path && data.status === 'completed'),
      canDownloadResult: !!(data.resultFile && data.resultFile.path && data.status === 'completed'),
      fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
      totalFileSize: data.uploadedFiles ? 
        data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0
    };

    console.log(`[ESTIMATION-DETAILS] Returning details for estimation ${estimationId}, hasResult: ${estimation.hasResult}`);

    res.json({ success: true, estimation });

  } catch (error) {
    console.error('[ESTIMATION-DETAILS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimation details'
    });
  }
});

// SECURE: Download estimation result file using signed URLs
router.get('/:estimationId/result/download', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    console.log(`[RESULT-DOWNLOAD] Secure download request for: ${estimationId} by: ${req.user.email}`);

    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const data = estimationDoc.data();

    // Verify access
    const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
    const isAdmin = req.user.type === 'admin';

    if (!isOwner && !isAdmin) {
      console.log(`[RESULT-DOWNLOAD] Access denied for user ${req.user.email} to estimation ${estimationId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only download your own estimation results'
      });
    }

    // Check if result exists and estimation is completed
    if (!data.resultFile || !data.resultFile.path) {
      return res.status(404).json({
        success: false,
        message: 'Result file not available yet - estimation may still be in progress'
      });
    }

    if (data.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Estimation not completed yet - result will be available once admin completes the review'
      });
    }

    try {
      // Create secure download link with access validation
      const downloadInfo = await createSecureDownloadLink(
        data.resultFile.path,
        req.user.email,
        req.user.uid,
        15 // 15 minutes expiration
      );

      console.log(`[RESULT-DOWNLOAD] Generated secure download link for estimation ${estimationId}`);

      res.json({
        success: true,
        downloadUrl: downloadInfo.downloadUrl,
        filename: downloadInfo.filename,
        expiresIn: downloadInfo.expiresIn,
        expiresAt: downloadInfo.expiresAt,
        fileSize: downloadInfo.fileSize,
        fileSizeMB: downloadInfo.fileSize ? (downloadInfo.fileSize / (1024 * 1024)).toFixed(2) : null,
        estimationInfo: {
          id: estimationId,
          projectTitle: data.projectTitle,
          completedAt: data.completedAt,
          completedBy: data.completedBy,
          estimatedAmount: data.estimatedAmount
        }
      });

    } catch (accessError) {
      console.error(`[RESULT-DOWNLOAD] Access denied for file:`, accessError);
      return res.status(403).json({
        success: false,
        message: 'Unable to access result file - please contact support if this persists'
      });
    }

  } catch (error) {
    console.error("[RESULT-DOWNLOAD] Error:", error);
    res.status(500).json({
      success: false,
      message: 'Error generating download link'
    });
  }
});

// ALTERNATIVE: Direct redirect download (for backwards compatibility)
router.get('/:estimationId/result', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    console.log(`[RESULT-DIRECT] Direct download request for: ${estimationId} by: ${req.user.email}`);

    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const data = estimationDoc.data();

    // Verify access
    const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
    const isAdmin = req.user.type === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if result exists
    if (!data.resultFile || !data.resultFile.path) {
      return res.status(404).json({
        success: false,
        message: 'Result file not available yet'
      });
    }

    try {
      // Validate access and generate signed URL
      const hasAccess = await validateContractorAccess(
        data.resultFile.path,
        req.user.email,
        req.user.uid
      );

      if (!hasAccess && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'File access denied'
        });
      }

      // Generate signed URL and redirect
      const signedUrl = await generateSignedUrl(data.resultFile.path, 15, 'attachment');
      
      console.log(`[RESULT-DIRECT] Redirecting to signed URL for direct download`);
      
      // Set proper headers for file download
      const fileName = data.resultFile.name || data.resultFile.originalname || 'estimation_result.pdf';
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', data.resultFile.mimetype || 'application/pdf');
      
      // Redirect to the signed URL
      res.redirect(signedUrl);

    } catch (accessError) {
      console.error(`[RESULT-DIRECT] File access error:`, accessError);
      return res.status(403).json({
        success: false,
        message: 'Unable to access file'
      });
    }

  } catch (error) {
    console.error("[RESULT-DIRECT] Error:", error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
});

// Get result file information for frontend display
router.get('/:estimationId/result-info', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    console.log(`[RESULT-INFO] Info request for: ${estimationId} by: ${req.user.email}`);

    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();

    if (!estimationDoc.exists) {
      return res.status(404).json({ success: false, message: 'Estimation not found' });
    }

    const data = estimationDoc.data();
    
    // Check access
    const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
    const isAdmin = req.user.type === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if result file exists
    if (!data.resultFile || !data.resultFile.path) {
      return res.json({
        success: true,
        downloadInfo: {
          available: false,
          message: 'Result file not available yet'
        },
        estimation: {
          id: estimationId,
          projectName: data.projectTitle || data.projectName,
          status: data.status,
          completedAt: data.completedAt
        }
      });
    }

    // Return download information for frontend
    res.json({
      success: true,
      downloadInfo: {
        available: true,
        canDownload: data.status === 'completed',
        filename: data.resultFile.name || data.resultFile.originalname || 'estimation_result.pdf',
        uploadedAt: data.resultFile.uploadedAt,
        uploadedBy: data.resultFile.uploadedBy || data.completedBy || 'Admin',
        size: data.resultFile.size || null,
        sizeMB: data.resultFile.size ? (data.resultFile.size / (1024 * 1024)).toFixed(2) : null,
        type: data.resultFile.mimetype || 'application/pdf'
      },
      estimation: {
        id: estimationId,
        projectName: data.projectTitle || data.projectName,
        status: data.status,
        completedAt: data.completedAt,
        estimatedAmount: data.estimatedAmount,
        notes: data.notes
      }
    });

  } catch (error) {
    console.error("[RESULT-INFO] Error:", error);
    res.status(500).json({
      success: false,
      message: 'Error getting result info'
    });
  }
});

// Enhanced result upload (Admin only) with secure file handling
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
  try {
    const { estimationId } = req.params;
    const { amount, notes } = req.body;
    const file = req.file;

    console.log(`[ADMIN-RESULT-UPLOAD] Admin ${req.user?.email} uploading result for estimation ${estimationId}`);
    
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
    
    const estData = estimationDoc.data();
    
    // Create secure file path with contractor info for access control
    const filePath = `estimation-results/${estimationId}/${file.originalname}`;
    
    // Add contractor metadata for secure access
    const uploadMetadata = {
      contractorEmail: estData.contractorEmail,
      contractorId: estData.contractorId,
      estimationId: estimationId,
      uploadedBy: req.user.email,
      fileType: 'estimation_result'
    };
    
    console.log(`[ADMIN-RESULT-UPLOAD] Uploading with metadata:`, uploadMetadata);
    
    // Upload result file with security metadata
    const uploadedFile = await uploadToFirebaseStorage(file, filePath, uploadMetadata);
    
    // Update estimation with result
    const updateData = {
      resultFile: {
        ...uploadedFile,
        uploadedBy: req.user.email
      },
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
    
    console.log(`[ADMIN-RESULT-UPLOAD] Result uploaded for estimation ${estimationId} with secure access`);

    // Send email notification to contractor
    try {
      await sendEstimationResultNotification(
        { name: estData.contractorName, email: estData.contractorEmail },
        { id: estimationId, title: estData.projectTitle, amount: updateData.estimatedAmount }
      );
      console.log(`[ADMIN-RESULT-UPLOAD] Email notification sent to ${estData.contractorEmail}`);
    } catch (emailError) {
      console.error(`[ADMIN-RESULT-UPLOAD] Failed to send email for ${estimationId}:`, emailError.message);
    }
    
    res.json({
      success: true,
      message: 'Estimation result uploaded successfully with secure access',
      data: {
        resultFile: {
          name: uploadedFile.originalname || uploadedFile.name,
          size: uploadedFile.size,
          sizeMB: (uploadedFile.size / (1024 * 1024)).toFixed(2),
          type: uploadedFile.mimetype,
          uploadedAt: uploadedFile.uploadedAt
        },
        estimatedAmount: updateData.estimatedAmount,
        completedAt: updateData.completedAt
      }
    });

  } catch (error) {
    console.error('[ADMIN-RESULT-UPLOAD] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading estimation result',
      error: error.message
    });
  }
});

// Get files for specific estimation with secure access validation
router.get('/:estimationId/files', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    console.log(`[FILES] Request for estimation ${estimationId} by ${req.user.email}`);
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const estimationData = estimationDoc.data();
    
    // Check authorization
    const isOwner = req.user.email === estimationData.contractorEmail || req.user.userId === estimationData.contractorId;
    const isAdmin = req.user.type === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only view files for your own estimations'
      });
    }

    const files = estimationData.uploadedFiles || [];
    
    // Format files with consistent structure (no direct URLs for security)
    const formattedFiles = files.map((file, index) => ({
      index: index,
      id: `${estimationId}_${index}`,
      name: file.name || file.originalname || `File ${index + 1}`,
      originalname: file.originalname || file.name,
      size: file.size || 0,
      sizeMB: file.size ? (file.size / (1024 * 1024)).toFixed(2) : '0.00',
      type: file.mimetype || 'application/pdf',
      uploadedAt: file.uploadedAt || estimationData.createdAt,
      path: file.path, // Store path for secure download
      downloadAvailable: true,
      canDownload: true
    }));
    
    const totalSize = formattedFiles.reduce((sum, file) => sum + (file.size || 0), 0);

    console.log(`[FILES] Returning ${formattedFiles.length} files for estimation ${estimationId}`);

    res.json({
      success: true,
      files: formattedFiles,
      fileCount: formattedFiles.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      estimationInfo: {
        id: estimationId,
        projectTitle: estimationData.projectTitle,
        status: estimationData.status,
        contractorEmail: estimationData.contractorEmail
      }
    });

  } catch (error) {
    console.error('[FILES] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
});

// Secure file download by index with proper authorization
router.get('/:estimationId/files/:fileIndex/download', authenticateToken, async (req, res) => {
  try {
    const { estimationId, fileIndex } = req.params;
    
    console.log(`[FILE-DOWNLOAD] Request for file ${fileIndex} from estimation ${estimationId} by ${req.user.email}`);
    
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
    const isOwner = req.user.email === estimationData.contractorEmail || req.user.userId === estimationData.contractorId;
    const isAdmin = req.user.type === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only download files for your own estimations'
      });
    }
    
    // Find the file in uploadedFiles
    const files = estimationData.uploadedFiles || [];
    const index = parseInt(fileIndex);
    
    if (index >= files.length || index < 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    const file = files[index];
    const filePath = file.path;
    
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'File path not available'
      });
    }
    
    try {
      // Validate access and create secure download link
      const downloadInfo = await createSecureDownloadLink(
        filePath,
        req.user.email,
        req.user.uid,
        15 // 15 minutes expiration
      );
      
      console.log(`[FILE-DOWNLOAD] Generated secure download link for file: ${file.name || file.originalname}`);
      
      res.json({
        success: true,
        downloadUrl: downloadInfo.downloadUrl,
        filename: downloadInfo.filename,
        expiresIn: downloadInfo.expiresIn,
        expiresAt: downloadInfo.expiresAt,
        fileSize: downloadInfo.fileSize,
        fileSizeMB: downloadInfo.fileSize ? (downloadInfo.fileSize / (1024 * 1024)).toFixed(2) : null
      });

    } catch (accessError) {
      console.error('[FILE-DOWNLOAD] Access denied:', accessError);
      return res.status(403).json({
        success: false,
        message: 'File access denied - unable to generate download link'
      });
    }

  } catch (error) {
    console.error('[FILE-DOWNLOAD] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error providing file download',
      error: error.message
    });
  }
});

// Alternative: Direct file download by filename (for backwards compatibility)
router.get('/:estimationId/files/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { estimationId, fileName } = req.params;
    
    console.log(`[FILE-DOWNLOAD-NAME] Request for file ${fileName} from estimation ${estimationId} by ${req.user.email}`);
    
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
    const isOwner = req.user.email === estimationData.contractorEmail || req.user.userId === estimationData.contractorId;
    const isAdmin = req.user.type === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Find the file in uploadedFiles
    const file = estimationData.uploadedFiles?.find(f => 
      (f.originalname === fileName) || (f.name === fileName)
    );
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    const filePath = file.path;
    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: 'File path not available'
      });
    }
    
    try {
      // Validate access and generate signed URL
      const hasAccess = await validateContractorAccess(
        filePath,
        req.user.email,
        req.user.uid
      );

      if (!hasAccess && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'File access denied'
        });
      }

      // Generate signed URL and redirect
      const signedUrl = await generateSignedUrl(filePath, 15, 'attachment');
      
      console.log(`[FILE-DOWNLOAD-NAME] Providing direct download for file: ${fileName}`);
      
      // Set proper headers and redirect to file
      const downloadFileName = file.originalname || file.name || fileName;
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
      res.setHeader('Content-Type', file.mimetype || 'application/pdf');
      
      // Redirect to the signed URL
      res.redirect(signedUrl);

    } catch (accessError) {
      console.error('[FILE-DOWNLOAD-NAME] File access error:', accessError);
      return res.status(403).json({
        success: false,
        message: 'Unable to access file'
      });
    }

  } catch (error) {
    console.error('[FILE-DOWNLOAD-NAME] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error providing file download',
      error: error.message
    });
  }
});

// Get downloadable URL for a specific file (returns JSON with URL)
router.get('/:estimationId/files/:fileIndex/url', authenticateToken, async (req, res) => {
  try {
    const { estimationId, fileIndex } = req.params;
    
    console.log(`[FILE-URL] Request for file ${fileIndex} URL from estimation ${estimationId} by ${req.user.email}`);
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({ success: false, message: 'Estimation not found' });
    }

    const estimationData = estimationDoc.data();
    
    // Check authorization
    const isOwner = req.user.email === estimationData.contractorEmail || req.user.userId === estimationData.contractorId;
    const isAdmin = req.user.type === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const files = estimationData.uploadedFiles || [];
    const index = parseInt(fileIndex);
    
    if (index >= files.length || index < 0) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    const file = files[index];
    
    if (!file.path) {
      return res.status(404).json({ success: false, message: 'File path not available' });
    }
    
    try {
      // Generate signed URL
      const signedUrl = await generateSignedUrl(file.path, 15, 'attachment');
      
      res.json({
        success: true,
        url: signedUrl,
        filename: file.originalname || file.name,
        expiresIn: 15 * 60 * 1000, // 15 minutes in milliseconds
        fileInfo: {
          name: file.originalname || file.name,
          size: file.size,
          sizeMB: file.size ? (file.size / (1024 * 1024)).toFixed(2) : null,
          type: file.mimetype,
          uploadedAt: file.uploadedAt
        }
      });

    } catch (accessError) {
      console.error('[FILE-URL] Access denied:', accessError);
      return res.status(403).json({ success: false, message: 'File access denied' });
    }

  } catch (error) {
    console.error('[FILE-URL] Error:', error);
    res.status(500).json({ success: false, message: 'Error generating file URL' });
  }
});

// Delete estimation with enhanced security and file cleanup
router.delete('/:estimationId', authenticateToken, async (req, res) => {
  try {
    const { estimationId } = req.params;
    
    console.log(`[DELETE] Request to delete estimation ${estimationId} by ${req.user.email}`);
    
    const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
    if (!estimationDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Estimation not found'
      });
    }

    const estimationData = estimationDoc.data();
    
    // Check authorization - only owner or admin can delete
    const isOwner = req.user.email === estimationData.contractorEmail;
    const isAdmin = req.user.type === 'admin';
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only delete your own estimations'
      });
    }

    // Only allow deletion if status is pending (protect completed estimations)
    if (estimationData.status !== 'pending' && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete estimation that is not pending. Contact admin if you need to remove a completed estimation.'
      });
    }

    // Collect all file paths for deletion
    const filesToDelete = [];
    
    // Add uploaded files
    if (estimationData.uploadedFiles && estimationData.uploadedFiles.length > 0) {
      estimationData.uploadedFiles.forEach(file => {
        if (file.path) {
          filesToDelete.push(file.path);
        }
      });
    }

    // Add result file if exists
    if (estimationData.resultFile && estimationData.resultFile.path) {
      filesToDelete.push(estimationData.resultFile.path);
    }

    // Delete associated files from Firebase Storage
    if (filesToDelete.length > 0) {
      console.log(`[DELETE] Deleting ${filesToDelete.length} files from storage for estimation ${estimationId}`);
      
      try {
        await batchDeleteFiles(filesToDelete);
        console.log(`[DELETE] Successfully deleted ${filesToDelete.length} files`);
      } catch (fileDeleteError) {
        console.error(`[DELETE] Some files could not be deleted:`, fileDeleteError);
        // Continue with deletion even if some files fail
      }
    }

    // Delete the estimation document
    await adminDb.collection('estimations').doc(estimationId).delete();

    console.log(`[DELETE] Estimation ${estimationId} and ${filesToDelete.length} associated files deleted by ${req.user?.email}`);

    res.json({
      success: true,
      message: 'Estimation and associated files deleted successfully',
      deletedFiles: filesToDelete.length
    });

  } catch (error) {
    console.error('[DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting estimation',
      error: error.message
    });
  }
});

// Get estimation statistics (Admin only)
router.get('/stats/overview', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log(`[STATS] Overview requested by admin: ${req.user.email}`);
    
    const snapshot = await adminDb.collection('estimations').get();
    
    const stats = {
      total: 0,
      pending: 0,
      completed: 0,
      totalFiles: 0,
      totalFileSize: 0,
      byContractor: {},
      recentActivity: []
    };
    
    const now = new Date();
    const last30Days = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      stats.total++;
      
      if (data.status === 'pending') {
        stats.pending++;
      } else if (data.status === 'completed') {
        stats.completed++;
      }
      
      if (data.uploadedFiles) {
        stats.totalFiles += data.uploadedFiles.length;
        stats.totalFileSize += data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
      }
      
      // Track by contractor
      const contractorEmail = data.contractorEmail;
      if (contractorEmail) {
        if (!stats.byContractor[contractorEmail]) {
          stats.byContractor[contractorEmail] = {
            name: data.contractorName,
            total: 0,
            pending: 0,
            completed: 0
          };
        }
        stats.byContractor[contractorEmail].total++;
        if (data.status === 'pending') {
          stats.byContractor[contractorEmail].pending++;
        } else if (data.status === 'completed') {
          stats.byContractor[contractorEmail].completed++;
        }
      }
      
      // Recent activity
      const createdAt = new Date(data.createdAt);
      if (createdAt > last30Days) {
        stats.recentActivity.push({
          id: doc.id,
          projectTitle: data.projectTitle,
          contractorName: data.contractorName,
          status: data.status,
          createdAt: data.createdAt
        });
      }
    });
    
    // Sort recent activity by date
    stats.recentActivity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Add computed stats
    stats.totalFileSizeMB = (stats.totalFileSize / (1024 * 1024)).toFixed(2);
    stats.avgFilesPerEstimation = stats.total > 0 ? (stats.totalFiles / stats.total).toFixed(1) : 0;
    stats.completionRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;
    
    console.log(`[STATS] Returning overview with ${stats.total} estimations`);
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('[STATS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching estimation statistics'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'estimation-api',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  console.error('[MULTER-ERROR]', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 50MB per file allowed.',
        errorCode: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`,
        errorCode: 'TOO_MANY_FILES'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.',
        errorCode: 'UNEXPECTED_FILE'
      });
    }
  }
  
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      errorCode: 'INVALID_FILE_TYPE'
    });
  }
  
  // Pass other errors to the next error handler
  next(error);
});

export default router;
