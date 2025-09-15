// src/routes/jobs.js - Complete file with multiple PDF attachments support
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

// Enhanced multer configuration for multiple PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_UPLOAD_CONFIG.maxFileSize, // 15MB per file
    files: FILE_UPLOAD_CONFIG.maxFiles, // Maximum 10 files
    fieldSize: 1024 * 1024 // 1MB for form fields
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
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

// TEMPORARY NOTIFICATION SERVICE - Use this until you create the full NotificationService
class TempNotificationService {
  static async notifyJobCreated(jobData) {
    try {
      console.log('📬 Creating job creation notifications...');
      
      // Get all designers to notify them about the new job
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

      // Add confirmation to job poster
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

      // Save all notifications to database
      const batch = adminDb.batch();
      notifications.forEach(notification => {
        const notificationRef = adminDb.collection('notifications').doc();
        batch.set(notificationRef, notification);
      });
      await batch.commit();

      console.log(`✅ Job creation notifications sent to ${designersSnapshot.size} designers`);
    } catch (error) {
      console.error('❌ Error in job creation notifications:', error);
    }
  }

  static async notifyJobStatusChanged(jobData, oldStatus, newStatus) {
    try {
      console.log(`📬 Creating job status change notification: ${oldStatus} -> ${newStatus}`);
      
      if (newStatus === 'completed') {
        // Notify the assigned designer
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

      console.log('✅ Job status change notifications sent');
    } catch (error) {
      console.error('❌ Error in job status change notifications:', error);
    }
  }
}

const router = express.Router();

// Public routes
router.get('/', getAllJobs);
router.get('/:id', getJobById);

// Protected routes
router.get('/user/:userId', authenticateToken, getJobsByUserId);

// Enhanced job creation with multiple PDF attachments
router.post('/', authenticateToken, isContractor, upload.array('attachments', 10), async (req, res) => {
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

    // Validate files if provided
    let attachments = [];
    if (files && files.length > 0) {
      try {
        validateFileUpload(files, FILE_UPLOAD_CONFIG.maxFiles);
        
        console.log(`Uploading ${files.length} PDF files for job`);
        console.log('File details:', files.map(f => ({
          name: f.originalname,
          size: `${(f.size / (1024 * 1024)).toFixed(2)}MB`,
          type: f.mimetype
        })));

        // Upload files to Firebase Storage
        attachments = await uploadMultipleFilesToFirebase(
          files, 
          FILE_UPLOAD_CONFIG.uploadPaths.jobs, 
          userId
        );
        
        console.log(`✅ Successfully uploaded ${attachments.length} files`);
      } catch (uploadError) {
        console.error('❌ File upload failed:', uploadError);
        return res.status(400).json({
          success: false,
          message: uploadError.message
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

    console.log(`✅ Job created with ID: ${jobRef.id}`);

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        await TempNotificationService.notifyJobCreated({
          ...createdJob,
          posterId: userId,
          posterName: req.user.name
        });
        console.log('✅ Job creation notifications sent successfully');
      } catch (notificationError) {
        console.error('❌ Failed to send job creation notifications:', notificationError);
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
      message: `Project posted successfully with ${attachments.length} PDF attachments`,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error creating job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: error.message
    });
  }
});

// Enhanced job update with notifications
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
        await TempNotificationService.notifyJobStatusChanged(updatedJob, oldStatus, status);
        console.log('✅ Job status change notifications sent successfully');
      } catch (notificationError) {
        console.error('❌ Failed to send job status change notifications:', notificationError);
      }
    }

    res.json({
      success: true,
      message: 'Job updated successfully',
      data: updatedJob
    });

  } catch (error) {
    console.error('❌ Error updating job:', error);
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

// Get job attachments
router.get('/:jobId/attachments', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const jobData = jobDoc.data();
    const attachments = jobData.attachments || [];
    const totalSize = attachments.reduce((sum, file) => sum + (file.size || 0), 0);

    res.json({
      success: true,
      attachments: attachments.map(file => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        uploadedAt: file.uploadedAt
      })),
      attachmentCount: attachments.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
    });

  } catch (error) {
    console.error('❌ Error fetching job attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attachments',
      error: error.message
    });
  }
});

// Download job attachment
router.get('/:jobId/attachments/:fileName/download', authenticateToken, async (req, res) => {
  try {
    const { jobId, fileName } = req.params;
    
    console.log(`Attachment download requested: ${fileName} from job ${jobId} by ${req.user.email}`);
    
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const jobData = jobDoc.data();
    
    // Find the file in attachments
    const attachment = jobData.attachments?.find(f => f.originalname === fileName);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    console.log(`✅ Redirecting to file URL for download: ${fileName}`);
    
    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalname}"`);
    res.setHeader('Content-Type', attachment.mimetype || 'application/pdf');
    
    // Redirect to the file URL
    res.redirect(attachment.url);

  } catch (error) {
    console.error('❌ Error downloading attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
});

// Bulk download all job attachments
router.get('/:jobId/attachments/download-all', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log(`Bulk download requested for job ${jobId} by ${req.user.email}`);
    
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    const jobData = jobDoc.data();
    const attachments = jobData.attachments || [];
    
    if (attachments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No attachments found for this job'
      });
    }
    
    // Return the list of file URLs for frontend to handle bulk download
    res.json({
      success: true,
      message: `${attachments.length} attachments available for download`,
      attachments: attachments.map(file => ({
        name: file.originalname,
        url: file.url,
        size: file.size,
        type: file.mimetype
      }))
    });

  } catch (error) {
    console.error('❌ Error in bulk download:', error);
    res.status(500).json({
      success: false,
      message: 'Error preparing bulk download',
      error: error.message
    });
  }
});

