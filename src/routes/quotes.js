// UPDATED ROUTE FILES WITH NOTIFICATION INTEGRATION

// 1. UPDATE: src/routes/quotes.js
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { 
  createQuote, 
  getQuotesForJob, 
  getQuotesByUser, 
  getQuoteById, 
  approveQuote, 
  deleteQuote 
} from '../controllers/quotecontroller.js';
import { authenticateToken, isDesigner } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { NotificationService } from '../services/NotificationService.js'; // Updated import

const router = express.Router();

// Enhanced quote creation with notifications
router.post(
  '/',
  authenticateToken,
  isDesigner,
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      // Store original res.json to intercept the response
      const originalJson = res.json;
      
      res.json = function(data) {
        // Call original response first
        originalJson.call(this, data);
        
        // If quote creation was successful, send notifications
        if (data.success && this.statusCode === 201) {
          (async () => {
            try {
              const quoteData = data.data;
              const { jobId } = req.body;
              
              // Get job data for notification
              const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
              if (jobDoc.exists) {
                const jobData = { id: jobId, ...jobDoc.data() };
                
                // Send notification using enhanced service
                await NotificationService.notifyQuoteSubmitted(quoteData, jobData);
                console.log('Quote submission notification sent successfully');
              }
            } catch (notificationError) {
              console.error('Failed to send quote submission notification:', notificationError);
            }
          })();
        }
      };
      
      // Call the original createQuote controller
      await createQuote(req, res, next);
      
    } catch (error) {
      next(error);
    }
  }
);

// Enhanced quote approval with notifications
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id: quoteId } = req.params;
    const { jobId } = req.body;
    const userId = req.user.userId;

    // Get quote info
    const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }
    const quoteData = { id: quoteId, ...quoteDoc.data() };

    // Get job info
    const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    const jobData = { id: jobId, ...jobDoc.data() };

    // Check authorization
    if (jobData.posterId !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Get all quotes for this job before updating (for rejection notifications)
    const allQuotesQuery = await adminDb.collection('quotes')
      .where('jobId', '==', jobId)
      .where('status', '==', 'submitted')
      .get();

    // Start a batch operation
    const batch = adminDb.batch();

    // Update the approved quote
    const quoteRef = adminDb.collection('quotes').doc(quoteId);
    batch.update(quoteRef, {
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date()
    });

    // Update the job
    const jobRef = adminDb.collection('jobs').doc(jobId);
    batch.update(jobRef, {
      status: 'assigned',
      assignedTo: quoteData.designerId,
      assignedToName: quoteData.designerName,
      approvedAmount: quoteData.quoteAmount,
      updatedAt: new Date()
    });

    // Reject all other quotes for this job
    allQuotesQuery.docs.forEach(doc => {
      if (doc.id !== quoteId) {
        batch.update(doc.ref, {
          status: 'rejected',
          rejectedAt: new Date(),
          updatedAt: new Date()
        });
      }
    });

    await batch.commit();

    // Send notifications using enhanced service
    try {
      // Notify the approved designer
      await NotificationService.notifyQuoteStatusChanged(quoteData, jobData, 'approved');
      console.log('Quote approval notification sent successfully');
      
      // Notify rejected designers
      for (const doc of allQuotesQuery.docs) {
        if (doc.id !== quoteId) {
          const rejectedQuoteData = { id: doc.id, ...doc.data() };
          await NotificationService.notifyQuoteStatusChanged(rejectedQuoteData, jobData, 'rejected');
        }
      }
      console.log('Quote rejection notifications sent successfully');
    } catch (notificationError) {
      console.error('Failed to send quote approval notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Quote approved successfully'
    });

  } catch (error) {
    console.error('Error approving quote:', error);
    res.status(500).json({ success: false, error: 'Failed to approve quote' });
  }
});

// Other routes remain the same...
router.get('/job/:jobId', authenticateToken, getQuotesForJob);
router.get('/user/:userId', authenticateToken, getQuotesByUser);
router.get('/:id', authenticateToken, getQuoteById);
router.delete('/:id', authenticateToken, deleteQuote);

export default router;

// ========================================

