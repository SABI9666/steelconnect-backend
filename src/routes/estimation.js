import express from 'express';
import { authenticateToken, isContractor, isAdmin } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';
import multer from 'multer';

const router = express.Router();

// Configure multer to handle file uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB total request size limit
});

// --- CONTRACTOR ROUTES ---

// Submit a new estimation request
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
  try {
    const { projectTitle, description } = req.body;
    const files = req.files;

    if (!projectTitle || !description || !files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Project title, description, and at least one file are required.' });
    }

    // IMPORTANT: Storing files directly in Firestore is subject to a 1MB document size limit.
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
    // Check for a specific error related to file size being too large for Firestore
    if (error.message.includes('bytes is larger than the maximum size of 1048576 bytes')) {
        return res.status(413).json({ success: false, error: 'File(s) too large. Total size must be under 1MB for database storage.' });
    }
    res.status(500).json({ success: false, error: 'Failed to submit estimation request.' });
  }
});

// --- ADMIN & GENERAL ROUTES ---

// Get all estimations (for admin) or only the user's estimations (for contractor)
router.get('/', authenticateToken, async (req, res) => {
    try {
        let query = adminDb.collection('estimations').orderBy('createdAt', 'desc');

        // If the user is not an admin, filter to show only their own estimations
        if (req.user.type !== 'admin' && req.user.role !== 'admin') {
            query = query.where('contractorId', '==', req.user.id);
        }

        const snapshot = await query.get();
        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            // Remove the large base64 data strings from the list view to keep the response fast and small
            if (data.uploadedFiles) {
                data.uploadedFiles.forEach(file => delete file.data);
            }
            if (data.resultFile) {
                delete data.resultFile.data;
            }
            return { _id: doc.id, id: doc.id, ...data };
        });

        res.json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch estimations.' });
    }
});

// Upload an estimation result (Admin only)
router.post('/:id/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    const resultFile = req.file;

    if (!resultFile) {
      return res.status(400).json({ success: false, error: 'Result file is required.' });
    }

    const docRef = adminDb.collection('estimations').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, error: 'Estimation not found.' });
    }

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
      completedAt: new Date().toISOString()
    };
    if (amount) updateData.estimatedAmount = parseFloat(amount);
    if (notes) updateData.adminNotes = notes;

    await docRef.update(updateData);
    res.json({ success: true, message: 'Estimation result uploaded successfully.' });
  } catch (error) {
    console.error('Error uploading result:', error);
     if (error.message.includes('bytes is larger than the maximum size of 1048576 bytes')) {
        return res.status(413).json({ success: false, error: 'Result file is too large. Must be under 1MB.' });
    }
    res.status(500).json({ success: false, error: 'Failed to upload result.' });
  }
});

// Update an estimation's status (Admin only)
router.patch('/:id/status', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status value.' });
        }
        await adminDb.collection('estimations').doc(id).update({ status, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'Estimation status updated successfully.' });
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
        // Security check: Only admin or the owner can download
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
        // Security check: Only admin or the owner can download
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
