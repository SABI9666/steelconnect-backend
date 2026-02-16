import express from 'express';
import multer from 'multer';
import { adminDb, storage, uploadToFirebaseStorage, FILE_UPLOAD_CONFIG } from '../../config/firebase.js';
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { generateAIEstimate } from '../../services/aiEstimationService.js';

const router = express.Router();

// Configure multer for file uploads - supports all construction file types
const allowedExtensions = ['pdf', 'dwg', 'dxf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'txt', 'rtf', 'zip', 'rar'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit (large drawings/blueprints)
        files: 20
    },
    fileFilter: (req, file, cb) => {
        const ext = file.originalname.toLowerCase().split('.').pop();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type .${ext} is not supported. Allowed: PDF, DWG, DXF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG, TIF, TXT, ZIP, RAR`), false);
        }
    }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 50MB.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 20 files allowed.'
            });
        }
    } else if (err.message && err.message.includes('not supported')) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next(err);
};

// Submit estimation request (for contractors) - supports multiple files
router.post('/submit', authenticateToken, upload.array('files', 20), handleMulterError, async (req, res) => {
    try {
        const { projectTitle, description, designStandard, projectType, region } = req.body;
        const files = req.files || [];
        const file = files[0] || req.file; // backwards compat for single file
        const userId = req.user.userId;

        // Validate required fields
        if (!projectTitle || !description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Project title and description are required' 
            });
        }

        if (projectTitle.length > 100) {
            return res.status(400).json({ 
                success: false, 
                message: 'Project title must be less than 100 characters' 
            });
        }

        if (description.length > 2000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Description must be less than 2000 characters' 
            });
        }

        // Check if user is a contractor
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || userDoc.data().type !== 'contractor') {
            return res.status(403).json({ 
                success: false, 
                message: 'Only contractors can submit estimation requests' 
            });
        }

        let uploadedFiles = [];

        // Handle file upload(s) if provided
        const allFiles = files.length > 0 ? files : (file ? [file] : []);
        if (allFiles.length > 0) {
            try {
                const uploadPromises = allFiles.map(async (f, index) => {
                    const timestamp = Date.now();
                    const filePath = `estimation-files/${userId}/${timestamp}_${index}_${f.originalname}`;
                    const metadata = {
                        contractorId: userId,
                        uploadedBy: userId,
                        fileIndex: index,
                        uploadBatch: timestamp
                    };
                    return uploadToFirebaseStorage(f, filePath, metadata);
                });
                uploadedFiles = await Promise.all(uploadPromises);
                console.log(`[CONTRACTOR-PORTAL] Successfully uploaded ${uploadedFiles.length} files`);
            } catch (uploadError) {
                console.error('File upload error:', uploadError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload file. Please try again.'
                });
            }
        }

        // Save estimation request to Firestore
        const fileNames = allFiles.map(f => f.originalname);
        const estimationData = {
            contractorId: userId,
            contractorEmail: req.user.email,
            contractorName: req.user.name || '',
            projectTitle: projectTitle.trim(),
            description: description.trim(),
            designStandard: designStandard || '',
            projectType: projectType || '',
            region: region || '',
            uploadedFiles,
            uploadedFile: uploadedFiles[0] || null, // backwards compat
            fileCount: uploadedFiles.length,
            totalFileSize: uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
            status: 'pending',
            aiStatus: 'generating',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const estimationRef = await adminDb.collection('estimations').add(estimationData);

        // Log the activity
        await adminDb.collection('activity_logs').add({
            userId,
            action: 'estimation_submitted',
            estimationId: estimationRef.id,
            timestamp: new Date().toISOString(),
            metadata: {
                projectTitle: projectTitle.trim(),
                hasFile: allFiles.length > 0,
                fileCount: allFiles.length
            }
        });

        res.status(201).json({
            success: true,
            message: `Estimation request submitted successfully with ${uploadedFiles.length} file(s). AI estimate is being generated.`,
            estimationId: estimationRef.id,
            data: {
                id: estimationRef.id,
                ...estimationData
            }
        });

        // Fire-and-forget: Generate AI estimate in background AFTER response is sent
        (async () => {
            try {
                console.log(`[CONTRACTOR-PORTAL] Starting background AI generation for ${estimationRef.id}`);
                const aiEstimate = await generateAIEstimate(
                    {
                        projectTitle: projectTitle.trim(),
                        description: description.trim(),
                        designStandard: designStandard || '',
                        projectType: projectType || '',
                        region: region || ''
                    },
                    {},
                    fileNames,
                    allFiles // pass actual file buffers for Claude Vision drawing analysis
                );
                await adminDb.collection('estimations').doc(estimationRef.id).update({
                    aiEstimate,
                    aiGeneratedAt: new Date().toISOString(),
                    aiStatus: 'completed',
                    estimatedAmount: aiEstimate?.summary?.grandTotal || aiEstimate?.summary?.totalEstimate || 0,
                    updatedAt: new Date().toISOString()
                });
                console.log(`[CONTRACTOR-PORTAL] AI estimate saved for ${estimationRef.id}`);
            } catch (aiError) {
                console.error(`[CONTRACTOR-PORTAL] AI generation failed for ${estimationRef.id}:`, aiError.message);
                try {
                    await adminDb.collection('estimations').doc(estimationRef.id).update({
                        aiStatus: 'failed',
                        aiError: aiError.message,
                        updatedAt: new Date().toISOString()
                    });
                } catch (updateErr) {
                    console.error(`[CONTRACTOR-PORTAL] Failed to update AI status:`, updateErr.message);
                }
            }
        })().catch(err => console.error(`[CONTRACTOR-PORTAL] Unhandled AI error:`, err.message));

    } catch (error) {
        console.error('Error submitting estimation request:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error. Please try again later.' 
        });
    }
});

// Get contractor's estimation requests
router.get('/my-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { status, limit = 10, offset = 0 } = req.query;

        // Check if user is a contractor
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || userDoc.data().type !== 'contractor') {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        let query = adminDb.collection('estimations')
            .where('contractorId', '==', userId)
            .orderBy('createdAt', 'desc');

        if (status) {
            query = query.where('status', '==', status);
        }

        const snapshot = await query
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        const estimations = [];
        snapshot.forEach(doc => {
            estimations.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Get total count for pagination
        const countSnapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', userId)
            .get();

        res.json({
            success: true,
            data: estimations,
            pagination: {
                total: countSnapshot.size,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: countSnapshot.size > parseInt(offset) + parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching estimation requests:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Get all estimation requests (for admins/managers)
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { status, contractorId, limit = 10, offset = 0 } = req.query;

        // Check if user has admin privileges
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().type)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Admin privileges required.' 
            });
        }

        let query = adminDb.collection('estimations').orderBy('createdAt', 'desc');

        if (status) {
            query = query.where('status', '==', status);
        }

        if (contractorId) {
            query = query.where('contractorId', '==', contractorId);
        }

        const snapshot = await query
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();

        const estimations = [];
        const contractorIds = new Set();

        snapshot.forEach(doc => {
            const data = doc.data();
            estimations.push({
                id: doc.id,
                ...data
            });
            contractorIds.add(data.contractorId);
        });

        // Fetch contractor details
        const contractorPromises = Array.from(contractorIds).map(async (contractorId) => {
            const contractorDoc = await adminDb.collection('users').doc(contractorId).get();
            return {
                id: contractorId,
                name: contractorDoc.exists ? contractorDoc.data().name : 'Unknown',
                email: contractorDoc.exists ? contractorDoc.data().email : 'Unknown'
            };
        });

        const contractors = await Promise.all(contractorPromises);
        const contractorMap = contractors.reduce((acc, contractor) => {
            acc[contractor.id] = contractor;
            return acc;
        }, {});

        // Enrich estimations with contractor info
        const enrichedEstimations = estimations.map(estimation => ({
            ...estimation,
            contractor: contractorMap[estimation.contractorId]
        }));

        // Get total count
        const countQuery = adminDb.collection('estimations');
        const countSnapshot = await countQuery.get();

        res.json({
            success: true,
            data: enrichedEstimations,
            pagination: {
                total: countSnapshot.size,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: countSnapshot.size > parseInt(offset) + parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching all estimations:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Get single estimation request
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const estimationDoc = await adminDb.collection('estimations').doc(id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Estimation request not found' 
            });
        }

        const estimationData = estimationDoc.data();
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userType = userDoc.data()?.type;

        // Check access permissions
        const isContractorOwner = estimationData.contractorId === userId;
        const isAdmin = ['admin', 'manager'].includes(userType);

        if (!isContractorOwner && !isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        // Get contractor info
        const contractorDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
        const contractor = contractorDoc.exists ? {
            id: estimationData.contractorId,
            name: contractorDoc.data().name,
            email: contractorDoc.data().email
        } : null;

        res.json({
            success: true,
            data: {
                id: estimationDoc.id,
                ...estimationData,
                contractor
            }
        });

    } catch (error) {
        console.error('Error fetching estimation:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Update estimation status (for admins/managers)
router.patch('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user.userId;

        // Validate status
        const validStatuses = ['pending', 'in-review', 'approved', 'rejected', 'completed'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ') 
            });
        }

        // Check admin privileges
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().type)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Admin privileges required.' 
            });
        }

        const estimationRef = adminDb.collection('estimations').doc(id);
        const estimationDoc = await estimationRef.get();

        if (!estimationDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Estimation request not found' 
            });
        }

        const updateData = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: userId
        };

        if (notes) {
            updateData.adminNotes = notes;
        }

        await estimationRef.update(updateData);

        // Log the activity
        await adminDb.collection('activity_logs').add({
            userId,
            action: 'estimation_status_updated',
            estimationId: id,
            timestamp: new Date().toISOString(),
            metadata: {
                oldStatus: estimationDoc.data().status,
                newStatus: status,
                notes: notes || null
            }
        });

        res.json({ 
            success: true, 
            message: 'Estimation status updated successfully',
            data: {
                id,
                status,
                updatedAt: updateData.updatedAt
            }
        });

    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// Delete estimation request
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const estimationDoc = await adminDb.collection('estimations').doc(id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Estimation request not found' 
            });
        }

        const estimationData = estimationDoc.data();
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userType = userDoc.data()?.type;

        // Check permissions - only the contractor who created it or admin can delete
        const isContractorOwner = estimationData.contractorId === userId;
        const isAdmin = ['admin', 'manager'].includes(userType);

        if (!isContractorOwner && !isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
            });
        }

        // Delete associated file if exists
        if (estimationData.uploadedFile?.path) {
            try {
                await bucket.file(estimationData.uploadedFile.path).delete();
            } catch (fileError) {
                console.error('Error deleting file:', fileError);
                // Continue with estimation deletion even if file deletion fails
            }
        }

        // Delete the estimation
        await adminDb.collection('estimations').doc(id).delete();

        // Log the activity
        await adminDb.collection('activity_logs').add({
            userId,
            action: 'estimation_deleted',
            estimationId: id,
            timestamp: new Date().toISOString(),
            metadata: {
                projectTitle: estimationData.projectTitle,
                deletedBy: userType === 'contractor' ? 'contractor' : 'admin'
            }
        });

        res.json({ 
            success: true, 
            message: 'Estimation request deleted successfully' 
        });

    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

export default router;