// Add attachment to existing job
router.post('/:jobId/attachments', authenticateToken, isContractor, upload.array('attachments', 10), async (req, res) => {
  try {
    const { jobId } = req.params;
    const files = req.files;
    const userId = req.user.userId;

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one file is required'
      });
    }

    // Get the job first
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = jobDoc.data();
    
    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const existingAttachments = jobData.attachments || [];
    
    // Check if adding new files would exceed limit
    if (existingAttachments.length + files.length > FILE_UPLOAD_CONFIG.maxFiles) {
      return res.status(400).json({
        success: false,
        message: `Cannot add ${files.length} files. Job already has ${existingAttachments.length} attachments. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`
      });
    }

    // Validate and upload new files
    try {
      validateFileUpload(files, FILE_UPLOAD_CONFIG.maxFiles);
      
      const newAttachments = await uploadMultipleFilesToFirebase(
        files, 
        FILE_UPLOAD_CONFIG.uploadPaths.jobs, 
        userId
      );
      
      const allAttachments = [...existingAttachments, ...newAttachments];
      const totalSize = allAttachments.reduce((sum, file) => sum + file.size, 0);
      
      // Update job with new attachments
      await adminDb.collection('jobs').doc(jobId).update({
        attachments: allAttachments,
        attachmentCount: allAttachments.length,
        totalAttachmentSize: totalSize,
        updatedAt: new Date()
      });

      res.json({
        success: true,
        message: `${newAttachments.length} files added successfully`,
        data: {
          newAttachments: newAttachments.map(file => ({
            name: file.originalname,
            size: file.size,
            type: file.mimetype,
            uploadedAt: file.uploadedAt
          })),
          totalAttachments: allAttachments.length
        }
      });

    } catch (uploadError) {
      return res.status(400).json({
        success: false,
        message: uploadError.message
      });
    }

  } catch (error) {
    console.error('❌ Error adding attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add attachments',
      error: error.message
    });
  }
});

// Remove specific attachment from job
router.delete('/:jobId/attachments/:fileName', authenticateToken, isContractor, async (req, res) => {
  try {
    const { jobId, fileName } = req.params;
    const userId = req.user.userId;

    // Get the job first
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = jobDoc.data();
    
    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const attachments = jobData.attachments || [];
    const fileToRemove = attachments.find(f => f.originalname === fileName);
    
    if (!fileToRemove) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Remove file from Firebase Storage
    try {
      await deleteFileFromFirebase(fileToRemove.path || fileToRemove.filename);
    } catch (deleteError) {
      console.error(`Failed to delete file from storage: ${deleteError.message}`);
      // Continue with database update even if storage deletion fails
    }

    // Remove file from attachments array
    const updatedAttachments = attachments.filter(f => f.originalname !== fileName);
    const totalSize = updatedAttachments.reduce((sum, file) => sum + file.size, 0);

    // Update job
    await adminDb.collection('jobs').doc(jobId).update({
      attachments: updatedAttachments,
      attachmentCount: updatedAttachments.length,
      totalAttachmentSize: totalSize,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'File removed successfully',
      data: {
        removedFile: fileName,
        remainingAttachments: updatedAttachments.length
      }
    });

  } catch (error) {
    console.error('❌ Error removing attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove attachment',
      error: error.message
    });
  }
});

// Enhanced job deletion with file cleanup
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
    if (jobData.attachments && jobData.attachments.length > 0) {
      console.log(`Deleting ${jobData.attachments.length} attachments from storage`);
      
      for (const attachment of jobData.attachments) {
        try {
          await deleteFileFromFirebase(attachment.path || attachment.filename);
        } catch (fileDeleteError) {
          console.error(`Failed to delete file ${attachment.originalname}:`, fileDeleteError);
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
      console.log(`Deleted ${quotesSnapshot.size} related quotes`);
    }

    // Delete the job document
    await adminDb.collection('jobs').doc(id).delete();

    console.log(`✅ Job ${id} and associated files deleted by ${req.user?.email}`);

    res.json({
      success: true,
      message: 'Job, associated files, and related quotes deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting job:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete job',
      message: error.message 
    });
  }
});

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
  console.error('Upload error:', error);
  
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
        message: `Too many files. Maximum ${FILE_UPLOAD_CONFIG.maxFiles} files allowed.`
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
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
