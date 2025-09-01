// src/routes/estimation.js - CORRECTED with Firebase Storage

import express from 'express';
import multer from 'multer';
import path from 'path';
import jwt from 'jsonwebtoken';
import { adminDb, adminStorage } from '../config/firebase.js'; // Assuming you export storage from your config

const router = express.Router();
const bucket = adminStorage.bucket();

// --- (Authentication middleware like 'authenticate' and 'isContractor' remain the same) ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization token is required.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};

const isContractor = (req, res, next) => {
    if (req.user.type !== 'contractor') {
        return res.status(403).json({ success: false, error: 'Contractor access required.' });
    }
    next();
};


// --- CORRECTED: Use multer's memoryStorage to process files before uploading to Firebase ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// --- NEW: Helper function to upload buffered files to Firebase Storage ---
const uploadFilesToFirebase = (files, contractorId) => {
    const uploadPromises = files.map(file => {
        return new Promise((resolve, reject) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const newFileName = `estimation-${uniqueSuffix}${path.extname(file.originalname)}`;
            const filePath = `estimations/${contractorId}/${newFileName}`;
            
            const blob = bucket.file(filePath);
            const blobStream = blob.createWriteStream({
                metadata: {
                    contentType: file.mimetype
                }
            });

            blobStream.on('error', (err) => reject(err));

            blobStream.on('finish', () => {
                // Return metadata to be saved in Firestore
                resolve({
                    fileId: uniqueSuffix,
                    originalName: file.originalname,
                    storagePath: filePath, // Path in Firebase Storage
                    mimeType: file.mimetype,
                    fileSize: file.size,
                    uploadDate: new Date().toISOString()
                });
            });

            blobStream.end(file.buffer);
        });
    });
    return Promise.all(uploadPromises);
};


// --- CORRECTED: Submit route now uploads to Firebase ---
router.post('/contractor/submit', authenticate, isContractor, upload.array('files', 10), async (req, res) => {
    try {
        const { projectTitle, description, ...otherData } = req.body;

        if (!projectTitle || !description) {
            return res.status(400).json({ success: false, message: 'Project title and description are required' });
        }

        let uploadedFiles = [];
        if (req.files && req.files.length > 0) {
            // Upload files to Firebase Storage and get their metadata
            uploadedFiles = await uploadFilesToFirebase(req.files, req.user.userId);
        }

        const estimationData = {
            contractorId: req.user.userId,
            projectTitle,
            description,
            ...otherData,
            uploadedFiles, // Save the Firebase metadata array
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await adminDb.collection('estimations').add(estimationData);

        res.status(201).json({
            success: true,
            message: 'Estimation request created successfully',
            estimation: { id: docRef.id, ...estimationData }
        });

    } catch (error) {
        console.error('Create estimation error:', error);
        res.status(500).json({ success: false, message: 'Failed to create estimation request', error: error.message });
    }
});


// --- ✅ ADDED: Route to get all estimations for the logged-in contractor ---
router.get('/contractor', authenticate, isContractor, async (req, res) => {
    try {
        const contractorId = req.user.userId; // Get user ID from the JWT token

        const estimationsRef = adminDb.collection('estimations');
        // Query the collection for documents where contractorId matches
        const snapshot = await estimationsRef.where('contractorId', '==', contractorId).orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            return res.json({ success: true, estimations: [] });
        }

        const estimations = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, estimations });

    } catch (error) {
        console.error('Get contractor estimations error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve estimations', error: error.message });
    }
});


// --- CORRECTED: Download route now redirects to a temporary Firebase URL ---
router.get('/:id/download/:fileId', authenticate, async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(id).get();

        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }

        const estimationData = estimationDoc.data();
        const file = estimationData.uploadedFiles?.find(f => f.fileId === fileId);

        if (!file || !file.storagePath) {
            return res.status(404).json({ success: false, message: 'File record not found' });
        }

        // Generate a temporary, signed URL for the file that expires in 15 minutes
        const options = {
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        };
        const [url] = await bucket.file(file.storagePath).getSignedUrl(options);

        // Redirect the user's browser to the temporary URL to start the download
        res.redirect(url);

    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({ success: false, message: 'Failed to download file', error: error.message });
    }
});

// ... (Other routes like get estimations, delete, etc., remain largely the same) ...

export default router;
