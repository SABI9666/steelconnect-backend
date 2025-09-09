// src/routes/admin.js - Working version with fixed dependencies
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Admin check middleware (built-in to avoid import issues)
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.type !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard stats - FIXES /api/admin/dashboard 404
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested by:', req.user?.email);
        
        // Get collection counts safely with error handling
        const getCollectionData = async (collectionName) => {
            try {
                const snapshot = await adminDb.collection(collectionName).get();
                return {
                    size: snapshot.size || 0,
                    docs: snapshot.docs || []
                };
            } catch (error) {
                console.warn(`Could not access collection: ${collectionName}`);
                return { size: 0, docs: [] };
            }
        };

        const [usersData, quotesData, messagesData, jobsData, estimationsData] = await Promise.all([
            getCollectionData('users'),
            getCollectionData('quotes'), 
            getCollectionData('messages'),
            getCollectionData('jobs'),
            getCollectionData('estimations')
        ]);

        // Count user types (exclude admin users from counts)
        let contractors = 0;
        let designers = 0;
        let totalUsers = 0;

        usersData.docs.forEach(doc => {
            const userData = doc.data();
            if (userData.type !== 'admin') {
                totalUsers++;
                if (userData.type === 'contractor') contractors++;
                if (userData.type === 'designer') designers++;
            }
        });

        // Count job statuses
        let activeJobs = 0;
        let completedJobs = 0;
        jobsData.docs.forEach(doc => {
            const jobData = doc.data();
            if (jobData.status === 'active' || jobData.status === 'open' || jobData.status === 'in-progress') {
                activeJobs++;
            } else if (jobData.status === 'completed' || jobData.status === 'finished') {
                completedJobs++;
            }
        });

        // Count estimation statuses
        let pendingEstimations = 0;
        let completedEstimations = 0;
        estimationsData.docs.forEach(doc => {
            const estData = doc.data();
            if (estData.status === 'pending') {
                pendingEstimations++;
            } else if (estData.status === 'completed') {
                completedEstimations++;
            }
        });

        const stats = {
            totalUsers,
            contractors,
            designers,
            totalQuotes: quotesData.size,
            totalMessages: messagesData.size,
            totalJobs: jobsData.size,
            totalEstimations: estimationsData.size,
            activeJobs,
            completedJobs,
            pendingEstimations,
            completedEstimations
        };

        console.log(`Dashboard data loaded: ${totalUsers} total users, ${estimationsData.size} total estimations`);

        res.json({
            success: true,
            data: {
                stats: stats,
                adminUser: req.user?.email || 'admin@steelconnect.com',
                recentActivity: [
                    {
                        type: 'user',
                        description: `${totalUsers} total users registered`,
                        timestamp: new Date().toISOString()
                    },
                    {
                        type: 'estimation',
                        description: `${pendingEstimations} estimations pending review`,
                        timestamp: new Date().toISOString()
                    }
                ]
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching dashboard statistics',
            error: error.message 
        });
    }
});

