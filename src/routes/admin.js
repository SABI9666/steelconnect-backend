// src/routes/admin.js - CORRECTED VERSION

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Middleware to check for admin privileges
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

// Multer setup (no changes needed here)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/results';
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'result-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are allowed'), false);
    }
});


// Helper functions
const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US');
};

// --- ROUTES ---

// ... (Dashboard, User Management, and other routes remain the same) ...
// The code for dashboard stats, getting users, and updating user status is correct in your file.

// --- Estimation Management ---
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// CORRECTED: File listing route with proper URL generation
router.get('/estimations/:id/files', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        
        const data = doc.data();
        const files = (data.uploadedFiles || []).map(file => {
            // Use fileName as a fallback for fileId to support older data and prevent 'undefined'
            const fileIdentifier = file.fileId || file.fileName;
            return {
                name: file.originalName,
                size: formatFileSize(file.fileSize),
                uploadedAt: formatDate(file.uploadDate || file.createdAt),
                // CORRECTED: The URL is now built correctly relative to the API base path.
                // The frontend will combine this with the API_BASE to form the full, working URL.
                url: `/admin/estimations/${req.params.id}/files/${fileIdentifier}/download`,
            };
        });
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch files', error: error.message });
    }
});

// CORRECTED: File download route made more robust
router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const doc = await adminDb.collection('estimations').doc(id).get();
        if (!doc.exists) return res.status(404).send('Estimation not found');
        
        const data = doc.data();
        // Robust find logic: checks fileId (newer data) and fileName (older data)
        const file = data.uploadedFiles?.find(f => f.fileId === fileId || f.fileName === fileId);
        
        if (!file || !file.filePath) {
            return res.status(404).send('File not found in the estimation record.');
        }

        const filePath = path.resolve(file.filePath);
        if (!fs.existsSync(filePath)) {
            // This is a critical error, meaning the file is gone from the server disk (ephemeral filesystem issue)
            console.error(`File not found on disk: ${filePath}`);
            return res.status(404).send('File not found on server disk. It may have been deleted during a server restart.');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({ success: false, error: 'Failed to process file download.' });
    }
});


// ... (The rest of your admin.js routes for uploading results, updating status, etc., are fine) ...
// --- User Management ---
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...userWithoutPassword } = doc.data();
            return { id: doc.id, ...userWithoutPassword };
        });
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user status (activate/deactivate)
router.patch('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, error: 'Invalid "isActive" status provided.' });
        }
        await adminDb.collection('users').doc(id).update({
            isActive: isActive,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'} successfully.` });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status.' });
    }
});


router.patch('/estimations/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'in-progress', 'completed', 'rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status provided' });
        }
        await adminDb.collection('estimations').doc(req.params.id).update({ 
            status: status,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Other Data Routes (Jobs, Quotes, Messages) ---
router.get('/jobs', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/quotes', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/messages', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
