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
import { generateSmartQuestions, generateAIEstimate } from '../services/aiEstimationService.js';

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
    // Accept common construction/estimation file types
    const allowedExtensions = ['pdf', 'dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'txt', 'rtf', 'zip', 'rar'];
    const allowedMimes = [
      'application/pdf',
      'application/octet-stream',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'text/plain',
      'image/jpeg', 'image/png', 'image/tiff', 'image/bmp',
      'application/zip', 'application/x-rar-compressed',
      'application/acad', 'application/x-acad', 'application/x-autocad',
      'image/vnd.dwg', 'image/x-dwg'
    ];

    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error(`File type .${ext} is not supported. Allowed: PDF, DWG, DOC, DOCX, XLS, XLSX, JPG, PNG, TIF, CSV, TXT, ZIP`), false);
    }

    // Accept if MIME matches or is octet-stream (browsers sometimes send unknown types as octet-stream)
    if (!allowedMimes.includes(file.mimetype)) {
      // Still allow if extension is valid (some browsers miscategorize MIME types)
      console.warn(`[UPLOAD] Unusual MIME ${file.mimetype} for .${ext} - allowing based on extension`);
    }

    cb(null, true);
  }
});

// Safe multer wrapper - handles upload errors inline via promise
const safeEstimationUpload = (req, res) => {
  return new Promise((resolve, reject) => {
    upload.array('files', 20)(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

// Helper to normalize Firestore timestamps to ISO strings
const normalizeDate = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
  if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
};

// Get all estimations (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    console.log('[ADMIN] Estimations list requested by:', req.user?.email);

    const snapshot = await adminDb.collection('estimations').get();

    const estimations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        _id: doc.id,
        id: doc.id,
        ...data,
        // Normalize all date fields to ISO strings
        createdAt: normalizeDate(data.createdAt),
        updatedAt: normalizeDate(data.updatedAt),
        completedAt: normalizeDate(data.completedAt),
        // Add file statistics
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ?
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0,
        // Add convenience flags
        hasResult: !!(data.resultFile && data.resultFile.path),
        hasFiles: !!(data.uploadedFiles && data.uploadedFiles.length > 0)
      };
    });

    // Sort by createdAt descending (in memory)
    estimations.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
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

