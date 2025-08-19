import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

// Import all the controller functions
import {
    getDashboardStats,
    getAllUsers,
    deleteUser, // This was in your file, so I've kept it.
    getSystemStats,
    getAllQuotes,
    getAllJobs,
    getAllMessages,
    getAllSubscriptions,
    getAllEstimations // Added for the new feature
} from '../controllers/adminController.js';

const router = express.Router();

// This security check applies to all routes in this file
router.use(isAdmin);

// --- API ROUTES ---

// Dashboard & System
router.get('/dashboard', getDashboardStats);
router.get('/system-stats', getSystemStats);

// Users Management
router.get('/users', getAllUsers);
router.delete('/users/:userId', deleteUser);

// User Status Updates (expected by frontend)
router.put('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        
        // Update user status in database
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({ 
            status, 
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'User status updated successfully.' });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// User Subscription Updates (expected by frontend)
router.put('/users/:userId/subscription', async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({ 
            'subscription.status': status,
            'subscription.updatedAt': new Date().toISOString(),
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'User subscription updated successfully.' });
    } catch (error) {
        console.error('Error updating user subscription:', error);
        res.status(500).json({ success: false, message: 'Error updating user subscription' });
    }
});

// User Subscription Required Updates (expected by frontend)
router.put('/users/:userId/subscription-required', async (req, res) => {
    try {
        const { userId } = req.params;
        const { required } = req.body;
        
        const userRef = adminDb.collection('users').doc(userId);
        await userRef.update({ 
            subscriptionRequired: required,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription requirement updated successfully.' });
    } catch (error) {
        console.error('Error updating subscription requirement:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription requirement' });
    }
});

// Quotes Management
router.get('/quotes', getAllQuotes);

// Quote Updates (expected by frontend)
router.put('/quotes/:quoteId/amount', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { amount } = req.body;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        await quoteRef.update({ 
            amount: parseFloat(amount) || 0,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Quote amount updated successfully.' });
    } catch (error) {
        console.error('Error updating quote amount:', error);
        res.status(500).json({ success: false, message: 'Error updating quote amount' });
    }
});

router.put('/quotes/:quoteId/status', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { status } = req.body;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        await quoteRef.update({ 
            status,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Quote status updated successfully.' });
    } catch (error) {
        console.error('Error updating quote status:', error);
        res.status(500).json({ success: false, message: 'Error updating quote status' });
    }
});

router.put('/quotes/:quoteId/subscription-required', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { required } = req.body;
        
        const quoteRef = adminDb.collection('quotes').doc(quoteId);
        await quoteRef.update({ 
            subscriptionRequired: required,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Quote subscription requirement updated successfully.' });
    } catch (error) {
        console.error('Error updating quote subscription requirement:', error);
        res.status(500).json({ success: false, message: 'Error updating quote subscription requirement' });
    }
});

router.get('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
        
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }
        
        res.json({ success: true, quote: { id: quoteDoc.id, ...quoteDoc.data() } });
    } catch (error) {
        console.error('Error fetching quote details:', error);
        res.status(500).json({ success: false, message: 'Error fetching quote details' });
    }
});

router.delete('/quotes/:quoteId', async (req, res) => {
    try {
        const { quoteId } = req.params;
        await adminDb.collection('quotes').doc(quoteId).delete();
        res.json({ success: true, message: 'Quote deleted successfully.' });
    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).json({ success: false, message: 'Error deleting quote' });
    }
});

// Jobs Management
router.get('/jobs', getAllJobs);

// Job Updates (expected by frontend)
router.put('/jobs/:jobId/salary', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { salary } = req.body;
        
        const jobRef = adminDb.collection('jobs').doc(jobId);
        await jobRef.update({ 
            salary,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Job salary updated successfully.' });
    } catch (error) {
        console.error('Error updating job salary:', error);
        res.status(500).json({ success: false, message: 'Error updating job salary' });
    }
});

router.put('/jobs/:jobId/status', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status } = req.body;
        
        const jobRef = adminDb.collection('jobs').doc(jobId);
        await jobRef.update({ 
            status,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Job status updated successfully.' });
    } catch (error) {
        console.error('Error updating job status:', error);
        res.status(500).json({ success: false, message: 'Error updating job status' });
    }
});

router.put('/jobs/:jobId/subscription-required', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { required } = req.body;
        
        const jobRef = adminDb.collection('jobs').doc(jobId);
        await jobRef.update({ 
            subscriptionRequired: required,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Job subscription requirement updated successfully.' });
    } catch (error) {
        console.error('Error updating job subscription requirement:', error);
        res.status(500).json({ success: false, message: 'Error updating job subscription requirement' });
    }
});

router.get('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const jobDoc = await adminDb.collection('jobs').doc(jobId).get();
        
        if (!jobDoc.exists) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        
        res.json({ success: true, job: { id: jobDoc.id, ...jobDoc.data() } });
    } catch (error) {
        console.error('Error fetching job details:', error);
        res.status(500).json({ success: false, message: 'Error fetching job details' });
    }
});

