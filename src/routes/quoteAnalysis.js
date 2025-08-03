import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Add debugging middleware
router.use((req, res, next) => {
    console.log(`📊 Quote Analysis Route: ${req.method} ${req.path}`);
    console.log(`📊 User:`, req.user?.userId || 'No user');
    next();
});

// Test endpoint
router.get('/test', (req, res) => {
    console.log('📊 Test endpoint hit');
    res.json({ 
        success: true, 
        message: 'Quote analysis routes are working',
        timestamp: new Date().toISOString()
    });
});

// GET - Analyze quotes for a specific job (for job owners)
router.get('/job/:jobId', authenticateToken, async (req, res) => {
    try {
        console.log('📊 Starting quote analysis for job:', req.params.jobId);
        const { jobId } = req.params;
        const userId = req.user.userId; // FIXED: Changed from req.user.id

        if (!userId) {
            console.log('❌ No user ID found');
            return res.status(400).json({ 
                success: false, 
                message: 'User ID not found in token' 
            });
        }

        // Verify job ownership
        console.log('📊 Fetching job document...');
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        
        if (!jobDoc.exists) {
            console.log('❌ Job not found');
            return res.status(404).json({ 
                success: false, 
                message: 'Job not found' 
            });
        }

        const jobData = jobDoc.data();
        console.log('📊 Job data:', { posterId: jobData.posterId, title: jobData.title });

        if (jobData.posterId !== userId) {
            console.log('❌ Unauthorized access attempt');
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized - you can only analyze quotes for your own jobs' 
            });
        }

        // Get all quotes for this job
        console.log('📊 Fetching quotes for job...');
        const quotesSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', jobId)
            .get();

        console.log('📊 Found quotes:', quotesSnapshot.size);

        if (quotesSnapshot.empty) {
            return res.json({ 
                success: true, 
                data: {
                    totalQuotes: 0,
                    analysis: 'No quotes received yet',
                    jobTitle: jobData.title || 'Untitled Job'
                }
            });
        }

        const quotes = quotesSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        // Perform analysis
        const amounts = quotes.map(q => q.amount).filter(a => typeof a === 'number' && !isNaN(a));
        const deliveryTimes = quotes.map(q => q.deliveryTime).filter(d => typeof d === 'number' && !isNaN(d));

        const analysis = {
            totalQuotes: quotes.length,
            jobTitle: jobData.title || 'Untitled Job',
            averageAmount: amounts.length > 0 ? Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100 : 0,
            lowestAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
            highestAmount: amounts.length > 0 ? Math.max(...amounts) : 0,
            averageDeliveryTime: deliveryTimes.length > 0 ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length) : 0,
            shortestDeliveryTime: deliveryTimes.length > 0 ? Math.min(...deliveryTimes) : 0,
            longestDeliveryTime: deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : 0,
            statusBreakdown: {
                pending: quotes.filter(q => q.status === 'pending').length,
                accepted: quotes.filter(q => q.status === 'accepted').length,
                rejected: quotes.filter(q => q.status === 'rejected').length
            },
            quotes: quotes.map(q => ({
                id: q.id,
                amount: q.amount,
                deliveryTime: q.deliveryTime,
                status: q.status,
                description: q.description,
                designerId: q.designerId,
                createdAt: q.createdAt
            }))
        };

        console.log('📊 Analysis complete');
        res.json({ 
            success: true, 
            data: analysis 
        });

    } catch (error) {
        console.error('❌ Error analyzing quotes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to analyze quotes',
            error: error.message 
        });
    }
});

// GET - Get designer statistics
router.get('/designer/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; // FIXED: Changed from req.user.id

        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID not found in token' 
            });
        }

        // Get all quotes by this designer
        const quotesSnapshot = await adminDb.collection('quotes')
            .where('designerId', '==', userId)
            .get();

        const quotes = quotesSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));

        const stats = {
            totalQuotes: quotes.length,
            acceptedQuotes: quotes.filter(q => q.status === 'accepted').length,
            pendingQuotes: quotes.filter(q => q.status === 'pending').length,
            rejectedQuotes: quotes.filter(q => q.status === 'rejected').length,
            averageQuoteAmount: quotes.length > 0 ? 
                Math.round((quotes.reduce((sum, q) => sum + (q.amount || 0), 0) / quotes.length) * 100) / 100 : 0,
            acceptanceRate: quotes.length > 0 ? 
                Math.round((quotes.filter(q => q.status === 'accepted').length / quotes.length) * 100 * 100) / 100 : 0
        };

        res.json({ 
            success: true, 
            data: stats 
        });

    } catch (error) {
        console.error('Error getting designer stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get designer statistics' 
        });
    }
});

// POST - Analyze a specific quote (keeping your original functionality)
router.post('/:quoteId/analyze', authenticateToken, async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { jobId } = req.body;
        const userId = req.user.userId; // FIXED: Changed from req.user.id

        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID not found in token' 
            });
        }

        // Get quote
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Quote not found' 
            });
        }
        const quote = { id: quoteDoc.id, ...quoteDoc.data() };

        // Get job
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Job not found' 
            });
        }
        const job = { id: jobDoc.id, ...jobDoc.data() };

        // Check authorization
        if (job.posterId !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized to analyze this quote' 
            });
        }

        // Simple analysis (since we don't have the external services)
        const analysis = {
            quoteId: quoteId,
            jobId: jobId,
            amount: quote.amount,
            deliveryTime: quote.deliveryTime,
            analysisDate: new Date(),
            status: quote.status,
            isCompetitive: true, // You can add more complex logic here
            recommendation: quote.status === 'pending' ? 'Review quote details' : `Quote is ${quote.status}`
        };

        res.json({ 
            success: true, 
            data: { quote, job, analysis } 
        });

    } catch (error) {
        console.error('Quote analysis route error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to complete quote analysis.' 
        });
    }
});

export default router;