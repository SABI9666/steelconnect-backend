// Import Firebase admin - adjust this path to match your project structure
import { adminDb } from '../config/firebase.js';

// This function needs to be fully implemented based on your quote creation logic
export const createQuote = async (req, res, next) => {
    try {
        // Placeholder - Replace with your actual implementation
        console.log('🚧 createQuote function called (placeholder)');
        res.status(501).json({ success: false, message: 'createQuote function not yet implemented.' });
    } catch (error) {
        console.error('❌ Error in createQuote:', error);
        next(error);
    }
};

export const getQuotesByUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        
        if (userId !== req.user.userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view these quotes.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('designerId', '==', userId).get();
        
        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        quotes.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA; // Sort descending
        });

        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('❌ Error in getQuotesByUser:', error);
        next(error);
    }
};

export const approveQuote = async (req, res, next) => {
    try {
        const { id: quoteId } = req.params;
        const { jobId } = req.body; // Get jobId from the request body
        const contractorId = req.user.userId;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const jobRef = adminDb.collection('jobs').doc(jobId);

        const [quoteDoc, jobDoc] = await Promise.all([quoteRef.get(), jobRef.get()]);

        if (!quoteDoc.exists) return res.status(404).json({ success: false, message: 'Quote not found' });
        if (!jobDoc.exists) return res.status(404).json({ success: false, message: 'Associated job not found' });
        
        const quoteData = quoteDoc.data();
        const jobData = jobDoc.data();
        
        // FIX: Authorization check now uses 'posterId' which is the correct field on the job document.
        if (jobData.posterId !== contractorId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to approve quotes for this job' });
        }
        
        if (jobData.status !== 'open') {
             return res.status(400).json({ success: false, message: `Cannot approve quote, job is already ${jobData.status}.` });
        }
        
        // Use a batch write for atomic operations
        const batch = adminDb.batch();

        // 1. Update the job status to 'assigned'
        batch.update(jobRef, {
            status: 'assigned',
            assignedTo: quoteData.designerId,
            approvedQuoteId: quoteId,
            updatedAt: new Date()
        });
        
        // 2. Update the approved quote's status
        batch.update(quoteRef, { status: 'approved', approvedAt: new Date() });

        // 3. Reject all other 'submitted' quotes for this job
        const otherQuotesSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', jobId)
            .where('status', '==', 'submitted') // Or 'pending', based on your status names
            .get();
            
        otherQuotesSnapshot.docs.forEach(doc => {
            if (doc.id !== quoteId) {
                batch.update(doc.ref, { status: 'rejected' });
            }
        });
        
        await batch.commit();
        
        res.status(200).json({ success: true, message: 'Quote approved and job status updated.' });
        
    } catch (error) {
        console.error('❌ Error in approveQuote:', error);
        next(error);
    }
};

// Get all quotes for a specific job
export const getQuotesForJob = async (req, res, next) => {
    try {
        const { jobId } = req.params;
        const contractorId = req.user.userId;

        const jobRef = adminDb.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Job not found.' });
        }

        const jobData = jobDoc.data();
        // FIX: Authorization check now uses 'posterId' to correctly verify the job owner.
        if (jobData.posterId !== contractorId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view quotes for this job.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).get();

        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        quotes.sort((a, b) => (b.createdAt?.toDate() || new Date(b.createdAt)) - (a.createdAt?.toDate() || new Date(a.createdAt)));

        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('❌ Error in getQuotesForJob:', error);
        next(error);
    }
};


export const deleteQuote = async (req, res, next) => {
    try {
        const { id: quoteId } = req.params; // Get ID from route params
        const userId = req.user.userId;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const quoteDoc = await quoteRef.get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }

        const quoteData = quoteDoc.data();

        // Authorization: only the designer who created the quote can delete it
        if (quoteData.designerId !== userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this quote.' });
        }

        // A quote can only be deleted if it has not been approved yet
        if (quoteData.status !== 'submitted' && quoteData.status !== 'pending') {
             return res.status(400).json({ success: false, message: `Cannot delete a quote that is already ${quoteData.status}.` });
        }
        
        await quoteRef.delete();
        
        res.status(200).json({ success: true, message: 'Quote deleted successfully.' });

    } catch (error) {
        console.error('❌ Error in deleteQuote:', error);
        next(error);
    }
};












