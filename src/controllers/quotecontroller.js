/ src/controllers/quoteController.js (Corrected)
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

// Get all quotes by a specific user (designer)
export const getQuotesByUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        
        // Authorization: A user can only view their own quotes
        if (userId !== req.user.id) {
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

        // Authorization: The designer who created it or the contractor who owns the job can view it
        if (quoteData.designerId !== req.user.id && quoteData.contractorId !== req.user.id) {
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

        // Authorization: Only the contractor who posted the job can approve a quote
        if (jobDoc.data().posterId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You are not authorized to approve this quote.' });
        }

        // Logic to set the job's assigned designer and update its status
        await jobRef.update({
            status: 'assigned',
            assignedDesignerId: quoteData.designerId,
            assignedQuoteId: id,
        });

        // Update the quote's status to 'approved'
        await quoteRef.update({ status: 'approved' });
        
        // Optionally, update all other quotes for this job to 'rejected'
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
        
        // Authorization: Only the designer who created the quote can delete it, and only if it's not approved.
        const quoteData = quoteDoc.data();
        if (quoteData.designerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this quote.' });
        }
        if (quoteData.status === 'approved') {
            return res.status(400).json({ success: false, message: 'Cannot delete an approved quote.' });
        }

        // Atomically decrement the quotes count on the job document
        const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
        await jobRef.update({ quotesCount: admin.firestore.FieldValue.increment(-1) });

        await quoteRef.delete();

        res.json({ success: true, message: 'Quote deleted successfully.' });
    } catch (error) {
        next(error);
    }
};