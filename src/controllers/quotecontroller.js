import { adminDb, admin } from '../config/firebase.js';
import { uploadToFirebase } from '../middleware/upload.js';

// Create a new quote
export const createQuote = async (req, res, next) => {
    try {
        const { jobId, quoteAmount, timeline, description } = req.body;
        const designerId = req.user.userId;
        const designerName = req.user.name;

        // Validate required fields
        if (!jobId || !quoteAmount || !description) {
            return res.status(400).json({ 
                success: false, 
                message: 'Job ID, quote amount, and description are required.' 
            });
        }

        // Check if job exists and is still open
        const jobRef = adminDb.collection('jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Job not found.' });
        }

        const jobData = jobDoc.data();
        if (jobData.status !== 'open') {
            return res.status(400).json({ 
                success: false, 
                message: 'This job is no longer accepting quotes.' 
            });
        }

        // Check if user already submitted a quote for this job
        const existingQuoteSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', jobId)
            .where('designerId', '==', designerId)
            .get();

        if (!existingQuoteSnapshot.empty) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already submitted a quote for this job.' 
            });
        }

        // Handle file uploads
        let attachmentUrls = [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file => 
                uploadToFirebase(file, 'quote-attachments')
            );
            attachmentUrls = await Promise.all(uploadPromises);
        }

        // Create quote data
        const quoteData = {
            jobId,
            jobTitle: jobData.title,
            designerId,
            designerName,
            contractorId: jobData.posterId,
            quoteAmount: parseFloat(quoteAmount),
            timeline: timeline ? parseInt(timeline) : null,
            description,
            attachments: attachmentUrls,
            status: 'submitted',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Add quote to database
        const quoteRef = await adminDb.collection('quotes').add(quoteData);

        // Update job's quotes count
        await jobRef.update({
            quotesCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({
            success: true,
            message: 'Quote submitted successfully!',
            data: { id: quoteRef.id, ...quoteData }
        });

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

        // Fixed sorting to handle both Firestore timestamps and regular dates
        quotes.sort((a, b) => {
            let dateA, dateB;
            
            if (a.createdAt && typeof a.createdAt.toDate === 'function') {
                dateA = a.createdAt.toDate();
            } else if (a.createdAt) {
                dateA = new Date(a.createdAt);
            } else {
                dateA = new Date(0);
            }
            
            if (b.createdAt && typeof b.createdAt.toDate === 'function') {
                dateB = b.createdAt.toDate();
            } else if (b.createdAt) {
                dateB = new Date(b.createdAt);
            } else {
                dateB = new Date(0);
            }
            
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
        const { jobId } = req.body;
        const contractorId = req.user.userId;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const jobRef = adminDb.collection('jobs').doc(jobId);

        const [quoteDoc, jobDoc] = await Promise.all([quoteRef.get(), jobRef.get()]);

        if (!quoteDoc.exists) return res.status(404).json({ success: false, message: 'Quote not found' });
        if (!jobDoc.exists) return res.status(404).json({ success: false, message: 'Associated job not found' });
        
        const quoteData = quoteDoc.data();
        const jobData = jobDoc.data();
        
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
            assignedToName: quoteData.designerName,
            approvedQuoteId: quoteId,
            approvedAmount: quoteData.quoteAmount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 2. Update the approved quote's status
        batch.update(quoteRef, { 
            status: 'approved', 
            approvedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // 3. Reject all other 'submitted' quotes for this job
        const otherQuotesSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', jobId)
            .where('status', '==', 'submitted')
            .get();
            
        otherQuotesSnapshot.docs.forEach(doc => {
            if (doc.id !== quoteId) {
                batch.update(doc.ref, { 
                    status: 'rejected',
                    rejectedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        
        await batch.commit();
        
        res.status(200).json({ success: true, message: 'Quote approved and job status updated.' });
        
    } catch (error) {
        console.error('❌ Error in approveQuote:', error);
        next(error);
    }
};

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
        if (jobData.posterId !== contractorId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view quotes for this job.' });
        }

        const quotesSnapshot = await adminDb.collection('quotes').where('jobId', '==', jobId).get();

        const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Fixed sorting to handle both Firestore timestamps and regular dates
        quotes.sort((a, b) => {
            let dateA, dateB;
            
            if (a.createdAt && typeof a.createdAt.toDate === 'function') {
                dateA = a.createdAt.toDate();
            } else if (a.createdAt) {
                dateA = new Date(a.createdAt);
            } else {
                dateA = new Date(0);
            }
            
            if (b.createdAt && typeof b.createdAt.toDate === 'function') {
                dateB = b.createdAt.toDate();
            } else if (b.createdAt) {
                dateB = new Date(b.createdAt);
            } else {
                dateB = new Date(0);
            }
            
            return dateB - dateA; // Sort descending
        });

        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('❌ Error in getQuotesForJob:', error);
        next(error);
    }
};

export const getQuoteById = async (req, res, next) => {
    try {
        const { id: quoteId } = req.params;
        const userId = req.user.userId;
        const userType = req.user.type;

        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const quoteDoc = await quoteRef.get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }

        const quoteData = { id: quoteDoc.id, ...quoteDoc.data() };

        // Authorization check
        const isDesigner = quoteData.designerId === userId;
        let isContractor = false;

        if (!isDesigner && userType === 'contractor') {
            const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
            const jobDoc = await jobRef.get();
            if (jobDoc.exists && jobDoc.data().posterId === userId) {
                isContractor = true;
            }
        }
        
        if (!isDesigner && !isContractor) {
            return res.status(403).json({ success: false, message: 'You are not authorized to view this quote.' });
        }

        res.json({ success: true, data: quoteData });
    } catch (error) {
        console.error('❌ Error in getQuoteById:', error);
        next(error);
    }
};

export const deleteQuote = async (req, res, next) => {
    try {
        const { id: quoteId } = req.params;
        const userId = req.user.userId;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const quoteDoc = await quoteRef.get();

        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found.' });
        }

        const quoteData = quoteDoc.data();

        if (quoteData.designerId !== userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this quote.' });
        }

        if (quoteData.status !== 'submitted' && quoteData.status !== 'pending') {
             return res.status(400).json({ success: false, message: `Cannot delete a quote that is already ${quoteData.status}.` });
        }
        
        // Decrease job's quotes count when deleting quote
        const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
        await jobRef.update({
            quotesCount: admin.firestore.FieldValue.increment(-1)
        });
        
        await quoteRef.delete();
        
        res.status(200).json({ success: true, message: 'Quote deleted successfully.' });

    } catch (error) {
        console.error('❌ Error in deleteQuote:', error);
        next(error);
    }
};