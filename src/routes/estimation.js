// src/routes/estimation.js - Fixed estimation routes with better error handling
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';
import { sendEstimationResultNotification } from '../utils/emailService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024, // 15MB limit per file
        files: 10 // Maximum 10 files
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/vnd.dwg',
            'application/acad',
            'image/vnd.dwg',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`), false);
        }
    }
});

// Get contractor's estimation requests - MOVED TO TOP to prevent conflicts
router.get('/contractor/:contractorEmail', async (req, res) => {
    try {
        const { contractorEmail } = req.params;
        const userId = req.user.userId;

        console.log(`Fetching estimations for contractor: ${contractorEmail}`);
        console.log(`Authenticated user: ${req.user.email} (${req.user.type})`);

        // Decode the email parameter in case it's URL encoded
        const decodedEmail = decodeURIComponent(contractorEmail);
        
        // Check if user can access this data (must be the same contractor or admin)
        if (req.user.email !== decodedEmail && req.user.type !== 'admin') {
            console.log(`Access denied: ${req.user.email} trying to access ${decodedEmail}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied - you can only view your own estimation requests'
            });
        }

        const estimationsQuery = await adminDb.collection('estimations')
            .where('contractorEmail', '==', decodedEmail)
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = [];
        estimationsQuery.forEach(doc => {
            estimations.push({
                _id: doc.id,
                id: doc.id,
                ...doc.data()
            });
        });

        console.log(`Found ${estimations.length} estimations for ${decodedEmail}`);

        res.json({
            success: true,
            estimations: estimations,
            total: estimations.length
        });

    } catch (error) {
        console.error('Error fetching contractor estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation requests',
            error: error.message
        });
    }
});

// Submit estimation request (Contractors only)
router.post('/contractor/submit', upload.array('files', 10), async (req, res) => {
    try {
        const { projectTitle, description, contractorName, contractorEmail } = req.body;
        const userId = req.user.userId;
        const userType = req.user.type;

        // Check if user is a contractor
        if (userType !== 'contractor') {
            return res.status(403).json({
                success: false,
                message: 'Only contractors can submit estimation requests'
            });
        }

        // Validate required fields
        if (!projectTitle || !description) {
            return res.status(400).json({
                success: false,
                message: 'Project title and description are required'
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one file is required for estimation'
            });
        }

        console.log(`Processing estimation request from ${contractorEmail} with ${req.files.length} files`);

        // Upload files to Firebase Storage
        const uploadedFiles = [];
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            try {
                const filePath = `estimations/${userId}/${Date.now()}_${i}_${file.originalname}`;
                const fileUrl = await uploadToFirebaseStorage(file, filePath);
                
                uploadedFiles.push({
                    name: file.originalname,
                    url: fileUrl,
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date().toISOString()
                });
            } catch (uploadError) {
                console.error('File upload error:', uploadError);
                return res.status(500).json({
                    success: false,
                    message: `Failed to upload file: ${file.originalname}`
                });
            }
        }

        // Create estimation request document
        const estimationData = {
            projectTitle,
            description,
            contractorId: userId,
            contractorName,
            contractorEmail,
            uploadedFiles,
            status: 'pending', // pending, in-progress, completed, rejected
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            estimatedAmount: null,
            resultFile: null,
            adminNotes: '',
            processedBy: null,
            completedAt: null
        };

        const estimationRef = await adminDb.collection('estimations').add(estimationData);
        
        console.log(`Estimation request created: ${estimationRef.id} for contractor ${contractorEmail}`);

        res.status(201).json({
            success: true,
            message: 'Estimation request submitted successfully',
            data: {
                id: estimationRef.id,
                status: 'pending',
                message: 'Your estimation request has been submitted and is being processed by our team.'
            }
        });

    } catch (error) {
        console.error('Error submitting estimation request:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting estimation request',
            error: error.message
        });
    }
});

// Get estimation files (for viewing)
router.get('/:estimationId/files', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const userId = req.user.userId;

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation request not found'
            });
        }

        const estimation = estimationDoc.data();

        // Check if user can access this data
        if (estimation.contractorId !== userId && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.json({
            success: true,
            files: estimation.uploadedFiles || []
        });

    } catch (error) {
        console.error('Error fetching estimation files:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching files'
        });
    }
});

// Get estimation result (for download)
router.get('/:estimationId/result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const userId = req.user.userId;

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation request not found'
            });
        }

        const estimation = estimationDoc.data();

        // Check if user can access this data
        if (estimation.contractorId !== userId && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        if (!estimation.resultFile || estimation.status !== 'completed') {
            return res.status(404).json({
                success: false,
                message: 'Estimation result not available yet'
            });
        }

        res.json({
            success: true,
            resultFile: estimation.resultFile,
            estimatedAmount: estimation.estimatedAmount,
            completedAt: estimation.completedAt
        });

    } catch (error) {
        console.error('Error fetching estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching result'
        });
    }
});

