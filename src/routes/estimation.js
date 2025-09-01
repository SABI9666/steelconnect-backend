import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();
const bucket = getStorage().bucket();

// --- Multer Configuration for File Uploads ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// --- Controller Functions ---

const getEstimationsByContractorEmail = async (req, res) => {
    try {
        const { email } = req.params;
        console.log(`✅ Fetching estimations for contractor email from Firestore: ${email}`);
        const estimationsRef = db.collection('estimations');
        const snapshot = await estimationsRef.where('contractorEmail', '==', email).get();
        if (snapshot.empty) {
            return res.json({ success: true, estimations: [] });
        }
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });
    } catch (error) {
        console.error('❌ Error in getEstimationsByContractorEmail:', error);
        res.status(500).json({ success: false, error: 'Server error while fetching estimations.' });
    }
};

const createEstimation = async (req, res) => {
    try {
        console.log('✅ Creating a new estimation in Firestore...');
        const { projectTitle, contractorEmail } = req.body;
        if (!projectTitle || !contractorEmail || !req.file) {
            return res.status(400).json({ success: false, error: 'Missing required fields or file.' });
        }

        // --- File Upload to Firebase Storage ---
        const fileName = `${uuidv4()}-${req.file.originalname}`;
        const fileUpload = bucket.file(fileName);
        const blobStream = fileUpload.createWriteStream({
            metadata: { contentType: req.file.mimetype },
        });

        blobStream.on('error', (error) => {
            console.error('❌ Error uploading to Firebase Storage:', error);
            res.status(500).json({ success: false, error: 'File upload failed.' });
        });

        blobStream.on('finish', async () => {
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            
            // --- Save Estimation to Firestore ---
            const newEstimation = {
                projectTitle,
                contractorEmail,
                status: 'Submitted',
                createdAt: new Date().toISOString(),
                fileUrl: publicUrl,
                originalFileName: req.file.originalname,
            };
            const docRef = await db.collection('estimations').add(newEstimation);
            res.status(201).json({ 
                success: true, 
                message: 'Estimation created successfully.',
                estimationId: docRef.id 
            });
        });

        blobStream.end(req.file.buffer);

    } catch (error) {
        console.error('❌ Error in createEstimation:', error);
        res.status(500).json({ success: false, error: 'Server error while creating estimation.' });
    }
};

const router = express.Router();

// --- Routes ---
router.get('/contractor/:email', authenticate, getEstimationsByContractorEmail);
router.post('/', authenticate, upload.single('file'), createEstimation); // 'file' should match your form field name

export default router;

