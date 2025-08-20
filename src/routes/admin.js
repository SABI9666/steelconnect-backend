// src/routes/admin.js - Firebase-based admin routes
import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Middleware to use on all admin routes
router.use(isAdmin);

// --- Admin Dashboard Stats Route ---
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Admin dashboard requested');
        
        // Get counts from Firebase collections
        const [usersSnapshot, quotesSnapshot, messagesSnapshot, jobsSnapshot, estimationsSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get()
        ]);

        // Get unread messages count
        const unreadMessagesSnapshot = await adminDb.collection('messages')
            .where('status', '==', 'unread')
            .get();

        // Get pending estimations count
        const pendingEstimationsSnapshot = await adminDb.collection('estimations')
            .where('status', '==', 'pending')
            .get();

        // Get recent activity (last 5 users)
        const recentUsersSnapshot = await adminDb.collection('users')
            .orderBy('createdAt', 'desc')
            .limit(3)
            .get();

        const recentActivity = [];
        recentUsersSnapshot.forEach(doc => {
            const user = doc.data();
            recentActivity.push({
                type: 'user',
                description: `New user registration: ${user.email}`,
                timestamp: user.createdAt
            });
        });

        // Get recent quotes
        const recentQuotesSnapshot = await adminDb.collection('quotes')
            .orderBy('createdAt', 'desc')
            .limit(2)
            .get();

        recentQuotesSnapshot.forEach(doc => {
            const quote = doc.data();
            recentActivity.push({
                type: 'quote',
                description: `Quote request: ${quote.projectTitle || 'New Project'}`,
                timestamp: quote.createdAt
            });
        });

        // Sort activity by timestamp
        recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const stats = {
            totalUsers: usersSnapshot.size,
            totalQuotes: quotesSnapshot.size,
            totalMessages: messagesSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalEstimations: estimationsSnapshot.size,
            activeSubscriptions: 0, // Add when implementing subscriptions
            pendingEstimations: pendingEstimationsSnapshot.size,
            unreadMessages: unreadMessagesSnapshot.size
        };

        res.status(200).json({
            success: true,
            stats,
            recentActivity: recentActivity.slice(0, 5)
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch dashboard statistics.' 
        });
    }
});

// --- User Management Routes ---
router.get('/users', async (req, res) => {
    try {
        console.log('Admin requesting users list');
        
        const usersSnapshot = await adminDb.collection('users')
            .where('role', '!=', 'admin')
            .orderBy('role')
            .orderBy('createdAt', 'desc')
            .get();
            
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                _id: doc.id,
                name: userData.name,
                email: userData.email,
                role: userData.role,
                isActive: userData.isActive !== false, // Default to true if not set
                company: userData.company,
                phone: userData.phone,
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin
            });
        });
            
        res.status(200).json({ 
            success: true, 
            users 
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch users.' 
        });
    }
});

// Get specific user details
router.get('/users/:id', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.id).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        const userData = userDoc.data();
        
        // Get user activity stats
        const [quotesSnapshot, jobsSnapshot, messagesSnapshot] = await Promise.all([
            adminDb.collection('quotes').where('userId', '==', req.params.id).get(),
            adminDb.collection('jobs').where('clientId', '==', req.params.id).get(),
            adminDb.collection('messages').where('senderId', '==', req.params.id).get()
        ]);
        
        const stats = {
            quotesRequested: quotesSnapshot.size,
            jobsCompleted: jobsSnapshot.docs.filter(doc => doc.data().status === 'completed').length,
            messagesSent: messagesSnapshot.size
        };
        
        const user = {
            _id: userDoc.id,
            ...userData,
            stats
        };
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('User details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load user details'
        });
    }
});

// Update user status
router.patch('/users/:id/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        
        await adminDb.collection('users').doc(req.params.id).update({
            isActive,
            updatedAt: new Date().toISOString()
        });
        
        const userDoc = await adminDb.collection('users').doc(req.params.id).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            user: { _id: userDoc.id, ...userDoc.data() }
        });
        
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const userDoc = await adminDb.collection('users').doc(req.params.id).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        await adminDb.collection('users').doc(req.params.id).delete();
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

