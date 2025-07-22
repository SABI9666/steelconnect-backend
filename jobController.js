
// Job Controller
const admin = require('firebase-admin');
const db = admin.firestore();

// Get all jobs
const getAllJobs = async (req, res) => {
  try {
    const jobsSnapshot = await db.collection('jobs').get();
    const jobs = [];
    
    jobsSnapshot.forEach(doc => {
      jobs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching jobs',
      error: error.message
    });
  }
};

// Get job by ID
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const jobDoc = await db.collection('jobs').doc(id).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: jobDoc.id,
        ...jobDoc.data()
      }
    });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job',
      error: error.message
    });
  }
};

// Create new job
const createJob = async (req, res) => {
  try {
    const jobData = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const jobRef = await db.collection('jobs').add(jobData);
    
    res.status(201).json({
      success: true,
      data: {
        id: jobRef.id,
        ...jobData
      },
      message: 'Job created successfully'
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating job',
      error: error.message
    });
  }
};

// Update job
const updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('jobs').doc(id).update(updateData);
    
    res.status(200).json({
      success: true,
      message: 'Job updated successfully'
    });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating job',
      error: error.message
    });
  }
};

// Delete job
const deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('jobs').doc(id).delete();
    
    res.status(200).json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting job',
      error: error.message
    });
  }
};

module.exports = {
  getAllJobs,
  getJobById,
  createJob,
  updateJob,
  deleteJob
};