// Estimation submission: upload files + auto-generate AI estimate + save to Firestore
router.post('/contractor/submit', authenticateToken, isContractor, async (req, res) => {
  try {
    // Parse multipart upload safely (handles multer errors inline)
    try {
      await safeEstimationUpload(req, res);
    } catch (uploadErr) {
      console.error('[CONTRACTOR] Multer error:', uploadErr.message);
      const isSize = uploadErr.code === 'LIMIT_FILE_SIZE';
      const isCount = uploadErr.code === 'LIMIT_FILE_COUNT';
      return res.status(400).json({
        success: false,
        message: isSize ? 'File size too large. Maximum 50MB per file allowed.'
               : isCount ? `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`
               : `Upload error: ${uploadErr.message}`,
        errorCode: isSize ? 'FILE_TOO_LARGE' : isCount ? 'TOO_MANY_FILES' : 'UPLOAD_ERROR'
      });
    }

    console.log('[CONTRACTOR] Estimation submission by:', req.user?.email);
    console.log('[CONTRACTOR] Files received:', req.files?.length || 0);

    const { projectTitle, description, contractorName, contractorEmail, designStandard, projectType, region, totalArea, fileNames } = req.body;
    const files = req.files;

    // Validate required fields
    if (!projectTitle || !description) {
      return res.status(400).json({
        success: false,
        message: 'Project title and description are required'
      });
    }

    // Validate files
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one file is required'
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

    console.log(`[CONTRACTOR] Processing ${files.length} files for estimation`);

    // Upload files to Firebase Storage with contractor metadata for security
    let uploadedFiles = [];
    try {
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
      console.log(`[CONTRACTOR] Successfully uploaded ${uploadedFiles.length} files`);
    } catch (uploadError) {
      console.error('[CONTRACTOR] File upload failed:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'File upload failed',
        error: uploadError.message
      });
    }

    // Parse fileNames if sent as string
    let parsedFileNames = fileNames;
    if (typeof fileNames === 'string') {
      try { parsedFileNames = JSON.parse(fileNames); } catch (e) { parsedFileNames = files.map(f => f.originalname); }
    }
    if (!parsedFileNames) parsedFileNames = files.map(f => f.originalname);

    // Auto-generate AI estimate in the background
    let aiEstimate = null;
    try {
      console.log(`[CONTRACTOR] Auto-generating AI estimate for "${projectTitle}"`);
      aiEstimate = await generateAIEstimate(
        { projectTitle, description, designStandard: designStandard || '', projectType: projectType || '', region: region || '', totalArea: totalArea || '' },
        {}, // No questionnaire answers in single-submit flow
        parsedFileNames
      );
      console.log(`[CONTRACTOR] AI estimate generated successfully`);
    } catch (aiError) {
      console.error('[CONTRACTOR] AI estimate generation failed (non-blocking):', aiError.message);
      // Non-blocking - estimation still saved without AI result
    }

    // Create estimation document with files + AI result
    const estimationData = {
      projectTitle,
      description,
      designStandard: designStandard || '',
      projectType: projectType || '',
      region: region || '',
      totalArea: totalArea || '',
      contractorName: contractorName || req.user.name,
      contractorEmail: contractorEmail || req.user.email,
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
        version: '3.0'
      }
    };

    // Attach AI estimate if generated
    if (aiEstimate) {
      estimationData.aiEstimate = aiEstimate;
      estimationData.aiGeneratedAt = new Date().toISOString();
      estimationData.estimatedAmount = aiEstimate?.summary?.grandTotal || aiEstimate?.summary?.totalEstimate || 0;
    }

    const estimationRef = await adminDb.collection('estimations').add(estimationData);

    console.log(`[CONTRACTOR] Estimation created with ID: ${estimationRef.id}, AI estimate: ${aiEstimate ? 'yes' : 'no'}`);

    res.status(201).json({
      success: true,
      message: `Estimation submitted successfully with ${uploadedFiles.length} file(s)${aiEstimate ? ' and AI estimate generated' : ''}`,
      estimationId: estimationRef.id,
      data: {
        id: estimationRef.id,
        projectTitle,
        description,
        fileCount: uploadedFiles.length,
        totalFileSizeMB: (estimationData.totalFileSize / (1024 * 1024)).toFixed(2),
        hasAIEstimate: !!aiEstimate,
        status: 'pending',
        createdAt: estimationData.createdAt
      }
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

    // Query without orderBy to avoid composite index requirement
    const snapshot = await adminDb.collection('estimations')
      .where('contractorEmail', '==', contractorEmail)
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
        resultType: data.resultType || null,
        estimatedAmount: data.estimatedAmount || null,
        aiEstimate: data.status === 'completed' ? (data.aiEstimate || null) : null,
        aiGeneratedAt: data.aiGeneratedAt || null,
        notes: data.notes || '',
        createdAt: normalizeDate(data.createdAt),
        updatedAt: normalizeDate(data.updatedAt),
        completedAt: normalizeDate(data.completedAt),
        completedBy: data.completedBy,
        // Add convenience flags for frontend
        hasAIEstimate: !!data.aiEstimate,
        hasResult: !!(data.resultFile && data.resultFile.path),
        resultAvailable: !!(data.resultFile && data.resultFile.path && data.status === 'completed'),
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : 0,
        totalFileSize: data.uploadedFiles ?
          data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) : 0,
        totalFileSizeMB: data.uploadedFiles ?
          (data.uploadedFiles.reduce((sum, file) => sum + (file.size || 0), 0) / (1024 * 1024)).toFixed(2) : '0.00'
      };
    });

    // Sort by createdAt descending (in memory, avoids composite index)
    estimations.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
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
    
    // Validate file type (PDF and Excel for results)
    const allowedResultMimes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv'
    ];
    if (!allowedResultMimes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Result file must be a PDF, Excel, Word, or CSV file'
      });
    }

    // Check file size
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `Result file size (${sizeMB}MB) exceeds 50MB limit`
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

