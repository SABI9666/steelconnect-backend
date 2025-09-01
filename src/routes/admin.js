import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import multer from 'multer';

const router = express.Router();

// Configure multer for result file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for result files
  fileFilter: (req, file, cb) => {
    // Allow any file type for result uploads
    cb(null, true);
  }
});

// Middleware to check admin access
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.type === 'admin' || req.user.role === 'admin')) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required.' 
    });
  }
};

// Apply auth and admin check to all routes
router.use(authenticateToken);
router.use(isAdmin);

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Admin routes are working!', 
    timestamp: new Date().toISOString(),
    user: req.user,
    availableRoutes: [
      'GET /test',
      'GET /dashboard',
      'GET /users',
      'PUT /users/:id/status',
      'DELETE /users/:id',
      'GET /quotes',
      'GET /messages',
      'GET /jobs',
      'GET /estimations'
    ]
  });
});

// Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    // Get counts from all collections
    const [usersSnapshot, quotesSnapshot, messagesSnapshot, jobsSnapshot, estimationsSnapshot] = await Promise.all([
      adminDb.collection('users').where('type', '!=', 'admin').get(),
      adminDb.collection('quotes').get(),
      adminDb.collection('messages').get(),
      adminDb.collection('jobs').get(),
      adminDb.collection('estimations').get()
    ]);

    const stats = {
      totalUsers: usersSnapshot.size,
      totalQuotes: quotesSnapshot.size,
      totalMessages: messagesSnapshot.size,
      totalJobs: jobsSnapshot.size,
      totalEstimations: estimationsSnapshot.size,
      lastUpdated: new Date().toISOString()
    };

    // Get recent activity counts
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [recentUsersSnapshot, recentJobsSnapshot] = await Promise.all([
        adminDb.collection('users').where('createdAt', '>=', oneDayAgo).get(),
        adminDb.collection('jobs').where('createdAt', '>=', oneWeekAgo).get()
      ]);

      stats.recentUsers = recentUsersSnapshot.size;
      stats.recentJobs = recentJobsSnapshot.size;
    } catch (error) {
      console.warn('Could not fetch recent activity stats:', error.message);
      stats.recentUsers = 0;
      stats.recentJobs = 0;
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch dashboard statistics.' 
    });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('users')
      .where('type', 'in', ['contractor', 'designer'])
      .orderBy('createdAt', 'desc')
      .get();

    const users = snapshot.docs.map(doc => {
      const userData = doc.data();
      // Remove password from response
      const { password, ...userWithoutPassword } = userData;
      return {
        id: doc.id,
        ...userWithoutPassword
      };
    });

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch users.' 
    });
  }
});

// Update user status
router.put('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status. Must be active, inactive, or suspended.' 
      });
    }

    await adminDb.collection('users').doc(id).update({
      isActive: status === 'active',
      status: status,
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'User status updated successfully.'
    });

  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update user status.' 
    });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userDoc = await adminDb.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found.' 
      });
    }

    // Delete user
    await adminDb.collection('users').doc(id).delete();

    res.json({
      success: true,
      message: 'User deleted successfully.'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete user.' 
    });
  }
});

// Get all quotes
router.get('/quotes', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('quotes')
      .orderBy('createdAt', 'desc')
      .get();

    const quotes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      quotes
    });

  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch quotes.' 
    });
  }
});

// Get all messages
router.get('/messages', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(100) // Limit for performance
      .get();

    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      messages
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch messages.' 
    });
  }
});

// Get all jobs
router.get('/jobs', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('jobs')
      .orderBy('createdAt', 'desc')
      .get();

    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      jobs
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch jobs.' 
    });
  }
});

// Get all estimations
router.get('/estimations', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('estimations')
      .orderBy('createdAt', 'desc')
      .get();

    const estimations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      estimations
    });

  } catch (error) {
    console.error('Error fetching estimations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch estimations.' 
    });
  }
});

// Get all estimations
router.get('/estimations', async (req, res) => {
  try {
    const snapshot = await adminDb.collection('estimations')
      .orderBy('createdAt', 'desc')
      .get();

    const estimations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      estimations
    });

  } catch (error) {
    console.error('Error fetching estimations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch estimations.' 
    });
  }
});

// Get single estimation details for admin
router.get('/estimations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    const estimation = doc.data();

    res.json({
      success: true,
      estimation: {
        id: doc.id,
        ...estimation
      }
    });

  } catch (error) {
    console.error('Error fetching estimation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch estimation.' 
    });
  }
});

// Download contractor's uploaded files (Admin only)
router.get('/estimations/:id/download-files', async (req, res) => {
  try {
    const { id } = req.params;
    
    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    const estimation = doc.data();
    
    if (!estimation.uploadedFiles || estimation.uploadedFiles.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No files found for this estimation.' 
      });
    }

    // In production, you would generate actual download URLs from your file storage service
    const downloadableFiles = estimation.uploadedFiles.map(file => ({
      ...file,
      downloadUrl: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/estimations/${id}/${file.name}`
    }));

    res.json({
      success: true,
      files: downloadableFiles
    });

  } catch (error) {
    console.error('Error getting download files:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get download files.' 
    });
  }
});

// Update estimation status and upload result file
router.put('/estimations/:id/complete', upload.single('resultFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedAmount, notes } = req.body;
    const resultFile = req.file;

    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    const updateData = {
      status: 'completed',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    if (estimatedAmount) {
      updateData.estimatedAmount = parseFloat(estimatedAmount);
    }

    if (notes) {
      updateData.adminNotes = notes;
    }

    if (resultFile) {
      // In production, upload to cloud storage and get URL
      updateData.resultFile = {
        name: resultFile.originalname,
        size: resultFile.size,
        type: resultFile.mimetype,
        uploadedAt: new Date().toISOString(),
        url: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/results/${id}/${resultFile.originalname}`
      };
    }

    await adminDb.collection('estimations').doc(id).update(updateData);

    res.json({
      success: true,
      message: 'Estimation completed successfully.',
      data: updateData
    });

  } catch (error) {
    console.error('Error completing estimation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete estimation.' 
    });
  }
});

export default router;