// 2. UPDATE: src/routes/jobs.js
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
import { NotificationService } from '../services/NotificationService.js'; // Updated import
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
      // Store original response function
      const originalSend = res.send;
      const originalJson = res.json;
      
      // Override response functions to catch successful job creation
      res.json = function(data) {
        // If job creation was successful (status 201), send notifications
        if (this.statusCode === 201 && data.success) {
          // Extract job data from response
          const jobData = {
            id: data.data.id || res.locals.jobId,
            ...data.data,
            posterId: req.user.userId,
            posterName: req.user.name
          };
          
          // Send notifications asynchronously
          setImmediate(async () => {
            try {
              await NotificationService.notifyJobCreated(jobData);
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

// ========================================

// 3. UPDATE: src/routes/messages.js (Key parts for notifications)

// Add this to your existing messages.js file:

// Update the message sending route (around line 70-120 in your existing file)
router.post('/:conversationId/messages', checkUserBlocked, async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const { text } = req.body;
        const senderId = req.user.userId || req.user.id;

        console.log(`[MESSAGE-ROUTE] Sending message: User ${senderId} (${req.user.name}) in conversation ${conversationId}`);

        // Validation (keep existing validation code)
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.log(`[MESSAGE-ROUTE] Invalid text input:`, text);
            return res.status(400).json({ 
                success: false, 
                message: 'Message text is required and cannot be empty' 
            });
        }

        // Get conversation and validate access (keep existing code)
        const convoRef = adminDb.collection('conversations').doc(conversationId);
        const convoDoc = await convoRef.get();

        if (!convoDoc.exists) {
            console.log(`[MESSAGE-ROUTE] Conversation ${conversationId} not found`);
            return res.status(404).json({ success: false, message: 'Conversation not found.' });
        }

        const conversationData = convoDoc.data();
        
        if (!conversationData.participantIds || !conversationData.participantIds.includes(senderId)) {
            console.log(`[MESSAGE-ROUTE] User ${senderId} not authorized for conversation ${conversationId}`);
            return res.status(403).json({ success: false, message: 'Not authorized to send messages here.' });
        }

        // Create message object with proper timestamp
        const messageTimestamp = new Date();
        const newMessage = {
            text: text.trim(),
            senderId,
            senderName: req.user.name,
            createdAt: messageTimestamp
        };
        
        console.log(`[MESSAGE-ROUTE] Saving message to subcollection...`);
        
        // Save message to subcollection (CRITICAL: This must match where getMessages reads from)
        const messagesCollectionRef = convoRef.collection('messages');
        const messageRef = await messagesCollectionRef.add(newMessage);

        // Update conversation metadata
        await convoRef.update({ 
            lastMessage: text.trim().substring(0, 100),
            updatedAt: messageTimestamp,
            lastMessageBy: req.user.name
        });

        console.log(`[MESSAGE-ROUTE] Message saved with ID: ${messageRef.id}`);

        const messageResponse = { id: messageRef.id, ...newMessage };

        // Send success response FIRST (critical for frontend)
        res.status(201).json({ 
            success: true, 
            message: 'Message sent successfully', 
            data: messageResponse 
        });

        // ENHANCED NOTIFICATION CREATION - After response sent (non-blocking)
        setImmediate(async () => {
            try {
                console.log(`[NOTIFICATION] Creating message notifications for conversation ${conversationId}...`);
                
                // Get participant details for notification
                const participantPromises = conversationData.participantIds.map(id => 
                    adminDb.collection('users').doc(id).get()
                );
                const participantDocs = await Promise.all(participantPromises);
                
                const participants = participantDocs.map(doc => {
                    if (!doc.exists) return { id: doc.id, name: 'Unknown User' };
                    const { name, type } = doc.data();
                    return { id: doc.id, name, type };
                });
                
                console.log(`[NOTIFICATION] Retrieved participants:`, participants.map(p => `${p.name} (${p.id})`));
                
                // Get job title for context
                let jobTitle = 'Unknown Project';
                if (conversationData.jobId) {
                    try {
                        const jobDoc = await adminDb.collection('jobs').doc(conversationData.jobId).get();
                        if (jobDoc.exists) {
                            jobTitle = jobDoc.data().title;
                        }
                    } catch (jobError) {
                        console.warn(`[NOTIFICATION] Could not fetch job title:`, jobError.message);
                    }
                }
                console.log(`[NOTIFICATION] Job title: ${jobTitle}`);

                // Prepare enriched conversation data for notification service
                const enrichedConversationData = {
                    id: conversationId,
                    participants,
                    jobTitle,
                    ...conversationData
                };

                console.log(`[NOTIFICATION] Calling NotificationService.notifyNewMessage...`);
                
                // Create notification using enhanced service
                await NotificationService.notifyNewMessage(messageResponse, enrichedConversationData);
                console.log(`[NOTIFICATION] Message notifications created successfully`);
                
            } catch (notificationError) {
                console.error(`[NOTIFICATION] Failed to create message notifications:`, notificationError);
                // Don't fail the message send if notifications fail - just log the error
            }
        });

    } catch (error) {
        console.error('[MESSAGE-ROUTE] Error in message sending route:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========================================

// 4. UPDATE: src/routes/estimation.js (Key parts for notifications)

// Add this import at the top of your existing estimation.js file:
import { NotificationService } from '../services/NotificationService.js';

// Update the contractor submission route (around line 60-140 in your existing file)
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        console.log('Estimation submission by contractor:', req.user?.email);
        
        const { projectTitle, description, contractorName, contractorEmail } = req.body;
        const files = req.files;

        // Keep your existing validation code...
        if (!projectTitle || !description || !contractorName || !contractorEmail) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required: projectTitle, description, contractorName, contractorEmail'
            });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one file is required'
            });
        }
        
        console.log(`Processing ${files.length} files for estimation`);

        // Keep your existing file upload logic...
        const uploadedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filename = `estimations/${req.user.userId}/${timestamp}-${safeFileName}`;
            
            try {
                console.log(`Uploading file ${i + 1}/${files.length}: ${file.originalname}`);
                const publicUrl = await uploadToFirebaseStorage(file, filename);
                                
                uploadedFiles.push({
                    name: file.originalname,
                    url: publicUrl,
                    size: file.size,
                    type: file.mimetype,
                    uploadedAt: new Date().toISOString(),
                    path: filename
                });
                                
                console.log(`✅ File uploaded successfully: ${file.originalname}`);
            } catch (uploadError) {
                console.error(`❌ Error uploading file ${file.originalname}:`, uploadError);
                return res.status(500).json({
                    success: false,
                    message: `Failed to upload file: ${file.originalname}`,
                    error: uploadError.message
                });
            }
        }

        // Create estimation document
        const estimationData = {
            projectTitle,
            description,
            contractorName,
            contractorEmail,
            contractorId: req.user.userId,
            uploadedFiles,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const estimationRef = await adminDb.collection('estimations').add(estimationData);
        
        console.log(`✅ Estimation created with ID: ${estimationRef.id}`);
        
        // SEND NOTIFICATIONS USING ENHANCED SERVICE
        const fullEstimationData = {
            id: estimationRef.id,
            ...estimationData
        };

        // Send notifications asynchronously
        setImmediate(async () => {
            try {
                await NotificationService.notifyEstimationSubmitted(fullEstimationData);
                console.log('✅ Estimation submission notifications sent successfully');
            } catch (notificationError) {
                console.error('❌ Failed to send estimation submission notifications:', notificationError);
            }
        });
        
        res.status(201).json({
            success: true,
            message: 'Estimation request submitted successfully',
            estimationId: estimationRef.id,
            data: {
                id: estimationRef.id,
                ...estimationData,
                uploadedFiles: uploadedFiles.map(f => ({
                    name: f.name,
                    size: f.size,
                    type: f.type,
                    uploadedAt: f.uploadedAt
                })) // Don't expose URLs in response for security
            }
        });

    } catch (error) {
        console.error('❌ Error submitting estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting estimation request',
            error: error.message
        });
    }
});