// ==========================================
// AI AUTOMATED ESTIMATION ENGINE
// ==========================================

// POST /estimation/ai-estimate - Generate AI-powered cost estimation
router.post('/ai-estimate', authenticateToken, async (req, res) => {
    try {
        // Parse multipart upload safely (handles multer errors inline)
        try {
            await safeEstimationUpload(req, res);
        } catch (uploadErr) {
            console.error('[AI-ESTIMATION] Multer error:', uploadErr.message);
            const isFileType = uploadErr.message.includes('Only PDF') || uploadErr.message.includes('File extension');
            const isSize = uploadErr.code === 'LIMIT_FILE_SIZE';
            const isCount = uploadErr.code === 'LIMIT_FILE_COUNT';
            return res.status(400).json({
                success: false,
                message: isSize ? 'File size too large. Maximum 50MB per file allowed.'
                       : isCount ? `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`
                       : isFileType ? uploadErr.message
                       : `Upload error: ${uploadErr.message}`,
                errorCode: isSize ? 'FILE_TOO_LARGE' : isCount ? 'TOO_MANY_FILES' : isFileType ? 'INVALID_FILE_TYPE' : 'UPLOAD_ERROR'
            });
        }

        const {
            projectTitle, description, contractorName, contractorEmail,
            // Questionnaire fields
            projectType, buildingType, totalArea, numberOfFloors,
            region, city, state, country,
            structuralSystem, foundationType,
            materialPreferences, qualityGrade,
            siteCondition, soilType, seismicZone,
            timeline, urgency,
            specialRequirements, existingStructure,
            mepRequirements, finishLevel
        } = req.body;

        if (!projectTitle || !description || !projectType || !totalArea || !region) {
            return res.status(400).json({
                success: false,
                message: 'Project title, description, project type, total area, and region are required'
            });
        }

        // Upload files to Firebase Storage (reuse existing upload helper)
        let uploadedFiles = [];
        const files = req.files;
        if (files && files.length > 0) {
            try {
                const uploadPromises = files.map(async (file, index) => {
                    const timestamp = Date.now();
                    const fileName = `${timestamp}_${index}_${file.originalname}`;
                    const filePath = `estimation-files/${req.user.userId}/${fileName}`;

                    const metadata = {
                        contractorEmail: req.user.email,
                        contractorId: req.user.userId,
                        uploadedBy: req.user.userId,
                        fileIndex: index,
                        uploadBatch: timestamp,
                        estimationType: 'ai-automated'
                    };

                    return uploadToFirebaseStorage(file, filePath, metadata);
                });

                uploadedFiles = await Promise.all(uploadPromises);
                console.log(`[AI-ESTIMATION] Successfully uploaded ${uploadedFiles.length} files`);
            } catch (uploadError) {
                console.error('[AI-ESTIMATION] File upload failed:', uploadError);
                // Continue without files - AI estimation can still proceed
            }
        }

        // Build questionnaire data object
        const questionnaire = {
            projectType: projectType || 'general',
            buildingType: buildingType || '',
            totalArea: parseFloat(totalArea) || 0,
            numberOfFloors: parseInt(numberOfFloors) || 1,
            region: region || '',
            city: city || '',
            state: state || '',
            country: country || 'USA',
            structuralSystem: structuralSystem || '',
            foundationType: foundationType || '',
            materialPreferences: materialPreferences || '',
            qualityGrade: qualityGrade || 'standard',
            siteCondition: siteCondition || 'normal',
            soilType: soilType || '',
            seismicZone: seismicZone || '',
            timeline: timeline || '',
            urgency: urgency || 'normal',
            specialRequirements: specialRequirements || '',
            existingStructure: existingStructure || 'no',
            mepRequirements: mepRequirements || '',
            finishLevel: finishLevel || 'standard'
        };

        // Generate AI estimation using Claude API
        let aiResult = null;
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

        if (anthropicApiKey) {
            try {
                const estimationPrompt = buildEstimationPrompt(questionnaire, projectTitle, description);

                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': anthropicApiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-5-20250929',
                        max_tokens: 8000,
                        messages: [{
                            role: 'user',
                            content: estimationPrompt
                        }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const aiText = data.content?.[0]?.text || '';
                    aiResult = parseAIEstimationResponse(aiText);
                } else {
                    console.error('[AI-ESTIMATION] Claude API error:', response.status, await response.text());
                }
            } catch (aiError) {
                console.error('[AI-ESTIMATION] AI processing error:', aiError);
            }
        }

        // Fallback: generate estimation using built-in calculation engine
        if (!aiResult) {
            aiResult = generateFallbackEstimation(questionnaire, projectTitle, description);
        }

        // Store in Firestore
        const estimationDoc = {
            projectTitle,
            description,
            contractorName: contractorName || req.user.name,
            contractorEmail: contractorEmail || req.user.email,
            contractorId: req.user.userId,
            uploadedFiles,
            fileCount: uploadedFiles.length,
            totalFileSize: uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
            questionnaire,
            aiResult,
            status: 'completed',
            estimationType: 'ai-automated',
            estimatedAmount: aiResult?.summary?.totalEstimate || 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            completedBy: 'AI Engine',
            submissionMetadata: {
                userAgent: req.get('User-Agent') || 'Unknown',
                ipAddress: req.ip || req.connection?.remoteAddress,
                timestamp: new Date().toISOString(),
                version: '3.0-ai'
            }
        };

        const docRef = await adminDb.collection('estimations').add(estimationDoc);

        console.log(`[AI-ESTIMATION] Generated for "${projectTitle}" by ${req.user.email} (ID: ${docRef.id})`);

        res.status(201).json({
            success: true,
            message: 'AI estimation generated successfully',
            data: {
                id: docRef.id,
                ...estimationDoc
            }
        });

    } catch (error) {
        console.error('[AI-ESTIMATION] Error:', error);
        res.status(500).json({ success: false, message: 'Error generating AI estimation' });
    }
});

