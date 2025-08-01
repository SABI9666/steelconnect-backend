// Import Firebase admin - adjust this path to match your project structure
import { adminDb } from '../config/firebase.js';

export const getQuotesByUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        
        // Debug logs
        console.log('=== DEBUG MY QUOTES ===');
        console.log('Requested userId from params:', userId);
        console.log('Token userId:', req.user.userId);
        console.log('Token user object:', req.user);
        
        if (userId !== req.user.userId) {
            console.log('❌ Authorization failed: userId mismatch');
            return res.status(403).json({ success: false, message: 'You are not authorized to view these quotes.' });
        }

        console.log('✅ Authorization passed, querying quotes...');
        
        // Query with debug
        console.log('Querying quotes where designerId ==', userId);
        const quotesSnapshot = await adminDb.collection('quotes').where('designerId', '==', userId).get();
        
        console.log('📊 Raw query results:', quotesSnapshot.docs.length, 'documents found');
        
        if (quotesSnapshot.docs.length === 0) {
            console.log('ℹ️ No quotes found for this designer');
        }
        
        const quotes = quotesSnapshot.docs.map(doc => {
            const data = { id: doc.id, ...doc.data() };
            console.log('📄 Quote document:', {
                id: data.id,
                designerId: data.designerId,
                jobId: data.jobId,
                status: data.status,
                createdAt: data.createdAt
            });
            return data;
        });

        // Sort by createdAt (handle both Firestore Timestamp and Date objects)
        quotes.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA;
        });

        console.log('📋 Final response:', quotes.length, 'quotes returned');
        console.log('=== END DEBUG ===');

        res.json({ success: true, data: quotes });
    } catch (error) {
        console.error('❌ Error in getQuotesByUser:', error);
        next(error);
    }
};

export const approveQuote = async (req, res, next) => {
    try {
        const { quoteId } = req.params;
        const contractorId = req.user.userId;
        
        console.log('=== DEBUG APPROVE QUOTE ===');
        console.log('Quote ID:', quoteId);
        console.log('Contractor ID:', contractorId);
        
        // Get the quote document
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        const quoteDoc = await quoteRef.get();
        
        if (!quoteDoc.exists) {
            console.log('❌ Quote not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Quote not found' 
            });
        }
        
        const quoteData = quoteDoc.data();
        console.log('📄 Quote data:', quoteData);
        
        // Verify this quote belongs to a job posted by this contractor
        const jobRef = adminDb.collection('jobs').doc(quoteData.jobId);
        const jobDoc = await jobRef.get();
        
        if (!jobDoc.exists) {
            console.log('❌ Associated job not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Associated job not found' 
            });
        }
        
        const jobData = jobDoc.data();
        console.log('📄 Job data:', jobData);
        
        // Check if the contractor owns this job
        if (jobData.contractorId !== contractorId) {
            console.log('❌ Authorization failed: not job owner');
            return res.status(403).json({ 
                success: false, 
                message: 'You are not authorized to approve quotes for this job' 
            });
        }
        
        // Check if quote is in pending status
        if (quoteData.status !== 'pending') {
            console.log('❌ Quote not in pending status:', quoteData.status);
            return res.status(400).json({ 
                success: false, 
                message: `Quote is already ${quoteData.status}` 
            });
        }
        
        // Update quote status to approved
        await quoteRef.update({
            status: 'approved',
            approvedAt: new Date(),
            approvedBy: contractorId
        });
        
        // Optional: Update job status to indicate it has an approved quote
        await jobRef.update({
            status: 'quote_approved',
            approvedQuoteId: quoteId,
            updatedAt: new Date()
        });
        
        // Optional: Reject other pending quotes for this job
        const otherQuotesSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', quoteData.jobId)
            .where('status', '==', 'pending')
            .get();
            
        const batch = adminDb.batch();
        otherQuotesSnapshot.docs.forEach(doc => {
            if (doc.id !== quoteId) {
                batch.update(doc.ref, {
                    status: 'rejected',
                    rejectedAt: new Date(),
                    rejectedReason: 'Another quote was approved'
                });
            }
        });
        
        if (batch._mutations.length > 0) {
            await batch.commit();
            console.log('📝 Other pending quotes rejected');
        }
        
        console.log('✅ Quote approved successfully');
        console.log('=== END DEBUG ===');
        
        res.json({ 
            success: true, 
            message: 'Quote approved successfully',
            data: {
                quoteId: quoteId,
                status: 'approved',
                approvedAt: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error in approveQuote:', error);
        next(error);
    }
};