// --- Quotes Management Routes ---
router.get('/quotes', async (req, res) => {
    try {
        console.log('Admin requesting quotes list');
        
        const quotesSnapshot = await adminDb.collection('quotes')
            .orderBy('createdAt', 'desc')
            .get();
            
        const quotes = [];
        
        for (const doc of quotesSnapshot.docs) {
            const quoteData = doc.data();
            
            // Get user data for each quote
            let userData = null;
            if (quoteData.userId) {
                const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
                if (userDoc.exists) {
                    userData = userDoc.data();
                }
            }
            
            quotes.push({
                _id: doc.id,
                clientName: userData?.name || 'Unknown Client',
                clientEmail: userData?.email || 'Unknown Email',
                projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled Project',
                projectType: quoteData.projectType || quoteData.category || 'General',
                amount: quoteData.estimatedCost || quoteData.amount || 0,
                status: quoteData.status || 'pending',
                createdAt: quoteData.createdAt,
                updatedAt: quoteData.updatedAt
            });
        }
        
        res.status(200).json({ 
            success: true, 
            quotes 
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch quotes.' 
        });
    }
});

// Get specific quote details
router.get('/quotes/:id', async (req, res) => {
    try {
        const quoteDoc = await adminDb.collection('quotes').doc(req.params.id).get();
        
        if (!quoteDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found'
            });
        }
        
        const quoteData = quoteDoc.data();
        
        // Get user data
        let userData = null;
        if (quoteData.userId) {
            const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
            if (userDoc.exists) {
                userData = userDoc.data();
            }
        }
        
        const quote = {
            _id: quoteDoc.id,
            quoteNumber: quoteData.quoteNumber || quoteDoc.id.slice(-6),
            clientName: userData?.name || 'Unknown Client',
            clientEmail: userData?.email || 'Unknown Email',
            clientPhone: userData?.phone || 'Not provided',
            projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled Project',
            projectType: quoteData.projectType || quoteData.category || 'General',
            amount: quoteData.estimatedCost || quoteData.amount || 0,
            status: quoteData.status || 'pending',
            description: quoteData.description || 'No description provided',
            createdAt: quoteData.createdAt,
            updatedAt: quoteData.updatedAt
        };
        
        res.json({
            success: true,
            quote
        });
        
    } catch (error) {
        console.error('Quote details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load quote details'
        });
    }
});

// Update quote status
router.patch('/quotes/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        await adminDb.collection('quotes').doc(req.params.id).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Quote status updated successfully'
        });
        
    } catch (error) {
        console.error('Update quote status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update quote status'
        });
    }
});

// Update quote amount
router.patch('/quotes/:id/amount', async (req, res) => {
    try {
        const { amount } = req.body;
        
        await adminDb.collection('quotes').doc(req.params.id).update({
            amount: parseFloat(amount),
            estimatedCost: parseFloat(amount),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Quote amount updated successfully'
        });
        
    } catch (error) {
        console.error('Update quote amount error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update quote amount'
        });
    }
});

// Delete quote
router.delete('/quotes/:id', async (req, res) => {
    try {
        const quoteDoc = await adminDb.collection('quotes').doc(req.params.id).get();
        
        if (!quoteDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Quote not found'
            });
        }
        
        await adminDb.collection('quotes').doc(req.params.id).delete();
        
        res.json({
            success: true,
            message: 'Quote deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete quote error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete quote'
        });
    }
});

