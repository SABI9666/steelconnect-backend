// src/middleware/upload.js
// Complete upload middleware with Firebase integration

import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { bucket, isFirebaseEnabled } from '../config/firebase.js';

// Generate unique filename
function generateUniqueFilename(originalname) {
  const timestamp = Date.now();
  const uuid = uuidv4().substring(0, 8);
  const ext = path.extname(originalname);
  const name = path.basename(originalname, ext).replace(/[^a-zA-Z0-9]/g, '-');
  return `${name}-${timestamp}-${uuid}${ext}`;
}

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory for Firebase upload

const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-zip-compressed'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

// Configure upload limits - EXPORT THIS as named export 'upload'
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files at once
  }
});

// Upload single file to Firebase Storage
export const uploadToFirebase = async (file, folder = 'uploads') => {
  try {
    if (!isFirebaseEnabled()) {
      console.log('⚠️ Firebase not enabled, returning local file info');
      return {
        success: true,
        url: `http://localhost:3000/uploads/${file.originalname}`,
        fileName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        folder: folder
      };
    }

    if (!file || !file.buffer) {
      throw new Error('No file buffer provided');
    }

    const fileName = generateUniqueFilename(file.originalname);
    const filePath = `${folder}/${fileName}`;
    
    // Create a reference to the file in Firebase Storage
    const fileRef = bucket.file(filePath);
    
    // Upload the file
    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      }
    });

    // Make the file publicly accessible (optional)
    await fileRef.makePublic();

    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    console.log('✅ File uploaded to Firebase:', fileName);

    return {
      success: true,
      url: publicUrl,
      fileName: fileName,
      filePath: filePath,
      size: file.size,
      mimeType: file.mimetype,
      folder: folder
    };

  } catch (error) {
    console.error('❌ Firebase upload error:', error.message);
    
    // Return mock data if Firebase fails
    return {
      success: false,
      error: error.message,
      url: null,
      fileName: file?.originalname || 'unknown',
      size: file?.size || 0,
      mimeType: file?.mimetype || 'unknown'
    };
  }
};

// Upload multiple files to Firebase
export const uploadMultipleToFirebase = async (files, folder = 'uploads') => {
  try {
    if (!files || files.length === 0) {
      return [];
    }

    const uploadPromises = files.map(file => uploadToFirebase(file, folder));
    const results = await Promise.all(uploadPromises);
    
    console.log(`✅ Uploaded ${results.length} files to Firebase`);
    return results;
    
  } catch (error) {
    console.error('❌ Multiple upload error:', error.message);
    return [];
  }
};

// Delete file from Firebase
export const deleteFromFirebase = async (filePath) => {
  try {
    if (!isFirebaseEnabled()) {
      console.log('⚠️ Firebase not enabled, skipping delete');
      return { success: true, message: 'Firebase not enabled' };
    }

    if (!filePath) {
      throw new Error('No file path provided');
    }

    const fileRef = bucket.file(filePath);
    await fileRef.delete();
    
    console.log('✅ File deleted from Firebase:', filePath);
    return { success: true, message: 'File deleted successfully' };
    
  } catch (error) {
    console.error('❌ Firebase delete error:', error.message);
    return { success: false, error: error.message };
  }
};

// Middleware for single file upload
export const uploadSingle = (fieldName, folder = 'uploads') => {
  return async (req, res, next) => {
    upload.single(fieldName)(req, res, async (err) => {
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
              error: 'Too many files. Maximum is 10 files.'
            });
          }
        }
        
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload failed'
        });
      }
      
      // If file uploaded, process it
      if (req.file) {
        try {
          const uploadResult = await uploadToFirebase(req.file, folder);
          req.fileUpload = uploadResult;
          
          console.log('File processed:', req.file.originalname);
        } catch (uploadError) {
          console.error('File processing error:', uploadError.message);
          req.fileUpload = { success: false, error: uploadError.message };
        }
      }
      
      next();
    });
  };
};

// Middleware for multiple file upload
export const uploadMultiple = (fieldName, maxCount = 5, folder = 'uploads') => {
  return async (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, async (err) => {
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
      
      // If files uploaded, process them
      if (req.files && req.files.length > 0) {
        try {
          const uploadResults = await uploadMultipleToFirebase(req.files, folder);
          req.fileUploads = uploadResults;
          
          console.log(`Files processed: ${req.files.length} files`);
        } catch (uploadError) {
          console.error('Files processing error:', uploadError.message);
          req.fileUploads = [];
        }
      }
      
      next();
    });
  };
};

// Middleware for mixed file upload (multiple fields)
export const uploadFields = (fields, folder = 'uploads') => {
  return async (req, res, next) => {
    upload.fields(fields)(req, res, async (err) => {
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
      
      // Process uploaded files
      if (req.files) {
        try {
          req.fileUploads = {};
          
          for (const fieldName of Object.keys(req.files)) {
            const fieldFiles = req.files[fieldName];
            const uploadResults = await uploadMultipleToFirebase(fieldFiles, folder);
            req.fileUploads[fieldName] = uploadResults;
          }
          
          console.log('Multiple field files processed');
        } catch (uploadError) {
          console.error('Field files processing error:', uploadError.message);
          req.fileUploads = {};
        }
      }
      
      next();
    });
  };
};

// Export default object with all functions
export default {
  upload, // Add this to the default export as well
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadToFirebase,
  uploadMultipleToFirebase,
  deleteFromFirebase
};
