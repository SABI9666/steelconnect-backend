import express from 'express';
import multer from 'multer';
import { adminDb, bucket } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for file uploads (large PDF support)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit (large drawings/blueprints)
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
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
    } else if (err.message === 'Only PDF files are allowed') {
        return res.status(400).json({ 
            success: false, 
            message: 'Only PDF files are allowed.' 
        });
    }
    next(err);
};

// Submit estimation request (for contractors)
router.post('/submit', authenticateToken, upload.single('estimationFile'), handleMulterError, async (req, res) => {
    try {
        const { projectTitle, description } = req.body;
        const file = req.file;
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

        let uploadedFile = null;
        
        // Handle file upload if provided
        if (file) {
            try {
                const fileName = `estimations/requests/${userId}_${Date.now()}_${file.originalname}`;
                const fileUpload = bucket.file(fileName);
                
                await fileUpload.save(file.buffer, {
                    metadata: {
                        contentType: file.mimetype,
                        metadata: {
                            uploadedBy: userId,
                            uploadedAt: new Date().toISOString(),
                            originalName: file.originalname
                        }
                    }
                });
                
                // Make file publicly accessible
                await fileUpload.makePublic();
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                
                uploadedFile = {
                    url: publicUrl,
                    fileName: file.originalname,
                    path: fileName,
                    uploadedAt: new Date().toISOString(),
                    size: file.size
                };
            } catch (uploadError) {
                console.error('File upload error:', uploadError);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to upload file. Please try again.' 
                });
            }
        }

        // Save estimation request to Firestore
        const estimationData = {
            contractorId: userId,
            projectTitle: projectTitle.trim(),
            description: description.trim(),
            uploadedFile,
            status: 'pending',
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
                hasFile: !!file
            }
        });

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
