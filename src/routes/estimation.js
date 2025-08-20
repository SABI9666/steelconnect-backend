// src/routes/estimation.js
import express from 'express';
import { upload, uploadToFirebase } from '../middleware/upload.js';
import { isAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Mock estimation data - replace with actual database calls
let estimations = [
  {
    _id: '1',
    projectTitle: 'Office Building Steel Frame',
    contractorName: 'Steel Works Inc',
    contractorEmail: 'contractor@steelworks.com',
    status: 'pending',
    description: 'Structural steel framework for 5-story office building',
    uploadedFiles: [
      {
        name: 'blueprints.pdf',
        url: 'https://example.com/files/blueprints.pdf',
        uploadedAt: new Date().toISOString()
      }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    _id: '2',
    projectTitle: 'Bridge Reinforcement Project',
    contractorName: 'Metro Construction',
    contractorEmail: 'info@metroconstruction.com',
    status: 'completed',
    description: 'Steel reinforcement for highway bridge expansion',
    uploadedFiles: [
      {
        name: 'specifications.pdf',
        url: 'https://example.com/files/specifications.pdf',
        uploadedAt: new Date().toISOString()
      }
    ],
    resultFile: {
      name: 'estimation_result.pdf',
      url: 'https://example.com/results/estimation_result.pdf',
      uploadedAt: new Date().toISOString()
    },
    estimatedAmount: 125000,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 43200000).toISOString()
  }
];

// GET /api/estimation - Get all estimations (Admin only)
router.get('/', isAdmin, async (req, res) => {
  try {
    console.log('Admin requesting all estimations');
    
    res.json({
      success: true,
      estimations: estimations
    });
    
  } catch (error) {
    console.error('Get estimations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimations'
    });
  }
});

// GET /api/estimation/:id - Get specific estimation
router.get('/:id', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const estimation = estimations.find(est => est._id === estimationId);
    
    if (!estimation) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    res.json({
      success: true,
      estimation: estimation
    });
    
  } catch (error) {
    console.error('Get estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimation'
    });
  }
});

// GET /api/estimation/:id/files - Get estimation files
router.get('/:id/files', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const estimation = estimations.find(est => est._id === estimationId);
    
    if (!estimation) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    res.json({
      success: true,
      files: estimation.uploadedFiles || []
    });
    
  } catch (error) {
    console.error('Get estimation files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimation files'
    });
  }
});

// PATCH /api/estimation/:id/status - Update estimation status
router.patch('/:id/status', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const estimationIndex = estimations.findIndex(est => est._id === estimationId);
    
    if (estimationIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    estimations[estimationIndex] = {
      ...estimations[estimationIndex],
      status,
      updatedAt: new Date().toISOString()
    };
    
    console.log('Estimation status updated:', estimationId, 'to', status);
    
    res.json({
      success: true,
      estimation: estimations[estimationIndex],
      message: 'Estimation status updated successfully'
    });
    
  } catch (error) {
    console.error('Update estimation status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update estimation status'
    });
  }
});

// POST /api/estimation/:id/result - Upload estimation result (Admin only)
router.post('/:id/result', isAdmin, upload.single('resultFile'), async (req, res) => {
  try {
    const estimationId = req.params.id;
    const { notes } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No result file provided'
      });
    }
    
    const estimationIndex = estimations.findIndex(est => est._id === estimationId);
    
    if (estimationIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    // Upload file to Firebase
    try {
      const fileUrl = await uploadToFirebase(req.file, `estimation-results/${estimationId}`);
      
      // Update estimation with result file
      estimations[estimationIndex] = {
        ...estimations[estimationIndex],
        resultFile: {
          name: req.file.originalname,
          url: fileUrl,
          uploadedAt: new Date().toISOString()
        },
        notes: notes || '',
        status: 'completed',
        updatedAt: new Date().toISOString()
      };
      
      console.log('Estimation result uploaded:', estimationId);
      
      res.json({
        success: true,
        estimation: estimations[estimationIndex],
        message: 'Estimation result uploaded successfully'
      });
      
    } catch (uploadError) {
      console.error('File upload error:', uploadError);
      res.status(500).json({
        success: false,
        error: 'Failed to upload result file'
      });
    }
    
  } catch (error) {
    console.error('Upload estimation result error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload estimation result'
    });
  }
});

