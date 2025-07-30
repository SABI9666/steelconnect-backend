import express from 'express';
import { adminDb } from '../config/firebase.js';
import { upload } from '../middleware/upload.js';
// --- FIX: Import the uploadToFirebase function ---
import { uploadToFirebase } from '../middleware/upload.js';

const router = express.Router();

// POST A NEW QUOTE
router.post('/', upload.single('attachment'), async (req, res) => {
    try {
        const { jobId, amount, description, quoterId, quoterName } = req.body;
        
        let attachmentUrl = null; 

        if (req.file) {
            // This line now works because of the import
            attachmentUrl = await uploadToFirebase(req.file, 'quote-attachments');
        }
        
        const newQuote = {
            jobId,
            amount: Number(amount),
            description,
            attachment: attachmentUrl, // This will be null or a valid URL
            quoterId,
            quoterName,
            status: 'pending',
            createdAt: new Date().toISOString()
        };

        const docRef = await adminDb.collection('quotes').add(newQuote);
        res.status(201).json({ message: 'Quote submitted successfully!', quoteId: docRef.id });
    } catch (error) {
        console.error("Error submitting quote:", error);
        res.status(500).json({ error: 'Failed to submit quote.' });
    }
});

// GET QUOTES FOR A SPECIFIC JOB
router.get('/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const snapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).get();
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(quotes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quotes for job.' });
    }
});

// GET QUOTES BY A SPECIFIC USER
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const snapshot = await adminDb.collection('quotes').where('quoterId', '==', userId).get();
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(quotes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user quotes.' });
    }
});

// GET A SINGLE QUOTE BY ITS ID
router.get('/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const doc = await quoteRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Quote not found.' });
        }

        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quote.' });
    }
});

// UPDATE (APPROVE) A QUOTE
router.put('/:quoteId/approve', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        
        const quoteDoc = await quoteRef.get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ error: 'Quote to approve not found.' });
        }
        
        await quoteRef.update({ status: 'approved' });
        
        const { jobId } = quoteDoc.data();
        const otherQuotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).get();
        
        const batch = adminDb.batch();
        otherQuotesSnapshot.forEach(doc => {
            if (doc.id !== quoteId) {
                batch.update(doc.ref, { status: 'rejected' });
            }
        });
        
        await batch.commit();
        res.status(200).json({ message: 'Quote approved successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve quote.' });
    }
});

// DELETE A QUOTE
router.delete('/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        await adminDb.collection('quotes').doc(quoteId).delete();
        res.status(200).json({ message: 'Quote deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete quote.' });
    }
});

export default router;