import { adminDb, admin } from '../config/firebase.js';
import { uploadMultipleFilesToFirebase } from '../middleware/upload.js';

// Create a new job
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
        
        // FIXED: Properly map uploaded files to attachment structure
        attachments = uploadedFiles.map(file => ({
          name: file.name || file.originalname || 'Unknown File',
          url: file.url || file.downloadURL || '',
          uploadedAt: file.uploadedAt || new Date().toISOString(),
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
      attachments: attachments,
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
      createdAt: new Date().toISOString()
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
    let query = adminDb.collection('jobs').where('status', '==', status).orderBy(sortBy, sortOrder);

    // For pagination, use cursors (startAfter) for efficiency
    if (page > 1) {
        const offset = (parseInt(page) - 1) * numericLimit;
        // Get the last document of the previous page to use as a cursor
        const prevPageSnapshot = await query.limit(offset).get();
        if (!prevPageSnapshot.empty) {
            const lastVisibleDoc = prevPageSnapshot.docs[prevPageSnapshot.docs.length - 1];
            query = query.startAfter(lastVisibleDoc);
        }
    }

    // Fetch one extra document to determine if there is a next page
    const snapshot = await query.limit(numericLimit + 1).get();
    
    let jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Check if there are more jobs to load
    const hasNext = jobs.length > numericLimit;
    if (hasNext) {
      jobs.pop(); // Remove the extra document from the response
    }

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        currentPage: parseInt(page),
        hasNext: hasNext,
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get a single job by ID
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    const jobData = jobDoc.data();

    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();

    res.status(200).json({
      success: true,
      data: {
        id: jobDoc.id,
        ...jobData,
        quotesCount: quotesSnapshot.size
      }
    });

  } catch (error) {
    next(error);
  }
};

// Update a job
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const jobData = jobDoc.data();

    // Check if user is authorized to update (must be the poster)
    if (jobData.posterId !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this job' });
    }

    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot update job details after it has been assigned.' });
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
          name: file.name || file.originalname || 'Unknown File',
          url: file.url || file.downloadURL || '',
          uploadedAt: file.uploadedAt || new Date().toISOString(),
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

    await jobRef.update({ ...updates, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const updatedDoc = await jobRef.get();
    res.status(200).json({ success: true, message: 'Job updated successfully', data: { id: updatedDoc.id, ...updatedDoc.data() } });

  } catch (error) {
    next(error);
  }
};

// Get all jobs posted by a specific user
export const getJobsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (req.user.userId !== userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view these jobs.' });
    }
    const jobsSnapshot = await adminDb.collection('jobs').where('posterId', '==', userId).orderBy('createdAt', 'desc').get();
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
};

// Delete a job and all its related data (quotes, conversations)
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    const jobData = jobDoc.data();

    // Authorization: only the job poster can delete
    if (jobData.posterId !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this job.' });
    }

    // To prevent deleting work in progress, check status
    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot delete a job that has already been assigned.' });
    }

    const batch = adminDb.batch();

    // 1. Find and delete all quotes for this job
    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();
    quotesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // 2. Find and delete all conversations (and their sub-collections of messages)
    const conversationsSnapshot = await adminDb.collection('conversations').where('jobId', '==', id).get();
    for (const convoDoc of conversationsSnapshot.docs) {
        const messagesSnapshot = await convoDoc.ref.collection('messages').get();
        messagesSnapshot.docs.forEach(msgDoc => batch.delete(msgDoc.ref));
        batch.delete(convoDoc.ref);
    }
    
    // 3. Delete the job itself
    batch.delete(jobRef);
    
    // Commit all deletions in one atomic operation
    await batch.commit();

    res.status(200).json({ success: true, message: 'Job and all related data deleted successfully.' });
  } catch (error) {
    next(error);
  }
};
