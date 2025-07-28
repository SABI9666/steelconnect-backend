// src/controllers/jobController.js (Corrected)
import { adminDb, admin } from '../config/firebase.js';

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

// Get a single job by its ID (public)
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

// Create a new job (protected, for contractors)
export const createJob = async (req, res, next) => {
  try {
    // Assuming validation middleware has already run
    const jobData = {
      ...req.body,
      posterId: req.user.id, // Set the poster ID from the authenticated user
      posterName: req.user.name,
      status: 'open',
      quotesCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const jobRef = await adminDb.collection('jobs').add(jobData);
    
    res.status(201).json({
      success: true,
      message: 'Job created successfully.',
      data: { id: jobRef.id, ...jobData }
    });
  } catch (error) {
    next(error);
  }
};

// Update an existing job (protected)
export const updateJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    // Authorization check: only the user who posted the job can update it
    if (jobDoc.data().posterId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'You are not authorized to update this job.' });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await jobRef.update(updateData);
    
    res.status(200).json({ success: true, message: 'Job updated successfully.' });
  } catch (error) {
    next(error);
  }
};

// Delete a job (protected)
export const deleteJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRef = adminDb.collection('jobs').doc(id);
    const jobDoc = await jobRef.get();

     if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    // Authorization check: only the user who posted the job or an admin can delete it
    if (jobDoc.data().posterId !== req.user.id && req.user.type !== 'admin') {
       return res.status(403).json({ success: false, message: 'You are not authorized to delete this job.' });
    }

    // In a real app, you would also delete associated quotes and files from storage
    await jobRef.delete();
    
    res.status(200).json({ success: true, message: 'Job deleted successfully.' });
  } catch (error) {
    next(error);
  }
};