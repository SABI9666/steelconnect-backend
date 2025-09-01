import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Import the pre-initialized db and bucket from our central firebase config
import { db, bucket } from '../config/firebase.js'; 
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Configure multer to handle file uploads in memory.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
});

/**
 * @route   GET /api/estimation/contractor/:email
 * @desc    Get all estimations for a specific contractor
 * @access  Private
 */
router.get('/contractor/:email', authenticate, async (req, res) => {
    try {
        const { email } = req.params;
        console.log(`Fetching estimations from Firestore for: ${email}`);
        
        const estimationsRef = db.collection('estimations');
        const snapshot = await estimationsRef.where('contractorEmail', '==', email).get();

        if (snapshot.empty) {
            // It's not an error if a user has no estimations, so return an empty array.
            return res.status(200).json({ success: true, estimations: [] });
        }

        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, estimations });

    } catch (error) {
        console.error('❌ Error fetching estimations by contractor:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch estimations.' });
    }
});

/**
 * @route   POST /api/estimation/
 * @desc    Create a new estimation with a file upload
 * @access  Private
 */
router.post('/', authenticate, upload.single('file'), async (req, res) => {
    try {
        const { projectTitle, contractorEmail } = req.body;

        // Validate that all required data is present.
        if (!projectTitle || !contractorEmail || !req.file) {
            return res.status(400).json({ success: false, error: 'Missing required fields or file.' });
        }

        console.log(`Creating new estimation for ${contractorEmail} with file: ${req.file.originalname}`);

        // Create a unique name for the file to prevent overwrites in storage.
        const fileName = `${uuidv4()}-${req.file.originalname}`;
        const fileUpload = bucket.file(fileName);

        // Create a writable stream to upload the file buffer.
        const blobStream = fileUpload.createWriteStream({
            metadata: { contentType: req.file.mimetype },
        });

        blobStream.on('error', (error) => {
            throw new Error('File upload to Firebase Storage failed:', error);
        });

        blobStream.on('finish', async () => {
            // The file is now uploaded.
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            
            // Now, save the estimation details (including the file URL) to Firestore.
            const newEstimation = {
                projectTitle,
                contractorEmail,
                fileUrl: publicUrl,
                originalFileName: req.file.originalname,
                status: 'Submitted',
                createdAt: new Date().toISOString(),
            };
            const docRef = await db.collection('estimations').add(newEstimation);

            res.status(201).json({ 
                success: true, 
                message: 'Estimation created successfully!',
                estimationId: docRef.id 
            });
        });

        // Start the upload by writing the file buffer to the stream.
        blobStream.end(req.file.buffer);

    } catch (error) {
        console.error('❌ Error creating estimation:', error);
        res.status(500).json({ success: false, error: 'Failed to create estimation.' });
    }
});

export default router;

