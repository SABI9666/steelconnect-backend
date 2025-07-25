import express from 'express';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// --- POST A NEW QUOTE ---
router.post('/', async (req, res) => {
    // ... (Your existing POST code is fine) ...
    try {
        const { jobId, amount, description, attachment, quoterId, quoterName } = req.body;
        if (!jobId || !amount || !description || !quoterId) {
            return res.status(400).json({ error: 'Missing required quote fields.' });
        }
        const newQuote = { jobId, amount: Number(amount), description, attachment: attachment || '', quoterId, quoterName, status: 'pending', createdAt: new Date().toISOString() };
        const docRef = await adminDb.collection('quotes').add(newQuote);
        res.status(201).json({ message: 'Quote submitted successfully!', quoteId: docRef.id });
    } catch (error) {
        console.error('ERROR POSTING QUOTE:', error);
        res.status(500).json({ error: 'Failed to submit quote.' });
    }
});

// --- NEW: GET QUOTES FOR A SPECIFIC JOB ---
router.get('/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const quotesRef = adminDb.collection('quotes');
        const snapshot = await quotesRef.where('jobId', '==', jobId).get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        const quotes = [];
        snapshot.forEach(doc => {
            quotes.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(quotes);
    } catch (error) {
        console.error('ERROR FETCHING QUOTES:', error);
        res.status(500).json({ error: 'Failed to fetch quotes for job.' });
    }
});

export default router;