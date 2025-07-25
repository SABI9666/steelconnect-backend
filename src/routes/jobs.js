import express from 'express';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// GET ALL JOBS (no change)
router.get('/', async (req, res) => { /* ... same as before ... */ });

// POST A NEW JOB (no change)
router.post('/', async (req, res) => { /* ... same as before ... */ });

// --- UPDATED: DELETE A JOB AND ITS ATTACHMENT ---
router.delete('/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const jobRef = adminDb.collection('jobs').doc(jobId);
        const doc = await jobRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Job not found.' });
        }

        // Delete the attachment file from the server's disk
        const { attachment } = doc.data();
        if (attachment) {
            const filePath = path.join('uploads', path.basename(attachment));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await jobRef.delete();
        res.status(200).json({ message: 'Job and attachment deleted successfully.' });
    } catch (error) {
        console.error("DELETE JOB ERROR:", error);
        res.status(500).json({ error: 'Failed to delete job.' });
    }
});

export default router;