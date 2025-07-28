// src/controllers/quoteController.js (Corrected)
import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Create a new quote for a job (protected, for designers)
export const createQuote = async (req, res, next) => {
  try {
    const { jobId, quoteAmount, timeline, description } = req.body;
    const jobRef = adminDb.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
      return res.status(404).json({ success: false, message: 'The requested job posting was not found.' });
    }
    
    // Handle file uploads
    let attachments = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToFirebase(file, 'quote-attachments'));
      attachments = await Promise.all(uploadPromises);
    }

    const quoteData = {
      jobId,
      jobTitle: jobDoc.data().title,
      designerId: req.user.id,
      designerName: req.user.name,
      contractorId: jobDoc.data().posterId,
      quoteAmount: parseFloat(quoteAmount),
      timeline: parseInt(timeline),
      description,
      attachments, // Array of public URLs from Firebase Storage
      status: 'submitted',
      createdAt: new Date(),
    };

    const quoteRef = await adminDb.collection('quotes').add(quoteData);
    // Atomically increment the quotes count on the job document
    await jobRef.update({ quotesCount: admin.firestore.FieldValue.increment(1) });
    
    res.status(201).json({ success: true, message: 'Quote submitted successfully.', data: { id: quoteRef.id, ...quoteData } });
  } catch (error) {
    next(error);
  }
};

// Get all quotes for a specific job (protected, for the contractor who posted it)
export const getQuotesForJob = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
             return res.status(404).json({ success: false, message: 'Job not found.' });
        }
        
        // Authorization: Only the contractor who posted the job can see the quotes
        if (jobDoc.data().posterId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view these quotes.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        next(error);
    }
};