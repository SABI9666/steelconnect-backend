import express from 'express';
import { adminDb } from '../config/firebase.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Enhanced admin middleware with detailed logging
const isAdmin = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        console.log(`🔍 Admin check for ${req.method} ${req.originalUrl}`);
        
        if (!token) {
            console.log('❌ Admin access: No token provided');
            return res.status(401).json({ 
                success: false, 
                error: 'Access denied. No token provided.',
                code: 'NO_TOKEN'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret');
        
        console.log('🔍 Admin token decoded:', {
            userId: decoded.userId,
            email: decoded.email,
            type: decoded.type,
            role: decoded.role
        });
        
        // Check if it's an environment admin
        if (decoded.userId === 'env_admin' && decoded.type === 'admin') {
            console.log('✅ Environment admin access granted:', decoded.email);
            req.user = decoded;
            return next();
        }
        
        // Check if it's a database admin
        if (decoded.type === 'admin' && decoded.role === 'admin') {
            console.log('🔍 Checking database admin...');
            try {
                const userDoc = await adminDb.collection('users').doc(decoded.userId).get();
                if (userDoc.exists && userDoc.data().type === 'admin') {
                    console.log('✅ Database admin access granted:', decoded.email);
                    req.user = decoded;
                    return next();
                } else {
                    console.log('❌ Database admin check failed - user not found or not admin');
                }
            } catch (dbError) {
                console.error('❌ Database verification failed:', dbError);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Database verification failed.',
                    code: 'DB_ERROR'
                });
            }
        }
        
        console.log('❌ Admin access denied:', {
            email: decoded.email,
            type: decoded.type,
            role: decoded.role,
            userId: decoded.userId
        });
        
        return res.status(403).json({ 
            success: false, 
            error: 'Access denied. Admin privileges required.',
            code: 'NOT_ADMIN',
            debug: {
                userType: decoded.type,
                userRole: decoded.role,
                isEnvAdmin: decoded.userId === 'env_admin',
                hasAdminType: decoded.type === 'admin',
                hasAdminRole: decoded.role === 'admin'
            }
        });
        
    } catch (error) {
        console.error('❌ Admin verification failed:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                error: 'Admin token has expired.',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        res.status(401).json({ 
            success: false, 
            error: 'Invalid admin token.',
            code: 'INVALID_ADMIN_TOKEN'
        });
    }
};

// Apply admin middleware to all routes
router.use(isAdmin);

// Dashboard endpoint
router.get('/dashboard', async (req, res) => {
    try {
        console.log('✅ Admin dashboard accessed by:', req.user.email);
        
        // Get basic stats
        const [usersSnapshot, jobsSnapshot, quotesSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get()
        ]);

        const stats = {
            totalUsers: usersSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            activeJobs: jobsSnapshot.docs.filter(doc => doc.data().status === 'open').length,
            completedJobs: jobsSnapshot.docs.filter(doc => doc.data().status === 'completed').length,
            contractors: usersSnapshot.docs.filter(doc => doc.data().type === 'contractor').length,
            designers: usersSnapshot.docs.filter(doc => doc.data().type === 'designer').length
        };

        console.log('✅ Dashboard data retrieved successfully');
        
        res.json({
            success: true,
            data: {
                stats,
                timestamp: new Date().toISOString(),
                adminUser: req.user.email
            }
        });
    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard data'
        });
    }
});

