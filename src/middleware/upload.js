// middleware/upload.js - Fixed version for job file uploads
import multer from 'multer';
import { FILE_UPLOAD_CONFIG, uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase } from '../config/firebase.js';

// Updated multer configuration to support job file uploads (not just PDFs)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize, // 15MB per file
    files: FILE_UPLOAD_CONFIG.maxFiles, // Maximum 10 files
    fieldSize: 1024 * 1024, // 1MB for form fields
    fieldNameSize: 100, // Field name size limit
    fields: 20 // Maximum number of non-file fields
  },
  fileFilter: (req, file, cb) => {
    console.log(`Processing file: ${file.originalname}, MIME: ${file.mimetype}`);
    
    // Define allowed file types for job uploads (expanded from PDF-only)
    const allowedJobMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/dwg', // DWG files
      'application/acad', // AutoCAD files
      'image/vnd.dwg' // Alternative DWG MIME type
    ];
    
    const allowedJobExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'dwg'];
    
    // Check MIME type
    if (!allowedJobMimeTypes.includes(file.mimetype)) {
      console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`File type not allowed. Supported formats: PDF, DOC, DOCX, JPG, PNG, DWG. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!allowedJobExtensions.includes(ext)) {
      console.log(`Rejected file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`File extension not allowed. Supported formats: ${allowedJobExtensions.join(', ')}. File extension: .${ext}`), false);
    }
    
    console.log(`Accepted file: ${file.originalname}`);
    cb(null, true);
  }
});

// Single file upload function (wrapper around multiple file upload)
export async function uploadToFirebase(file, folder, userId = null) {
  try {
    // Convert single file to array format for the multiple upload function
    const files = [file];
    const uploadedFiles = await uploadMultipleFilesToFirebase(files, folder, userId);
    
    // Return just the single file result
    return uploadedFiles[0];
  } catch (error) {
    throw new Error(`Single file upload failed: ${error.message}`);
  }
}

// Re-export Firebase utilities for convenience
export { uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase, FILE_UPLOAD_CONFIG };

// Enhanced error handling middleware
export const handleUploadError = (error, req, res, next) => {
  console.error('Upload error:', error);
  
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          error: `File size too large. Maximum ${FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)}MB per file allowed.`,
          errorCode: 'FILE_SIZE_LIMIT'
        });
        
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          error: `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`,
          errorCode: 'FILE_COUNT_LIMIT'
        });
        
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          error: 'Unexpected file field in upload.',
          errorCode: 'UNEXPECTED_FILE'
        });
        
      default:
        return res.status(400).json({
          success: false,
          error: `Upload error: ${error.message}`,
          errorCode: 'UPLOAD_ERROR'
        });
    }
  }
  
  // Handle custom file validation errors
  if (error.message.includes('File type not allowed') || error.message.includes('File extension not allowed')) {
    return res.status(400).json({
      success: false,
      error: error.message,
      errorCode: 'INVALID_FILE_TYPE'
    });
  }
  
  // Handle Firebase upload errors
  if (error.message.includes('Firebase upload failed') || error.message.includes('Failed to upload')) {
    return res.status(500).json({
      success: false,
      error: 'File upload to cloud storage failed. Please try again.',
      errorCode: 'STORAGE_ERROR'
    });
  }
  
  // Generic error
  next(error);
};

// Updated validation middleware for job files (not just PDFs)
export const validateFileRequirements = (req, res, next) => {
  const files = req.files;
  
  // Files are optional for job creation, so we don't require them
  if (!files || files.length === 0) {
    console.log('No files provided - continuing without files');
    return next();
  }
  
  if (files.length > FILE_UPLOAD_CONFIG.maxFiles) {
    return res.status(400).json({
      success: false,
      error: `Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed. You uploaded ${files.length} files.`,
      errorCode: 'TOO_MANY_FILES'
    });
  }
  
  // Check total upload size
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotalSize = FILE_UPLOAD_CONFIG.maxFileSize * FILE_UPLOAD_CONFIG.maxFiles;
  
  if (totalSize > maxTotalSize) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
    const maxMB = (maxTotalSize / (1024 * 1024)).toFixed(2);
    return res.status(400).json({
      success: false,
      error: `Total upload size (${totalMB}MB) exceeds maximum allowed (${maxMB}MB).`,
      errorCode: 'TOTAL_SIZE_LIMIT'
    });
  }
  
  console.log(`File validation passed: ${files.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
  next();
};

// Middleware to log upload details
export const logUploadDetails = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    console.log('=== UPLOAD DETAILS ===');
    console.log(`User: ${req.user?.email || 'Unknown'}`);
    console.log(`Files: ${req.files.length}`);
    req.files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB, ${file.mimetype})`);
    });
    console.log('=====================');
  }
  next();
};

// Updated file validation for job uploads (supports multiple file types)
export const validatePDFFiles = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('No files provided in request');
    return next();
  }
  
  console.log(`Validating ${files.length} files...`);
  
  const allowedJobMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/dwg',
    'application/acad',
    'image/vnd.dwg'
  ];
  
  for (const file of files) {
    // Check MIME type
    if (!allowedJobMimeTypes.includes(file.mimetype)) {
      console.log(`File validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" type not supported. Supported formats: PDF, DOC, DOCX, JPG, PNG, DWG.`,
        errorCode: 'INVALID_FILE_TYPE'
      });
    }
    
    // Check file size
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)).toFixed(0);
      console.log(`File validation failed: ${file.originalname} size (${sizeMB}MB) exceeds limit (${maxMB}MB)`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" (${sizeMB}MB) exceeds the ${maxMB}MB size limit.`,
        errorCode: 'FILE_TOO_LARGE'
      });
    }
    
    console.log(`File validated: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
  }
  
  console.log('All files passed validation');
  next();
};

// PDF-specific validation (for estimation tool)
export const validatePDFFilesOnly = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'At least one PDF file is required.',
      errorCode: 'NO_FILES'
    });
  }
  
  console.log(`Validating ${files.length} PDF files...`);
  
  for (const file of files) {
    // Check MIME type - only PDFs for estimation tool
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      console.log(`PDF validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" is not a PDF. Only PDF files are allowed for estimation requests.`,
        errorCode: 'INVALID_FILE_TYPE'
      });
    }
    
    // Check file size
    if (file.size > FILE_UPLOAD_CONFIG.maxFileSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)).toFixed(0);
      console.log(`PDF validation failed: ${file.originalname} size (${sizeMB}MB) exceeds limit (${maxMB}MB)`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" (${sizeMB}MB) exceeds the ${maxMB}MB size limit.`,
        errorCode: 'FILE_TOO_LARGE'
      });
    }
    
    console.log(`PDF validated: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
  }
  
  console.log('All PDF files passed validation');
  next();
};

export default { 
  upload, 
  handleUploadError, 
  validateFileRequirements, 
  logUploadDetails, 
  validatePDFFiles,
  validatePDFFilesOnly,
  uploadToFirebase,
  uploadMultipleFilesToFirebase,
  validateFileUpload,
  deleteFileFromFirebase