router.delete('/jobs/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        await adminDb.collection('jobs').doc(jobId).delete();
        res.json({ success: true, message: 'Job deleted successfully.' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ success: false, message: 'Error deleting job' });
    }
});

// Messages Management
router.get('/messages', getAllMessages);

// Message Updates (expected by frontend)
router.put('/messages/:messageId/type', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { type } = req.body;
        
        const messageRef = adminDb.collection('messages').doc(messageId);
        await messageRef.update({ 
            type,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Message type updated successfully.' });
    } catch (error) {
        console.error('Error updating message type:', error);
        res.status(500).json({ success: false, message: 'Error updating message type' });
    }
});

router.put('/messages/:messageId/amount', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { amount } = req.body;
        
        const messageRef = adminDb.collection('messages').doc(messageId);
        await messageRef.update({ 
            amount: parseFloat(amount) || 0,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Message amount updated successfully.' });
    } catch (error) {
        console.error('Error updating message amount:', error);
        res.status(500).json({ success: false, message: 'Error updating message amount' });
    }
});

router.put('/messages/:messageId/subscription-required', async (req, res) => {
    try {
        const { messageId } = req.params;
        const { required } = req.body;
        
        const messageRef = adminDb.collection('messages').doc(messageId);
        await messageRef.update({ 
            subscriptionRequired: required,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Message subscription requirement updated successfully.' });
    } catch (error) {
        console.error('Error updating message subscription requirement:', error);
        res.status(500).json({ success: false, message: 'Error updating message subscription requirement' });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        res.json({ success: true, message: { id: messageDoc.id, ...messageDoc.data() } });
    } catch (error) {
        console.error('Error fetching message details:', error);
        res.status(500).json({ success: false, message: 'Error fetching message details' });
    }
});

router.delete('/messages/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        await adminDb.collection('messages').doc(messageId).delete();
        res.json({ success: true, message: 'Message deleted successfully.' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ success: false, message: 'Error deleting message' });
    }
});

// Subscriptions Management
router.get('/subscriptions', getAllSubscriptions);

// Subscription Updates (expected by frontend)
router.put('/subscriptions/:subscriptionId/amount', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { amount } = req.body;
        
        const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
        await subRef.update({ 
            amount: parseFloat(amount) || 0,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription amount updated successfully.' });
    } catch (error) {
        console.error('Error updating subscription amount:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription amount' });
    }
});

router.put('/subscriptions/:subscriptionId/status', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { status } = req.body;
        
        const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
        await subRef.update({ 
            status,
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription status updated successfully.' });
    } catch (error) {
        console.error('Error updating subscription status:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription status' });
    }
});

router.put('/subscriptions/:subscriptionId/end-date', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { endDate } = req.body;
        
        const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
        await subRef.update({ 
            endDate: new Date(endDate).toISOString(),
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription end date updated successfully.' });
    } catch (error) {
        console.error('Error updating subscription end date:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription end date' });
    }
});

router.put('/subscriptions/:subscriptionId/extend', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const { months } = req.body;
        
        const subDoc = await adminDb.collection('subscriptions').doc(subscriptionId).get();
        if (!subDoc.exists) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }
        
        const subData = subDoc.data();
        const currentEndDate = new Date(subData.endDate || new Date());
        const newEndDate = new Date(currentEndDate.setMonth(currentEndDate.getMonth() + parseInt(months)));
        
        const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
        await subRef.update({ 
            endDate: newEndDate.toISOString(),
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription extended successfully.' });
    } catch (error) {
        console.error('Error extending subscription:', error);
        res.status(500).json({ success: false, message: 'Error extending subscription' });
    }
});

router.put('/subscriptions/:subscriptionId/cancel', async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        
        const subRef = adminDb.collection('subscriptions').doc(subscriptionId);
        await subRef.update({ 
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString() 
        });
        
        res.json({ success: true, message: 'Subscription cancelled successfully.' });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, message: 'Error cancelling subscription' });
    }
});

router.post('/subscriptions', async (req, res) => {
    try {
        const { userEmail, plan, amount, duration } = req.body;
        
        // Find user by email
        const userSnapshot = await adminDb.collection('users')
            .where('email', '==', userEmail.toLowerCase())
            .limit(1)
            .get();
            
        if (userSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userDoc = userSnapshot.docs[0];
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + duration);
        
        const newSubscription = {
            userId: userDoc.id,
            user: { id: userDoc.id, name: userDoc.data().name, email: userDoc.data().email },
            plan,
            amount: parseFloat(amount),
            status: 'active',
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            paymentMethod: 'Manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const subRef = await adminDb.collection('subscriptions').add(newSubscription);
        
        // Update user's subscription status
        await adminDb.collection('users').doc(userDoc.id).update({
            'subscription.status': 'active',
            'subscription.endDate': endDate.toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Subscription added successfully.', subscription: { id: subRef.id, ...newSubscription } });
    } catch (error) {
        console.error('Error adding subscription:', error);
        res.status(500).json({ success: false, message: 'Error adding subscription' });
    }
});

// (NEW) Estimations Management from MongoDB
router.get('/estimations', getAllEstimations);

export default router;
