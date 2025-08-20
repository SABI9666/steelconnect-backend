// src/middleware/upload.js
// Simple upload middleware without uuid dependency

import multer from 'multer';
import path from 'path';

// Generate simple unique filename without uuid
function generateUniqueFilename(originalname) {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext);
  return `${name}-${timestamp}-${random}${ext}`;
}

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory for processing

const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

// Configure upload limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files at once
  }
});

// Middleware for single file upload
export const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message);
        
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'File too large. Maximum size is 10MB.'
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              success: false,
              error: 'Too many files. Maximum is 5 files.'
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      
      // Add unique filename to file object
      if (req.file) {
        req.file.uniqueName = generateUniqueFilename(req.file.originalname);
        console.log('File uploaded:', req.file.originalname, '→', req.file.uniqueName);
      }
      
      next();
    });
  };
};

// Middleware for multiple file upload
export const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message);
        
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'File too large. Maximum size is 10MB.'
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              success: false,
              error: `Too many files. Maximum is ${maxCount} files.`
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      
      // Add unique filenames to file objects
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          file.uniqueName = generateUniqueFilename(file.originalname);
          console.log('File uploaded:', file.originalname, '→', file.uniqueName);
        });
      }
      
      next();
    });
  };
};

// Middleware for mixed file upload (multiple fields)
export const uploadFields = (fields) => {
  return (req, res, next) => {
    upload.fields(fields)(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message);
        
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'File too large. Maximum size is 10MB.'
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
              success: false,
              error: 'Too many files uploaded.'
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      
      // Add unique filenames to all uploaded files
      if (req.files) {
        Object.keys(req.files).forEach(fieldName => {
          req.files[fieldName].forEach(file => {
            file.uniqueName = generateUniqueFilename(file.originalname);
            console.log('File uploaded:', file.originalname, '→', file.uniqueName);
          });
        });
      }
      
      next();
    });
  };
};

export default {
  uploadSingle,
  uploadMultiple,
  uploadFields
};