// Build the prompt for Claude API
function buildEstimationPrompt(q, title, description) {
    return `You are a world-class construction cost estimator with 30+ years of experience across all trades including structural steel, rebar, concrete, MEP, finishes, sitework, and general construction. Generate a comprehensive, professional cost estimation report.

PROJECT DETAILS:
- Title: ${title}
- Description: ${description}
- Project Type: ${q.projectType}
- Building Type: ${q.buildingType}
- Total Area: ${q.totalArea} sq ft
- Number of Floors: ${q.numberOfFloors}
- Structural System: ${q.structuralSystem}
- Foundation Type: ${q.foundationType}

LOCATION & SITE:
- Region: ${q.region}
- City: ${q.city}, State: ${q.state}, Country: ${q.country}
- Site Condition: ${q.siteCondition}
- Soil Type: ${q.soilType}
- Seismic Zone: ${q.seismicZone}

SPECIFICATIONS:
- Material Preferences: ${q.materialPreferences}
- Quality Grade: ${q.qualityGrade}
- MEP Requirements: ${q.mepRequirements}
- Finish Level: ${q.finishLevel}
- Existing Structure: ${q.existingStructure}
- Special Requirements: ${q.specialRequirements}
- Timeline: ${q.timeline}
- Urgency: ${q.urgency}

Generate the response as a valid JSON object (no markdown, no code blocks, just pure JSON) with this exact structure:
{
  "summary": {
    "totalEstimate": <number - total cost in USD>,
    "costPerSqFt": <number>,
    "contingency": <number - contingency amount>,
    "estimateRange": { "low": <number>, "high": <number> },
    "confidenceLevel": "<string: High/Medium/Low>",
    "generatedAt": "<ISO date string>"
  },
  "trades": [
    {
      "name": "<trade name>",
      "category": "<category>",
      "description": "<what this covers>",
      "materialCost": <number>,
      "laborCost": <number>,
      "equipmentCost": <number>,
      "subtotal": <number>,
      "unit": "<per sq ft / per ton / lump sum etc>",
      "quantity": <number>,
      "unitRate": <number>,
      "notes": "<any notes>"
    }
  ],
  "materials": [
    {
      "name": "<material name>",
      "specification": "<spec>",
      "quantity": <number>,
      "unit": "<unit>",
      "unitPrice": <number>,
      "totalCost": <number>,
      "supplier": "<suggested supplier type>"
    }
  ],
  "laborBreakdown": [
    {
      "trade": "<trade>",
      "hours": <number>,
      "rate": <number>,
      "totalCost": <number>,
      "crew": "<crew description>"
    }
  ],
  "timeline": {
    "totalDuration": "<e.g., 6-8 months>",
    "phases": [
      {
        "name": "<phase name>",
        "duration": "<duration>",
        "cost": <number>,
        "description": "<what happens>"
      }
    ]
  },
  "regionalFactors": {
    "laborIndex": <number - multiplier>,
    "materialIndex": <number - multiplier>,
    "region": "<region name>",
    "adjustments": "<explanation of regional adjustments>"
  },
  "risks": [
    {
      "risk": "<risk description>",
      "impact": "<High/Medium/Low>",
      "mitigation": "<mitigation strategy>",
      "costImpact": <number>
    }
  ],
  "recommendations": ["<recommendation 1>", "<recommendation 2>"],
  "assumptions": ["<assumption 1>", "<assumption 2>"],
  "exclusions": ["<exclusion 1>", "<exclusion 2>"]
}

Include ALL relevant construction trades for this project type. Use realistic ${q.region} region pricing. Be detailed and professional. Include at minimum these trade categories where applicable:
- General Conditions & Requirements
- Sitework & Earthwork
- Concrete & Foundations
- Structural Steel / Rebar
- Masonry
- Metals & Miscellaneous Steel
- Carpentry & Wood Framing
- Thermal & Moisture Protection (Roofing, Insulation, Waterproofing)
- Doors, Windows & Glass
- Finishes (Drywall, Painting, Flooring, Ceiling)
- Mechanical (HVAC, Plumbing, Fire Protection)
- Electrical (Power, Lighting, Low Voltage)
- Equipment & Specialties
- Exterior Improvements & Landscaping

Remember: Output ONLY valid JSON, nothing else.`;
}

