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
        return res.status(401).json({ 
            success: false,
            error: 'Authorization token is required.' 
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        if (decoded.role !== 'admin' && decoded.type !== 'admin') {
            return res.status(403).json({ 
                success: false,
                error: 'Access denied. Admin privileges required.' 
            });
        }
        
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false,
            error: 'Invalid or expired token.' 
        });
    }
};

router.use(isAdmin);

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/results';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
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
            cb(new Error('Only PDF files are allowed for result uploads'), false);
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

const deleteFile = async (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
    }
};

function getStatusInfo(status) {
    const statusMap = {
        'pending': { text: 'Pending Review', color: 'orange' },
        'in-progress': { text: 'In Progress', color: 'blue' },
        'completed': { text: 'Completed', color: 'green' },
        'rejected': { text: 'Rejected', color: 'red' },
        'cancelled': { text: 'Cancelled', color: 'gray' }
    };
    return statusMap[status] || { text: status, color: 'gray' };
}

// --- ROUTES ---

// Dashboard Stats
router.get('/dashboard', async (req, res) => {
    try {
        const [usersSnapshot, quotesSnapshot, messagesSnapshot, jobsSnapshot, estimationsSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get()
        ]);

        const stats = {
            totalUsers: usersSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalMessages: messagesSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            adminUser: req.user.email
        };

        res.json({
            success: true,
            data: { stats }
        });

    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch dashboard statistics.',
            error: error.message 
        });
    }
});

// Get all estimations
router.get('/estimations', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        snapshot.forEach(doc => {
            estimations.push({ id: doc.id, ...doc.data() });
        });
        res.json({ success: true, estimations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get details for a single estimation
router.get('/estimations/:id', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        res.json({ success: true, estimation: { id: estimationDoc.id, ...estimationDoc.data() } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIX: Added this new route to get the list of files for an estimation
router.get('/estimations/:id/files', async (req, res) => {
    try {
        const estimationDoc = await adminDb.collection('estimations').doc(req.params.id).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        const estimationData = estimationDoc.data();
        const files = (estimationData.uploadedFiles || []).map(file => ({
            name: file.originalName,
            url: `/api/admin/estimations/${req.params.id}/files/${file.fileId || file.fileName}/download`,
        }));
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch files', error: error.message });
    }
});

// Download a specific file from an estimation
router.get('/estimations/:id/files/:fileId/download', async (req, res) => {
    try {
        const { id, fileId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(id).get();
        if (!estimationDoc.exists) return res.status(404).send('Estimation not found');
        
        const estimationData = estimationDoc.data();
        const file = estimationData.uploadedFiles?.find(f => (f.fileId === fileId || f.fileName === fileId));
        if (!file) return res.status(404).send('File not found');

        const filePath = path.resolve(file.filePath);
        if (!fs.existsSync(filePath)) return res.status(404).send('File not found on server');

        res.download(filePath, file.originalName);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload an estimation result PDF
router.post('/estimations/:id/upload-result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

        const estimationRef = adminDb.collection('estimations').doc(req.params.id);
        const estimationDoc = await estimationRef.get();
        if (!estimationDoc.exists) {
            await deleteFile(req.file.path);
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        const currentData = estimationDoc.data();
        if (currentData.resultFile?.filePath) await deleteFile(currentData.resultFile.filePath);

        const updateData = {
            resultFile: getFileInfo(req.file),
            status: 'completed',
            updatedAt: new Date().toISOString()
        };
        if(req.body.amount) updateData.estimatedAmount = parseFloat(req.body.amount);

        await estimationRef.update(updateData);
        const updatedDoc = await estimationRef.get();
        res.json({ success: true, message: 'Result uploaded', estimation: updatedDoc.data() });
    } catch (error) {
        if (req.file) await deleteFile(req.file.path);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Update estimation status
router.patch('/estimations/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await adminDb.collection('estimations').doc(req.params.id).update({ status });
        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all users
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

// Get all jobs
router.get('/jobs', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').get();
        const jobs = [];
        jobsSnapshot.forEach(doc => jobs.push({ id: doc.id, ...doc.data() }));
        // FIX: Added 'data' property for frontend compatibility
        res.json({ success: true, data: jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all quotes
router.get('/quotes', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const quotes = [];
        quotesSnapshot.forEach(doc => quotes.push({ id: doc.id, ...doc.data() }));
        // FIX: Added 'data' property for frontend compatibility
        res.json({ success: true, data: quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all messages
router.get('/messages', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').get();
        const messages = [];
        messagesSnapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
        // FIX: Added 'data' property for frontend compatibility
        res.json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


export default router;