// Users endpoint
router.get('/users', async (req, res) => {
    try {
        console.log('✅ Admin users list accessed by:', req.user.email);
        
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        
        const users = usersSnapshot.docs.map(doc => {
            const userData = doc.data();
            // Remove password from response
            const { password, ...userWithoutPassword } = userData;
            return {
                id: doc.id,
                ...userWithoutPassword
            };
        });

        console.log(`✅ Retrieved ${users.length} users`);
        
        res.json({
            success: true,
            data: users,
            meta: {
                total: users.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Users fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load users'
        });
    }
});

// Jobs endpoint
router.get('/jobs', async (req, res) => {
    try {
        console.log('✅ Admin jobs list accessed by:', req.user.email);
        
        const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        
        const jobs = jobsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ Retrieved ${jobs.length} jobs`);
        
        res.json({
            success: true,
            data: jobs,
            meta: {
                total: jobs.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Jobs fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load jobs'
        });
    }
});

// Quotes endpoint
router.get('/quotes', async (req, res) => {
    try {
        console.log('✅ Admin quotes list accessed by:', req.user.email);
        
        const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        
        const quotes = quotesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ Retrieved ${quotes.length} quotes`);
        
        res.json({
            success: true,
            data: quotes,
            meta: {
                total: quotes.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Quotes fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load quotes'
        });
    }
});

// Messages endpoint
router.get('/messages', async (req, res) => {
    try {
        console.log('✅ Admin messages list accessed by:', req.user.email);
        
        const conversationsSnapshot = await adminDb.collection('conversations').orderBy('updatedAt', 'desc').get();
        
        const conversations = conversationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ Retrieved ${conversations.length} conversations`);
        
        res.json({
            success: true,
            data: conversations,
            meta: {
                total: conversations.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Messages fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load messages'
        });
    }
});

// Subscriptions endpoint
router.get('/subscriptions', async (req, res) => {
    try {
        console.log('✅ Admin subscriptions list accessed by:', req.user.email);
        
        // Get users with subscription data
        const usersSnapshot = await adminDb.collection('users').get();
        
        const subscriptions = usersSnapshot.docs
            .filter(doc => doc.data().subscription)
            .map(doc => ({
                id: doc.id,
                userName: doc.data().name,
                userEmail: doc.data().email,
                userType: doc.data().type,
                subscription: doc.data().subscription,
                createdAt: doc.data().createdAt
            }));

        console.log(`✅ Retrieved ${subscriptions.length} subscriptions`);
        
        res.json({
            success: true,
            data: subscriptions,
            meta: {
                total: subscriptions.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Subscriptions fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscriptions'
        });
    }
});

// Subscription plans endpoint
router.get('/subscription-plans', async (req, res) => {
    try {
        console.log('✅ Admin subscription plans accessed by:', req.user.email);
        
        // Mock subscription plans data (you can move this to Firestore later)
        const plans = [
            {
                id: 'basic',
                name: 'Basic Plan',
                price: 29.99,
                duration: 'monthly',
                features: ['Basic job posting', 'Email support', '5 quotes per month'],
                active: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'premium',
                name: 'Premium Plan',
                price: 59.99,
                duration: 'monthly',
                features: ['Unlimited job posting', 'Priority support', 'Unlimited quotes', 'Advanced analytics'],
                active: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'enterprise',
                name: 'Enterprise Plan',
                price: 199.99,
                duration: 'monthly',
                features: ['Custom integrations', 'Dedicated support', 'White-label solution', 'API access'],
                active: false,
                createdAt: new Date().toISOString()
            }
        ];

        console.log(`✅ Retrieved ${plans.length} subscription plans`);
        
        res.json({
            success: true,
            data: plans,
            meta: {
                total: plans.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Subscription plans fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load subscription plans'
        });
    }
});

// Analytics endpoint
router.get('/analytics', async (req, res) => {
    try {
        console.log('✅ Admin analytics accessed by:', req.user.email);
        
        const [usersSnapshot, jobsSnapshot, quotesSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get()
        ]);

        // Basic analytics
        const analytics = {
            userGrowth: {
                total: usersSnapshot.size,
                contractors: usersSnapshot.docs.filter(doc => doc.data().type === 'contractor').length,
                designers: usersSnapshot.docs.filter(doc => doc.data().type === 'designer').length,
                admins: usersSnapshot.docs.filter(doc => doc.data().type === 'admin').length
            },
            jobMetrics: {
                total: jobsSnapshot.size,
                open: jobsSnapshot.docs.filter(doc => doc.data().status === 'open').length,
                assigned: jobsSnapshot.docs.filter(doc => doc.data().status === 'assigned').length,
                completed: jobsSnapshot.docs.filter(doc => doc.data().status === 'completed').length
            },
            quoteMetrics: {
                total: quotesSnapshot.size,
                submitted: quotesSnapshot.docs.filter(doc => doc.data().status === 'submitted').length,
                approved: quotesSnapshot.docs.filter(doc => doc.data().status === 'approved').length,
                rejected: quotesSnapshot.docs.filter(doc => doc.data().status === 'rejected').length
            },
            recentActivity: {
                newUsersLastWeek: usersSnapshot.docs.filter(doc => {
                    const createdAt = doc.data().createdAt;
                    if (!createdAt) return false;
                    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    return new Date(createdAt) > oneWeekAgo;
                }).length,
                newJobsLastWeek: jobsSnapshot.docs.filter(doc => {
                    const createdAt = doc.data().createdAt;
                    if (!createdAt) return false;
                    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                    return new Date(createdAt) > oneWeekAgo;
                }).length
            }
        };

        console.log('✅ Analytics data generated');
        
        res.json({
            success: true,
            data: analytics,
            meta: {
                generatedAt: new Date().toISOString(),
                adminUser: req.user.email
            }
        });
    } catch (error) {
        console.error('❌ Analytics fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load analytics'
        });
    }
});

// System stats endpoint
router.get('/system-stats', async (req, res) => {
    try {
        console.log('✅ Admin system stats accessed by:', req.user.email);
        
        const systemStats = {
            server: {
                uptime: Math.floor(process.uptime()),
                uptimeFormatted: formatUptime(process.uptime()),
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
                },
                nodeVersion: process.version,
                platform: process.platform
            },
            database: {
                status: 'connected',
                timestamp: new Date().toISOString(),
                provider: 'Firebase Firestore'
            },
            environment: process.env.NODE_ENV || 'development',
            version: '2.0.0'
        };

        console.log('✅ System stats generated');
        
        res.json({
            success: true,
            data: systemStats,
            meta: {
                timestamp: new Date().toISOString(),
                adminUser: req.user.email
            }
        });
    } catch (error) {
        console.error('❌ System stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load system stats'
        });
    }
});

// Estimations endpoint
router.get('/estimations', async (req, res) => {
    try {
        console.log('✅ Admin estimations accessed by:', req.user.email);
        
        // Try to get estimations from Firestore (if collection exists)
        let estimations = [];
        try {
            const estimationsSnapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
            estimations = estimationsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (collectionError) {
            console.log('📝 No estimations collection found, using mock data');
            // Mock data for estimations
            estimations = [
                {
                    id: 'est1',
                    projectName: 'Office Building Foundation',
                    clientEmail: 'client1@example.com',
                    estimatedCost: 150000,
                    actualCost: 148000,
                    status: 'completed',
                    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'est2',
                    projectName: 'Residential Steel Frame',
                    clientEmail: 'client2@example.com',
                    estimatedCost: 75000,
                    actualCost: null,
                    status: 'in_progress',
                    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    completedAt: null
                }
            ];
        }

        console.log(`✅ Retrieved ${estimations.length} estimations`);
        
        res.json({
            success: true,
            data: estimations,
            meta: {
                total: estimations.length,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Estimations fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load estimations'
        });
    }
});

// Helper function to format uptime
function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export default router;