// Parse AI response - try JSON first, then extract from text
function parseAIEstimationResponse(text) {
    try {
        // Try direct JSON parse
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('[AI-ESTIMATION] Failed to parse AI response as JSON, using fallback');
        return null;
    }
}

// Fallback estimation engine when Claude API is unavailable
function generateFallbackEstimation(q, title, description) {
    const area = q.totalArea || 1000;
    const floors = q.numberOfFloors || 1;

    // Regional cost multipliers
    const regionMultipliers = {
        'northeast': 1.25, 'midwest': 0.95, 'south': 0.90, 'west': 1.15,
        'northwest': 1.10, 'southeast': 0.92, 'southwest': 0.95,
        'usa': 1.0, 'canada': 1.08, 'uk': 1.20, 'australia': 1.15,
        'india': 0.25, 'uae': 0.85, 'europe': 1.18
    };

    const qualityMultipliers = {
        'economy': 0.75, 'standard': 1.0, 'premium': 1.35, 'luxury': 1.75
    };

    const projectTypeRates = {
        'commercial': 185, 'residential': 155, 'industrial': 145, 'institutional': 195,
        'healthcare': 350, 'retail': 165, 'warehouse': 95, 'mixed-use': 175,
        'renovation': 130, 'infrastructure': 200, 'general': 160
    };

    const regionKey = (q.region || 'usa').toLowerCase().replace(/[^a-z]/g, '');
    const regionMult = regionMultipliers[regionKey] || 1.0;
    const qualityMult = qualityMultipliers[q.qualityGrade] || 1.0;
    const baseRate = projectTypeRates[q.projectType] || 160;
    const costPerSqFt = baseRate * regionMult * qualityMult;
    const totalArea = area * floors;

    // Trade breakdown percentages
    const tradePercents = {
        'General Conditions': 0.08,
        'Sitework & Earthwork': 0.06,
        'Concrete & Foundations': 0.12,
        'Structural Steel': 0.14,
        'Masonry': 0.04,
        'Carpentry & Framing': 0.06,
        'Roofing & Waterproofing': 0.05,
        'Doors, Windows & Glass': 0.05,
        'Finishes': 0.10,
        'Mechanical (HVAC)': 0.10,
        'Plumbing': 0.06,
        'Electrical': 0.09,
        'Fire Protection': 0.03,
        'Equipment & Specialties': 0.02
    };

    const baseCost = costPerSqFt * totalArea;
    const contingency = baseCost * 0.10;
    const totalEstimate = baseCost + contingency;

    const trades = Object.entries(tradePercents).map(([name, pct]) => {
        const subtotal = Math.round(baseCost * pct);
        return {
            name,
            category: name,
            description: `${name} for ${q.projectType} project`,
            materialCost: Math.round(subtotal * 0.55),
            laborCost: Math.round(subtotal * 0.35),
            equipmentCost: Math.round(subtotal * 0.10),
            subtotal,
            unit: 'per sq ft',
            quantity: totalArea,
            unitRate: Math.round((subtotal / totalArea) * 100) / 100,
            notes: ''
        };
    });

    const materials = [
        { name: 'Structural Steel', specification: 'ASTM A992 Grade 50', quantity: Math.round(totalArea * 0.008), unit: 'tons', unitPrice: 3200 * regionMult, totalCost: 0, supplier: 'Steel Mill / Distributor' },
        { name: 'Rebar', specification: 'Grade 60 #4-#11', quantity: Math.round(totalArea * 0.005), unit: 'tons', unitPrice: 1800 * regionMult, totalCost: 0, supplier: 'Rebar Supplier' },
        { name: 'Ready-Mix Concrete', specification: '4000 PSI', quantity: Math.round(totalArea * 0.15), unit: 'cubic yards', unitPrice: 165 * regionMult, totalCost: 0, supplier: 'Local Batch Plant' },
        { name: 'Lumber/Framing', specification: 'SPF Grade #2', quantity: Math.round(totalArea * 2.5), unit: 'board feet', unitPrice: 0.85 * regionMult, totalCost: 0, supplier: 'Lumber Yard' },
        { name: 'Roofing System', specification: 'TPO/EPDM Single Ply', quantity: Math.round(totalArea / floors), unit: 'sq ft', unitPrice: 12 * regionMult, totalCost: 0, supplier: 'Roofing Distributor' }
    ];
    materials.forEach(m => { m.totalCost = Math.round(m.quantity * m.unitPrice); });

    return {
        summary: {
            totalEstimate: Math.round(totalEstimate),
            costPerSqFt: Math.round(costPerSqFt * 100) / 100,
            contingency: Math.round(contingency),
            estimateRange: { low: Math.round(totalEstimate * 0.85), high: Math.round(totalEstimate * 1.15) },
            confidenceLevel: 'Medium',
            generatedAt: new Date().toISOString()
        },
        trades,
        materials,
        laborBreakdown: trades.slice(0, 6).map(t => ({
            trade: t.name,
            hours: Math.round(t.laborCost / (55 * regionMult)),
            rate: Math.round(55 * regionMult * 100) / 100,
            totalCost: t.laborCost,
            crew: `${t.name} crew`
        })),
        timeline: {
            totalDuration: `${Math.max(3, Math.round(totalArea / 5000) + floors * 2)}-${Math.max(5, Math.round(totalArea / 3000) + floors * 3)} months`,
            phases: [
                { name: 'Pre-Construction', duration: '2-4 weeks', cost: Math.round(totalEstimate * 0.02), description: 'Permits, mobilization, site prep' },
                { name: 'Foundation & Structure', duration: `${Math.max(1, Math.round(floors * 1.5))} months`, cost: Math.round(totalEstimate * 0.30), description: 'Excavation, foundation, framing' },
                { name: 'Envelope & MEP Rough-in', duration: `${Math.max(1, Math.round(floors))} months`, cost: Math.round(totalEstimate * 0.35), description: 'Roofing, windows, mechanical/electrical rough-in' },
                { name: 'Interior Finishes', duration: `${Math.max(1, Math.round(floors * 0.8))} months`, cost: Math.round(totalEstimate * 0.25), description: 'Drywall, paint, flooring, trim' },
                { name: 'Commissioning & Closeout', duration: '2-3 weeks', cost: Math.round(totalEstimate * 0.08), description: 'Testing, inspections, punch list, turnover' }
            ]
        },
        regionalFactors: {
            laborIndex: regionMult,
            materialIndex: regionMult,
            region: q.region || 'Default',
            adjustments: `Regional multiplier of ${regionMult}x applied based on ${q.region || 'default'} market conditions`
        },
        risks: [
            { risk: 'Material price volatility', impact: 'High', mitigation: 'Lock in pricing with early procurement', costImpact: Math.round(totalEstimate * 0.05) },
            { risk: 'Weather delays', impact: 'Medium', mitigation: 'Build schedule buffer and weather contingency', costImpact: Math.round(totalEstimate * 0.03) },
            { risk: 'Labor shortage', impact: 'Medium', mitigation: 'Pre-qualify subcontractors early', costImpact: Math.round(totalEstimate * 0.04) },
            { risk: 'Scope changes', impact: 'High', mitigation: 'Detailed scope documentation and change order process', costImpact: Math.round(totalEstimate * 0.07) }
        ],
        recommendations: [
            'Conduct detailed site investigation before finalizing foundation design',
            'Obtain minimum 3 competitive bids for major trade packages',
            'Consider value engineering for cost optimization',
            'Implement phased procurement to manage material price risks'
        ],
        assumptions: [
            'Normal site conditions with standard soil bearing capacity',
            'Standard permitting timeline with no unusual regulatory requirements',
            `${q.qualityGrade || 'Standard'} quality materials and finishes`,
            'No hazardous material abatement required',
            'Standard working hours (no premium time included)'
        ],
        exclusions: [
            'Land acquisition costs',
            'Architectural and engineering design fees',
            'Furniture, fixtures, and equipment (FF&E)',
            'Owner soft costs and financing charges',
            'Environmental remediation'
        ]
    };
}

