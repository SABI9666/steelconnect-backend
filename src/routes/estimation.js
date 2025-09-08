// FIXED: src/routes/estimation.js - Corrected file download endpoints
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

// FIXED: Get single estimation by ID - Main endpoint for admin/contractor access
router.get('/:estimationId', authenticateToken, async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        console.log(`Estimation details requested for ID: ${estimationId} by user: ${req.user?.email}`);
        
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
        
        // Get user data if available
        let userData = null;
        if (estimationData.contractorId) {
            try {
                const userDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for estimation: ${estimationId}`);
            }
        }
        
        const estimation = {
            _id: doc.id,
            id: doc.id,
            projectTitle: estimationData.projectTitle || 'Untitled',
            projectType: estimationData.projectType || 'General',
            description: estimationData.description || '',
            contractorName: userData?.name || estimationData.contractorName || 'Unknown',
            contractorEmail: userData?.email || estimationData.contractorEmail || 'N/A',
            contractorCompany: userData?.company || estimationData.contractorCompany || 'Not specified',
            contractorId: estimationData.contractorId,
            uploadedFiles: estimationData.uploadedFiles || [],
            resultFile: estimationData.resultFile || null,
            status: estimationData.status || 'pending',
            estimatedAmount: estimationData.estimatedAmount || null,
            notes: estimationData.notes || '',
            dueDate: estimationData.dueDate || null,
            createdAt: estimationData.createdAt,
            updatedAt: estimationData.updatedAt || estimationData.createdAt,
            completedAt: estimationData.completedAt || null,
            ...estimationData
        };
        
        res.json({
            success: true,
            estimation: estimation
        });
    } catch (error) {
        console.error('Error fetching estimation details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation details',
            error: error.message
        });
    }
});

// Submit new estimation
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

        // Upload files to Firebase Storage
        const uploadedFiles = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const timestamp = Date.now();
            const filename = `estimations/${req.user.userId}/${timestamp}-${file.originalname}`;
            
            try {
                console.log(`Uploading file: ${file.originalname}`);
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

        console.log(`Estimation created with ID: ${estimationRef.id}`);

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

// Upload estimation result (admin only)
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
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (amount) {
            updateData.estimatedAmount = parseFloat(amount);
        }

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        console.log(`Result uploaded for estimation ${estimationId}`);

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

// FIXED: Update estimation status (admin only)
router.patch('/:estimationId/status', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status, notes } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        const updateData = {
            status: status,
            updatedAt: new Date().toISOString()
        };
        
        if (notes) {
            updateData.notes = notes;
        }
        
        if (status === 'completed' && !updateData.completedAt) {
            updateData.completedAt = new Date().toISOString();
        }
        
        await adminDb.collection('estimations').doc(estimationId).update(updateData);
        
        console.log(`Estimation ${estimationId} status updated to ${status} by ${req.user?.email}`);
        
        res.json({
            success: true,
            message: 'Estimation status updated successfully'
        });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating estimation status',
            error: error.message
        });
    }
});

// REMOVED: Problematic download endpoints - Files are now accessed directly via their public URLs

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

        // Only allow deletion if status is pending (for contractors) or any status (for admin)
        if (req.user.type !== 'admin' && estimationData.status !== 'pending') {
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
