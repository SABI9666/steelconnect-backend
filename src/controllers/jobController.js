import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Create a new job
export const createJob = async (req, res, next) => {
  try {
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
      posterId: req.user.userId, // Storing the job creator's ID
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

// Get all jobs with efficient pagination
export const getAllJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 6, // Default limit matching the frontend request
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
        hasNext: hasNext, // Let the frontend know if there's a next page
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