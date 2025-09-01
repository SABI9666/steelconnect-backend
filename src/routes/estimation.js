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
      'DELETE /:id',
      'GET /admin/all'
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
        // In a real implementation, you'd upload to cloud storage
        url: `placeholder-url-${file.originalname}`
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
      data: {
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
    
    // Check access permissions
    if (estimation.contractorId !== req.user.id && req.user.type !== 'admin') {
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
    
    // Check access permissions
    if (estimation.contractorId !== req.user.id && req.user.type !== 'admin') {
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

// Admin route to get all estimations
router.get('/admin/all', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const snapshot = await adminDb.collection('estimations')
      .orderBy('createdAt', 'desc')
      .get();

    const estimations = snapshot.docs.map(doc => ({
      _id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      estimations
    });

  } catch (error) {
    console.error('Error fetching all estimations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch estimations.' 
    });
  }
});

// Admin route to download contractor's uploaded files
router.get('/admin/:id/files/download', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin') {
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

    // In a real implementation, you would:
    // 1. Get actual file URLs from cloud storage (Firebase Storage, AWS S3, etc.)
    // 2. Generate temporary download links
    // 3. Return downloadable URLs
    
    res.json({
      success: true,
      files: estimation.uploadedFiles.map(file => ({
        ...file,
        downloadUrl: `${process.env.STORAGE_BASE_URL || 'https://storage.example.com'}/estimations/${id}/${file.name}`
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

// Admin route to upload estimation result
router.post('/admin/:id/result', authenticateToken, upload.single('resultFile'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.type !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required.' 
      });
    }

    const { id } = req.params;
    const { estimatedAmount, notes } = req.body;
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

    // In a real implementation, upload file to cloud storage
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

    if (estimatedAmount) {
      updateData.estimatedAmount = parseFloat(estimatedAmount);
    }

    if (notes) {
      updateData.adminNotes = notes;
    }

    await adminDb.collection('estimations').doc(id).update(updateData);

    res.json({
      success: true,
      message: 'Estimation result uploaded successfully.',
      data: updateData
    });

  } catch (error) {
    console.error('Error uploading result:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload result.' 
    });
  }
});

export default router;
