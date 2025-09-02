import express from 'express';
import { authenticateToken, isContractor, isAdmin } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer to handle file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB request size limit
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

// --- CONTRACTOR ROUTES ---

// Submit a new estimation request with files
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
  try {
    const { projectTitle, description } = req.body;
    const files = req.files;

    if (!projectTitle || !description || !files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Project title, description, and at least one file are required.' });
    }

    // IMPORTANT: Storing files in Firestore is subject to a 1MB document size limit.
    // This solution will fail for files larger than ~700KB after base64 encoding.
    // For a 15MB limit, you MUST use a dedicated service like Firebase Cloud Storage.
    const uploadedFiles = files.map(file => ({
      name: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date().toISOString(),
      data: file.buffer.toString('base64') // Store file content as a base64 string
    }));

    const estimationData = {
      projectTitle,
      description,
      contractorName: req.user.name,
      contractorEmail: req.user.email,
      contractorId: req.user.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedFiles: uploadedFiles
    };

    const docRef = await adminDb.collection('estimations').add(estimationData);
    res.status(201).json({ success: true, message: 'Estimation request submitted!', id: docRef.id });

  } catch (error) {
    console.error('Error submitting estimation:', error);
    if (error.message.includes('bytes is larger than the maximum size of 1048576 bytes')) {
        return res.status(413).json({ success: false, error: 'File(s) too large. Total size must be under 1MB for database storage.' });
    }
    res.status(500).json({ success: false, error: 'Failed to submit estimation request.' });
  }
});

// GET contractor's estimations by email (This fixes the 404 error from your script.js)
router.get('/contractor/:email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.params;
        if (req.user.email !== email && req.user.type !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied.' });
        }

        const snapshot = await adminDb.collection('estimations')
            .where('contractorEmail', '==', email)
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            // Remove file data from list view to keep payload small
            if (data.uploadedFiles) data.uploadedFiles.forEach(f => delete f.data);
            if (data.resultFile) delete data.resultFile.data;
            return { id: doc.id, ...data };
        });

        res.json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching contractor estimations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch estimations.' });
    }
});


// --- GENERAL ROUTES ---

// GET Estimations (Preferred Route: gets all for admin, or just contractor's own based on token)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = adminDb.collection('estimations').orderBy('createdAt', 'desc');

    if (req.user.type !== 'admin') {
      query = query.where('contractorId', '==', req.user.id);
    }

    const snapshot = await query.get();
    const estimations = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.uploadedFiles) data.uploadedFiles.forEach(f => delete f.data);
        if (data.resultFile) delete data.resultFile.data;
        return { id: doc.id, ...data };
    });

    res.json({ success: true, estimations });
  } catch (error) {
    console.error('Error fetching estimations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch estimations.' });
  }
});

// GET Single Estimation Details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await adminDb.collection('estimations').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Estimation not found.' });

    const estimation = doc.data();
    if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    
    // Remove large file data from the main details response
    if (estimation.uploadedFiles) estimation.uploadedFiles.forEach(f => delete f.data);
    if (estimation.resultFile) delete estimation.resultFile.data;

    res.json({ success: true, estimation: { id: doc.id, ...estimation }});
  } catch (error) {
    console.error('Error fetching estimation:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch estimation.' });
  }
});

// DELETE a pending estimation
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await adminDb.collection('estimations').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Estimation not found.' });

    const estimation = doc.data();
    if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (estimation.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending estimations can be deleted.' });
    }

    await adminDb.collection('estimations').doc(id).delete();
    res.json({ success: true, message: 'Estimation deleted successfully.' });
  } catch (error) {
    console.error('Error deleting estimation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete estimation.' });
  }
});


// --- ADMIN-ONLY ROUTES ---

// POST Upload Estimation Result
router.post('/:id/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    const resultFile = req.file;
    if (!resultFile) return res.status(400).json({ success: false, error: 'Result file is required.' });

    const resultFileData = {
      name: resultFile.originalname,
      size: resultFile.size,
      mimetype: resultFile.mimetype,
      uploadedAt: new Date().toISOString(),
      data: resultFile.buffer.toString('base64')
    };

    const updateData = {
      status: 'completed',
      resultFile: resultFileData,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      estimatedAmount: parseFloat(amount) || 0,
      adminNotes: notes || ''
    };

    await adminDb.collection('estimations').doc(id).update(updateData);
    res.json({ success: true, message: 'Estimation result uploaded successfully.' });
  } catch (error) {
    console.error('Error uploading result:', error);
    res.status(500).json({ success: false, error: 'Failed to upload result.' });
  }
});

// PATCH Update Estimation Status
router.patch('/:id/status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status.' });

    await adminDb.collection('estimations').doc(id).update({ status, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: 'Status updated.' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
});


// --- FILE DOWNLOAD ROUTES ---

// Download a specific file submitted by a contractor
router.get('/:id/files/:fileName/download', authenticateToken, async (req, res) => {
    try {
        const { id, fileName } = req.params;
        const doc = await adminDb.collection('estimations').doc(id).get();
        if (!doc.exists) return res.status(404).send('Estimation not found.');

        const estimation = doc.data();
        if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
            return res.status(403).send('Access denied.');
        }

        const fileData = estimation.uploadedFiles.find(f => f.name === decodeURIComponent(fileName));
        if (!fileData || !fileData.data) return res.status(404).send('File not found.');

        const fileBuffer = Buffer.from(fileData.data, 'base64');
        res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
        res.setHeader('Content-Type', fileData.mimetype);
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).send('Could not download file.');
    }
});

// Download the result file uploaded by an admin
router.get('/:id/result/download', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await adminDb.collection('estimations').doc(id).get();
        if (!doc.exists) return res.status(404).send('Estimation not found.');

        const estimation = doc.data();
        if (req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
            return res.status(403).send('Access denied.');
        }

        const resultFile = estimation.resultFile;
        if (!resultFile || !resultFile.data) return res.status(404).send('Result file not available.');
        
        const fileBuffer = Buffer.from(resultFile.data, 'base64');
        res.setHeader('Content-Disposition', `attachment; filename="${resultFile.name}"`);
        res.setHeader('Content-Type', resultFile.mimetype);
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error downloading result file:', error);
        res.status(500).send('Could not download result file.');
    }
});

export default router;
