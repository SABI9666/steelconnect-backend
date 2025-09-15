// src/routes/jobs.js - Complete working version for 10 PDF files, viewable by designers
import express from 'express';
import multer from 'multer';
import { authenticateToken, isContractor } from '../middleware/auth.js';
import { adminDb, uploadMultipleFilesToFirebase, FILE_UPLOAD_CONFIG } from '../config/firebase.js';

const router = express.Router();

// Enhanced multer configuration - same as estimation route that works
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize, // 15MB per file
    files: FILE_UPLOAD_CONFIG.maxFiles, // Maximum 10 files
    fieldSize: 1024 * 1024 // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    console.log(`[JOBS-UPLOAD] Processing file: ${file.originalname}, MIME: ${file.mimetype}, Field: ${file.fieldname}`);
    
    // Only allow PDF files
    if (!FILE_UPLOAD_CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      console.log(`[JOBS-UPLOAD] Rejected file ${file.originalname}: Invalid MIME type ${file.mimetype}`);
      return cb(new Error(`Only PDF files are allowed. Received: ${file.mimetype}`), false);
    }
    
    // Check file extension as additional validation
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!FILE_UPLOAD_CONFIG.allowedExtensions.map(e => e.replace('.', '')).includes(ext)) {
      console.log(`[JOBS-UPLOAD] Rejected file ${file.originalname}: Invalid extension .${ext}`);
      return cb(new Error(`Only PDF files are allowed. File extension: .${ext}`), false);
    }
    
    console.log(`[JOBS-UPLOAD] Accepted file: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    cb(null, true);
  }
});

// Flexible file upload handler to accept multiple field names
const handleFileUpload = (req, res, next) => {
  // Try 'attachments' first (most common)
  const uploadAttachments = upload.array('attachments', 10);
  
  uploadAttachments(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE' && err.field) {
      // If 'attachments' failed, try other common field names
      console.log(`[JOBS-UPLOAD] Trying field name: ${err.field}`);
      
      const uploadAny = upload.array(err.field, 10);
      uploadAny(req, res, (err2) => {
        if (err2) {
          console.error('[JOBS-UPLOAD] Upload error with alternative field name:', err2);
          return next(err2);
        }
        console.log(`[JOBS-UPLOAD] Success with field '${err.field}': ${req.files?.length || 0} files`);
        next();
      });
    } else if (err) {
      console.error('[JOBS-UPLOAD] Upload error:', err);
      return next(err);
    } else {
      console.log(`[JOBS-UPLOAD] Success with 'attachments' field: ${req.files?.length || 0} files`);
      next();
    }
  });
};

// NOTIFICATION SERVICE
class JobNotificationService {
  static async notifyJobCreated(jobData) {
    try {
      console.log('[NOTIFICATIONS] Creating job creation notifications...');
      
      const designersSnapshot = await adminDb.collection('users')
        .where('type', '==', 'designer')
        .where('profileStatus', '==', 'approved')
        .get();

      const notifications = [];

      designersSnapshot.docs.forEach(doc => {
        notifications.push({
          userId: doc.id,
          title: 'New Project Available',
          message: `A new project "${jobData.title}" with budget ${jobData.budget} and ${jobData.attachmentCount || 0} attachments is now available for quotes`,
          type: 'job',
          metadata: {
            action: 'job_created',
            jobId: jobData.id,
            contractorId: jobData.posterId,
            contractorName: jobData.posterName,
            jobTitle: jobData.title,
            budget: jobData.budget,
            deadline: jobData.deadline,
            attachmentCount: jobData.attachmentCount || 0
          },
          isRead: false,
          seen: false,
          deleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      // Add confirmation to job poster
      notifications.push({
        userId: jobData.posterId,
        title: 'Project Posted Successfully',
        message: `Your project "${jobData.title}" has been posted with ${jobData.attachmentCount || 0} PDF attachments and is now visible to all qualified designers`,
        type: 'job',
        metadata: {
          action: 'job_posted_confirmation',
          jobId: jobData.id,
          jobTitle: jobData.title,
          attachmentCount: jobData.attachmentCount || 0
        },
        isRead: false,
        seen: false,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Save all notifications to database
      const batch = adminDb.batch();
      notifications.forEach(notification => {
        const notificationRef = adminDb.collection('notifications').doc();
        batch.set(notificationRef, notification);
      });
      await batch.commit();

      console.log(`[NOTIFICATIONS] Job creation notifications sent to ${designersSnapshot.size} designers`);
    } catch (error) {
      console.error('[NOTIFICATIONS] Error in job creation notifications:', error);
    }
  }

  static async notifyJobStatusChanged(jobData, oldStatus, newStatus) {
    try {
      console.log(`[NOTIFICATIONS] Creating job status change notification: ${oldStatus} -> ${newStatus}`);
      
      if (newStatus === 'completed') {
        if (jobData.assignedTo) {
          const notification = {
            userId: jobData.assignedTo,
            title: 'Project Completed',
            message: `The project "${jobData.title}" has been marked as completed by the client`,
            type: 'job',
            metadata: {
              action: 'job_completed',
              jobId: jobData.id,
              jobTitle: jobData.title,
              contractorId: jobData.posterId
            },
            isRead: false,
            seen: false,
            deleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await adminDb.collection('notifications').add(notification);
        }
      }

      console.log('[NOTIFICATIONS] Job status change notifications sent');
    } catch (error) {
      console.error('[NOTIFICATIONS] Error in job status change notifications:', error);
    }
  }
}

// CREATE JOB - Enhanced with file upload support
router.post('/', authenticateToken, isContractor, handleFileUpload, async (req, res) => {
  try {
    console.log('[JOBS-CREATE] Starting job creation...');
    console.log('[JOBS-CREATE] User:', req.user?.email);
    console.log('[JOBS-CREATE] Files received:', req.files?.length || 0);
    
    const { title, description, budget, deadline, skills, link } = req.body;
    const files = req.files;
    const userId = req.user.userId;

    // Log form data for debugging
    console.log('[JOBS-CREATE] Form data:', { 
      title: title ? 'PROVIDED' : 'MISSING', 
      description: description ? 'PROVIDED' : 'MISSING', 
      budget: budget ? 'PROVIDED' : 'MISSING',
      deadline, 
      skills, 
      link 
    });
    
    if (files && files.length > 0) {
      files.forEach((file, i) => {
        console.log(`[JOBS-CREATE] File ${i + 1}: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB) - Field: ${file.fieldname}`);
      });
    }

    // Validate required fields
    if (!title || !description || !budget) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and budget are required'
      });
    }

    // Validate files if provided
    let uploadedFiles = [];
    if (files && files.length > 0) {
      try {
        // Validate file count
        if (files.length > FILE_UPLOAD_CONFIG.maxFiles) {
          return res.status(400).json({
            success: false,
            message: `Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed. You uploaded ${files.length} files.`
          });
        }
        
        console.log(`[JOBS-CREATE] Uploading ${files.length} PDF files to Firebase Storage...`);
        
        // Upload files using the same function as estimation
        uploadedFiles = await uploadMultipleFilesToFirebase(
          files, 
          FILE_UPLOAD_CONFIG.uploadPaths.jobs, // 'job-attachments'
          userId
        );
        
        console.log(`[JOBS-CREATE] Successfully uploaded ${uploadedFiles.length} files`);
      } catch (uploadError) {
        console.error('[JOBS-CREATE] File upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'File upload failed',
          error: uploadError.message
        });
      }
    }

    // Create job data with attachment information
    const jobData = {
      title,
      description,
      budget,
      deadline: deadline ? new Date(deadline) : null,
      skills: skills ? skills.split(',').map(s => s.trim()) : [],
      link: link || null,
      
      // File attachment data (same structure as estimation)
      uploadedFiles, // Full file data for internal use
      attachments: uploadedFiles, // Alias for compatibility
      fileCount: uploadedFiles.length,
      attachmentCount: uploadedFiles.length,
      totalFileSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
      totalAttachmentSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0),
      
      // Job metadata
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
    
    console.log(`[JOBS-CREATE] Job created with ID: ${jobRef.id}, Files: ${uploadedFiles.length}`);

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        await JobNotificationService.notifyJobCreated({
          ...createdJob,
          posterId: userId,
          posterName: req.user.name
        });
        console.log('[JOBS-CREATE] Job creation notifications sent successfully');
      } catch (notificationError) {
        console.error('[JOBS-CREATE] Failed to send job creation notifications:', notificationError);
      }
    });

    // Prepare response (include file info but not direct URLs for security)
    const responseData = {
      id: jobRef.id,
      title,
      description,
      budget,
      deadline: jobData.deadline,
      skills: jobData.skills,
      link: jobData.link,
      fileCount: uploadedFiles.length,
      attachmentCount: uploadedFiles.length,
      totalFileSize: jobData.totalFileSize,
      uploadedFiles: uploadedFiles.map(f => ({
        name: f.originalname,
        size: f.size,
        type: f.mimetype,
        uploadedAt: f.uploadedAt
      })),
      status: 'open',
      posterName: req.user.name,
      posterEmail: req.user.email,
      posterId: userId,
      createdAt: jobData.createdAt
    };
    
    res.status(201).json({
      success: true,
      message: `Project posted successfully with ${uploadedFiles.length} PDF attachments (${(jobData.totalFileSize / (1024 * 1024)).toFixed(2)}MB total)`,
      data: responseData
    });

  } catch (error) {
    console.error('[JOBS-CREATE] Error creating job:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating job',
      error: error.message
    });
  }
});

// GET ALL JOBS - For designers to see available jobs with attachment info
router.get('/', async (req, res) => {
  try {
    console.log('[JOBS-LIST] Fetching all jobs...');
    
    const { page = 1, limit = 6 } = req.query;
    const offset = (page - 1) * limit;

    const snapshot = await adminDb.collection('jobs')
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit))
      .offset(offset)
      .get();

    const jobs = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firestore timestamp to regular date if needed
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const deadline = data.deadline?.toDate ? data.deadline.toDate() : data.deadline;
      
      return {
        id: doc.id,
        ...data,
        createdAt,
        deadline,
        
        // File attachment information for designers
        attachmentCount: data.uploadedFiles ? data.uploadedFiles.length : (data.attachments ? data.attachments.length : 0),
        fileCount: data.uploadedFiles ? data.uploadedFiles.length : (data.attachments ? data.attachments.length : 0),
        hasAttachments: (data.uploadedFiles && data.uploadedFiles.length > 0) || (data.attachments && data.attachments.length > 0),
        totalFileSize: data.totalFileSize || data.totalAttachmentSize || 0,
        
        // File list for designers (without direct URLs for security)
        files: data.uploadedFiles ? data.uploadedFiles.map(file => ({
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          uploadedAt: file.uploadedAt
        })) : (data.attachments ? data.attachments.map(file => ({
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          uploadedAt: file.uploadedAt
        })) : [])
      };
    });

    console.log(`[JOBS-LIST] Found ${jobs.length} jobs`);

    // Check if there are more jobs
    const nextSnapshot = await adminDb.collection('jobs')
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .offset(offset + parseInt(limit))
      .get();

    res.json({
      success: true,
      data: jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasNext: !nextSnapshot.empty
      }
    });

  } catch (error) {
    console.error('[JOBS-LIST] Error fetching jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch jobs',
      error: error.message
    });
  }
});

// GET SPECIFIC JOB - For designers to see job details with files
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`[JOB-GET] Fetching job: ${id}`);
    
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const jobData = jobDoc.data();
    
    // Convert Firestore timestamps
    const createdAt = jobData.createdAt?.toDate ? jobData.createdAt.toDate() : jobData.createdAt;
    const deadline = jobData.deadline?.toDate ? jobData.deadline.toDate() : jobData.deadline;
    
    // Prepare file information for designers
    const files = jobData.uploadedFiles || jobData.attachments || [];
    
    const responseData = {
      id: jobDoc.id,
      ...jobData,
      createdAt,
      deadline,
      
      // File attachment information
      attachmentCount: files.length,
      fileCount: files.length,
      hasAttachments: files.length > 0,
      totalFileSize: jobData.totalFileSize || jobData.totalAttachmentSize || files.reduce((sum, file) => sum + (file.size || 0), 0),
      
      // File list for designers (includes names and sizes but not direct URLs)
      files: files.map(file => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        uploadedAt: file.uploadedAt
      }))
    };

    console.log(`[JOB-GET] Job found with ${files.length} attachments`);

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[JOB-GET] Error fetching job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch job',
      error: error.message
    });
  }
});

// GET USER JOBS - For contractors to see their posted jobs
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`[USER-JOBS] Fetching jobs for user: ${userId}`);
    
    const snapshot = await adminDb.collection('jobs')
      .where('posterId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const jobs = snapshot.docs.map(doc => {
      const data = doc.data();
      const files = data.uploadedFiles || data.attachments || [];
      
      // Convert Firestore timestamps
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const deadline = data.deadline?.toDate ? data.deadline.toDate() : data.deadline;
      
      return {
        id: doc.id,
        ...data,
        createdAt,
        deadline,
        attachmentCount: files.length,
        fileCount: files.length,
        hasAttachments: files.length > 0,
        totalFileSize: data.totalFileSize || data.totalAttachmentSize || 0,
        files: files.map(file => ({
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          uploadedAt: file.uploadedAt
        }))
      };
    });

    console.log(`[USER-JOBS] Found ${jobs.length} jobs for user ${userId}`);

    res.json({
      success: true,
      data: jobs
    });

  } catch (error) {
    console.error('[USER-JOBS] Error fetching user jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user jobs',
      error: error.message
    });
  }
});

// DOWNLOAD JOB ATTACHMENT - For authenticated users to download files
router.get('/:jobId/files/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { jobId, fileName } = req.params;
    
    console.log(`[DOWNLOAD] File: ${fileName} from job: ${jobId} by user: ${req.user.email}`);
    
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const jobData = jobDoc.data();
    const files = jobData.uploadedFiles || jobData.attachments || [];
    const file = files.find(f => f.originalname === fileName);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`[DOWNLOAD] Redirecting to file URL for: ${fileName}`);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalname}"`);
    res.setHeader('Content-Type', file.mimetype || 'application/pdf');
    
    // Redirect to the file URL
    res.redirect(file.url);

  } catch (error) {
    console.error('[DOWNLOAD] Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Download failed',
      error: error.message
    });
  }
});

