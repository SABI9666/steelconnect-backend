// jobController.js - Fixed version with multiple file upload support
import { adminDb, admin } from '../config/firebase.js';
import { uploadMultipleFilesToFirebase } from '../middleware/upload.js';

// Create a new job with multiple file attachments
export const createJob = async (req, res, next) => {
  try {
    console.log('Creating job with data:', req.body);
    console.log('Files received:', req.files?.length || 0);

    let attachments = [];
    
    // Handle multiple file uploads
    if (req.files && req.files.length > 0) {
      try {
        console.log('Uploading files to Firebase...');
        const uploadedFiles = await uploadMultipleFilesToFirebase(
          req.files, 
          'job-attachments', 
          req.user.userId
        );
        
        // Format attachments with proper structure
        attachments = uploadedFiles.map(file => ({
          name: file.originalName || file.name,
          url: file.downloadURL || file.url,
          uploadedAt: new Date().toISOString(),
          size: file.size || 0
        }));
        
        console.log('Files uploaded successfully:', attachments.length);
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to upload files: ' + uploadError.message 
        });
      }
    }

    // Parse skills properly
    let skills = [];
    if (req.body.skills) {
      if (typeof req.body.skills === 'string') {
        skills = req.body.skills.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(req.body.skills)) {
        skills = req.body.skills.filter(Boolean);
      }
    }

    const jobData = {
      title: req.body.title?.trim() || '',
      description: req.body.description?.trim() || '',
      budget: req.body.budget?.trim() || '0',
      deadline: req.body.deadline || null,
      link: req.body.link?.trim() || '',
      skills: skills,
      attachments: attachments, // Changed from single 'attachment' to multiple 'attachments'
      posterId: req.user.userId,
      posterName: req.user.name || 'Unknown User',
      status: 'open',
      quotesCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Validate required fields
    if (!jobData.title || !jobData.description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title and description are required' 
      });
    }

    console.log('Saving job to database...');
    const jobRef = await adminDb.collection('jobs').add(jobData);
    
    // Store job ID for notifications middleware
    res.locals.jobId = jobRef.id;
    
    const responseData = {
      id: jobRef.id,
      ...jobData,
      createdAt: new Date().toISOString() // Convert timestamp for response
    };

    console.log('Job created successfully:', jobRef.id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Job created successfully.', 
      data: responseData 
    });

  } catch (error) {
    console.error('Error in createJob:', error);
    next(error);
  }
};

// Update job with file attachment support
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = jobDoc.data();

    // Check authorization
    if (jobData.posterId !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to update this job' 
      });
    }

    // Prevent updates to assigned/completed jobs
    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot update job details after it has been assigned.' 
      });
    }

    // Parse skills if provided
    if (updates.skills && typeof updates.skills === 'string') {
      updates.skills = updates.skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Handle file uploads if present
    if (req.files && req.files.length > 0) {
      try {
        const uploadedFiles = await uploadMultipleFilesToFirebase(
          req.files, 
          'job-attachments', 
          req.user.userId
        );
        
        const newAttachments = uploadedFiles.map(file => ({
          name: file.originalName || file.name,
          url: file.downloadURL || file.url,
          uploadedAt: new Date().toISOString(),
          size: file.size || 0
        }));
        
        // Merge with existing attachments
        updates.attachments = [...(jobData.attachments || []), ...newAttachments];
      } catch (uploadError) {
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to upload files: ' + uploadError.message 
        });
      }
    }

    const updateData = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await jobRef.update(updateData);
    const updatedDoc = await jobRef.get();
    
    res.status(200).json({ 
      success: true, 
      message: 'Job updated successfully', 
      data: { id: updatedDoc.id, ...updatedDoc.data() } 
    });

  } catch (error) {
    console.error('Error updating job:', error);
    next(error);
  }
};

// Get all jobs with efficient pagination
export const getAllJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 6,
      status = 'open',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const numericLimit = parseInt(limit);
    const offset = (parseInt(page) - 1) * numericLimit;

    let query = adminDb.collection('jobs')
      .where('status', '==', status)
      .orderBy(sortBy, sortOrder);

    // Get total count for pagination
    const totalSnapshot = await query.get();
    const totalCount = totalSnapshot.size;

    // Apply pagination
    const snapshot = await query.limit(numericLimit).offset(offset).get();
    
    const jobs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Ensure attachments field exists and is properly formatted
        attachments: data.attachments || [],
        // Convert Firestore timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
    });

    const hasNext = (offset + numericLimit) < totalCount;

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        currentPage: parseInt(page),
        totalCount,
        hasNext,
        totalPages: Math.ceil(totalCount / numericLimit)
      }
    });

  } catch (error) {
    console.error('Error in getAllJobs:', error);
    next(error);
  }
};

// Get a single job by ID
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found.' });
    }

    const jobData = jobDoc.data();

    // Get quotes count
    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();

    const responseData = {
      id: jobDoc.id,
      ...jobData,
      attachments: jobData.attachments || [],
      quotesCount: quotesSnapshot.size,
      createdAt: jobData.createdAt?.toDate?.()?.toISOString() || jobData.createdAt,
      updatedAt: jobData.updatedAt?.toDate?.()?.toISOString() || jobData.updatedAt
    };

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Error in getJobById:', error);
    next(error);
  }
};

// Get all jobs posted by a specific user
export const getJobsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Authorization check
    if (req.user.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to view these jobs.' 
      });
    }

    const jobsSnapshot = await adminDb.collection('jobs')
      .where('posterId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const jobs = jobsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        attachments: data.attachments || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      };
    });

    res.status(200).json({ success: true, data: jobs });
    
  } catch (error) {
    console.error('Error in getJobsByUserId:', error);
    next(error);
  }
};

// Delete a job and all its related data
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, error: 'Job not found.' });
    }

    const jobData = jobDoc.data();

    // Authorization check
    if (jobData.posterId !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'You are not authorized to delete this job.' 
      });
    }

    // Prevent deletion of assigned/completed jobs
    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete a job that has already been assigned.' 
      });
    }

    const batch = adminDb.batch();

    // Delete all quotes for this job
    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();
    quotesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Delete all conversations and their messages
    const conversationsSnapshot = await adminDb.collection('conversations').where('jobId', '==', id).get();
    for (const convoDoc of conversationsSnapshot.docs) {
      const messagesSnapshot = await convoDoc.ref.collection('messages').get();
      messagesSnapshot.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
      batch.delete(convoDoc.ref);
    }
    
    // Delete the job itself
    batch.delete(jobRef);
    
    // Commit all deletions
    await batch.commit();

    res.status(200).json({ 
      success: true, 
      message: 'Job and all related data deleted successfully.' 
    });
    
  } catch (error) {
    console.error('Error in deleteJob:', error);
    next(error);
  }
};
