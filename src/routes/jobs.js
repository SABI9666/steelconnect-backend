// src/routes/jobs.js - Fixed version with proper multiple file upload support
import express from 'express';
import {
  createJob,
  getAllJobs,
  getJobById,
  deleteJob,
  getJobsByUserId,
  updateJob
} from '../controllers/jobController.js';
import { authenticateToken, isContractor, isDesigner } from '../middleware/auth.js';
import { 
  upload, 
  handleUploadError, 
  validateFileRequirements, 
  logUploadDetails, 
  validatePDFFiles 
} from '../middleware/upload.js';
import { adminDb } from '../config/firebase.js';

// TEMPORARY NOTIFICATION SERVICE
class TempNotificationService {
  static async notifyJobCreated(jobData) {
    try {
      console.log('📬 Creating job creation notifications...');
      
      // Get all approved designers
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

      // Confirmation to job poster
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

      // Save notifications in batch
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
      
      if (newStatus === 'completed' && jobData.assignedTo) {
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

// Designer assigned projects - returns all jobs where this designer is assigned
router.get('/assigned/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized.' });
        }
        // Query without orderBy to avoid needing a composite Firestore index
        const jobsSnapshot = await adminDb.collection('jobs')
            .where('assignedTo', '==', userId)
            .get();
        const jobs = [];
        for (const doc of jobsSnapshot.docs) {
            const jobData = { id: doc.id, ...doc.data() };
            // Include poster (contractor) email for invoice sending
            if (jobData.posterId) {
                try {
                    const posterDoc = await adminDb.collection('users').doc(jobData.posterId).get();
                    if (posterDoc.exists) {
                        const posterData = posterDoc.data();
                        jobData.posterEmail = posterData.email || '';
                        jobData.posterName = posterData.name || 'Client';
                        jobData.posterCompany = posterData.companyName || posterData.company || '';
                    }
                } catch (e) { /* skip */ }
            }
            jobs.push(jobData);
        }
        // Sort by createdAt descending in JS
        jobs.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
        });
        res.status(200).json({ success: true, data: jobs });
    } catch (error) {
        console.error('Error fetching assigned jobs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch assigned projects.' });
    }
});

// Enhanced job creation with multiple file support
router.post(
  '/', 
  authenticateToken, 
  isContractor, 
  upload.array('attachments', 10), // Support up to 10 files with field name 'attachments'
  handleUploadError,
  validateFileRequirements,
  logUploadDetails,
  validatePDFFiles,
  async (req, res, next) => {
    try {
      console.log('=== JOB CREATION REQUEST ===');
      console.log('User:', req.user.email);
      console.log('Body:', req.body);
      console.log('Files:', req.files?.length || 0);
      console.log('==============================');

      // Store original response function
      const originalJson = res.json;
      
      // Override response function to catch successful job creation
      res.json = function(data) {
        // If job creation was successful, send notifications
        if (this.statusCode === 201 && data.success) {
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
      
      // Call the createJob controller
      await createJob(req, res, next);
      
    } catch (error) {
      console.error('Error in job creation route:', error);
      next(error);
    }
  }
);

// Enhanced job update with file support and notifications
router.put(
  '/:id', 
  authenticateToken, 
  isContractor, 
  upload.array('attachments', 10), // Allow file uploads in updates too
  handleUploadError,
  validatePDFFiles,
  logUploadDetails,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.userId;

      // If it's just a status update (no other data), handle it specially
      if (status && Object.keys(req.body).length === 1 && (!req.files || req.files.length === 0)) {
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
        
        // Update the job status
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

        return res.json({
          success: true,
          message: 'Job updated successfully',
          data: updatedJob
        });
      } else {
        // For regular updates (with potential file uploads), use the controller
        await updateJob(req, res, next);
      }

    } catch (error) {
      console.error('Error updating job:', error);
      res.status(500).json({ success: false, error: 'Failed to update job' });
    }
  }
);

