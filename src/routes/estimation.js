// src/routes/estimation.js - Fixed version compatible with your existing auth middleware
import express from 'express';
import { upload, uploadToFirebase } from '../middleware/upload.js';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Simple authentication middleware for contractors (using your existing pattern)
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return next(); // Allow anonymous access for legacy endpoints
        }
        
        // Use Firebase Admin to verify token
        const decodedToken = await adminDb.auth().verifyIdToken(token);
        
        // Get user data from Firestore
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
            req.user = {
                id: decodedToken.uid,
                ...userDoc.data()
            };
        }
        
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return next(); // Allow to continue for legacy endpoints
    }
};

// Middleware to require authentication
const requireAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        // Use Firebase Admin to verify token
        const decodedToken = await adminDb.auth().verifyIdToken(token);
        
        // Get user data from Firestore
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        req.user = {
            id: decodedToken.uid,
            ...userDoc.data()
        };
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
};

// Helper function to format estimation data
const formatEstimationData = (docId, data) => {
    return {
        id: docId,
        _id: docId, // Keep for compatibility
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        estimationStartDate: data.estimationStartDate?.toDate ? data.estimationStartDate.toDate().toISOString() : data.estimationStartDate,
        estimationCompletedDate: data.estimationCompletedDate?.toDate ? data.estimationCompletedDate.toDate().toISOString() : data.estimationCompletedDate,
        dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate
    };
};

// --- ADMIN ROUTES (Enhanced with Firebase) ---