// Get all users - FIXES /api/admin/users 404
router.get('/users', async (req, res) => {
    try {
        console.log('Admin users list requested by:', req.user?.email);
        
        const snapshot = await adminDb.collection('users').get();
        
        const users = snapshot.docs
            .map(doc => {
                const userData = doc.data();
                const { password, ...userWithoutPassword } = userData;
                return { 
                    id: doc.id,
                    _id: doc.id,
                    name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
                    email: userData.email,
                    type: userData.type || 'user',
                    isActive: userData.canAccess !== false && userData.isActive !== false,
                    company: userData.companyName || userData.company || 'N/A',
                    phone: userData.phone || 'N/A',
                    profileStatus: userData.profileStatus || 'incomplete',
                    canAccess: userData.canAccess !== false,
                    createdAt: userData.createdAt || userData.joinedAt,
                    ...userWithoutPassword
                };
            })
            .filter(user => user.type !== 'admin') // Exclude admin users
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); // Sort by newest first
        
        console.log(`Found ${users.length} users for admin`);
        
        res.json({ 
            success: true, 
            data: users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// Get all estimations - FIXES /api/admin/estimations 404
router.get('/estimations', async (req, res) => {
    try {
        console.log('Admin estimations list requested by:', req.user?.email);
        
        let snapshot;
        try {
            snapshot = await adminDb.collection('estimations')
                .orderBy('createdAt', 'desc')
                .get();
        } catch (orderError) {
            console.log('Ordering failed, fetching without order');
            snapshot = await adminDb.collection('estimations').get();
        }
        
        const estimations = snapshot.docs.map(doc => {
            const estData = doc.data();
            return {
                id: doc.id,
                _id: doc.id,
                projectTitle: estData.projectTitle || estData.title || 'Untitled Project',
                contractorName: estData.contractorName || 'Unknown Contractor',
                contractorEmail: estData.contractorEmail || 'N/A',
                status: estData.status || 'pending',
                description: estData.description || '',
                uploadedFiles: estData.uploadedFiles || [],
                resultFile: estData.resultFile || null,
                estimatedAmount: estData.estimatedAmount || null,
                notes: estData.notes || '',
                createdAt: estData.createdAt,
                updatedAt: estData.updatedAt,
                ...estData
            };
        });

        // Sort manually if ordering failed
        estimations.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        console.log(`Found ${estimations.length} estimations for admin`);
        
        res.json({ 
            success: true, 
            data: estimations
        });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching estimations',
            error: error.message
        });
    }
});

// Get all jobs - FIXES /api/admin/jobs 404
router.get('/jobs', async (req, res) => {
    try {
        console.log('Admin jobs list requested by:', req.user?.email);
        
        let snapshot;
        try {
            snapshot = await adminDb.collection('jobs')
                .orderBy('createdAt', 'desc')
                .get();
        } catch (orderError) {
            console.log('Jobs ordering failed, fetching without order');
            snapshot = await adminDb.collection('jobs').get();
        }
        
        const jobs = snapshot.docs.map(doc => {
            const jobData = doc.data();
            return { 
                id: doc.id,
                _id: doc.id,
                title: jobData.title || jobData.projectTitle || 'Untitled Job',
                projectTitle: jobData.title || jobData.projectTitle || 'Untitled Job',
                category: jobData.category || jobData.type || 'General',
                status: jobData.status || 'pending',
                budget: jobData.budget || jobData.amount || 0,
                clientName: jobData.clientName || jobData.posterName || 'Unknown Client',
                clientEmail: jobData.clientEmail || jobData.posterEmail || 'N/A',
                contractorName: jobData.contractorName || jobData.assignedTo || 'Unassigned',
                contractorEmail: jobData.contractorEmail || 'N/A',
                description: jobData.description || '',
                createdAt: jobData.createdAt,
                updatedAt: jobData.updatedAt,
                ...jobData
            };
        });

        // Sort manually if needed
        jobs.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        console.log(`Found ${jobs.length} jobs for admin`);
        
        res.json({ 
            success: true, 
            data: jobs
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.json({ 
            success: true, 
            data: [],
            message: 'Jobs collection not found or empty'
        });
    }
});

// Get all messages - FIXES /api/admin/messages 404
router.get('/messages', async (req, res) => {
    try {
        console.log('Admin messages list requested by:', req.user?.email);
        
        let snapshot;
        try {
            snapshot = await adminDb.collection('messages')
                .orderBy('createdAt', 'desc')
                .get();
        } catch (orderError) {
            console.log('Messages ordering failed, fetching without order');
            snapshot = await adminDb.collection('messages').get();
        }
        
        const messages = snapshot.docs.map(doc => {
            const messageData = doc.data();
            return {
                id: doc.id,
                _id: doc.id,
                senderName: messageData.senderName || messageData.from || messageData.name || 'Anonymous',
                senderEmail: messageData.senderEmail || messageData.email || 'N/A',
                subject: messageData.subject || messageData.title || 'No Subject',
                content: messageData.content || messageData.message || messageData.text || '',
                type: messageData.type || 'contact',
                status: messageData.status || 'unread',
                isRead: messageData.isRead || false,
                createdAt: messageData.createdAt,
                updatedAt: messageData.updatedAt,
                ...messageData
            };
        });

        // Sort manually if needed
        messages.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        console.log(`Found ${messages.length} messages for admin`);
        
        res.json({ 
            success: true, 
            data: messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.json({ 
            success: true, 
            data: [],
            message: 'Messages collection not found or empty'
        });
    }
});

// Get all quotes - FIXES /api/admin/quotes 404  
router.get('/quotes', async (req, res) => {
    try {
        console.log('Admin quotes list requested by:', req.user?.email);
        
        let snapshot;
        try {
            snapshot = await adminDb.collection('quotes')
                .orderBy('createdAt', 'desc')
                .get();
        } catch (orderError) {
            console.log('Quotes ordering failed, fetching without order');
            snapshot = await adminDb.collection('quotes').get();
        }
        
        const quotes = snapshot.docs.map(doc => {
            const quoteData = doc.data();
            return {
                id: doc.id,
                _id: doc.id,
                clientName: quoteData.clientName || quoteData.name || 'Unknown Client',
                clientEmail: quoteData.clientEmail || quoteData.email || 'N/A',
                projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled Project',
                projectType: quoteData.projectType || quoteData.category || quoteData.type || 'General',
                amount: quoteData.amount || quoteData.estimatedAmount || quoteData.price || 0,
                status: quoteData.status || 'pending',
                description: quoteData.description || '',
                createdAt: quoteData.createdAt,
                updatedAt: quoteData.updatedAt,
                ...quoteData
            };
        });

        // Sort manually if needed
        quotes.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateB - dateA;
        });
        
        console.log(`Found ${quotes.length} quotes for admin`);
        
        res.json({ 
            success: true, 
            data: quotes
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.json({ 
            success: true, 
            data: [],
            message: 'Quotes collection not found or empty'
        });
    }
});

// Update user status - FIXES /api/admin/users/:userId/status PATCH 404
router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, canAccess, profileStatus } = req.body;

        console.log(`Admin ${req.user?.email} updating user ${userId} status`);

        const updateData = {
            updatedAt: new Date().toISOString(),
            statusUpdatedBy: req.user.email
        };

        if (typeof isActive === 'boolean') updateData.isActive = isActive;
        if (typeof canAccess === 'boolean') updateData.canAccess = canAccess;
        if (profileStatus) updateData.profileStatus = profileStatus;

        await adminDb.collection('users').doc(userId).update(updateData);

        console.log(`User ${userId} status updated successfully`);

        res.json({ 
            success: true, 
            message: 'User status updated successfully'
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user status',
            error: error.message
        });
    }
});

// Delete user - FIXES /api/admin/users/:userId DELETE 404
router.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        console.log(`Admin ${req.user?.email} deleting user ${userId}`);
        
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await adminDb.collection('users').doc(userId).delete();
        
        console.log(`User ${userId} deleted successfully`);
        
        res.json({ 
            success: true, 
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting user',
            error: error.message
        });
    }
});

// Health check
router.get('/health', async (req, res) => {
    try {
        await adminDb.collection('users').limit(1).get();
        res.json({
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                database: 'connected'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Health check failed',
            error: error.message
        });
    }
});

export default router;