// Update the admin result upload route (around line 160-220 in your existing file)
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { amount, notes } = req.body;
        const file = req.file;

        console.log(`Admin ${req.user?.email} uploading result for estimation ${estimationId}`);
        
        // Keep existing validation...
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }
        
        if (file.mimetype !== 'application/pdf') {
            return res.status(400).json({
                success: false,
                message: 'Result file must be a PDF'
            });
        }
        
        // Check if estimation exists
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const existingEstimationData = estimationDoc.data();
        
        // Keep existing file upload logic...
        const timestamp = Date.now();
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `estimation-results/${estimationId}/${timestamp}-${safeFileName}`;
                
        console.log(`Uploading result file: ${file.originalname}`);
        const publicUrl = await uploadToFirebaseStorage(file, filename);
        
        const resultFile = {
            name: file.originalname,
            url: publicUrl,
            size: file.size,
            type: file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.email,
            path: filename
        };
        
        // Update estimation with result
        const updateData = {
            resultFile,
            status: 'completed',
            notes: notes || '',
            completedAt: new Date().toISOString(),
            completedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        if (amount && !isNaN(parseFloat(amount))) {
            updateData.estimatedAmount = parseFloat(amount);
        }
        
        await adminDb.collection('estimations').doc(estimationId).update(updateData);
        
        console.log(`✅ Result uploaded for estimation ${estimationId}`);
        
        // SEND COMPLETION NOTIFICATIONS USING ENHANCED SERVICE
        const completedEstimationData = {
            id: estimationId,
            ...existingEstimationData,
            ...updateData
        };

        // Send notifications asynchronously
        setImmediate(async () => {
            try {
                await NotificationService.notifyEstimationCompleted(completedEstimationData);
                console.log('✅ Estimation completion notifications sent successfully');
            } catch (notificationError) {
                console.error('❌ Failed to send estimation completion notifications:', notificationError);
            }
        });
        
        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            data: {
                resultFile: {
                    name: resultFile.name,
                    size: resultFile.size,
                    type: resultFile.type,
                    uploadedAt: resultFile.uploadedAt
                },
                estimatedAmount: updateData.estimatedAmount
            }
        });

    } catch (error) {
        console.error('❌ Error uploading estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading estimation result',
            error: error.message
        });
    }
});