// GET /api/estimation - Get all estimations (Admin only)
router.get('/', isAdmin, async (req, res) => {
    try {
        console.log('Admin requesting all estimations');
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status;
        
        let query = adminDb.collection('estimations');
        
        // Apply status filter if provided
        if (status) {
            query = query.where('status', '==', status);
        }
        
        // Order by creation date
        query = query.orderBy('createdAt', 'desc');
        
        // Apply pagination
        const offset = (page - 1) * limit;
        if (offset > 0) {
            query = query.offset(offset);
        }
        query = query.limit(limit);
        
        const snapshot = await query.get();
        const estimations = snapshot.docs.map(doc => formatEstimationData(doc.id, doc.data()));
        
        // Get total count for pagination
        let countQuery = adminDb.collection('estimations');
        if (status) countQuery = countQuery.where('status', '==', status);
        const countSnapshot = await countQuery.get();
        const total = countSnapshot.size;
        
        res.json({
            success: true,
            estimations: estimations,
            pagination: {
                current: page,
                pages: Math.ceil(total / limit),
                total,
                limit,
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
        
    } catch (error) {
        console.error('Get estimations error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch estimations'
        });
    }
});

// GET /api/estimation/:id - Get specific estimation (Admin only)
router.get('/:id', isAdmin, async (req, res) => {
    try {
        const estimationId = req.params.id;
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        const estimation = formatEstimationData(doc.id, doc.data());
        
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
router.get('/:id/files', authenticateToken, async (req, res) => {
    try {
        const estimationId = req.params.id;
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        const estimation = doc.data();
        
        // Check access rights (Admin or owner)
        if (req.user && req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
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

// PATCH /api/estimation/:id/status - Update estimation status (Admin only)
router.patch('/:id/status', isAdmin, async (req, res) => {
    try {
        const estimationId = req.params.id;
        const { status } = req.body;
        const adminId = req.user?.id;
        
        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected', 'cancelled'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        const updateData = {
            status,
            updatedAt: new Date()
        };
        
        // Update related fields based on status
        if (status === 'in-progress') {
            updateData.estimationStartDate = new Date();
            if (adminId) updateData.estimatedBy = adminId;
        } else if (status === 'completed') {
            updateData.estimationCompletedDate = new Date();
            if (!doc.data().estimatedBy && adminId) {
                updateData.estimatedBy = adminId;
            }
        }
        
        await docRef.update(updateData);
        
        // Get updated document
        const updatedDoc = await docRef.get();
        const estimation = formatEstimationData(updatedDoc.id, updatedDoc.data());
        
        console.log('Estimation status updated:', estimationId, 'to', status);
        
        res.json({
            success: true,
            estimation: estimation,
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
        const { notes, estimatedAmount } = req.body;
        const adminId = req.user?.id;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No result file provided'
            });
        }
        
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        try {
            const fileUrl = await uploadToFirebase(req.file, `estimation-results/${estimationId}`);
            
            const updateData = {
                resultFile: {
                    name: req.file.originalname,
                    url: fileUrl,
                    size: req.file.size,
                    mimeType: req.file.mimetype,
                    uploadedAt: new Date()
                },
                status: 'completed',
                updatedAt: new Date(),
                estimationCompletedDate: new Date()
            };
            
            if (adminId) updateData.estimatedBy = adminId;
            if (notes) updateData.adminNotes = notes;
            if (estimatedAmount) updateData.estimatedAmount = parseFloat(estimatedAmount);
            
            await docRef.update(updateData);
            
            // Get updated document
            const updatedDoc = await docRef.get();
            const estimation = formatEstimationData(updatedDoc.id, updatedDoc.data());
            
            console.log('Estimation result uploaded:', estimationId);
            
            res.json({
                success: true,
                estimation: estimation,
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

// GET /api/estimation/:id/result - Get estimation result
router.get('/:id/result', authenticateToken, async (req, res) => {
    try {
        const estimationId = req.params.id;
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        const estimation = doc.data();
        
        // Check access rights (Admin or owner)
        if (req.user && req.user.type !== 'admin' && estimation.contractorId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
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

// PATCH /api/estimation/:id/due-date - Set due date (Admin only)
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
        
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        await docRef.update({
            dueDate: new Date(dueDate),
            updatedAt: new Date()
        });
        
        // Get updated document
        const updatedDoc = await docRef.get();
        const estimation = formatEstimationData(updatedDoc.id, updatedDoc.data());
        
        console.log('Estimation due date set:', estimationId, 'to', dueDate);
        
        res.json({
            success: true,
            estimation: estimation,
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
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const estimationId = req.params.id;
        
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        const estimation = doc.data();
        
        // Check permissions - Admin can delete any, contractors can only delete their pending ones
        if (req.user) {
            if (req.user.type !== 'admin') {
                if (estimation.contractorId !== req.user.id) {
                    return res.status(403).json({
                        success: false,
                        error: 'Access denied'
                    });
                }
                if (estimation.status !== 'pending') {
                    return res.status(400).json({
                        success: false,
                        error: 'Can only delete pending estimations'
                    });
                }
            }
        }
        
        await docRef.delete();
        
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

// POST /api/estimation/submit - Submit new estimation request (Authenticated users)
router.post('/submit', requireAuth, upload.array('estimationFile', 10), async (req, res) => {
    try {
        const { projectTitle, description } = req.body;
        const userId = req.user.id;
        
        // Validate required fields
        if (!projectTitle || !description) {
            return res.status(400).json({
                success: false,
                error: 'Project title and description are required'
            });
        }
        
        const uploadedFiles = [];
        
        // Upload files to Firebase Storage
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const fileUrl = await uploadToFirebase(file, `estimation-uploads/${userId}`);
                    uploadedFiles.push({
                        name: file.originalname,
                        url: fileUrl,
                        size: file.size,
                        mimeType: file.mimetype,
                        uploadedAt: new Date()
                    });
                } catch (uploadError) {
                    console.error('File upload error:', uploadError);
                    // Continue with other files even if one fails
                }
            }
        }
        
        // Create estimation document
        const estimationData = {
            projectTitle,
            description,
            contractorId: userId,
            contractorName: req.user.name,
            contractorEmail: req.user.email,
            status: 'pending',
            uploadedFiles,
            createdAt: new Date(),
            updatedAt: new Date(),
            // Additional fields for tracking
            priority: 'normal',
            estimatedAmount: null,
            estimatedBy: null,
            estimationStartDate: null,
            estimationCompletedDate: null,
            adminNotes: '',
            resultFile: null,
            dueDate: null
        };
        
        // Add to Firestore
        const docRef = await adminDb.collection('estimations').add(estimationData);
        
        // Get the created document
        const createdDoc = await docRef.get();
        const formattedEstimation = formatEstimationData(docRef.id, createdDoc.data());
        
        console.log('New estimation submitted:', projectTitle, 'by', req.user.name);
        
        res.status(201).json({
            success: true,
            data: formattedEstimation,
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

// POST /api/estimation/contractor/submit - Legacy endpoint for compatibility
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
        
        // Upload files to Firebase Storage
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const fileUrl = await uploadToFirebase(file, `estimation-uploads/${contractorEmail}`);
                    uploadedFiles.push({
                        name: file.originalname,
                        url: fileUrl,
                        size: file.size,
                        mimeType: file.mimetype,
                        uploadedAt: new Date()
                    });
                } catch (uploadError) {
                    console.error('File upload error:', uploadError);
                }
            }
        }
        
        const estimationData = {
            projectTitle,
            description,
            contractorName,
            contractorEmail,
            contractorId: null, // Legacy - no user ID
            status: 'pending',
            uploadedFiles,
            createdAt: new Date(),
            updatedAt: new Date(),
            priority: 'normal',
            estimatedAmount: null,
            estimatedBy: null,
            adminNotes: '',
            resultFile: null
        };
        
        const docRef = await adminDb.collection('estimations').add(estimationData);
        const createdDoc = await docRef.get();
        const formattedEstimation = formatEstimationData(docRef.id, createdDoc.data());
        
        console.log('New estimation submitted (legacy):', projectTitle, 'by', contractorName);
        
        res.status(201).json({
            success: true,
            estimation: formattedEstimation,
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
router.get('/contractor/:email', authenticateToken, async (req, res) => {
    try {
        const contractorEmail = req.params.email;
        
        // If user is authenticated, verify they can access this email's data
        if (req.user && req.user.email !== contractorEmail && req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }
        
        const snapshot = await adminDb.collection('estimations')
            .where('contractorEmail', '==', contractorEmail)
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = snapshot.docs.map(doc => formatEstimationData(doc.id, doc.data()));
        
        console.log('Contractor estimations requested:', contractorEmail);
        
        res.json({
            success: true,
            estimations: estimations
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