// GET /api/estimation/:id/result - Download estimation result
router.get('/:id/result', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const estimation = estimations.find(est => est._id === estimationId);
    
    if (!estimation) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    if (!estimation.resultFile) {
      return res.status(404).json({
        success: false,
        error: 'No result file available for this estimation'
      });
    }
    
    res.json({
      success: true,
      resultFile: estimation.resultFile
    });
    
  } catch (error) {
    console.error('Get estimation result error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch estimation result'
    });
  }
});

// PATCH /api/estimation/:id/due-date - Set due date
router.patch('/:id/due-date', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const { dueDate } = req.body;
    
    if (!dueDate) {
      return res.status(400).json({
        success: false,
        error: 'Due date is required'
      });
    }
    
    const estimationIndex = estimations.findIndex(est => est._id === estimationId);
    
    if (estimationIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    estimations[estimationIndex] = {
      ...estimations[estimationIndex],
      dueDate,
      updatedAt: new Date().toISOString()
    };
    
    console.log('Estimation due date set:', estimationId, 'to', dueDate);
    
    res.json({
      success: true,
      estimation: estimations[estimationIndex],
      message: 'Due date set successfully'
    });
    
  } catch (error) {
    console.error('Set due date error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set due date'
    });
  }
});

// DELETE /api/estimation/:id - Delete estimation
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const estimationId = req.params.id;
    const estimationIndex = estimations.findIndex(est => est._id === estimationId);
    
    if (estimationIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Estimation not found'
      });
    }
    
    const deletedEstimation = estimations.splice(estimationIndex, 1)[0];
    
    console.log('Estimation deleted:', estimationId);
    
    res.json({
      success: true,
      message: 'Estimation deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete estimation'
    });
  }
});

// --- CONTRACTOR ROUTES ---

// POST /api/estimation/contractor/submit - Submit new estimation request (Contractor)
router.post('/contractor/submit', upload.array('files', 10), async (req, res) => {
  try {
    const { projectTitle, description, contractorName, contractorEmail } = req.body;
    
    if (!projectTitle || !description || !contractorName || !contractorEmail) {
      return res.status(400).json({
        success: false,
        error: 'Project title, description, contractor name, and email are required'
      });
    }
    
    const uploadedFiles = [];
    
    // Upload files to Firebase
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileUrl = await uploadToFirebase(file, `estimation-uploads/${contractorEmail}`);
          uploadedFiles.push({
            name: file.originalname,
            url: fileUrl,
            uploadedAt: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error('File upload error:', uploadError);
        }
      }
    }
    
    const newEstimation = {
      _id: (estimations.length + 1).toString(),
      projectTitle,
      description,
      contractorName,
      contractorEmail,
      status: 'pending',
      uploadedFiles,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    estimations.push(newEstimation);
    
    console.log('New estimation submitted:', projectTitle, 'by', contractorName);
    
    res.status(201).json({
      success: true,
      estimation: newEstimation,
      message: 'Estimation request submitted successfully'
    });
    
  } catch (error) {
    console.error('Submit estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit estimation request'
    });
  }
});

// GET /api/estimation/contractor/:email - Get estimations for specific contractor
router.get('/contractor/:email', async (req, res) => {
  try {
    const contractorEmail = req.params.email;
    const contractorEstimations = estimations.filter(est => est.contractorEmail === contractorEmail);
    
    console.log('Contractor estimations requested:', contractorEmail);
    
    res.json({
      success: true,
      estimations: contractorEstimations
    });
    
  } catch (error) {
    console.error('Get contractor estimations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contractor estimations'
    });
  }
});

export default router;
