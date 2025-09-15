// src/routes/jobs.js - Corrected to handle 10 files, 15MB each with proper field name
import express from 'express';
import multer from 'multer';
import {
  getAllJobs,
  getJobById,
  deleteJob,
  getJobsByUserId
} from '../controllers/jobController.js';
import { authenticateToken, isContractor } from '../middleware/auth.js';
import { 
  adminDb, 
  uploadMultipleFilesToFirebase, 
  validateFileUpload, 
  deleteFileFromFirebase,
  FILE_UPLOAD_CONFIG 
} from '../config/firebase.js';

// Enhanced multer configuration for multiple PDF uploads (10 files, 15MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB per file
    files: 10, // Maximum 10 files
    fieldSize: 1024 * 1024 // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    console.log(`Processing file: ${file.originalname}, MIME: ${file.mimetype}, Field: ${file.fieldname}`);
    
    // Only allow PDF files
    if (file.mimetype !== 'application/pdf') {
      console.log(`Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`Only PDF files are allowed. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext !== 'pdf') {
      console.log(`Rejected file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`Only PDF files are allowed. File extension: .${ext}`), false);
    }
    
    console.log(`Accepted file: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    cb(null, true);
  }
});

// Custom middleware to handle both 'attachment' and 'attachments' field names
const handleMultipleFileUpload = (req, res, next) => {
  const uploadAny = upload.any(); // Accept any field name
  
  uploadAny(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err);
      
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum 15MB per file allowed.',
            errorCode: 'FILE_SIZE_LIMIT'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 10 files allowed.',
            errorCode: 'FILE_COUNT_LIMIT'
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: 'Unexpected file field in upload.',
            errorCode: 'UNEXPECTED_FILE'
          });
        }
      }
      
      if (err.message.includes('Only PDF files are allowed')) {
        return res.status(400).json({
          success: false,
          message: err.message,
          errorCode: 'INVALID_FILE_TYPE'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'File upload error',
        error: err.message
      });
    }
    
    // Normalize files array
    if (!req.files) {
      req.files = [];
    }
    
    // Log received files
    if (req.files.length > 0) {
      console.log(`Received ${req.files.length} files:`);
      req.files.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB) - Field: ${file.fieldname}`);
      });
    }
    
    next();
  });
};

// Validation middleware for file requirements
const validateUploadedFiles = (req, res, next) => {
  const files = req.files;
  
  if (files && files.length > 0) {
    // Check file count
    if (files.length > 10) {
      return res.status(400).json({
        success: false,
        message: `Maximum 10 files allowed. You uploaded ${files.length} files.`,
        errorCode: 'TOO_MANY_FILES'
      });
    }
    
    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size > 15 * 1024 * 1024) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        return res.status(400).json({
          success: false,
          message: `File "${file.originalname}" (${sizeMB}MB) exceeds the 15MB size limit.`,
          errorCode: 'FILE_TOO_LARGE'
        });
      }
      
      // Check MIME type
      if (file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          success: false,
          message: `File "${file.originalname}" is not a PDF. Only PDF files are allowed.`,
          errorCode: 'INVALID_FILE_TYPE'
        });
      }
    }
    
    // Check total size (optional - 150MB total for 10 x 15MB files)
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const maxTotalSize = 10 * 15 * 1024 * 1024; // 150MB
    
    if (totalSize > maxTotalSize) {
      const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
      return res.status(400).json({
        success: false,
        message: `Total upload size (${totalMB}MB) exceeds maximum allowed (150MB).`,
        errorCode: 'TOTAL_SIZE_LIMIT'
      });
    }
    
    console.log(`File validation passed: ${files.length} files, total size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB`);
  }
  
  next();
};

// NOTIFICATION SERVICE
class TempNotificationService {
  static async notifyJobCreated(jobData) {
    try {
      console.log('Creating job creation notifications...');
      
      const designersSnapshot = await adminDb.collection('users')
        .where('type', '==', 'designer')
        .where('profileStatus', '==', 'approved')
        .get();

      const notifications = [];

      designersSnapshot.docs.forEach(doc => {
        notifications.push({
          userId: doc.id,
          title: 'New Project Available',
          message: `A new project "${jobData.title}" with budget ${jobData.budget} is now available for quotes`,
          type: 'job',
          metadata: {
            action: 'job_created',
            jobId: jobData.id,
            contractorId: jobData.posterId,
            contractorName: jobData.posterName,
            jobTitle: jobData.title,
            budget: jobData.budget,
            deadline: jobData.deadline,
            attachmentCount: jobData.attachments ? jobData.attachments.length : 0
          },
          isRead: false,
          seen: false,
          deleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      notifications.push({
        userId: jobData.posterId,
        title: 'Project Posted Successfully',
        message: `Your project "${jobData.title}" has been posted with ${jobData.attachments ? jobData.attachments.length : 0} PDF attachments and is now visible to all qualified designers`,
        type: 'job',
        metadata: {
          action: 'job_posted_confirmation',
          jobId: jobData.id,
          jobTitle: jobData.title,
          attachmentCount: jobData.attachments ? jobData.attachments.length : 0
        },
        isRead: false,
        seen: false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const batch = adminDb.batch();
      notifications.forEach(notification => {
        const notificationRef = adminDb.collection('notifications').doc();
        batch.set(notificationRef, notification);
      });
      await batch.commit();

      console.log(`Job creation notifications sent to ${designersSnapshot.size} designers`);
    } catch (error) {
      console.error('Error in job creation notifications:', error);
    }
  }
}

const router = express.Router();

// Public routes
router.get('/', getAllJobs);
router.get('/:id', getJobById);

// Protected routes
router.get('/user/:userId', authenticateToken, getJobsByUserId);

// Enhanced job creation with multiple PDF attachments (10 files, 15MB each)
router.post('/', authenticateToken, isContractor, handleMultipleFileUpload, validateUploadedFiles, async (req, res) => {
  try {
    const { title, description, budget, deadline, skills, link } = req.body;
    const files = req.files;
    const userId = req.user.userId;

    console.log(`Job creation request by ${req.user.email}`);
    console.log(`Files received: ${files ? files.length : 0}`);

    // Validate required fields
    if (!title || !description || !budget) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and budget are required'
      });
    }

    // Process uploaded files
    let attachments = [];
    if (files && files.length > 0) {
      try {
        console.log(`Uploading ${files.length} PDF files to Firebase Storage...`);
        
        // Upload files to Firebase Storage
        attachments = await uploadMultipleFilesToFirebase(
          files, 
          'job-attachments', // folder path
          userId
        );
        
        console.log(`Successfully uploaded ${attachments.length} files`);
      } catch (uploadError) {
        console.error('File upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'File upload to storage failed: ' + uploadError.message
        });
      }
    }

    // Create job data
    const jobData = {
      title,
      description,
      budget,
      deadline: deadline ? new Date(deadline) : null,
      skills: skills ? skills.split(',').map(s => s.trim()) : [],
      link: link || null,
      attachments, // Array of uploaded file objects
      attachmentCount: attachments.length,
      totalAttachmentSize: attachments.reduce((sum, file) => sum + file.size, 0),
      posterName: req.user.name,
      posterEmail: req.user.email,
      posterId: userId,
      status: 'open',
      quotesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to Firestore
    const jobRef = await adminDb.collection('jobs').add(jobData);
    const createdJob = { id: jobRef.id, ...jobData };

    console.log(`Job created with ID: ${jobRef.id}, Files: ${attachments.length}`);

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        await TempNotificationService.notifyJobCreated({
          ...createdJob,
          posterId: userId,
          posterName: req.user.name
        });
        console.log('Job creation notifications sent successfully');
      } catch (notificationError) {
        console.error('Failed to send job creation notifications:', notificationError);
      }
    });

    // Prepare response (don't expose file URLs for security)
    const responseData = {
      id: jobRef.id,
      ...jobData,
      attachments: attachments.map(file => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        uploadedAt: file.uploadedAt
      }))
    };

    res.status(201).json({
      success: true,
      message: `Project posted successfully with ${attachments.length} PDF attachments (${(jobData.totalAttachmentSize / (1024 * 1024)).toFixed(2)}MB total)`,
      data: responseData
    });

  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: error.message
    });
  }
});

export default router;
