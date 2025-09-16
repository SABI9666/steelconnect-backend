// src/routes/estimation.js - Complete estimation routes with result download support
import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { db } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router = express.Router();
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Apply authentication to all routes
router.use(authenticateToken);

// Submit new estimation request
router.post('/submit', upload.array('files', 10), async (req, res) => {
    try {
        const { projectTitle, description } = req.body;
        const userId = req.user.uid;
        const userEmail = req.user.email;
        const userName = req.user.name || req.user.displayName || 'Unknown User';

        console.log(`[ESTIMATION] New submission from user: ${userEmail}`);

        if (!projectTitle || !description) {
            return res.status(400).json({
                success: false,
                message: 'Project title and description are required'
            });
        }

        // Upload files to Firebase Storage
        const uploadedFiles = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const filePath = `estimations/${userId}/${Date.now()}_${file.originalname}`;
                
                try {
                    const fileUrl = await uploadToFirebaseStorage(file, filePath);
                    uploadedFiles.push({
                        name: file.originalname,
                        url: fileUrl,
                        size: file.size,
                        mimetype: file.mimetype,
                        uploadedAt: new Date().toISOString()
                    });
                    console.log(`[ESTIMATION] Uploaded file: ${file.originalname}`);
                } catch (uploadError) {
                    console.error(`[ESTIMATION] File upload error for ${file.originalname}:`, uploadError);
                    // Continue with other files even if one fails
                }
            }
        }

        // Create estimation document
        const estimationData = {
            contractorId: userId,
            contractorEmail: userEmail,
            contractorName: userName,
            projectTitle: projectTitle.trim(),
            projectName: projectTitle.trim(), // Alternative field name for compatibility
            description: description.trim(),
            projectDescription: description.trim(), // Alternative field name for compatibility
            uploadedFiles: uploadedFiles,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await db.collection('estimations').add(estimationData);
        console.log(`[ESTIMATION] Created estimation document: ${docRef.id}`);

        res.json({
            success: true,
            message: 'Estimation request submitted successfully',
            estimationId: docRef.id,
            uploadedFiles: uploadedFiles.length
        });

    } catch (error) {
        console.error('[ESTIMATION] Submit error:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting estimation request',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get estimations for specific contractor (used by admin and contractor)
router.get('/contractor/:contractorEmail', async (req, res) => {
    try {
        const { contractorEmail } = req.params;
        const requestingUser = req.user.email;

        console.log(`[ESTIMATION] Estimations requested for contractor: ${contractorEmail} by user: ${requestingUser}`);

        // Check if user is requesting their own data or is admin
        const isOwnData = contractorEmail === requestingUser;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwnData && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this contractor\'s estimations'
            });
        }

        const snapshot = await db.collection('estimations')
            .where('contractorEmail', '==', contractorEmail)
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                projectName: data.projectTitle || data.projectName,
                projectTitle: data.projectTitle || data.projectName,
                projectDescription: data.description || data.projectDescription,
                description: data.description || data.projectDescription,
                contractorEmail: data.contractorEmail,
                contractorName: data.contractorName,
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile || null,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                completedAt: data.completedAt,
                hasResult: !!(data.resultFile && data.resultFile.url)
            };
        });

        console.log(`[ESTIMATION] Found ${estimations.length} estimations for contractor ${contractorEmail}`);
        res.json({ success: true, estimations });

    } catch (error) {
        console.error('[ESTIMATION] Fetch contractor estimations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimations'
        });
    }
});

// Get all estimations (admin only)
router.get('/all', async (req, res) => {
    try {
        // Check admin permission
        if (req.user.role !== 'admin' && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        console.log('[ESTIMATION] Admin fetching all estimations');

        const snapshot = await db.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                ...data,
                hasResult: !!(data.resultFile && data.resultFile.url)
            };
        });

        console.log(`[ESTIMATION] Found ${estimations.length} total estimations`);
        res.json({ success: true, estimations });

    } catch (error) {
        console.error('[ESTIMATION] Fetch all estimations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching all estimations'
        });
    }
});

// Get specific estimation details
router.get('/:estimationId', async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`[ESTIMATION] Fetching details for estimation: ${estimationId} by user: ${req.user.email}`);

        const estimationDoc = await db.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const data = estimationDoc.data();

        // Check access permission
        const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this estimation'
            });
        }

        const estimation = {
            _id: estimationDoc.id,
            ...data,
            hasResult: !!(data.resultFile && data.resultFile.url)
        };

        res.json({ success: true, estimation });

    } catch (error) {
        console.error('[ESTIMATION] Get estimation details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation details'
        });
    }
});

