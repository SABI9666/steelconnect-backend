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
        const userId = req.user.userId;

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
                    jobTitle: jobData.title || 'Untitled Job',
                    averageAmount: 0,
                    lowestAmount: 0,
                    highestAmount: 0,
                    averageDeliveryTime: 0
                }
            });
        }

        const quotes = quotesSnapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                // Map different possible field names to standardized ones
                amount: data.amount || data.quoteAmount || 0,
                deliveryTime: data.deliveryTime || data.timeline || 0
            };
        });

        console.log('📊 Processing quotes:', quotes.map(q => ({ 
            id: q.id, 
            amount: q.amount, 
            deliveryTime: q.deliveryTime,
            status: q.status 
        })));

        // Perform analysis with better data handling
        const amounts = quotes
            .map(q => parseFloat(q.amount))
            .filter(a => !isNaN(a) && a > 0);
        
        const deliveryTimes = quotes
            .map(q => parseInt(q.deliveryTime))
            .filter(d => !isNaN(d) && d > 0);

        console.log('📊 Valid amounts:', amounts);
        console.log('📊 Valid delivery times:', deliveryTimes);

        // Calculate statistics
        const totalQuotes = quotes.length;
        const averageAmount = amounts.length > 0 ? 
            Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100 : 0;
        const lowestAmount = amounts.length > 0 ? Math.min(...amounts) : 0;
        const highestAmount = amounts.length > 0 ? Math.max(...amounts) : 0;
        const averageDeliveryTime = deliveryTimes.length > 0 ? 
            Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length) : 0;

        // Status breakdown
        const statusCounts = quotes.reduce((acc, quote) => {
            const status = quote.status || 'submitted';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        const analysis = {
            totalQuotes,
            jobTitle: jobData.title || 'Untitled Job',
            averageAmount,
            lowestAmount,
            highestAmount,
            averageDeliveryTime,
            shortestDeliveryTime: deliveryTimes.length > 0 ? Math.min(...deliveryTimes) : 0,
            longestDeliveryTime: deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : 0,
            statusBreakdown: {
                submitted: statusCounts.submitted || statusCounts.pending || 0,
                approved: statusCounts.approved || statusCounts.accepted || 0,
                rejected: statusCounts.rejected || 0
            },
            // Additional analysis like the comparison file
            priceAnalysis: {
                range: highestAmount - lowestAmount,
                coefficient: averageAmount > 0 ? ((highestAmount - lowestAmount) / averageAmount) : 0,
                competitiveQuotes: amounts.filter(a => a <= averageAmount * 1.1).length
            },
            timelineAnalysis: {
                consistentTimelines: deliveryTimes.filter(t => 
                    Math.abs(t - averageDeliveryTime) <= averageDeliveryTime * 0.2
                ).length,
                urgentQuotes: deliveryTimes.filter(t => t <= 7).length,
                longTermQuotes: deliveryTimes.filter(t => t > 30).length
            },
            quotes: quotes.map(q => ({
                id: q.id,
                amount: q.amount,
                deliveryTime: q.deliveryTime,
                status: q.status || 'submitted',
                description: q.description,
                designerId: q.designerId,
                designerName: q.designerName,
                createdAt: q.createdAt,
                // Calculate relative metrics
                pricePosition: amounts.length > 1 ? 
                    ((q.amount - lowestAmount) / (highestAmount - lowestAmount)) * 100 : 50,
                timelinePosition: deliveryTimes.length > 1 ? 
                    ((q.deliveryTime - Math.min(...deliveryTimes)) / 
                     (Math.max(...deliveryTimes) - Math.min(...deliveryTimes))) * 100 : 50
            })).sort((a, b) => a.amount - b.amount) // Sort by price
        };

        console.log('📊 Analysis complete:', {
            totalQuotes: analysis.totalQuotes,
            averageAmount: analysis.averageAmount,
            priceRange: `${analysis.lowestAmount} - ${analysis.highestAmount}`,
            avgTimeline: analysis.averageDeliveryTime
        });

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
        const userId = req.user.userId;

        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'User ID not found in token' 
            });
        }

        console.log('📊 Getting designer stats for user:', userId);

        // Get all quotes by this designer
        const quotesSnapshot = await adminDb.collection('quotes')
            .where('designerId', '==', userId)
            .get();

        const quotes = quotesSnapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                amount: data.amount || data.quoteAmount || 0
            };
        });

        console.log('📊 Found designer quotes:', quotes.length);

        // Calculate comprehensive stats
        const totalQuotes = quotes.length;
        const acceptedQuotes = quotes.filter(q => 
            q.status === 'accepted' || q.status === 'approved'
        ).length;
        const pendingQuotes = quotes.filter(q => 
            q.status === 'pending' || q.status === 'submitted'
        ).length;
        const rejectedQuotes = quotes.filter(q => q.status === 'rejected').length;

        const amounts = quotes
            .map(q => parseFloat(q.amount))
            .filter(a => !isNaN(a) && a > 0);

        const averageQuoteAmount = amounts.length > 0 ? 
            Math.round((amounts.reduce((sum, a) => sum + a, 0) / amounts.length) * 100) / 100 : 0;

        const acceptanceRate = totalQuotes > 0 ? 
            Math.round((acceptedQuotes / totalQuotes) * 100 * 100) / 100 : 0;

        // Additional insights
        const recentQuotes = quotes.filter(q => {
            const quoteDate = q.createdAt?.toDate ? q.createdAt.toDate() : new Date(q.createdAt);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return quoteDate >= thirtyDaysAgo;
        }).length;

        const stats = {
            totalQuotes,
            acceptedQuotes,
            pendingQuotes,
            rejectedQuotes,
            averageQuoteAmount,
            acceptanceRate,
            recentQuotes,
            // Performance metrics
            performance: {
                highValueQuotes: amounts.filter(a => a > averageQuoteAmount * 1.2).length,
                competitiveQuotes: amounts.filter(a => a <= averageQuoteAmount).length,
                totalValue: amounts.reduce((sum, a) => sum + a, 0)
            }
        };

        console.log('📊 Designer stats calculated:', stats);

        res.json({ 
            success: true, 
            data: stats 
        });

    } catch (error) {
        console.error('❌ Error getting designer stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get designer statistics',
            error: error.message 
        });
    }
});