// Delete estimation request (only if pending)
router.delete('/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const userId = req.user.userId;

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation request not found'
            });
        }

        const estimation = estimationDoc.data();

        // Check if user owns this estimation
        if (estimation.contractorId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Only allow deletion if status is pending
        if (estimation.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete estimation request that is already being processed'
            });
        }

        await adminDb.collection('estimations').doc(estimationId).delete();

        console.log(`Estimation request deleted: ${estimationId} by contractor ${estimation.contractorEmail}`);

        res.json({
            success: true,
            message: 'Estimation request deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting estimation request:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting estimation request'
        });
    }
});

// ADMIN ROUTES - For processing estimation requests

// Get all estimation requests (Admin only)
router.get('/admin/all', async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { status, page = 1, limit = 20 } = req.query;
        let query = adminDb.collection('estimations');

        if (status) {
            query = query.where('status', '==', status);
        }

        const estimationsQuery = await query
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit))
            .get();

        const estimations = [];
        estimationsQuery.forEach(doc => {
            estimations.push({
                _id: doc.id,
                id: doc.id,
                ...doc.data()
            });
        });

        // Get total count for pagination
        const totalQuery = await adminDb.collection('estimations').get();
        const total = totalQuery.size;

        res.json({
            success: true,
            estimations: estimations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching admin estimations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation requests'
        });
    }
});

// Update estimation status and upload result (Admin only)
router.put('/admin/:estimationId/complete', upload.single('resultFile'), async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { estimationId } = req.params;
        const { estimatedAmount, adminNotes } = req.body;

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation request not found'
            });
        }

        const estimation = estimationDoc.data();

        // Validate required fields
        if (!estimatedAmount) {
            return res.status(400).json({
                success: false,
                message: 'Estimated amount is required'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }

        console.log(`Processing estimation completion for ${estimationId}`);

        // Upload result file to Firebase Storage
        let resultFileData = null;
        try {
            const filePath = `estimation-results/${estimationId}/${Date.now()}_${req.file.originalname}`;
            const fileUrl = await uploadToFirebaseStorage(req.file, filePath);
            
            resultFileData = {
                name: req.file.originalname,
                url: fileUrl,
                mimetype: req.file.mimetype,
                size: req.file.size,
                uploadedAt: new Date().toISOString()
            };
        } catch (uploadError) {
            console.error('Result file upload error:', uploadError);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload result file'
            });
        }

        // Update estimation with result
        const updateData = {
            status: 'completed',
            estimatedAmount: parseFloat(estimatedAmount),
            resultFile: resultFileData,
            adminNotes: adminNotes || '',
            processedBy: req.user.email,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        // Get user data for email notification
        const userDoc = await adminDb.collection('users').doc(estimation.contractorId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // Send estimation result notification email
            const estimationDataForEmail = {
                ...estimation,
                ...updateData
            };
            
            sendEstimationResultNotification(userData, estimationDataForEmail)
                .then((result) => {
                    if (result.success) {
                        console.log(`Estimation result notification sent successfully to ${userData.email}`);
                    } else {
                        console.error(`Failed to send estimation result notification to ${userData.email}:`, result.error);
                    }
                })
                .catch(error => {
                    console.error('Failed to send estimation result notification email:', error);
                });
        }

        console.log(`Estimation completed: ${estimationId} by admin ${req.user.email}`);

        res.json({
            success: true,
            message: 'Estimation completed and result uploaded successfully',
            data: {
                id: estimationId,
                status: 'completed',
                estimatedAmount: parseFloat(estimatedAmount),
                completedAt: updateData.completedAt
            }
        });

    } catch (error) {
        console.error('Error completing estimation:', error);
        res.status(500).json({
            success: false,
            message: 'Error completing estimation request'
        });
    }
});

// Update estimation status (Admin only)
router.put('/admin/:estimationId/status', async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { estimationId } = req.params;
        const { status, adminNotes } = req.body;

        const allowedStatuses = ['pending', 'in-progress', 'completed', 'rejected'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation request not found'
            });
        }

        const updateData = {
            status: status,
            adminNotes: adminNotes || '',
            processedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(estimationId).update(updateData);

        console.log(`Estimation status updated: ${estimationId} to ${status} by admin ${req.user.email}`);

        res.json({
            success: true,
            message: 'Estimation status updated successfully',
            data: {
                id: estimationId,
                status: status,
                updatedAt: updateData.updatedAt
            }
        });

    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating estimation status'
        });
    }
});

export default router;
