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
    
    let attachments = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToFirebase(file, 'quote-attachments'));
      attachments = await Promise.all(uploadPromises);
    }

    const quoteData = {
      jobId,
      jobTitle: jobDoc.data().title,
      // FIX: Changed req.user.id to req.user.userId
      designerId: req.user.userId, 
      designerName: req.user.name, // This now works because name is in the token
      contractorId: jobDoc.data().posterId,
      quoteAmount: parseFloat(quoteAmount),
      timeline: parseInt(timeline),
      description,
      attachments,
      status: 'submitted',
      createdAt: new Date(),
    };

    const quoteRef = await adminDb.collection('quotes').add(quoteData);
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
        
        // FIX: Changed req.user.id to req.user.userId
        if (jobDoc.data().posterId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view these quotes.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        next(error);
    }
};

// Get all quotes by a specific user (designer)
export const getQuotesByUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        
        // FIX: Changed req.user.id to req.user.userId
        if (userId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view these quotes.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('designerId', '==', userId).orderBy('createdAt', 'desc').get();
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, data: quotes });
    } catch (error) {
        next(error);
    }
};

// Get a single quote by ID
export const getQuoteById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(id).get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }

        const quoteData = quoteDoc.data();

        // FIX: Changed req.user.id to req.user.userId
        if (quoteData.designerId !== req.user.userId && quoteData.contractorId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view this quote.' });
        }

        res.json({ success: true, data: { id: quoteDoc.id, ...quoteData } });
    } catch (error) {
        next(error);
    }
};

// Approve a quote
export const approveQuote = async (req, res, next) => {
    try {
        const { id } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(id);
        const quoteDoc = await quoteRef.get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }
        
        const quoteData = quoteDoc.data();
        const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
        const jobDoc = await jobRef.get();

        // FIX: Changed req.user.id to req.user.userId
        if (jobDoc.data().posterId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to approve this quote.' });
        }

        await jobRef.update({
            status: 'assigned',
            assignedDesignerId: quoteData.designerId,
            assignedQuoteId: id,
        });

        await quoteRef.update({ status: 'approved' });
        
        const otherQuotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', quoteData.jobId).get();
        const batch = adminDb.batch();
        otherQuotesSnapshot.docs.forEach(doc => {
            if (doc.id !== id) {
                batch.update(doc.ref, { status: 'rejected' });
            }
        });
        await batch.commit();

        res.json({ success: true, message: 'Quote approved successfully.' });
    } catch (error) {
        next(error);
    }
};

// Delete a quote
export const deleteQuote = async (req, res, next) => {
    try {
        const { id } = req.params;
        const quoteRef = adminDb.collection('quotes').doc(id);
        const quoteDoc = await quoteRef.get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }
        
        const quoteData = quoteDoc.data();
        // FIX: Changed req.user.id to req.user.userId
        if (quoteData.designerId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this quote.' });
        }
        if (quoteData.status === 'approved') {
            return res.status(400).json({ success: false, message: 'Cannot delete an approved quote.' });
        }

        const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
        await jobRef.update({ quotesCount: admin.firestore.FieldValue.increment(-1) });

        await quoteRef.delete();

        res.json({ success: true, message: 'Quote deleted successfully.' });
    } catch (error) {
        next(error);
    }
};