// ========================================

// 5. UPDATE: Create src/routes/profile.js (if it doesn't exist)

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { NotificationService } from '../services/NotificationService.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get profile completion form fields
router.get('/form-fields', async (req, res) => {
    try {
        const userType = req.user.type;
        
        // Define form fields based on user type
        const contractorFields = [
            { name: 'companyName', label: 'Company Name', type: 'text', required: true, placeholder: 'Your company name' },
            { name: 'businessAddress', label: 'Business Address', type: 'textarea', required: true, placeholder: 'Full business address' },
            { name: 'phoneNumber', label: 'Phone Number', type: 'tel', required: true, placeholder: '+1 (555) 123-4567' },
            { name: 'website', label: 'Website', type: 'url', required: false, placeholder: 'https://yourcompany.com' },
            { name: 'businessLicense', label: 'Business License', type: 'file', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
            { name: 'insuranceProof', label: 'Insurance Proof', type: 'file', required: true, accept: '.pdf,.jpg,.jpeg,.png' },
            { name: 'projectExperience', label: 'Years of Experience', type: 'number', required: true, placeholder: 'e.g., 5' },
            { name: 'specializations', label: 'Specializations', type: 'textarea', required: true, placeholder: 'List your areas of expertise' }
        ];

        const designerFields = [
            { name: 'professionalTitle', label: 'Professional Title', type: 'text', required: true, placeholder: 'e.g., Structural Engineer' },
            { name: 'education', label: 'Education Background', type: 'textarea', required: true, placeholder: 'Your educational qualifications' },
            { name: 'experience', label: 'Years of Experience', type: 'number', required: true, placeholder: 'e.g., 8' },
            { name: 'certifications', label: 'Professional Certifications', type: 'textarea', required: true, placeholder: 'List your professional certifications' },
            { name: 'portfolio', label: 'Portfolio URL', type: 'url', required: false, placeholder: 'https://yourportfolio.com' },
            { name: 'resume', label: 'Resume/CV', type: 'file', required: true, accept: '.pdf' },
            { name: 'certificationDocs', label: 'Certification Documents', type: 'file', required: false, accept: '.pdf,.jpg,.jpeg,.png', multiple: true },
            { name: 'specializations', label: 'Specializations', type: 'select', required: true, options: ['Structural Design', 'Steel Design', 'Concrete Design', 'Seismic Analysis', 'Building Design', 'Bridge Design'] }
        ];

        const fields = userType === 'contractor' ? contractorFields : designerFields;

        res.json({
            success: true,
            data: {
                fields,
                userType
            }
        });

    } catch (error) {
        console.error('Error fetching form fields:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading form fields'
        });
    }
});

// Submit profile for completion/review
router.put('/complete', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'businessLicense', maxCount: 1 },
    { name: 'insuranceProof', maxCount: 1 },
    { name: 'certificationDocs', maxCount: 5 }
]), async (req, res) => {
    try {
        const userId = req.user.userId;
        const files = req.files || {};
        
        // Build profile data from form fields
        const profileData = {
            ...req.body,
            profileStatus: 'pending',
            profileSubmittedAt: new Date().toISOString(),
            profileCompleted: true
        };

        // Handle file uploads
        if (files.resume && files.resume[0]) {
            profileData.resumeUrl = files.resume[0].url || files.resume[0].path;
        }
        if (files.businessLicense && files.businessLicense[0]) {
            profileData.businessLicenseUrl = files.businessLicense[0].url || files.businessLicense[0].path;
        }
        if (files.insuranceProof && files.insuranceProof[0]) {
            profileData.insuranceProofUrl = files.insuranceProof[0].url || files.insuranceProof[0].path;
        }
        if (files.certificationDocs && files.certificationDocs.length > 0) {
            profileData.certificationDocsUrls = files.certificationDocs.map(file => file.url || file.path);
        }

        // Update user profile
        await adminDb.collection('users').doc(userId).update(profileData);

        // Send notification about profile submission
        try {
            await NotificationService.notifyProfileStatusChanged(userId, 'pending');
            console.log('✅ Profile submission notification sent');
        } catch (notificationError) {
            console.error('❌ Failed to send profile submission notification:', notificationError);
        }

        res.json({
            success: true,
            message: 'Profile submitted for review successfully'
        });

    } catch (error) {
        console.error('Error completing profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting profile for review'
        });
    }
});

// Get profile status
router.get('/status', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
        res.json({
            success: true,
            data: {
                profileStatus: userData.profileStatus || 'incomplete',
                canAccess: userData.canAccess !== false,
                profileCompleted: userData.profileCompleted || false,
                rejectionReason: userData.rejectionReason || null
            }
        });
        
    } catch (error) {
        console.error('Error fetching profile status:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile status'
        });
    }
});

export default router;
        
