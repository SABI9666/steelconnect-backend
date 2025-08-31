import express from 'express';
import multer from 'multer';
import { adminDb, adminStorage, adminAuth } from '../../firebase.js'; // Adjusted path to firebase.js

const router = express.Router();

// Middleware for authenticating tokens
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        // FIX: Use the exported adminAuth service directly
        const decodedToken = await adminAuth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

// Multer setup for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB limit
});

// GET contractor's estimations
router.get('/contractor/:email', authenticateToken, async (req, res) => {
    try {
        const { email } = req.params;
        console.log(`Contractor estimations requested: ${email}`);
        
        // Ensure the requesting user is the one they claim to be
        if (req.user.email !== email) {
            return res.status(403).json({ error: 'Forbidden: You can only access your own estimations.' });
        }

        const snapshot = await adminDb.collection('estimations')
            .where('contractorEmail', '==', email)
            .orderBy('createdAt', 'desc')
            .get();
            
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });

    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch estimations' });
    }
});

// POST a new estimation request
router.post('/contractor/submit', authenticateToken, upload.array('files', 10), async (req, res) => {
     try {
        const { projectTitle, description, contractorName, contractorEmail } = req.body;
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one file is required for estimation.' });
        }

        // Upload files to Firebase Storage and get URLs
        const bucket = adminStorage.bucket();
        const uploadPromises = req.files.map(file => {
            const blob = bucket.file(`estimations/${Date.now()}-${file.originalname}`);
            const blobStream = blob.createWriteStream({
                metadata: { contentType: file.mimetype }
            });

            return new Promise((resolve, reject) => {
                blobStream.on('error', err => reject(err));
                blobStream.on('finish', () => {
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
                    resolve({ name: file.originalname, url: publicUrl, uploadedAt: new Date() });
                });
                blobStream.end(file.buffer);
            });
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        const newEstimation = {
            projectTitle,
            description,
            contractorName,
            contractorEmail,
            uploadedFiles,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const docRef = await adminDb.collection('estimations').add(newEstimation);
        res.status(201).json({ success: true, message: 'Estimation submitted successfully', id: docRef.id });

    } catch (error) {
        console.error('Error submitting estimation:', error);
        res.status(500).json({ success: false, error: 'Failed to submit estimation' });
    }
});


export default router;
