export const searchJobs = async (req, res, next) => {
  try {
    const {
      q: searchTerm,
      skills,
      minBudget,
      maxBudget,
      page = 1,
      limit = 10
    } = req.query;

    if (!searchTerm && !skills) {
      return res.status(400).json({
        success: false,
        message: 'Search term or skills filter is required'
      });
    }

    let query = adminDb.collection('jobs')
      .where('status', '==', 'open');

    // Apply budget filters
    if (minBudget) {
      const minBudgetNum = parseFloat(minBudget);
      if (!isNaN(minBudgetNum)) {
        query = query.where('budget', '>=', minBudgetNum.toString());
      }
    }

    if (maxBudget) {
      const maxBudgetNum = parseFloat(maxBudget);
      if (!isNaN(maxBudgetNum)) {
        query = query.where('budget', '<=', maxBudgetNum.toString());
      }
    }

    // Get all matching documents
    const snapshot = await query.get();
    
    let jobs = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      let matches = false;

      // Text search in title and description
      if (searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        const titleMatch = data.title?.toLowerCase().includes(searchTermLower);
        const descriptionMatch = data.description?.toLowerCase().includes(searchTermLower);
        matches = titleMatch || descriptionMatch;
      }

      // Skills filter
      if (skills && data.skills && Array.isArray(data.skills)) {
        const searchSkills = skills.toLowerCase().split(',').map(s => s.trim());
        const jobSkills = data.skills.map(skill => skill.toLowerCase());
        const skillMatch = searchSkills.some(searchSkill => 
          jobSkills.some(jobSkill => jobSkill.includes(searchSkill))
        );
        matches = matches || skillMatch;
      }
      
      if (matches || (!searchTerm && skills)) {
        jobs.import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Create a new job
export const createJob = async (req, res, next) => {
  try {
    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = await uploadToFirebase(req.file, 'job-attachments');
    }

    // Parse and structure the data correctly
    const jobData = {
      title: req.body.title,
      description: req.body.description,
      budget: req.body.budget || '0',
      deadline: req.body.deadline || null,
      link: req.body.link || '',
      // Convert the comma-separated skills string into an array
      skills: (req.body.skills || "").split(',').map(s => s.trim()).filter(Boolean),
      attachment: attachmentUrl,
      posterId: req.user.id,
      posterName: req.user.name,
      status: 'open',
      quotesCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const jobRef = await adminDb.collection('jobs').add(jobData);
    res.status(201).json({ success: true, message: 'Job created successfully.', data: { id: jobRef.id, ...jobData } });
  } catch (error) {
    next(error);
  }
};

// Get all jobs with pagination and filters
export const getAllJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status = 'open',
      minBudget,
      maxBudget,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let query = adminDb.collection('jobs');

    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }
    
    if (status) {
      query = query.where('status', '==', status);
    }

    if (minBudget) {
      query = query.where('budget', '>=', parseFloat(minBudget));
    }

    if (maxBudget) {
      query = query.where('budget', '<=', parseFloat(maxBudget));
    }

    // Apply sorting
    query = query.orderBy(sortBy, sortOrder);

    // Get all documents first (for pagination)
    const allSnapshot = await query.get();
    const totalJobs = allSnapshot.size;

    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedQuery = query.limit(parseInt(limit)).offset(offset);
    const snapshot = await paginatedQuery.get();
    
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalJobs / parseInt(limit)),
        totalJobs,
        hasNext: offset + jobs.length < totalJobs,
        hasPrev: parseInt(page) > 1
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

    // Get quotes count
    const quotesSnapshot = await adminDb.collection('quotes')
      .where('jobId', '==', id)
      .get();

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
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const jobData = jobDoc.data();

    // Check if user is authorized to update
    if (jobData.posterId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this job'
      });
    }

    // Prevent updates to certain fields based on job status
    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      const restrictedFields = ['budget', 'deadline', 'skills'];
      const hasRestrictedUpdates = restrictedFields.some(field => field in updates);
      
      if (hasRestrictedUpdates) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update critical job details after assignment'
        });
      }
    }

    // Handle file upload if present
    let attachmentUrl = jobData.attachment;
    if (req.file) {
      attachmentUrl = await uploadToFirebase(req.file, 'job-attachments');
    }

    // Prepare update data
    const updateData = {
      ...updates,
      attachment: attachmentUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Process skills if provided
    if (updates.skills && typeof updates.skills === 'string') {
      updateData.skills = updates.skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Remove fields that shouldn't be updated
    delete updateData.posterId;
    delete updateData.posterName;
    delete updateData.createdAt;
    delete updateData.quotesCount;

    await jobRef.update(updateData);

    // Get updated job data
    const updatedDoc = await jobRef.get();

    res.status(200).json({
      success: true,
      message: 'Job updated successfully',
      data: {
        id: updatedDoc.id,
        ...updatedDoc.data()
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get jobs for a specific user
export const getJobsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view these jobs.' });
    }
    const jobsSnapshot = await adminDb.collection('jobs').where('posterId', '==', userId).orderBy('createdAt', 'desc').get();
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    next(error);
  }
};

// Update job status
export const updateJobStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, assignedTo } = req.body;

    const validStatuses = ['open', 'assigned', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const jobData = jobDoc.data();

    // Check authorization
    if (jobData.posterId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this job status'
      });
    }

    const updateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'assigned' && assignedTo) {
      updateData.assignedTo = assignedTo;
      updateData.assignedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (status === 'completed') {
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await jobRef.update(updateData);

    res.status(200).json({
      success: true,
      message: `Job status updated to ${status}`,
      status
    });

  } catch (error) {
    next(error);
  }
};

