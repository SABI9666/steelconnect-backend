import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Create a new job
export const createJob = async (req, res, next) => {
  try {
    // Validate user authentication first
    if (!req.user || !req.user.userId) {
      console.log('❌ Job creation attempted without proper authentication');
      return res.status(401).json({ 
        success: false, 
        error: 'User authentication required.',
        debug: {
          hasReqUser: !!req.user,
          hasUserId: req.user?.userId || 'missing'
        }
      });
    }

    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = await uploadToFirebase(req.file, 'job-attachments');
    }

    const jobData = {
      title: req.body.title,
      description: req.body.description,
      budget: req.body.budget || '0',
      deadline: req.body.deadline || null,
      link: req.body.link || '',
      skills: (req.body.skills || "").split(',').map(s => s.trim()).filter(Boolean),
      attachment: attachmentUrl,
      posterId: req.user.userId,
      posterName: req.user.name || req.user.email, // Fallback to email if name not available
      posterEmail: req.user.email,
      status: 'open',
      quotesCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    console.log(`📝 Creating job "${req.body.title}" for user: ${req.user.email} (ID: ${req.user.userId})`);

    const jobRef = await adminDb.collection('jobs').add(jobData);
    
    res.status(201).json({ 
      success: true, 
      message: 'Job created successfully.', 
      data: { id: jobRef.id, ...jobData } 
    });
  } catch (error) {
    console.error('❌ Error creating job:', error);
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
    let query = adminDb.collection('jobs')
      .where('status', '==', status)
      .orderBy(sortBy, sortOrder);

    // For pagination, use cursors (startAfter) for efficiency
    if (page > 1) {
        const offset = (parseInt(page) - 1) * numericLimit;
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

    console.log(`📋 Retrieved ${jobs.length} jobs (status: ${status})`);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        currentPage: parseInt(page),
        hasNext: hasNext,
      }
    });

  } catch (error) {
    console.error('❌ Error fetching jobs:', error);
    next(error);
  }
};

// Get a single job by ID
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Job ID is required.' 
      });
    }

    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found.' 
      });
    }

    const jobData = jobDoc.data();
    const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', id).get();

    console.log(`📄 Retrieved job: ${id} (${jobData.title})`);

    res.status(200).json({
      success: true,
      data: {
        id: jobDoc.id,
        ...jobData,
        quotesCount: quotesSnapshot.size
      }
    });

  } catch (error) {
    console.error('❌ Error fetching job by ID:', error);
    next(error);
  }
};

// Update a job
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate user authentication
    if (!req.user || !req.user.userId) {
      console.log('❌ Job update attempted without proper authentication');
      return res.status(401).json({ 
        success: false, 
        message: 'User authentication required.',
        debug: {
          hasReqUser: !!req.user,
          hasUserId: req.user?.userId || 'missing'
        }
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

    // Check if user is authorized to update (must be the poster)
    if (jobData.posterId !== req.user.userId) {
      console.log(`❌ Unauthorized job update attempt: ${req.user.email} (${req.user.userId}) trying to update job ${id} owned by ${jobData.posterId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to update this job',
        debug: {
          jobId: id,
          jobOwner: jobData.posterId,
          requestUser: req.user.userId
        }
      });
    }

    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot update job details after it has been assigned.' 
      });
    }

    console.log(`✏️ Updating job: ${id} (${jobData.title}) by user: ${req.user.email}`);

    await jobRef.update({ 
      ...updates, 
      updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });
    
    const updatedDoc = await jobRef.get();
    res.status(200).json({ 
      success: true, 
      message: 'Job updated successfully', 
      data: { id: updatedDoc.id, ...updatedDoc.data() } 
    });

  } catch (error) {
    console.error('❌ Error updating job:', error);
    next(error);
  }
};

// Get all jobs posted by a specific user
export const getJobsByUserId = async (req, res, next) => {
  try {
    const { userId } = req.params;

    console.log(`🔍 Job request for userId: "${userId}" from user: ${req.user?.email || 'unknown'}`);

    // Enhanced validation for undefined/null/invalid userId
    if (!userId || userId === 'undefined' || userId === 'null') {
      console.log('❌ Invalid userId in URL path:', userId);
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid user ID provided in URL. Please check your request.',
        code: 'INVALID_USER_ID',
        debug: {
          receivedUserId: userId,
          userFromToken: req.user?.userId,
          userEmail: req.user?.email,
          suggestion: 'The URL should be /api/jobs/user/{valid-user-id}, not /api/jobs/user/undefined'
        }
      });
    }

    // Validate user authentication (this should be handled by middleware)
    if (!req.user || !req.user.userId) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required. Please login and try again.',
        code: 'NO_AUTH_DATA',
        debug: {
          hasReqUser: !!req.user,
          hasUserId: req.user?.userId || 'missing'
        }
      });
    }

    // Authorization check
    if (req.user.userId !== userId) {
      console.log(`❌ Authorization failed: User ${req.user.email} (${req.user.userId}) trying to access jobs for ${userId}`);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. You can only view your own jobs.',
        code: 'ACCESS_DENIED',
        debug: {
          requestedUserId: userId,
          authenticatedUserId: req.user.userId,
          userEmail: req.user.email,
          suggestion: 'Make sure you are requesting your own user ID'
        }
      });
    }

    console.log(`✅ Authorized request: Fetching jobs for user ${req.user.email} (ID: ${userId})`);

    const jobsSnapshot = await adminDb.collection('jobs')
      .where('posterId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const jobs = jobsSnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    }));

    console.log(`📋 Successfully found ${jobs.length} jobs for user: ${req.user.email}`);

    res.status(200).json({ 
      success: true, 
      data: jobs,
      meta: {
        userId: userId,
        jobCount: jobs.length,
        userEmail: req.user.email,
        message: `Found ${jobs.length} jobs`
      }
    });

  } catch (error) {
    console.error('❌ Error in getJobsByUserId:', error);
    console.error('Request details:', {
      url: req.originalUrl,
      method: req.method,
      userId: req.params.userId,
      userFromToken: req.user?.userId,
      userEmail: req.user?.email,
      error: error.message
    });
    next(error);
  }
};

// Delete a job and all its related data (quotes, conversations)
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate user authentication
    if (!req.user || !req.user.userId) {
      console.log('❌ Job deletion attempted without proper authentication');
      return res.status(401).json({ 
        success: false, 
        message: 'User authentication required.',
        debug: {
          hasReqUser: !!req.user,
          hasUserId: req.user?.userId || 'missing'
        }
      });
    }

    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found.' 
      });
    }

    const jobData = jobDoc.data();

    // Authorization: only the job poster can delete
    if (jobData.posterId !== req.user.userId) {
      console.log(`❌ Unauthorized job deletion attempt: ${req.user.email} (${req.user.userId}) trying to delete job ${id} owned by ${jobData.posterId}`);
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to delete this job.',
        debug: {
          jobId: id,
          jobOwner: jobData.posterId,
          requestUser: req.user.userId
        }
      });
    }

    // To prevent deleting work in progress, check status
    if (jobData.status === 'assigned' || jobData.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete a job that has already been assigned.' 
      });
    }

    console.log(`🗑️ Deleting job: ${id} (${jobData.title}) by user: ${req.user.email}`);

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

    console.log(`✅ Successfully deleted job: ${id} and all related data`);

    res.status(200).json({ 
      success: true, 
      message: 'Job and all related data deleted successfully.' 
    });

  } catch (error) {
    console.error('❌ Error deleting job:', error);
    next(error);
  }
};