// UPDATE JOB STATUS - For contractors to update their jobs
router.put('/:id', authenticateToken, isContractor, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, title, description, budget, deadline, skills, link } = req.body;
    const userId = req.user.userId;

    // Get the job first
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = jobDoc.data();
    
    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const oldStatus = jobData.status;
    
    // Prepare update data
    const updateData = {
      updatedAt: new Date()
    };

    // Update fields if provided
    if (status !== undefined) updateData.status = status;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (budget !== undefined) updateData.budget = budget;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (skills !== undefined) updateData.skills = skills ? skills.split(',').map(s => s.trim()) : [];
    if (link !== undefined) updateData.link = link || null;

    // Update the job
    await adminDb.collection('jobs').doc(id).update(updateData);

    const updatedJob = { id, ...jobData, ...updateData };

    // Send status change notifications if status changed
    if (status && status !== oldStatus) {
      try {
        await JobNotificationService.notifyJobStatusChanged(updatedJob, oldStatus, status);
        console.log('[JOBS-UPDATE] Job status change notifications sent successfully');
      } catch (notificationError) {
        console.error('[JOBS-UPDATE] Failed to send job status change notifications:', notificationError);
      }
    }

    res.json({
      success: true,
      message: 'Job updated successfully',
      data: updatedJob
    });

  } catch (error) {
    console.error('[JOBS-UPDATE] Error updating job:', error);
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

// DELETE JOB - For contractors to delete their jobs
router.delete('/:id', authenticateToken, isContractor, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Get the job first
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = jobDoc.data();
    
    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Delete associated files from Firebase Storage
    const files = jobData.uploadedFiles || jobData.attachments || [];
    if (files.length > 0) {
      console.log(`[JOBS-DELETE] Deleting ${files.length} files from storage`);
      
      const { deleteFileFromFirebase } = await import('../config/firebase.js');
      for (const file of files) {
        try {
          await deleteFileFromFirebase(file.path || file.filename);
        } catch (fileDeleteError) {
          console.error(`[JOBS-DELETE] Failed to delete file ${file.originalname}:`, fileDeleteError);
          // Continue with other files even if one fails
        }
      }
    }

    // Delete related quotes
    const quotesSnapshot = await adminDb.collection('quotes')
      .where('jobId', '==', id)
      .get();
    
    if (!quotesSnapshot.empty) {
      const batch = adminDb.batch();
      quotesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`[JOBS-DELETE] Deleted ${quotesSnapshot.size} related quotes`);
    }

    // Delete the job document
    await adminDb.collection('jobs').doc(id).delete();

    console.log(`[JOBS-DELETE] Job ${id} and associated files deleted by ${req.user?.email}`);

    res.json({
      success: true,
      message: 'Job, associated files, and related quotes deleted successfully'
    });

  } catch (error) {
    console.error('[JOBS-DELETE] Error deleting job:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete job',
      message: error.message 
    });
  }
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  console.error('[JOBS-ERROR] Upload error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum 15MB per file allowed.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field in upload.'
      });
    }
  }
  
  if (error.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

export default router;