// ==========================================
// AI-POWERED ESTIMATION ENDPOINTS
// ==========================================

// POST /estimation/ai/questions - Generate smart questionnaire based on project info
router.post('/ai/questions', authenticateToken, async (req, res) => {
    try {
        const { projectTitle, description, designStandard, projectType, region, totalArea, fileCount, fileNames } = req.body;

        if (!projectTitle || !description) {
            return res.status(400).json({ success: false, message: 'Project title and description are required' });
        }

        console.log(`[AI-ESTIMATION] Generating questions for "${projectTitle}" by ${req.user.email}`);

        const questions = await generateSmartQuestions({ projectTitle, description, designStandard, projectType, region, totalArea, fileCount, fileNames });

        res.json({ success: true, data: questions });
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating questions:', error);
        res.status(500).json({ success: false, message: 'Failed to generate questionnaire' });
    }
});

// POST /estimation/ai/generate - Generate full AI estimate from answers (with file upload support)
router.post('/ai/generate', authenticateToken, async (req, res) => {
    try {
        // Parse multipart upload if files are included
        try {
            await safeEstimationUpload(req, res);
        } catch (uploadErr) {
            console.warn('[AI-ESTIMATION] File upload skipped or failed:', uploadErr.message);
            // Continue without files - AI estimation can still proceed
        }

        const { estimationId, projectTitle, description, designStandard, projectType, region, totalArea, answers, fileNames } = req.body;

        // Parse answers if sent as string (FormData sends strings)
        let parsedAnswers = answers;
        if (typeof answers === 'string') {
            try { parsedAnswers = JSON.parse(answers); } catch (e) { parsedAnswers = {}; }
        }

        // Parse fileNames if sent as string
        let parsedFileNames = fileNames;
        if (typeof fileNames === 'string') {
            try { parsedFileNames = JSON.parse(fileNames); } catch (e) { parsedFileNames = []; }
        }

        if (!projectTitle || !parsedAnswers) {
            return res.status(400).json({ success: false, message: 'Project info and answers are required' });
        }

        console.log(`[AI-ESTIMATION] Generating estimate for "${projectTitle}" by ${req.user.email}`);

        // Upload files to Firebase Storage if included
        let uploadedFiles = [];
        const files = req.files;
        if (files && files.length > 0) {
            try {
                const uploadPromises = files.map(async (file, index) => {
                    const timestamp = Date.now();
                    const fileName = `${timestamp}_${index}_${file.originalname}`;
                    const filePath = `estimation-files/${req.user.userId}/${fileName}`;

                    const metadata = {
                        contractorEmail: req.user.email,
                        contractorId: req.user.userId,
                        uploadedBy: req.user.userId,
                        fileIndex: index,
                        uploadBatch: timestamp,
                        estimationType: 'ai-generated'
                    };

                    return uploadToFirebaseStorage(file, filePath, metadata);
                });

                uploadedFiles = await Promise.all(uploadPromises);
                console.log(`[AI-ESTIMATION] Successfully uploaded ${uploadedFiles.length} files`);
            } catch (uploadError) {
                console.error('[AI-ESTIMATION] File upload failed:', uploadError);
                // Continue without files - AI estimation can still proceed
            }
        }

        const estimate = await generateAIEstimate(
            { projectTitle, description, designStandard, projectType, region, totalArea },
            parsedAnswers,
            parsedFileNames || (uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name) : [])
        );

        // Always save AI result - create new document or update existing
        let savedEstimationId = estimationId;
        try {
            if (estimationId) {
                // Update existing estimation
                const docRef = adminDb.collection('estimations').doc(estimationId);
                const doc = await docRef.get();
                if (doc.exists) {
                    const updateData = {
                        aiEstimate: estimate,
                        aiGeneratedAt: new Date().toISOString(),
                        aiAnswers: parsedAnswers,
                        status: 'completed',
                        updatedAt: new Date().toISOString()
                    };
                    if (uploadedFiles.length > 0) {
                        updateData.uploadedFiles = uploadedFiles;
                        updateData.fileCount = uploadedFiles.length;
                        updateData.totalFileSize = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
                    }
                    await docRef.update(updateData);
                    console.log(`[AI-ESTIMATION] Updated estimation ${estimationId}`);
                }
            } else {
                // Create new estimation document
                const estimationDoc = {
                    projectTitle,
                    description: description || '',
                    designStandard: designStandard || '',
                    contractorName: req.user.name || '',
                    contractorEmail: req.user.email,
                    contractorId: req.user.userId,
                    uploadedFiles,
                    fileCount: uploadedFiles.length,
                    totalFileSize: uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
                    aiEstimate: estimate,
                    aiGeneratedAt: new Date().toISOString(),
                    aiAnswers: parsedAnswers,
                    estimatedAmount: estimate?.summary?.grandTotal || estimate?.summary?.totalEstimate || 0,
                    status: 'completed',
                    estimationType: 'ai-generated',
                    completedAt: new Date().toISOString(),
                    completedBy: 'AI Engine',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                const docRef = await adminDb.collection('estimations').add(estimationDoc);
                savedEstimationId = docRef.id;
                console.log(`[AI-ESTIMATION] Created new estimation ${savedEstimationId}`);
            }
        } catch (saveErr) {
            console.error('[AI-ESTIMATION] Could not save estimation:', saveErr.message);
        }

        res.json({
            success: true,
            data: estimate,
            estimationId: savedEstimationId,
            fileCount: uploadedFiles.length
        });
    } catch (error) {
        console.error('[AI-ESTIMATION] Error generating estimate:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to generate AI estimate' });
    }
});

// GET /estimation/:estimationId/ai-result - Get saved AI estimate for an estimation
router.get('/:estimationId/ai-result', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }

        const data = doc.data();

        // Access check
        if (data.contractorEmail !== req.user.email && req.user.type !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (!data.aiEstimate) {
            return res.status(404).json({ success: false, message: 'No AI estimate generated yet' });
        }

        res.json({
            success: true,
            data: {
                aiEstimate: data.aiEstimate,
                aiGeneratedAt: data.aiGeneratedAt,
                aiAnswers: data.aiAnswers
            }
        });
    } catch (error) {
        console.error('[AI-ESTIMATION] Error fetching AI result:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch AI estimate' });
    }
});

export default router;