// GET - Compare quotes for a specific job (new endpoint)
router.get('/job/:jobId/compare', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user.userId;

        // Verify job ownership
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        if (!jobDoc.exists || jobDoc.data().posterId !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized' 
            });
        }

        const jobData = jobDoc.data();

        // Get quotes with designer information
        const quotesSnapshot = await adminDb.collection('quotes')
            .where('jobId', '==', jobId)
            .get();

        if (quotesSnapshot.empty) {
            return res.json({ 
                success: true, 
                data: { 
                    comparison: 'No quotes to compare',
                    jobTitle: jobData.title 
                }
            });
        }

        const quotes = quotesSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            amount: doc.data().amount || doc.data().quoteAmount || 0,
            deliveryTime: doc.data().deliveryTime || doc.data().timeline || 0
        }));

        // Create detailed comparison similar to the PDF
        const amounts = quotes.map(q => q.amount).filter(a => a > 0);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const maxAmount = Math.max(...amounts);
        
        const comparison = {
            jobTitle: jobData.title,
            totalQuotes: quotes.length,
            summary: {
                lowestQuote: Math.min(...amounts),
                highestQuote: maxAmount,
                averageQuote: Math.round(avgAmount * 100) / 100,
                priceSpread: maxAmount - Math.min(...amounts)
            },
            detailedComparison: quotes.map(quote => {
                const percentageOfHighest = ((quote.amount / maxAmount) * 100).toFixed(2);
                const differenceFromMean = quote.amount - avgAmount;
                
                return {
                    id: quote.id,
                    designerName: quote.designerName || 'Unknown',
                    amount: quote.amount,
                    deliveryTime: quote.deliveryTime,
                    percentageOfHighest: `${percentageOfHighest}%`,
                    differenceFromMean: Math.round(differenceFromMean * 100) / 100,
                    status: quote.status,
                    description: quote.description,
                    // Value assessment
                    valueRating: differenceFromMean <= 0 ? 'Good Value' : 
                               differenceFromMean <= avgAmount * 0.2 ? 'Fair Value' : 'Premium',
                    // Timeline assessment
                    timelineRating: quote.deliveryTime <= 14 ? 'Fast' :
                                  quote.deliveryTime <= 30 ? 'Standard' : 'Extended'
                };
            }).sort((a, b) => a.amount - b.amount)
        };

        res.json({ 
            success: true, 
            data: comparison 
        });

    } catch (error) {
        console.error('❌ Error comparing quotes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to compare quotes',
            error: error.message 
        });
    }
});

export default router;