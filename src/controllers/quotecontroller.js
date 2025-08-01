
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