// Delete a job
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;

    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    const jobData = jobDoc.data();

    // Check if user is authorized to delete (only the job poster can delete)
    if (jobData.posterId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this job.'
      });
    }

    // Check if job has approved quotes (prevent deletion if work has started)
    if (jobData.status === 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a job that has been assigned to a designer. Please contact support if you need to cancel this job.'
      });
    }

    // Get all quotes for this job
    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();

    if (!quotesSnapshot.empty) {
      // Check if any quotes are approved
      const hasApprovedQuotes = quotesSnapshot.docs.some(doc => doc.data().status === 'approved');
      
      if (hasApprovedQuotes) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a job with approved quotes.'
        });
      }

      // Delete all quotes for this job (batch operation for efficiency)
      const batch = adminDb.batch();
      quotesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`Deleted ${quotesSnapshot.docs.length} quotes for job ${id}`);
    }

    // Delete any conversations related to this job
    const conversationsSnapshot = await adminDb.collection('conversations').where('jobId', '==', id).get();
    
    if (!conversationsSnapshot.empty) {
      const convoBatch = adminDb.batch();
      
      // Delete conversations and their messages
      for (const convoDoc of conversationsSnapshot.docs) {
        const messagesSnapshot = await convoDoc.ref.collection('messages').get();
        messagesSnapshot.docs.forEach(messageDoc => {
          convoBatch.delete(messageDoc.ref);
        });
        convoBatch.delete(convoDoc.ref);
      }
      
      await convoBatch.commit();
      console.log(`Deleted ${conversationsSnapshot.docs.length} conversations for job ${id}`);
    }

    // Finally, delete the job itself
    await jobRef.delete();

    res.status(200).json({
      success: true,
      message: 'Job and all related data deleted successfully.',
      deletedQuotes: quotesSnapshot.docs.length,
      deletedConversations: conversationsSnapshot.docs.length
    });

  } catch (error) {
    next(error);
  }
};

// Search jobs
export const searchJobs = async (req, res, next) => {
  try {
    const {
      q: searchTerm,
      category,
      minBudget,
      maxBudget,
      page = 1,
      limit = 10
    } = req.query;

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    let query = adminDb.collection('jobs')
      .where('status', '==', 'open');

    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }

    if (minBudget) {
      query = query.where('budget', '>=', parseFloat(minBudget));
    }

    if (maxBudget) {
      query = query.where('budget', '<=', parseFloat(maxBudget));
    }

    // Note: Firestore doesn't support full-text search natively
    // This is a basic implementation. For production, consider using Algolia or Elasticsearch
    const snapshot = await query.get();
    
    const searchTermLower = searchTerm.toLowerCase();
    const jobs = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const titleMatch = data.title.toLowerCase().includes(searchTermLower);
      const descriptionMatch = data.description.toLowerCase().includes(searchTermLower);
      const categoryMatch = data.category.toLowerCase().includes(searchTermLower);
      
      if (titleMatch || descriptionMatch || categoryMatch) {
        jobs.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate()
        });
      }
    });

    // Apply pagination to filtered results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedJobs = jobs.slice(startIndex, endIndex);

    res.json({
      success: true,
      jobs: paginatedJobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(jobs.length / parseInt(limit)),
        totalJobs: jobs.length,
        hasNext: endIndex < jobs.length,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error searching jobs:', error);
    next(error);
  }
};