// --- Messages Management Routes ---
router.get('/messages', async (req, res) => {
    try {
        console.log('Admin requesting messages list');
        
        const messagesSnapshot = await adminDb.collection('messages')
            .orderBy('createdAt', 'desc')
            .get();
            
        const messages = [];
        
        for (const doc of messagesSnapshot.docs) {
            const messageData = doc.data();
            
            // Get sender data
            let senderData = null;
            if (messageData.senderId) {
                const senderDoc = await adminDb.collection('users').doc(messageData.senderId).get();
                if (senderDoc.exists) {
                    senderData = senderDoc.data();
                }
            }
            
            messages.push({
                _id: doc.id,
                senderName: senderData?.name || messageData.senderName || 'Unknown Sender',
                senderEmail: senderData?.email || messageData.senderEmail || 'Unknown Email',
                subject: messageData.subject || 'No Subject',
                content: messageData.content || messageData.message || '',
                status: messageData.status || 'unread',
                createdAt: messageData.createdAt,
                attachments: messageData.attachments || []
            });
        }
        
        res.status(200).json({ 
            success: true, 
            messages 
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch messages.' 
        });
    }
});

// Get specific message details
router.get('/messages/:id', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.id).get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        const messageData = messageDoc.data();
        
        // Get sender data
        let senderData = null;
        if (messageData.senderId) {
            const senderDoc = await adminDb.collection('users').doc(messageData.senderId).get();
            if (senderDoc.exists) {
                senderData = senderDoc.data();
            }
        }
        
        const message = {
            _id: messageDoc.id,
            senderName: senderData?.name || messageData.senderName || 'Unknown Sender',
            senderEmail: senderData?.email || messageData.senderEmail || 'Unknown Email',
            subject: messageData.subject || 'No Subject',
            content: messageData.content || messageData.message || '',
            status: messageData.status || 'unread',
            createdAt: messageData.createdAt,
            attachments: messageData.attachments || []
        };
        
        res.json({
            success: true,
            message
        });
        
    } catch (error) {
        console.error('Message details error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load message details'
        });
    }
});

// Update message status
router.patch('/messages/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        
        await adminDb.collection('messages').doc(req.params.id).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Message status updated successfully'
        });
        
    } catch (error) {
        console.error('Update message status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update message status'
        });
    }
});

// Reply to message
router.post('/messages/:id/reply', async (req, res) => {
    try {
        const { content } = req.body;
        
        const messageDoc = await adminDb.collection('messages').doc(req.params.id).get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        // Create reply in replies subcollection
        await adminDb.collection('messages').doc(req.params.id)
            .collection('replies').add({
                content,
                senderName: 'Admin',
                senderType: 'admin',
                createdAt: new Date().toISOString()
            });
        
        // Update message status to replied
        await adminDb.collection('messages').doc(req.params.id).update({
            status: 'replied',
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Reply sent successfully'
        });
        
    } catch (error) {
        console.error('Reply to message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send reply'
        });
    }
});

// Delete message
router.delete('/messages/:id', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.id).get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Message not found'
            });
        }
        
        await adminDb.collection('messages').doc(req.params.id).delete();
        
        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete message'
        });
    }
});

// --- Jobs Management Routes ---
router.get('/jobs', async (req, res) => {
    try {
        console.log('Admin requesting jobs list');
        
        const jobsSnapshot = await adminDb.collection('jobs')
            .orderBy('createdAt', 'desc')
            .get();
            
        const jobs = [];
        jobsSnapshot.forEach(doc => {
            const jobData = doc.data();
            jobs.push({
                _id: doc.id,
                ...jobData
            });
        });
        
        res.status(200).json({ 
            success: true, 
            jobs 
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch jobs.' 
        });
    }
});

// --- Estimations Management Routes ---
router.get('/estimations', async (req, res) => {
    try {
        console.log('Admin requesting estimations list');
        
        const estimationsSnapshot = await adminDb.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();
            
        const estimations = [];
        estimationsSnapshot.forEach(doc => {
            const estimationData = doc.data();
            estimations.push({
                _id: doc.id,
                ...estimationData
            });
        });
        
        res.status(200).json({ 
            success: true, 
            estimations 
        });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch estimations.' 
        });
    }
});

// --- Subscription placeholder routes ---
router.get('/subscriptions', async (req, res) => {
    try {
        res.json({ 
            success: true, 
            subscriptions: [] 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch subscriptions.' 
        });
    }
});

router.get('/subscription-plans', async (req, res) => {
    try {
        res.json({ 
            success: true, 
            plans: [] 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch subscription plans.' 
        });
    }
});

export default router;
