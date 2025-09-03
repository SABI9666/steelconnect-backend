import express from 'express';
import multer from 'multer';
import { authenticateToken, isContractor, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb, adminStorage } from '../config/firebase.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15MB limit
    }
});

// Helper function to upload file to Firebase Storage
async function uploadToFirebaseStorage(file, path) {
    try {
        const bucket = adminStorage.bucket();
        const fileRef = bucket.file(path);
        
        const stream = fileRef.createWriteStream({
            metadata: {
                contentType: file.mimetype,
            },
        });

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', async () => {
                try {
                    await fileRef.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
                    resolve(publicUrl);
                } catch (error) {
                    reject(error);
                }
            });
            stream.end(file.buffer);
        });
    } catch (error) {
        throw error;
    }
}

// Get all estimations (for admin)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = snapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({
            success: true,
            estimations: estimations
        });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimations',
            error: error.message
        });
    }
});

// Submit new estimation (for contractors)
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        const { projectTitle, description, contractorName, contractorEmail } = req.body;
        const files = req.files;

        // Validation
        if (!projectTitle || !description || !contractorName || !contractorEmail) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one file is required'
            });
        }

        // Upload files to Firebase Storage
        const uploadedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const filename = `estimations/${req.user.userId}/${timestamp}-${file.originalname}`;
            
            try {
                const publicUrl = await uploadToFirebaseStorage(file, filename);
                uploadedFiles.push({
                    name: file.originalname,
                    url: publicUrl,
                    size: file.size,
                    type: file.mimetype,
                    uploadedAt: new Date().toISOString()
                });
            } catch (uploadError) {
                console.error('Error uploading file:', uploadError);
                throw new Error(`Failed to upload file: ${file.originalname}`);
            }
        }

        // Create estimation document
        const estimationData = {
            projectTitle,
            description,
            contractorName,
            contractorEmail,
            contractorId: req.user.userId,
            uploadedFiles,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const estimationRef = await adminDb.collection('estimations').add(estimationData);

        res.status(201).json({
            success: true,
            message: 'Estimation request submitted successfully',
            estimationId: estimationRef.id,
            data: {
                id: estimationRef.id,
                ...estimationData
            }
        });

    } catch (error) {
        console.error('Error submitting estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting estimation request',
            error: error.message
        });
    }
});

// Get contractor's estimations
router.get('/contractor/:contractorEmail', authenticateToken, async (req, res) => {
    try {
        const { contractorEmail } = req.params;
        
        // Check if user is authorized (either admin or the contractor themselves)
        if (req.user.type !== 'admin' && req.user.email !== contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const snapshot = await adminDb.collection('estimations')
            .where('contractorEmail', '==', contractorEmail)
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = snapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));

        res.json({
            success: true,
            estimations: estimations
        });

    } catch (error) {
        console.error('Error fetching contractor estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimations',
            error: error.message
        });
    }
});

// Get specific estimation details
router.get('/:estimationId', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = doc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            estimation: {
                _id: doc.id,
                id: doc.id,
                ...estimationData
            }
        });

    } catch (error) {
        console.error('Error fetching estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation',
            error: error.message
        });
    }
});

// Upload estimation result (admin only)
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { amount, notes } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }

        // Check if estimation exists
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        // Upload result file
        const timestamp = Date.now();
        const filename = `estimation-results/${estimationId}/${timestamp}-${file.originalname}`;
        const publicUrl = await uploadToFirebaseStorage(file, filename);

        const resultFile = {
            name: file.originalname,
            url: publicUrl,
            size: file.size,
            type: file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.email
        };

        // Update estimation with result
        const updateData = {
            resultFile,
            status: 'completed',
            notes: notes || '',
            updatedAt: new Date().toISOString()
        };

        if (amount) {
            updateData.estimatedAmount = parseFloat(amount);
        }

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            resultFile
        });

    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading estimation result',
            error: error.message
        });
    }
});

// Download estimation files
router.get('/:estimationId/files/:fileName/download', authenticateToken, async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        
        // Get estimation to check authorization
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Find the file in uploadedFiles
        const file = estimationData.uploadedFiles?.find(f => f.name === fileName);
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Redirect to the file URL
        res.redirect(file.url);

    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
});

// Download estimation result
router.get('/:estimationId/result/download', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        // Get estimation to check authorization and get result file
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!estimationData.resultFile) {
            return res.status(404).json({
                success: false,
                message: 'Result file not found'
            });
        }

        // Redirect to the result file URL
        res.redirect(estimationData.resultFile.url);

    } catch (error) {
        console.error('Error downloading result:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading result',
            error: error.message
        });
    }
});

// Get files for specific estimation
router.get('/:estimationId/files', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            files: estimationData.uploadedFiles || []
        });

    } catch (error) {
        console.error('Error fetching files:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching files',
            error: error.message
        });
    }
});

// Get result for specific estimation
router.get('/:estimationId/result', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!estimationData.resultFile) {
            return res.status(404).json({
                success: false,
                message: 'Result file not available'
            });
        }

        res.json({
            success: true,
            resultFile: estimationData.resultFile
        });

    } catch (error) {
        console.error('Error fetching result:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching result',
            error: error.message
        });
    }
});

// Delete estimation (contractor or admin)
router.delete('/:estimationId', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();
        
        // Check authorization
        if (req.user.type !== 'admin' && req.user.email !== estimationData.contractorEmail) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Only allow deletion if status is pending
        if (estimationData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete estimation that is not pending'
            });
        }

        await adminDb.collection('estimations').doc(estimationId).delete();

        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting estimation',
            error: error.message
        });
    }
});

export default router;
