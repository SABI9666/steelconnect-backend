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
import { NotificationService } from './notifications.js';
import { adminDb } from '../config/firebase.js';

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
      // Call the original createJob controller
      await createJob(req, res, next);
      
      // If job creation was successful (status 201), send notifications
      if (res.statusCode === 201) {
        try {
          // Extract job data from the response
          const jobData = res.locals.jobData || req.body;
          
          // Add the job ID if it was set by the controller
          if (res.locals.jobId) {
            jobData.id = res.locals.jobId;
          }
          
          // Send notifications to all designers
          await NotificationService.notifyJobCreated(jobData);
          console.log('✅ Job creation notifications sent successfully');
        } catch (notificationError) {
          console.error('❌ Failed to send job creation notifications:', notificationError);
          // Don't fail the job creation if notifications fail
        }
      }
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
      await NotificationService.notifyJobStatusChanged(updatedJob, oldStatus, status);
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
