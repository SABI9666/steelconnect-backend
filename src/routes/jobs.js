// src/routes/jobs.js - Fixed Import Path
import express from 'express';
import {
  createJob,
  getAllJobs,
  getJobById,
  deleteJob,
  getJobsByUserId
} from '../controllers/jobController.js';
import { authenticateToken, isContractor } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { adminDb } from '../config/firebase.js';

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
            deadline: jobData.deadline
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
        message: `Your project "${jobData.title}" has been posted and is now visible to all qualified designers`,
        type: 'job',
        metadata: {
          action: 'job_posted_confirmation',
          jobId: jobData.id,
          jobTitle: jobData.title
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

// Enhanced job creation with notifications
router.post(
  '/', 
  authenticateToken, 
  isContractor, 
  upload.single('attachment'),
  async (req, res, next) => {
    try {
      // Store original response function
      const originalSend = res.send;
      const originalJson = res.json;
      
      // Override response functions to catch successful job creation
      res.json = function(data) {
        // If job creation was successful (status 201), send notifications
        if (this.statusCode === 201 && data.success) {
          // Extract job data from response
          const jobData = {
            id: data.data?.id || res.locals?.jobId,
            ...data.data,
            posterId: req.user.userId,
            posterName: req.user.name
          };
          
          // Send notifications asynchronously
          setImmediate(async () => {
            try {
              await TempNotificationService.notifyJobCreated(jobData);
              console.log('✅ Job creation notifications sent successfully');
            } catch (notificationError) {
              console.error('❌ Failed to send job creation notifications:', notificationError);
            }
          });
        }
        
        // Call original response
        originalJson.call(this, data);
      };
      
      // Call the original createJob controller
      await createJob(req, res, next);
      
    } catch (error) {
      next(error);
    }
  }
);

// Enhanced job update with notifications
router.put('/:id', authenticateToken, isContractor, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
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
    
    // Update the job
    const updateData = {
      status,
      updatedAt: new Date()
    };

    await adminDb.collection('jobs').doc(id).update(updateData);

    const updatedJob = { id, ...jobData, ...updateData };

    // Send status change notifications
    try {
      await TempNotificationService.notifyJobStatusChanged(updatedJob, oldStatus, status);
      console.log('✅ Job status change notifications sent successfully');
    } catch (notificationError) {
      console.error('❌ Failed to send job status change notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Job updated successfully',
      data: updatedJob
    });

  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ success: false, error: 'Failed to update job' });
  }
});

router.delete('/:id', authenticateToken, isContractor, deleteJob);

export default router;
