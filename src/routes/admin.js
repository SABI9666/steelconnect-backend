// src/routes/admin.js - FIXED VERSION

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

// Multer setup for file uploads
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
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Helper functions
const getFileInfo = (file) => ({
    originalName: file.originalname,
    fileName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype
});

const deleteFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        console.error('Error deleting file:', error);
    }
};

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// --- ROUTES ---

// Dashboard Stats
router.get('/dashboard', async (req, res) => {
    try {
        const [users, quotes, messages, jobs, estimations] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get()
        ]);
        const stats = {
            totalUsers: users.size,
            totalQuotes: quotes.size,
            totalMessages: messages.size,
            totalJobs: jobs.size,
            totalEstimations: estimations.size,
            adminUser: req.user.email
        };
        res.json({ success: true, data: { stats } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- User Management ---
router.get('/users', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = [];
        usersSnapshot.forEach(doc => {
            const { password, ...userWithoutPassword } = doc.data();
            users.push({ id: doc.id, ...userWithoutPassword });
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

        const userRef = adminDb.collection('users').doc(id);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        await userRef.update({
            isActive: isActive,
            updatedAt: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully.` 
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user status.' });
    }
});

// --- Estimation Management ---
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        snapshot.forEach(doc => estimations.push({ id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/estimations/:id', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, estimation: { id: doc.id, ...doc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIXED: Corrected file listing with proper URLs and date formatting
router.get('/estimations/:id/files', async (req, res) => {
    try {
        const doc = await adminDb.collection('estimations').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        
        const data = doc.data();
        const files = (data.uploadedFiles || []).map(file => ({
            name: file.originalName,
            size: formatFileSize(file.fileSize),
            uploadedAt: formatDate(file.uploadDate || file.createdAt),
            mimeType: file.mimeType,
            // FIXED: Use the correct fileId for URL construction
            url: `/admin/estimations/${req.params.id}/files/${file.fileId || file.fileName}/download`,
        }));
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch files', error: error.message });
    }
});

// FIXED: Corrected file download route
router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const doc = await adminDb.collection('estimations').doc(id).get();
        if (!doc.exists) return res.status(404).send('Estimation not found');
        
        const data = doc.data();
        // FIXED: Search by both fileId and fileName for better compatibility
        const file = data.uploadedFiles?.find(f => 
            f.fileId === fileId || 
            f.fileName === fileId || 
            f.originalName === fileId
        );
        
        if (!file || !file.filePath) {
            console.log('File not found. Available files:', data.uploadedFiles?.map(f => ({
                fileId: f.fileId,
                fileName: f.fileName,
                originalName: f.originalName
            })));
            return res.status(404).send('File not found');
        }

        const filePath = path.resolve(file.filePath);
        if (!fs.existsSync(filePath)) {
            console.log('File path does not exist:', filePath);
            return res.status(404).send('File not found on server');
        }

        // Set proper headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        
        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (error) => {
            console.error('File stream error:', error);
            res.status(500).send('Error reading file');
        });
        
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/estimations/:id/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
        
        const ref = adminDb.collection('estimations').doc(req.params.id);
        const doc = await ref.get();
        if (!doc.exists) {
            deleteFile(req.file.path);
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        const currentData = doc.data();
        if (currentData.resultFile?.filePath) deleteFile(currentData.resultFile.filePath);

        const updateData = {
            resultFile: {
                ...getFileInfo(req.file),
                uploadDate: new Date().toISOString()
            },
            status: 'completed',
            updatedAt: new Date().toISOString()
        };
        if(req.body.amount) updateData.estimatedAmount = parseFloat(req.body.amount);

        await ref.update(updateData);
        const updatedDoc = await ref.get();
        res.json({ success: true, message: 'Result uploaded successfully', estimation: updatedDoc.data() });
    } catch (error) {
        if (req.file) deleteFile(req.file.path);
        res.status(500).json({ success: false, error: error.message });
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
        const jobs = [];
        snapshot.forEach(doc => jobs.push({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/quotes', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];
        snapshot.forEach(doc => quotes.push({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/messages', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];
        snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
