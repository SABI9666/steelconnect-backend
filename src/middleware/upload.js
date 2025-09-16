// middleware/upload.js - FIXED version with proper file validation
import multer from 'multer';
import { FILE_UPLOAD_CONFIG, uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase } from '../config/firebase.js';

// FIXED: Updated multer configuration with proper MIME type handling
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
    console.log(`Processing file: ${file.originalname}, MIME: ${file.mimetype}, Field: ${file.fieldname}`);
    
    // FIXED: Handle undefined MIME types
    if (!file.mimetype) {
      console.log(`Rejected file ${file.originalname}: Missing MIME type`);
      return cb(new Error(`File type could not be determined for ${file.originalname}. Please ensure the file is valid.`), false);
    }
    
    // Check if this is a quote upload route or estimation route
    const isQuoteUpload = req.originalUrl.includes('/quotes');
    const isEstimationUpload = req.originalUrl.includes('/estimation');
    
    // Define allowed file types based on route
    let allowedMimeTypes;
    let allowedExtensions;
    let routeDescription;
    
    if (isEstimationUpload) {
      // Estimation: PDF only
      allowedMimeTypes = ['application/pdf'];
      allowedExtensions = ['pdf'];
      routeDescription = 'PDF files only';
    } else if (isQuoteUpload) {
      // Quotes: Extended file types
      allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
      ];
      allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'xls', 'xlsx', 'txt'];
      routeDescription = 'PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, TXT';
    } else {
      // Jobs: All supported types including DWG
      allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'application/dwg',
        'application/acad',
        'image/vnd.dwg',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
      ];
      allowedExtensions = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'dwg', 'xls', 'xlsx', 'txt'];
      routeDescription = 'PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT';
    }
    
    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`File type not allowed. Supported formats: ${routeDescription}. Received: ${file.mimetype}`), false);
    }
    
    // FIXED: Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!allowedExtensions.includes(ext)) {
      console.log(`Rejected file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`File extension not allowed. Supported formats: ${allowedExtensions.join(', ')}. File extension: .${ext}`), false);
    }
    
    console.log(`Accepted file: ${file.originalname} (${file.mimetype})`);
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

// Re-export Firebase utilities
export { uploadMultipleFilesToFirebase, validateFileUpload, deleteFileFromFirebase, FILE_UPLOAD_CONFIG };

// FIXED: Enhanced error handling middleware with better error messages
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
  
  // FIXED: Handle MIME type errors specifically
  if (error.message.includes('File type not allowed') || 
      error.message.includes('File extension not allowed') ||
      error.message.includes('File type could not be determined')) {
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

// FIXED: File requirements validation with route-specific limits
export const validateFileRequirements = (req, res, next) => {
  const files = req.files;
  const isQuoteUpload = req.originalUrl.includes('/quotes');
  const isEstimationUpload = req.originalUrl.includes('/estimation');
  
  // Set max files based on route
  let maxFiles;
  if (isEstimationUpload) {
    maxFiles = 10; // Estimations can have up to 10 PDFs
  } else if (isQuoteUpload) {
    maxFiles = 5; // Quotes limited to 5 files
  } else {
    maxFiles = FILE_UPLOAD_CONFIG.maxFiles; // Jobs use default (10)
  }
  
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

// Middleware to log upload details
export const logUploadDetails = (req, res, next) => {
  if (req.files && req.files.length > 0) {
    console.log('=== UPLOAD DETAILS ===');
    console.log(`User: ${req.user?.email || 'Unknown'}`);
    console.log(`Route: ${req.originalUrl}`);
    console.log(`Files: ${req.files.length}`);
    req.files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB, ${file.mimetype})`);
    });
    console.log('=====================');
  }
  next();
};

// FIXED: File validation with proper route-specific handling
export const validatePDFFiles = (req, res, next) => {
  const files = req.files;
  
  if (!files || files.length === 0) {
    console.log('No files provided in request');
    return next();
  }
  
  console.log(`Validating ${files.length} files...`);
  
  // Route-specific validation
  const isEstimationUpload = req.originalUrl.includes('/estimation');
  
  if (isEstimationUpload) {
    // Estimation: Strict PDF-only validation
    for (const file of files) {
      if (file.mimetype !== 'application/pdf') {
        console.log(`PDF validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
        return res.status(400).json({
          success: false,
          error: `File "${file.originalname}" must be a PDF. Only PDF files are allowed for estimation requests.`,
          errorCode: 'INVALID_FILE_TYPE'
        });
      }
      
      const ext = file.originalname.toLowerCase().split('.').pop();
      if (ext !== 'pdf') {
        return res.status(400).json({
          success: false,
          error: `File "${file.originalname}" must have .pdf extension.`,
          errorCode: 'INVALID_FILE_EXTENSION'
        });
      }
    }
  } else {
    // For jobs and quotes: Use expanded validation (already handled by fileFilter)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/dwg',
      'application/acad',
      'image/vnd.dwg',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    for (const file of files) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        console.log(`File validation failed: ${file.originalname} has invalid MIME type: ${file.mimetype}`);
        return res.status(400).json({
          success: false,
          error: `File "${file.originalname}" type not supported. Supported formats: PDF, DOC, DOCX, JPG, PNG, DWG, XLS, XLSX, TXT.`,
          errorCode: 'INVALID_FILE_TYPE'
        });
      }
    }
  }
  
  // Common size validation
  for (const file of files) {
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

// PDF-only validation for estimation tool
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
    if (file.mimetype !== 'application/pdf') {
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
