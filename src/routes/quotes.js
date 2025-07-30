import express from 'express';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// POST A NEW QUOTE
router.post('/', async (req, res) => {
    try {
        const { jobId, amount, description, attachment, quoterId, quoterName } = req.body;
        const newQuote = {
            jobId,
            amount: Number(amount),
            description,
            attachment: attachment || '',
            quoterId,
            quoterName,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        const docRef = await adminDb.collection('quotes').add(newQuote);
        res.status(201).json({ message: 'Quote submitted successfully!', quoteId: docRef.id });
    } catch (error) {
        console.error("Error submitting quote:", error); // Log the actual error
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
        console.error("Error fetching quotes for job:", error);
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
        console.error("Error fetching user quotes:", error);
        res.status(500).json({ error: 'Failed to fetch user quotes.' });
    }
});

// **FIXED**: GET A SINGLE QUOTE BY ITS ID
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
        console.error("Error fetching single quote:", error);
        res.status(500).json({ error: 'Failed to fetch quote.' });
    }
});


// UPDATE (APPROVE) A QUOTE
router.put('/:quoteId/approve', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(quoteId);

        // Check if quote exists before proceeding
        const quoteDoc = await quoteRef.get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ error: 'Quote to approve not found.' });
        }
        const { jobId } = quoteDoc.data();

        // Update the approved quote
        await quoteRef.update({ status: 'approved' });

        // Update all other quotes for the same job to 'rejected'
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
        console.error("Error approving quote:", error);
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
        console.error("Error deleting quote:", error);
        res.status(500).json({ error: 'Failed to delete quote.' });
    }
});

export default router;