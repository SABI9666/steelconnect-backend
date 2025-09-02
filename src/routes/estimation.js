import express from 'express';
import { authenticateToken, isContractor } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.dwg', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DWG, DOC, DOCX, and images are allowed.'));
    }
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Estimation routes are working!', 
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'GET /test',
      'POST /contractor/submit',
      'GET /contractor/:email',
      'GET /:id',
      'GET /:id/files',
      'GET /:id/result',
      'POST /:id/result',
      'DELETE /:id',
      'PATCH /:id/status'
    ]
  });
});

// Submit estimation request (Contractor only)
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
  try {
    const { projectTitle, description, contractorName, contractorEmail } = req.body;
    const files = req.files;

    if (!projectTitle || !description || !files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Project title, description, and at least one file are required.' 
      });
    }

    // Create estimation document
    const estimationData = {
      projectTitle,
      description,
      contractorName: contractorName || req.user.name,
      contractorEmail: contractorEmail || req.user.email,
      contractorId: req.user.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedFiles: files.map(file => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        uploadedAt: new Date().toISOString(),
        // In a real implementation, you'd upload to cloud storage and get URL
        url: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/estimations/files/${file.originalname}`
      }))
    };

    // Save to database
    const docRef = await adminDb.collection('estimations').add(estimationData);

    res.status(201).json({
      success: true,
      message: 'Estimation request submitted successfully!',
      data: {
        id: docRef.id,
        ...estimationData
      }
    });

  } catch (error) {
    console.error('Error submitting estimation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit estimation request.' 
    });
  }
});

// Get contractor's estimations
router.get('/contractor/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    // Verify user can access this data
    if (req.user.email !== email && req.user.type !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied.' 
      });
    }

    const snapshot = await adminDb.collection('estimations')
      .where('contractorEmail', '==', email)
      .orderBy('createdAt', 'desc')
      .get();

    const estimations = snapshot.docs.map(doc => ({
      _id: doc.id,
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

// Get single estimation details
router.get('/:id', authenticateToken, async (req, res) => {
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
    
    // Check access permissions
    if (estimation.contractorId !== req.user.id && req.user.type !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied.' 
      });
    }

    res.json({
      success: true,
      estimation: {
        id: doc.id,
        _id: doc.id,
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

// Get estimation files
router.get('/:id/files', authenticateToken, async (req, res) => {
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
    
    // Check access permissions - admin can access all, contractors only their own
    if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied.' 
      });
    }

    res.json({
      success: true,
      files: estimation.uploadedFiles || []
    });

  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch files.' 
    });
  }
});

// Get estimation result
router.get('/:id/result', authenticateToken, async (req, res) => {
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
    
    // Check access permissions - admin can access all, contractors only their own
    if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied.' 
      });
    }

    if (!estimation.resultFile) {
      return res.status(404).json({ 
        success: false, 
        error: 'Result file not available yet.' 
      });
    }

    res.json({
      success: true,
      resultFile: estimation.resultFile
    });

  } catch (error) {
    console.error('Error fetching result:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch result.' 
    });
  }
});

// Admin route to upload estimation result
router.post('/:id/result', authenticateToken, upload.single('resultFile'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const { id } = req.params;
    const { estimatedAmount, notes, amount } = req.body;
    const resultFile = req.file;

    if (!resultFile) {
      return res.status(400).json({ 
        success: false, 
        error: 'Result file is required.' 
      });
    }

    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    // In production, upload file to cloud storage and get URL
    const resultFileData = {
      name: resultFile.originalname,
      size: resultFile.size,
      type: resultFile.mimetype,
      uploadedAt: new Date().toISOString(),
      url: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/results/${id}/${resultFile.originalname}`
    };

    const updateData = {
      status: 'completed',
      resultFile: resultFileData,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };

    if (estimatedAmount || amount) {
      updateData.estimatedAmount = parseFloat(estimatedAmount || amount);
    }

    if (notes) {
      updateData.adminNotes = notes;
    }

    await adminDb.collection('estimations').doc(id).update(updateData);

    res.json({
      success: true,
      message: 'Estimation result uploaded successfully.',
      resultFile: resultFileData
    });

  } catch (error) {
    console.error('Error uploading result:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload result.' 
    });
  }
});

// Update estimation status (Admin only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid status value.' 
      });
    }

    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    const updateData = {
      status: status,
      updatedAt: new Date().toISOString()
    };

    if (notes) {
      updateData.adminNotes = notes;
    }

    if (status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    await adminDb.collection('estimations').doc(id).update(updateData);

    res.json({
      success: true,
      message: 'Estimation status updated successfully.'
    });

  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update status.' 
    });
  }
});

// Delete estimation (only pending ones)
router.delete('/:id', authenticateToken, async (req, res) => {
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
    
    // Check access permissions
    if (estimation.contractorId !== req.user.id && req.user.type !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied.' 
      });
    }

    // Only allow deletion of pending estimations
    if (estimation.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        error: 'Can only delete pending estimations.' 
      });
    }

    await adminDb.collection('estimations').doc(id).delete();

    res.json({
      success: true,
      message: 'Estimation deleted successfully.'
    });

  } catch (error) {
    console.error('Error deleting estimation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete estimation.' 
    });
  }
});

// Get all estimations (for main route without admin prefix)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin or contractor accessing their own
    let query = adminDb.collection('estimations').orderBy('createdAt', 'desc');

    // If not admin, filter by contractor
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      query = query.where('contractorId', '==', req.user.id);
    }

    const snapshot = await query.get();

    const estimations = snapshot.docs.map(doc => ({
      _id: doc.id,
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

// Admin routes for file downloads
router.get('/admin/:id/files/download', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

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
    
    res.json({
      success: true,
      files: estimation.uploadedFiles.map(file => ({
        ...file,
        downloadUrl: file.url
      }))
    });

  } catch (error) {
    console.error('Error getting admin download files:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get download files.' 
    });
  }
});

// Update estimation amount (Admin only)
router.patch('/:id/amount', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid amount is required.' 
      });
    }

    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    await adminDb.collection('estimations').doc(id).update({
      estimatedAmount: parseFloat(amount),
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Estimation amount updated successfully.'
    });

  } catch (error) {
    console.error('Error updating amount:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update amount.' 
    });
  }
});

// Add admin notes
router.patch('/:id/notes', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const { id } = req.params;
    const { notes } = req.body;

    const doc = await adminDb.collection('estimations').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Estimation not found.' 
      });
    }

    await adminDb.collection('estimations').doc(id).update({
      adminNotes: notes || '',
      updatedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Notes updated successfully.'
    });

  } catch (error) {
    console.error('Error updating notes:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update notes.' 
    });
  }
});

// Get estimation statistics
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const snapshot = await adminDb.collection('estimations').get();
    const estimations = snapshot.docs.map(doc => doc.data());

    const stats = {
      total: estimations.length,
      pending: estimations.filter(e => e.status === 'pending').length,
      inProgress: estimations.filter(e => e.status === 'in-progress').length,
      completed: estimations.filter(e => e.status === 'completed').length,
      rejected: estimations.filter(e => e.status === 'rejected').length,
      cancelled: estimations.filter(e => e.status === 'cancelled').length,
      totalValue: estimations
        .filter(e => e.estimatedAmount)
        .reduce((sum, e) => sum + e.estimatedAmount, 0)
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching estimation stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics.' 
    });
  }
});

export default router;