// Designer submits/updates completion percentage with details
router.put('/:id/completion', authenticateToken, isDesigner, async (req, res) => {
    try {
        const { id } = req.params;
        const { percentage, details } = req.body;
        const designerId = req.user.userId;

        if (percentage === undefined || percentage === null) {
            return res.status(400).json({ success: false, message: 'Percentage is required.' });
        }
        const pct = parseInt(percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            return res.status(400).json({ success: false, message: 'Percentage must be between 0 and 100.' });
        }
        if (!details || !details.trim()) {
            return res.status(400).json({ success: false, message: 'Details about the progress are required.' });
        }

        const jobDoc = await adminDb.collection('jobs').doc(id).get();
        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const jobData = jobDoc.data();
        if (jobData.assignedTo !== designerId) {
            return res.status(403).json({ success: false, message: 'You are not assigned to this project.' });
        }
        if (jobData.status !== 'assigned') {
            return res.status(400).json({ success: false, message: 'Completion updates can only be submitted for in-progress projects.' });
        }

        const completionUpdate = {
            percentage: pct,
            details: details.trim(),
            submittedBy: designerId,
            submittedByName: req.user.name || 'Designer',
            submittedAt: new Date().toISOString(),
            status: 'pending' // pending, accepted, rejected
        };

        // Keep history of all updates
        const existingHistory = jobData.completionHistory || [];
        existingHistory.push(completionUpdate);

        await adminDb.collection('jobs').doc(id).update({
            completionUpdate: completionUpdate,
            completionHistory: existingHistory,
            updatedAt: new Date().toISOString()
        });

        // Notify contractor about the completion update
        try {
            const notification = {
                userId: jobData.posterId,
                title: 'Project Progress Update',
                message: `Designer ${req.user.name || 'Designer'} has submitted a ${pct}% completion update for "${jobData.title}"`,
                type: 'job',
                metadata: {
                    action: 'completion_update_submitted',
                    jobId: id,
                    jobTitle: jobData.title,
                    designerId: designerId,
                    designerName: req.user.name,
                    percentage: pct
                },
                isRead: false,
                seen: false,
                deleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await adminDb.collection('notifications').add(notification);
        } catch (notifError) {
            console.error('Failed to send completion update notification:', notifError);
        }

        res.status(200).json({
            success: true,
            message: 'Completion update submitted successfully.',
            data: completionUpdate
        });
    } catch (error) {
        console.error('Error submitting completion update:', error);
        res.status(500).json({ success: false, message: 'Failed to submit completion update.' });
    }
});

// Contractor accepts or rejects a completion update
router.put('/:id/completion/respond', authenticateToken, isContractor, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejectionReason } = req.body;
        const contractorId = req.user.userId;

        if (!action || !['accept', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be "accept" or "reject".' });
        }

        const jobDoc = await adminDb.collection('jobs').doc(id).get();
        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Project not found.' });
        }

        const jobData = jobDoc.data();
        if (jobData.posterId !== contractorId) {
            return res.status(403).json({ success: false, message: 'You are not the owner of this project.' });
        }
        if (!jobData.completionUpdate || jobData.completionUpdate.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'No pending completion update to respond to.' });
        }

        const updatedCompletion = { ...jobData.completionUpdate };
        updatedCompletion.status = action === 'accept' ? 'accepted' : 'rejected';
        updatedCompletion.respondedAt = new Date().toISOString();
        updatedCompletion.respondedBy = contractorId;
        updatedCompletion.respondedByName = req.user.name || 'Contractor';
        if (action === 'reject' && rejectionReason) {
            updatedCompletion.rejectionReason = rejectionReason.trim();
        }

        const updateData = {
            completionUpdate: updatedCompletion,
            updatedAt: new Date().toISOString()
        };

        // If accepted, update the confirmed completion percentage
        if (action === 'accept') {
            updateData.completionPercentage = updatedCompletion.percentage;
            updateData.completionDetails = updatedCompletion.details;
            updateData.completionAcceptedAt = new Date().toISOString();
        }

        // Update history with the response
        const history = jobData.completionHistory || [];
        if (history.length > 0) {
            history[history.length - 1] = updatedCompletion;
        }
        updateData.completionHistory = history;

        await adminDb.collection('jobs').doc(id).update(updateData);

        // Notify designer about the response
        try {
            const notification = {
                userId: jobData.assignedTo,
                title: action === 'accept' ? 'Completion Update Accepted' : 'Completion Update Rejected',
                message: action === 'accept'
                    ? `Your ${updatedCompletion.percentage}% completion update for "${jobData.title}" has been accepted by the contractor.`
                    : `Your completion update for "${jobData.title}" was rejected.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`,
                type: 'job',
                metadata: {
                    action: action === 'accept' ? 'completion_accepted' : 'completion_rejected',
                    jobId: id,
                    jobTitle: jobData.title,
                    contractorId: contractorId,
                    percentage: updatedCompletion.percentage
                },
                isRead: false,
                seen: false,
                deleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await adminDb.collection('notifications').add(notification);
        } catch (notifError) {
            console.error('Failed to send completion response notification:', notifError);
        }

        res.status(200).json({
            success: true,
            message: `Completion update ${action === 'accept' ? 'accepted' : 'rejected'} successfully.`,
            data: updatedCompletion
        });
    } catch (error) {
        console.error('Error responding to completion update:', error);
        res.status(500).json({ success: false, message: 'Failed to respond to completion update.' });
    }
});

router.delete('/:id', authenticateToken, isContractor, deleteJob);

export default router;
