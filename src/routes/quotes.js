import express from 'express';
import fs from 'fs';
import path from 'path';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// POST A NEW QUOTE (no change)
router.post('/', async (req, res) => { /* ... same as before ... */ });

// GET QUOTES FOR A SPECIFIC JOB (no change)
router.get('/job/:jobId', async (req, res) => { /* ... same as before ... */ });

// GET QUOTES BY A SPECIFIC USER (no change)
router.get('/user/:userId', async (req, res) => { /* ... same as before ... */ });

// UPDATE (APPROVE) A QUOTE (no change)
router.put('/:quoteId/approve', async (req, res) => { /* ... same as before ... */ });

// --- NEW: DELETE A QUOTE ---
router.delete('/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const doc = await quoteRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Quote not found.' });
        }
        
        const { attachment } = doc.data();
        if (attachment) {
            const filePath = path.join('uploads', path.basename(attachment));
             if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await quoteRef.delete();
        res.status(200).json({ message: 'Quote deleted successfully.' });
    } catch (error) {
        console.error("DELETE QUOTE ERROR:", error);
        res.status(500).json({ error: 'Failed to delete quote.' });
    }
});

export default router;