// Get estimation result file info for contractor
router.get('/:estimationId/result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`[ESTIMATION] Download result request for estimation: ${estimationId} by user: ${req.user.email}`);

        const estimationDoc = await db.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            console.log(`[ESTIMATION] Estimation not found: ${estimationId}`);
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const data = estimationDoc.data();

        // Verify this estimation belongs to the current contractor
        const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwner && !isAdmin) {
            console.log(`[ESTIMATION] Access denied. Estimation belongs to: ${data.contractorEmail}, requested by: ${req.user.email}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied to this estimation'
            });
        }

        // Check if result file exists
        if (!data.resultFile || !data.resultFile.url) {
            console.log(`[ESTIMATION] No result file available for estimation: ${estimationId}`);
            return res.status(404).json({
                success: false,
                message: 'No result file available for this estimation yet. Please wait for admin to upload the result.'
            });
        }

        console.log(`[ESTIMATION] Providing download info for result file: ${data.resultFile.name}`);

        // Return the download information
        res.json({
            success: true,
            downloadInfo: {
                url: data.resultFile.url,
                filename: data.resultFile.name || 'estimation_result.pdf',
                uploadedAt: data.resultFile.uploadedAt,
                uploadedBy: data.resultFile.uploadedBy || 'Admin',
                size: data.resultFile.size || null
            },
            estimation: {
                id: estimationId,
                projectName: data.projectTitle || data.projectName,
                status: data.status,
                completedAt: data.completedAt
            }
        });

    } catch (error) {
        console.error("[ESTIMATION] Download Result Error:", error);
        res.status(500).json({
            success: false,
            message: 'Error accessing result file',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Direct download endpoint (alternative approach)
router.get('/:estimationId/download-result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`[ESTIMATION] Direct download request for estimation: ${estimationId} by user: ${req.user.email}`);

        const estimationDoc = await db.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const data = estimationDoc.data();

        // Verify access
        const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Check if result exists
        if (!data.resultFile || !data.resultFile.url) {
            return res.status(404).json({
                success: false,
                message: 'Result file not available yet'
            });
        }

        // Redirect to the Firebase Storage URL for direct download
        res.redirect(data.resultFile.url);

    } catch (error) {
        console.error("[ESTIMATION] Direct Download Error:", error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file'
        });
    }
});

// Get estimation files (for admin to view uploaded files)
router.get('/:estimationId/files', async (req, res) => {
    try {
        const { estimationId } = req.params;

        const estimationDoc = await db.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const data = estimationDoc.data();

        // Check access permission
        const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const files = data.uploadedFiles || [];
        res.json({
            success: true,
            files: files,
            estimationInfo: {
                id: estimationId,
                projectTitle: data.projectTitle || data.projectName,
                contractorName: data.contractorName,
                status: data.status
            }
        });

    } catch (error) {
        console.error('[ESTIMATION] Get files error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation files'
        });
    }
});

// Download specific uploaded file by index
router.get('/:estimationId/files/:fileIndex/download', async (req, res) => {
    try {
        const { estimationId, fileIndex } = req.params;

        const estimationDoc = await db.collection('estimations').doc(estimationId).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const data = estimationDoc.data();

        // Check access permission
        const isOwner = data.contractorEmail === req.user.email || data.contractorId === req.user.uid;
        const isAdmin = req.user.role === 'admin' || req.user.type === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const files = data.uploadedFiles || [];
        const index = parseInt(fileIndex);

        if (index >= files.length || index < 0) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        const file = files[index];
        res.json({
            success: true,
            file: {
                url: file.url,
                name: file.name,
                downloadUrl: file.url,
                size: file.size,
                mimetype: file.mimetype
            }
        });

    } catch (error) {
        console.error('[ESTIMATION] Download file error:', error);
        res.status(500).json({
            success: false,
            message: 'Error accessing file'
        });
    }
});

// Update estimation status (admin only)
router.patch('/:estimationId/status', async (req, res) => {
    try {
        // Check admin permission
        if (req.user.role !== 'admin' && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { estimationId } = req.params;
        const { status, adminNotes } = req.body;

        const validStatuses = ['pending', 'in_progress', 'completed', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const updateData = {
            status: status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (adminNotes) {
            updateData.adminNotes = adminNotes;
        }

        if (status === 'completed') {
            updateData.completedAt = new Date().toISOString();
        }

        await db.collection('estimations').doc(estimationId).update(updateData);

        console.log(`[ESTIMATION] Status updated to ${status} for estimation: ${estimationId}`);

        res.json({
            success: true,
            message: `Estimation status updated to ${status}`
        });

    } catch (error) {
        console.error('[ESTIMATION] Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating estimation status'
        });
    }
});

// Upload result file (admin only) - this should match what's in your admin.js
router.post('/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        // Check admin permission
        if (req.user.role !== 'admin' && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { estimationId } = req.params;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Result file is required'
            });
        }

        console.log(`[ESTIMATION] Uploading result for estimation: ${estimationId} by admin: ${req.user.email}`);

        const filePath = `estimations/results/${estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);

        const updateData = {
            resultFile: {
                url: fileUrl,
                name: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.email
            },
            status: 'completed',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.collection('estimations').doc(estimationId).update(updateData);

        console.log(`[ESTIMATION] Result uploaded successfully: ${req.file.originalname}`);

        res.json({
            success: true,
            message: 'Estimation result uploaded successfully'
        });

    } catch (error) {
        console.error('[ESTIMATION] Upload result error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading result',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Delete estimation (admin only)
router.delete('/:estimationId', async (req, res) => {
    try {
        // Check admin permission
        if (req.user.role !== 'admin' && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { estimationId } = req.params;

        await db.collection('estimations').doc(estimationId).delete();

        console.log(`[ESTIMATION] Deleted estimation: ${estimationId} by admin: ${req.user.email}`);

        res.json({
            success: true,
            message: 'Estimation deleted successfully'
        });

    } catch (error) {
        console.error('[ESTIMATION] Delete estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting estimation'
        });
    }
});

export default router;
