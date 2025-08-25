// src/routes/estimation.js - Complete Firebase Integrated Version
import express from 'express';
import { upload, uploadToFirebase } from '../middleware/upload.js';
import { isAdmin, authenticateUser } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

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

// Initialize with mock data if needed (for testing)
const initializeMockData = async () => {
    try {
        const snapshot = await adminDb.collection('estimations').limit(1).get();
        if (snapshot.empty) {
            console.log('Initializing estimation collection with sample data...');
            
            const mockEstimations = [
                {
                    projectTitle: 'Office Building Steel Frame',
                    contractorName: 'Steel Works Inc',
                    contractorEmail: 'contractor@steelworks.com',
                    contractorId: 'mock-contractor-1',
                    status: 'pending',
                    description: 'Structural steel framework for 5-story office building',
                    uploadedFiles: [
                        {
                            name: 'blueprints.pdf',
                            url: 'https://example.com/files/blueprints.pdf',
                            uploadedAt: new Date()
                        }
                    ],
                    createdAt: new Date(Date.now() - 86400000),
                    updatedAt: new Date(Date.now() - 86400000),
                    priority: 'normal',
                    estimatedAmount: null,
                    estimatedBy: null,
                    adminNotes: '',
                    resultFile: null
                },
                {
                    projectTitle: 'Bridge Reinforcement Project',
                    contractorName: 'Metro Construction',
                    contractorEmail: 'info@metroconstruction.com',
                    contractorId: 'mock-contractor-2',
                    status: 'completed',
                    description: 'Steel reinforcement for highway bridge expansion',
                    uploadedFiles: [
                        {
                            name: 'specifications.pdf',
                            url: 'https://example.com/files/specifications.pdf',
                            uploadedAt: new Date()
                        }
                    ],
                    resultFile: {
                        name: 'estimation_result.pdf',
                        url: 'https://example.com/results/estimation_result.pdf',
                        uploadedAt: new Date()
                    },
                    estimatedAmount: 125000,
                    createdAt: new Date(Date.now() - 172800000),
                    updatedAt: new Date(Date.now() - 43200000),
                    priority: 'high',
                    estimatedBy: 'admin-user-1',
                    adminNotes: 'Completed with standard specifications'
                }
            ];

            for (const estimation of mockEstimations) {
                await adminDb.collection('estimations').add(estimation);
            }
            console.log('Sample estimation data initialized');
        }
    } catch (error) {
        console.error('Error initializing mock data:', error);
    }
};

// Initialize mock data on server start (call this once)
// initializeMockData();

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
        
        // Get contractor details if available
        if (estimation.contractorId) {
            try {
                const contractorDoc = await adminDb.collection('users').doc(estimation.contractorId).get();
                if (contractorDoc.exists) {
                    const contractorData = contractorDoc.data();
                    estimation.contractorDetails = {
                        id: contractorDoc.id,
                        name: contractorData.name,
                        email: contractorData.email,
                        type: contractorData.type,
                        phone: contractorData.phone,
                        company: contractorData.company
                    };
                }
            } catch (err) {
                console.warn('Could not fetch contractor details:', err.message);
            }
        }
        
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
router.get('/:id/files', async (req, res) => {
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
        const adminId = req.user.id;
        
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
            updateData.estimatedBy = adminId;
        } else if (status === 'completed') {
            updateData.estimationCompletedDate = new Date();
            if (!doc.data().estimatedBy) {
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
        const adminId = req.user.id;
        
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
                estimationCompletedDate: new Date(),
                estimatedBy: adminId
            };
            
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
router.get('/:id/result', async (req, res) => {
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

// PATCH /api/estimation/:id/amount - Update estimation amount (Admin only)
router.patch('/:id/amount', isAdmin, async (req, res) => {
    try {
        const estimationId = req.params.id;
        const { amount } = req.body;
        
        if (!amount || isNaN(amount) || amount < 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid amount is required'
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
            estimatedAmount: parseFloat(amount),
            updatedAt: new Date()
        });
        
        // Get updated document
        const updatedDoc = await docRef.get();
        const estimation = formatEstimationData(updatedDoc.id, updatedDoc.data());
        
        res.json({
            success: true,
            estimation: estimation,
            message: 'Estimation amount updated successfully'
        });
        
    } catch (error) {
        console.error('Update amount error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update estimation amount'
        });
    }
});

// PATCH /api/estimation/:id/notes - Add/update admin notes (Admin only)
router.patch('/:id/notes', isAdmin, async (req, res) => {
    try {
        const estimationId = req.params.id;
        const { notes } = req.body;
        
        const docRef = adminDb.collection('estimations').doc(estimationId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Estimation not found'
            });
        }
        
        await docRef.update({
            adminNotes: notes || '',
            updatedAt: new Date()
        });
        
        // Get updated document
        const updatedDoc = await docRef.get();
        const estimation = formatEstimationData(updatedDoc.id, updatedDoc.data());
        
        res.json({
            success: true,
            estimation: estimation,
            message: 'Notes updated successfully'
        });
        
    } catch (error) {
        console.error('Update notes error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update notes'
        });
    }
});

// DELETE /api/estimation/:id - Delete estimation
router.delete('/:id', async (req, res) => {
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

// --- CONTRACTOR ROUTES (Enhanced with Firebase and Authentication) ---

// POST /api/estimation/submit - Submit new estimation request (Updated endpoint)
router.post('/submit', authenticateUser, upload.array('estimationFile', 10), async (req, res) => {
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
        
        // Get user data
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userData = userDoc.data();
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
            contractorName: userData.name,
            contractorEmail: userData.email,
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
        
        console.log('New estimation submitted:', projectTitle, 'by', userData.name);
        
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
router.get('/contractor/:email', async (req, res) => {
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

// GET /api/estimation/my-estimations - Get current user's estimations
router.get('/my-estimations', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const snapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = snapshot.docs.map(doc => formatEstimationData(doc.id, doc.data()));
        
        res.json({
            success: true,
            data: estimations
        });
        
    } catch (error) {
        console.error('Get my estimations error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch estimations'
        });
    }
});

// GET /api/estimation/stats/dashboard - Get estimation dashboard stats (Admin only)
router.get('/stats/dashboard', isAdmin, async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').get();
        
        const stats = {
            total: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
            rejected: 0,
            cancelled: 0,
            overdue: 0,
            totalValue: 0,
            avgCompletionDays: 0
        };
        
        const completionTimes = [];
        const now = new Date();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            stats.total++;
            
            // Count by status
            if (data.status) {
                const statusKey = data.status.replace('-', '');
                if (stats.hasOwnProperty(statusKey)) {
                    stats[statusKey]++;
                } else if (data.status === 'in-progress') {
                    stats.inProgress++;
                }
            }
            
            // Total estimated value
            if (data.estimatedAmount) {
                stats.totalValue += data.estimatedAmount;
            }
            
            // Check for overdue
            if (data.dueDate && data.status !== 'completed' && data.dueDate.toDate() < now) {
                stats.overdue++;
            }
            
            // Calculate completion time
            if (data.status === 'completed' && data.estimationStartDate && data.estimationCompletedDate) {
                const startDate = data.estimationStartDate.toDate();
                const endDate = data.estimationCompletedDate.toDate();
                const completionDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
                completionTimes.push(completionDays);
            }
        });
        
        // Calculate average completion time
        if (completionTimes.length > 0) {
            stats.avgCompletionDays = Math.round(
                completionTimes.reduce((sum, days) => sum + days, 0) / completionTimes.length
            );
        }
        
        res.json({
            success: true,
            stats: stats
        });
        
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dashboard statistics'
        });
    }
});

export default router;
