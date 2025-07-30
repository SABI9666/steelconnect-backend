import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Get all jobs (public)
export const getAllJobs = async (req, res, next) => {
  try {
    const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json({ success: true, data: jobs });
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

// Get a single job by its ID
export const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobDoc = await adminDb.collection('jobs').doc(id).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    res.status(200).json({ success: true, data: { id: jobDoc.id, ...jobDoc.data() }});
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
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }
    if (jobDoc.data().posterId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'You are not authorized to delete this job.' });
    }
    await jobRef.delete();
    res.status(200).json({ success: true, message: 'Job deleted successfully.' });
  } catch (error) {
    next(error);
  }
};