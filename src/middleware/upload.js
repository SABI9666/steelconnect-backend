// middleware/upload.js - Added quote support without changing existing functionality
import multer from 'multer';
import { FILE_UPLOAD_CONFIG, uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase } from '../config/firebase.js';

// Updated multer configuration to support job AND quote file uploads
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
    
    // ADDED: Check if this is a quote upload route
    const isQuoteUpload = req.originalUrl.includes('/quotes');
    
    // Define allowed file types for job AND quote uploads
    const allowedJobMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/dwg', // DWG files
      'application/acad', // AutoCAD files
      'image/vnd.dwg', // Alternative DWG MIME type
      // ADDED: Additional types for quotes
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    const allowedJobExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'dwg', 'xls', 'xlsx', 'txt'];
    
    // Check MIME type
    if (!allowedJobMimeTypes.includes(file.mimetype)) {
      console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      const supportedFormats = isQuoteUpload ? 
        'PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT' : 
        'PDF, DOC, DOCX, JPG, PNG, DWG';
      return cb(new Error(`File type not allowed. Supported formats: ${supportedFormats}. Received: ${file.mimetype}`), false);
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

// UNCHANGED: Single file upload function
export async function uploadToFirebase(file, folder, userId = null) {
  try {
    const files = [file];
    const uploadedFiles = await uploadMultipleFilesToFirebase(files, folder, userId);
    return uploadedFiles[0];
  } catch (error) {
    throw new Error(`Single file upload failed: ${error.message}`);
  }
}

// UNCHANGED: Re-export Firebase utilities
export { uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase, FILE_UPLOAD_CONFIG };

// UNCHANGED: Enhanced error handling middleware
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
  
  if (error.message.includes('File type not allowed') || error.message.includes('File extension not allowed')) {
    return res.status(400).json({
      success: false,
      error: error.message,
      errorCode: 'INVALID_FILE_TYPE'
    });
  }
  
  if (error.message.includes('Firebase upload failed') || error.message.includes('Failed to upload')) {
    return res.status(500).json({
      success: false,
      error: 'File upload to cloud storage failed. Please try again.',
      errorCode: 'STORAGE_ERROR'
    });
  }
  
  next(error);
};

// UPDATED: File requirements validation with quote support
export const validateFileRequirements = (req, res, next) => {
  const files = req.files;
  const isQuoteUpload = req.originalUrl.includes('/quotes');
  const maxFiles = isQuoteUpload ? 5 : FILE_UPLOAD_CONFIG.maxFiles; // ADDED: Limit quotes to 5 files
  
  if (!files || files.length === 0) {
    console.log('No files provided - continuing without files');
    return next();
  }
  
  if (files.length > maxFiles) {
    return res.status(400).json({
      success: false,
      error: `Maximum ${maxFiles} files allowed. You uploaded ${files.length} files.`,
      errorCode: 'TOO_MANY_FILES'
    });
  }
  
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotalSize = FILE_UPLOAD_CONFIG.maxFileSize * maxFiles;
  
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

// UNCHANGED: Middleware to log upload details
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

// UPDATED: File validation with quote support (expanded file types)
export const validatePDFFiles = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('No files provided in request');
    return next();
  }
  
  console.log(`Validating ${files.length} files...`);
  
  // EXPANDED: Include quote-supported file types
  const allowedJobMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/dwg',
    'application/acad',
    'image/vnd.dwg',
    // ADDED: Quote-specific additions
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];
  
  for (const file of files) {
    if (!allowedJobMimeTypes.includes(file.mimetype)) {
      console.log(`File validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" type not supported. Supported formats: PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT.`,
        errorCode: 'INVALID_FILE_TYPE'
      });
    }
    
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

// UNCHANGED: PDF-specific validation (for estimation tool)
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
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      console.log(`PDF validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
      return res.status(400).json({
        success: false,
        error: `File "${file.originalname}" is not a PDF. Only PDF files are allowed for estimation requests.`,
        errorCode: 'INVALID_FILE_TYPE'
      });
    }
    
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

// UNCHANGED: Default export
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
};
