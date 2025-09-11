// src/routes/estimation.js
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
        fileSize: 15 * 1024 * 1024, // 15MB limit
        files: 10 // Maximum 10 files
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

// Get all estimations (Admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
    try {
        console.log('Admin estimations list requested by:', req.user?.email);
        
        const snapshot = await adminDb.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = snapshot.docs.map(doc => ({
            _id: doc.id,
            id: doc.id,
            ...doc.data()
        }));
        
        console.log(`Found ${estimations.length} estimations for admin`);
        
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

// Enhanced file upload handling for estimations (Contractor only)
router.post('/contractor/submit', authenticateToken, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        console.log('Estimation submission by contractor:', req.user?.email);
        
        const { projectTitle, description, contractorName, contractorEmail } = req.body;
        const files = req.files;

        // Validation
        if (!projectTitle || !description || !contractorName || !contractorEmail) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required: projectTitle, description, contractorName, contractorEmail'
            });
        }
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one file is required'
            });
        }
        
        console.log(`Processing ${files.length} files for estimation`);

        // Upload files to Firebase Storage with better error handling
        const uploadedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filename = `estimations/${req.user.userId}/${timestamp}-${safeFileName}`;
            
            try {
                console.log(`Uploading file ${i + 1}/${files.length}: ${file.originalname}`);
                const publicUrl = await uploadToFirebaseStorage(file, filename);
                                
                uploadedFiles.push({
                    name: file.originalname,
                    url: publicUrl,
                    size: file.size,
                    type: file.mimetype,
                    uploadedAt: new Date().toISOString(),
                    path: filename
                });
                                
                console.log(`✅ File uploaded successfully: ${file.originalname}`);
            } catch (uploadError) {
                console.error(`❌ Error uploading file ${file.originalname}:`, uploadError);
                return res.status(500).json({
                    success: false,
                    message: `Failed to upload file: ${file.originalname}`,
                    error: uploadError.message
                });
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
        
        console.log(`✅ Estimation created with ID: ${estimationRef.id}`);
        
        res.status(201).json({
            success: true,
            message: 'Estimation request submitted successfully',
            estimationId: estimationRef.id,
            data: {
                id: estimationRef.id,
                ...estimationData,
                uploadedFiles: uploadedFiles.map(f => ({
                    name: f.name,
                    size: f.size,
                    type: f.type,
                    uploadedAt: f.uploadedAt
                })) // Don't expose URLs in response for security
            }
        });

    } catch (error) {
        console.error('❌ Error submitting estimation:', error);
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
        
        console.log(`Estimations requested for contractor: ${contractorEmail} by user: ${req.user?.email}`);
        
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

        console.log(`Found ${estimations.length} estimations for contractor ${contractorEmail}`);

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

// Enhanced result upload with better validation (Admin only)
router.post('/:estimationId/result', authenticateToken, isAdmin, upload.single('resultFile'), async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { amount, notes } = req.body;
        const file = req.file;

        console.log(`Admin ${req.user?.email} uploading result for estimation ${estimationId}`);
        
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }
        
        // Validate file type (should be PDF for results)
        if (file.mimetype !== 'application/pdf') {
            return res.status(400).json({
                success: false,
                message: 'Result file must be a PDF'
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
        const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `estimation-results/${estimationId}/${timestamp}-${safeFileName}`;
                
        console.log(`Uploading result file: ${file.originalname}`);
        const publicUrl = await uploadToFirebaseStorage(file, filename);
        
        const resultFile = {
            name: file.originalname,
            url: publicUrl,
            size: file.size,
            type: file.mimetype,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.email,
            path: filename
        };
        
        // Update estimation with result
        const updateData = {
            resultFile,
            status: 'completed',
            notes: notes || '',
            completedAt: new Date().toISOString(),
            completedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        if (amount && !isNaN(parseFloat(amount))) {
            updateData.estimatedAmount = parseFloat(amount);
        }
        
        await adminDb.collection('estimations').doc(estimationId).update(updateData);
        
        console.log(`✅ Result uploaded for estimation ${estimationId}`);
        
        res.json({
            success: true,
            message: 'Estimation result uploaded successfully',
            data: {
                resultFile: {
                    name: resultFile.name,
                    size: resultFile.size,
                    type: resultFile.type,
                    uploadedAt: resultFile.uploadedAt
                },
                estimatedAmount: updateData.estimatedAmount
            }
        });

    } catch (error) {
        console.error('❌ Error uploading estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading estimation result',
            error: error.message
        });
    }
});

// Enhanced file download with proper authorization
router.get('/:estimationId/files/:fileName/download', authenticateToken, async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        
        console.log(`File download requested: ${fileName} from estimation ${estimationId} by ${req.user.email}`);
        
        // Get estimation to check authorization
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        const estimationData = estimationDoc.data();
        
        // Check authorization - admin or the contractor who submitted
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
        
        console.log(`✅ Redirecting to file URL for download: ${fileName}`);
        
        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Content-Type', file.type || 'application/octet-stream');
        
        // Redirect to the file URL
        res.redirect(file.url);

    } catch (error) {
        console.error('❌ Error downloading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
});

// Enhanced result download
router.get('/:estimationId/result/download', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        console.log(`Result download requested for estimation ${estimationId} by ${req.user.email}`);
        
        // Get estimation to check authorization and get result file
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        const estimationData = estimationDoc.data();
        
        // Check authorization - admin or the contractor who submitted
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
        
        console.log(`✅ Redirecting to result file URL for download`);
        
        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${estimationData.resultFile.name}"`);
        res.setHeader('Content-Type', estimationData.resultFile.type || 'application/pdf');
        
        // Redirect to the result file URL
        res.redirect(estimationData.resultFile.url);

    } catch (error) {
        console.error('❌ Error downloading result:', error);
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

// Delete estimation
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

        console.log(`Estimation ${estimationId} deleted by ${req.user?.email}`);

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
