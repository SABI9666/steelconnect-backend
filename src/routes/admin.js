// src/routes/admin.js - CORRECTED with Firebase Storage

import express from 'express';
import multer from 'multer';
import path from 'path';
import jwt from 'jsonwebtoken';
import { adminDb, adminStorage } from '../config/firebase.js'; // Assuming you export storage

const router = express.Router();
const bucket = adminStorage.bucket();

// --- (isAdmin middleware remains the same) ---
const isAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization token is required.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        if (decoded.role !== 'admin' && decoded.type !== 'admin') {
            return res.status(403).json({ success: false, error: 'Access denied. Admin privileges required.' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
};
router.use(isAdmin);


// --- CORRECTED: Use multer's memoryStorage for admin uploads ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'), false);
    }
});


// --- CORRECTED: Route to upload result PDF directly to Firebase ---
router.post('/estimations/:id/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        const estimationId = req.params.id;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const ref = adminDb.collection('estimations').doc(estimationId);
        const doc = await ref.get();
        if (!doc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        // Upload file to Firebase Storage
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const newFileName = `result-${uniqueSuffix}.pdf`;
        const filePath = `results/${estimationId}/${newFileName}`; // Store results in a separate folder

        const blob = bucket.file(filePath);
        const blobStream = blob.createWriteStream({
            metadata: { contentType: file.mimetype }
        });

        blobStream.on('error', (err) => {
            throw err;
        });

        blobStream.on('finish', async () => {
            // Prepare metadata to save in Firestore
            const resultFileMetadata = {
                fileId: uniqueSuffix,
                originalName: file.originalname,
                storagePath: filePath,
                mimeType: file.mimetype,
                fileSize: file.size,
                uploadDate: new Date().toISOString()
            };

            const updateData = {
                resultFile: resultFileMetadata,
                status: 'completed',
                updatedAt: new Date().toISOString()
            };
            if (req.body.amount) {
                updateData.estimatedAmount = parseFloat(req.body.amount);
            }
            
            await ref.update(updateData);
            res.json({ success: true, message: 'Result uploaded successfully' });
        });

        blobStream.end(file.buffer);

    } catch (error) {
        console.error("Upload result error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// --- CORRECTED: Download route for contractor-uploaded files (as seen by admin) ---
router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const doc = await adminDb.collection('estimations').doc(id).get();
        if (!doc.exists) return res.status(404).send('Estimation not found');
        
        const data = doc.data();
        const file = data.uploadedFiles?.find(f => f.fileId === fileId);
        
        if (!file || !file.storagePath) {
            return res.status(404).send('File record not found in estimation.');
        }

        const [url] = await bucket.file(file.storagePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        res.redirect(url);

    } catch (error) {
        console.error('Admin download file error:', error);
        res.status(500).json({ success: false, error: 'Failed to process file download.' });
    }
});


// *** NEW ROUTE ADDED HERE ***
// --- NEW: Download route for admin-uploaded result files ---
router.get('/estimations/:id/download-result', async (req, res) => {
    try {
        const estimationId = req.params.id;
        const ref = adminDb.collection('estimations').doc(estimationId);
        const doc = await ref.get();

        if (!doc.exists || !doc.data().resultFile) {
            return res.status(404).json({ success: false, message: 'Result file not found.' });
        }

        const resultFile = doc.data().resultFile;
        const [url] = await bucket.file(resultFile.storagePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });

        res.redirect(url);

    } catch (error) {
        console.error('Admin download result error:', error);
        res.status(500).json({ success: false, error: 'Failed to process result download.' });
    }
});


// ... (Other routes like get estimations, update status, etc., can go here) ...

export default router;
