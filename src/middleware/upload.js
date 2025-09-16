// middleware/upload.js - Enhanced upload middleware for multiple PDF files
import multer from 'multer';
import { FILE_UPLOAD_CONFIG, uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase } from '../config/firebase.js';

// Enhanced multer configuration for multiple PDF uploads
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
    
    // Only allow PDF files
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`Only PDF files are allowed. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!FILE_UPLOAD_CONFIG.allowedExtensions.map(e => e.replace('.', '')).includes(ext)) {
      console.log(`Rejected file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`Only PDF files are allowed. File extension: .${ext}`), false);
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
          message: `File size too large. Maximum ${FILE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)}MB per file allowed.`,
          errorCode: 'FILE_SIZE_LIMIT'
        });
        
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`,
          errorCode: 'FILE_COUNT_LIMIT'
        });
        
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field in upload.',
          errorCode: 'UNEXPECTED_FILE'
        });
        
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many parts in multipart upload.',
          errorCode: 'PART_COUNT_LIMIT'
        });
        
      case 'LIMIT_FIELD_KEY':
        return res.status(400).json({
          success: false,
          message: 'Field name too long.',
          errorCode: 'FIELD_KEY_LIMIT'
        });
        
      case 'LIMIT_FIELD_VALUE':
        return res.status(400).json({
          success: false,
          message: 'Field value too long.',
          errorCode: 'FIELD_VALUE_LIMIT'
        });
        
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many fields in form.',
          errorCode: 'FIELD_COUNT_LIMIT'
        });
        
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${error.message}`,
          errorCode: 'UPLOAD_ERROR'
        });
    }
  }
  
  // Handle custom file validation errors
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      errorCode: 'INVALID_FILE_TYPE'
    });
  }
  
  // Handle Firebase upload errors
  if (error.message.includes('Firebase upload failed') || error.message.includes('Failed to upload')) {
    return res.status(500).json({
      success: false,
      message: 'File upload to cloud storage failed. Please try again.',
      errorCode: 'STORAGE_ERROR'
    });
  }
  
  // Generic error
  next(error);
};

// Validation middleware to check file requirements before processing
export const validateFileRequirements = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one PDF file is required.',
      errorCode: 'NO_FILES'
    });
  }
  
  if (files.length > FILE_UPLOAD_CONFIG.maxFiles) {
    return res.status(400).json({
      success: false,
      message: `Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed. You uploaded ${files.length} files.`,
      errorCode: 'TOO_MANY_FILES'
    });
  }
  
  // Check total upload size (optional additional validation)
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotalSize = FILE_UPLOAD_CONFIG.maxFileSize * FILE_UPLOAD_CONFIG.maxFiles;
  
  if (totalSize > maxTotalSize) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
    const maxMB = (maxTotalSize / (1024 * 1024)).toFixed(2);
    return res.status(400).json({
      success: false,
      message: `Total upload size (${totalMB}MB) exceeds maximum allowed (${maxMB}MB).`,
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
      console.log(`  ${index + 1}. ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    });
    console.log('=====================');
  }
  next();
};

// Enhanced file validation middleware with detailed logging
export const validatePDFFiles = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('No files provided in request');
    return next();
  }
  
  console.log(`Validating ${files.length} files...`);
  
  for (const file of files) {
    // Check MIME type
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      console.log(`File validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
      return res.status(400).json({
        success: false,
        message: `File "${file.originalname}" is not a PDF. Only PDF files are allowed.`,
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
        message: `File "${file.originalname}" (${sizeMB}MB) exceeds the ${maxMB}MB size limit.`,
        errorCode: 'FILE_TOO_LARGE'
      });
    }
    
    console.log(`File validated: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
  }
  
  console.log('All files passed validation');
  next();
};

export default { 
  upload, 
  handleUploadError, 
  validateFileRequirements, 
  logUploadDetails, 
  validatePDFFiles,
  uploadToFirebase,
  uploadMultipleFilesToFirebase,
  validateFileUpload,
  deleteFileFromFirebase
};
