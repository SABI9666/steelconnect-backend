import express from 'express';
import multer from 'multer';
import { adminDb, bucket } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 10 * 1024 * 1024 // 10MB limit
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
                message: 'File too large. Maximum size is 10MB.' 
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

// POST /api/estimation/submit - Submit a new estimation request (for contractors)
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

        // Check user type
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || userDoc.data().type !== 'contractor') {
            return res.status(403).json({ 
                success: false, 
                message: 'Only contractors can submit estimation requests' 
            });
        }

        let uploadedFile = null;
        
        // Handle file upload if one is provided
        if (file) {
            try {
                const fileName = `estimations/requests/${userId}_${Date.now()}_${file.originalname}`;
                const fileUpload = bucket.file(fileName);
                
                await fileUpload.save(file.buffer, {
                    metadata: { contentType: file.mimetype }
                });
                
                await fileUpload.makePublic();
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                
                uploadedFile = {
                    url: publicUrl,
                    fileName: file.originalname,
                    path: fileName,
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
            status: 'pending', // Initial status
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const estimationRef = await adminDb.collection('estimations').add(estimationData);

        res.status(201).json({ 
            success: true, 
            message: 'Estimation request submitted successfully',
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

// GET /api/estimation/my-requests - Get a contractor's own estimation requests
router.get('/my-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Query Firestore for estimations belonging to the logged-in contractor
        const snapshot = await adminDb.collection('estimations')
            .where('contractorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();

        const estimations = [];
        snapshot.forEach(doc => {
            estimations.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            data: estimations
        });

    } catch (error) {
        console.error('Error fetching contractor estimation requests:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

// GET /api/estimation/all - Get all estimation requests (for admins/managers)
router.get('/all', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Check for admin privileges
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists || !['admin', 'manager'].includes(userDoc.data().type)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Admin privileges required.' 
            });
        }

        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();

        const estimations = [];
        snapshot.forEach(doc => {
            estimations.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({
            success: true,
            data: estimations
        });

    } catch (error) {
        console.error('Error fetching all estimations:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

export default router;
