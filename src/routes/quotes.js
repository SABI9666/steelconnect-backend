import express from 'express';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// POST A NEW QUOTE
router.post('/', async (req, res) => {
    try {
        const { jobId, amount, description, attachment, quoterId, quoterName } = req.body;
        const newQuote = { jobId, amount: Number(amount), description, attachment: attachment || '', quoterId, quoterName, status: 'pending', createdAt: new Date().toISOString() };
        const docRef = await adminDb.collection('quotes').add(newQuote);
        res.status(201).json({ message: 'Quote submitted successfully!', quoteId: docRef.id });
    } catch (error) {
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

// UPDATE (APPROVE) A QUOTE
router.put('/:quoteId/approve', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        await quoteRef.update({ status: 'approved' });
        const quoteDoc = await quoteRef.get();
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
        // You would also delete any associated file from storage here
        await adminDb.collection('quotes').doc(quoteId).delete();
        res.status(200).json({ message: 'Quote deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete quote.' });
    }
});

export default router;