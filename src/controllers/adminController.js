import { adminDb, bucket } from '../config/firebase.js';

// ===== DASHBOARD & ANALYTICS =====

export const getDashboardStats = async (req, res) => {
    try {
        const [users, jobs, quotes, messages, estimations, subscriptions] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('estimations').get(),
            adminDb.collection('subscriptions').get()
        ]);

        // Get active subscriptions
        const activeSubscriptions = subscriptions.docs.filter(doc => 
            doc.data().status === 'active'
        ).length;

        // Get pending estimations
        const pendingEstimations = estimations.docs.filter(doc => 
            doc.data().status === 'pending'
        ).length;

        // Get unread messages
        const unreadMessages = messages.docs.filter(doc => 
            doc.data().status === 'unread'
        ).length;

        const stats = {
            totalUsers: users.size,
            totalJobs: jobs.size,
            totalQuotes: quotes.size,
            totalMessages: messages.size,
            totalEstimations: estimations.size,
            activeSubscriptions: activeSubscriptions,
            pendingEstimations: pendingEstimations,
            unreadMessages: unreadMessages
        };

        // Generate chart data for dashboard
        const chartData = {
            growth: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                users: [10, 25, 50, 75, 120, users.size],
                quotes: [5, 15, 30, 45, 80, quotes.size]
            },
            userDistribution: {
                contractors: users.docs.filter(doc => doc.data().type === 'contractor').length,
                designers: users.docs.filter(doc => doc.data().type === 'designer').length
            }
        };

        // Recent activity
        const recentActivity = [
            { type: 'user', description: 'New user registered', timestamp: new Date().toISOString() },
            { type: 'quote', description: 'Quote submitted', timestamp: new Date().toISOString() },
            { type: 'estimation', description: 'Estimation completed', timestamp: new Date().toISOString() }
        ];

        res.json({ success: true, stats, chartData, recentActivity });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
    }
};

export const getAdvancedStats = async (req, res) => {
    try {
        // Placeholder for more complex analytics
        res.json({ success: true, message: 'Advanced stats endpoint is working.' });
    } catch (error) {
        console.error('Error fetching advanced stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching advanced stats' });
    }
};

export const getSystemStats = async (req, res) => {
    try {
        // Placeholder for system health stats
        res.json({
            success: true,
            stats: {
                status: 'healthy',
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error fetching system stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching system stats' });
    }
};

// ===== USER MANAGEMENT =====

export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
};

export const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Get user's stats
        const [quotes, jobs, estimations] = await Promise.all([
            adminDb.collection('quotes').where('userId', '==', userId).get(),
            adminDb.collection('jobs').where('userId', '==', userId).get(),
            adminDb.collection('estimations').where('userId', '==', userId).get()
        ]);

        const userData = { 
            id: userDoc.id, 
            ...userDoc.data(),
            stats: {
                totalQuotes: quotes.size,
                totalJobs: jobs.size,
                totalEstimations: estimations.size
            }
        };
        
        res.json({ success: true, user: userData });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ success: false, message: 'Error fetching user details' });
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        await adminDb.collection('users').doc(userId).update({ status, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'User status updated successfully' });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
};

export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        await adminDb.collection('users').doc(userId).delete();
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
};

// ===== JOBS MANAGEMENT =====

export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, jobs });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ success: false, message: 'Error fetching jobs' });
    }
};

export const updateJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { status } = req.body;
        await adminDb.collection('jobs').doc(jobId).update({ status, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'Job status updated successfully' });
    } catch (error) {
        console.error('Error updating job status:', error);
        res.status(500).json({ success: false, message: 'Error updating job status' });
    }
};

export const deleteJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        await adminDb.collection('jobs').doc(jobId).delete();
        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ success: false, message: 'Error deleting job' });
    }
};

// ===== QUOTES MANAGEMENT =====

export const getAllQuotes = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            _id: doc.id, // For frontend compatibility
            ...doc.data() 
        }));
        res.json({ success: true, quotes });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
};

export const getQuoteDetails = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }
        res.json({ success: true, quote: { id: quoteDoc.id, _id: quoteDoc.id, ...quoteDoc.data() } });
    } catch (error) {
        console.error('Error fetching quote details:', error);
        res.status(500).json({ success: false, message: 'Error fetching quote details' });
    }
};

export const updateQuoteAmount = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { amount } = req.body;
        await adminDb.collection('quotes').doc(quoteId).update({ amount, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'Quote amount updated successfully' });
    } catch (error) {
        console.error('Error updating quote amount:', error);
        res.status(500).json({ success: false, message: 'Error updating quote amount' });
    }
};

export const updateQuoteStatus = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { status } = req.body;
        await adminDb.collection('quotes').doc(quoteId).update({ status, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'Quote status updated successfully' });
    } catch (error) {
        console.error('Error updating quote status:', error);
        res.status(500).json({ success: false, message: 'Error updating quote status' });
    }
};

export const deleteQuote = async (req, res) => {
    try {
        const { quoteId } = req.params;
        await adminDb.collection('quotes').doc(quoteId).delete();
        res.json({ success: true, message: 'Quote deleted successfully' });
    } catch (error) {
        console.error('Error deleting quote:', error);
        res.status(500).json({ success: false, message: 'Error deleting quote' });
    }
};

// ===== MESSAGES MANAGEMENT =====

export const getAllMessages = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            _id: doc.id, // For frontend compatibility
            ...doc.data() 
        }));
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
};

export const getMessageDetails = async (req, res) => {
    try {
        const { messageId } = req.params;
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        res.json({ success: true, message: { id: messageDoc.id, _id: messageDoc.id, ...messageDoc.data() } });
    } catch (error) {
        console.error('Error fetching message details:', error);
        res.status(500).json({ success: false, message: 'Error fetching message details' });
    }
};

export const replyToMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        
        // Get the original message
        const messageDoc = await adminDb.collection('messages').doc(messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const messageData = messageDoc.data();
        
        // Create reply object
        const reply = {
            content,
            senderName: 'Admin',
            sentAt: new Date().toISOString(),
            isAdmin: true
        };

        // Update message with reply and change status to replied
        const thread = messageData.thread || [];
        thread.push(reply);

        await adminDb.collection('messages').doc(messageId).update({
            thread,
            status: 'replied',
            updatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
    }
};

export const updateMessageStatus = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { status } = req.body;
        await adminDb.collection('messages').doc(messageId).update({ 
            status, 
            updatedAt: new Date().toISOString() 
        });
        res.json({ success: true, message: 'Message status updated successfully' });
    } catch (error) {
        console.error('Error updating message status:', error);
        res.status(500).json({ success: false, message: 'Error updating message status' });
    }
};

export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        await adminDb.collection('messages').doc(messageId).delete();
        res.json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ success: false, message: 'Error deleting message' });
    }
};

// ===== SUBSCRIPTION MANAGEMENT =====

export const getUserSubscriptions = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscriptions').orderBy('startDate', 'desc').get();
        const subscriptions = [];
        
        for (const doc of snapshot.docs) {
            const subscriptionData = doc.data();
            
            // Get user details
            const userDoc = await adminDb.collection('users').doc(subscriptionData.userId).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            
            // Get plan details
            const planDoc = await adminDb.collection('subscription_plans').doc(subscriptionData.planId).get();
            const planData = planDoc.exists ? planDoc.data() : {};
            
            subscriptions.push({
                id: doc.id,
                _id: doc.id,
                ...subscriptionData,
                userName: userData.name || 'Unknown User',
                userEmail: userData.email || 'Unknown Email',
                planName: planData.name || 'Unknown Plan',
                planPrice: planData.price || 0,
                planInterval: planData.interval || 'month'
            });
        }
        
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
    }
};

export const getSubscriptionPlans = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscription_plans').get();
        const plans = [];
        
        for (const doc of snapshot.docs) {
            const planData = doc.data();
            
            // Count subscribers for each plan
            const subscribersSnapshot = await adminDb.collection('subscriptions')
                .where('planId', '==', doc.id)
                .where('status', '==', 'active')
                .get();
            
            plans.push({
                id: doc.id,
                _id: doc.id,
                ...planData,
                subscriberCount: subscribersSnapshot.size
            });
        }
        
        res.json({ success: true, plans });
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscription plans' });
    }
};

export const createSubscriptionPlan = async (req, res) => {
    try {
        const planData = {
            ...req.body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const docRef = await adminDb.collection('subscription_plans').add(planData);
        res.status(201).json({ success: true, planId: docRef.id, message: 'Plan created successfully' });
    } catch (error) {
        console.error('Error creating subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error creating subscription plan' });
    }
};

export const updateSubscriptionPlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const planData = {
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        await adminDb.collection('subscription_plans').doc(planId).update(planData);
        res.json({ success: true, message: 'Plan updated successfully' });
    } catch (error) {
        console.error('Error updating subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription plan' });
    }
};

export const deleteSubscriptionPlan = async (req, res) => {
    try {
        const { planId } = req.params;
        
        // Check if plan has active subscriptions
        const activeSubscriptions = await adminDb.collection('subscriptions')
            .where('planId', '==', planId)
            .where('status', '==', 'active')
            .get();
            
        if (!activeSubscriptions.empty) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete plan with active subscriptions' 
            });
        }
        
        await adminDb.collection('subscription_plans').doc(planId).delete();
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        console.error('Error deleting subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error deleting subscription plan' });
    }
};

export const cancelSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        
        await adminDb.collection('subscriptions').doc(subscriptionId).update({
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, message: 'Error cancelling subscription' });
    }
};

// ===== ESTIMATION MANAGEMENT =====

export const getAllEstimations = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const estimationData = doc.data();
            
            // Get contractor details
            let contractorData = {};
            if (estimationData.contractorId) {
                const contractorDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
                contractorData = contractorDoc.exists ? contractorDoc.data() : {};
            }
            
            estimations.push({
                id: doc.id,
                _id: doc.id,
                ...estimationData,
                contractorName: contractorData.name || estimationData.contractorName || 'Unknown Contractor',
                contractorEmail: contractorData.email || estimationData.contractorEmail || 'Unknown Email'
            });
        }
        
        res.json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
};

export const getEstimationDetails = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        const estimationData = estimationDoc.data();
        
        // Get contractor details if available
        let contractorData = {};
        if (estimationData.contractorId) {
            const contractorDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
            contractorData = contractorDoc.exists ? contractorDoc.data() : {};
        }
        
        const estimation = {
            id: estimationDoc.id,
            _id: estimationDoc.id,
            ...estimationData,
            contractorName: contractorData.name || estimationData.contractorName || 'Unknown Contractor',
            contractorEmail: contractorData.email || estimationData.contractorEmail || 'Unknown Email'
        };
        
        res.json({ success: true, estimation });
    } catch (error) {
        console.error('Error fetching estimation details:', error);
        res.status(500).json({ success: false, message: 'Error fetching estimation details' });
    }
};

export const uploadEstimationResult = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        if (!req.file || !req.file.publicUrl) {
            return res.status(400).json({ success: false, message: 'File upload failed or URL not found' });
        }

        const resultFile = {
            url: req.file.publicUrl,
            path: req.file.firebasePath,
            fileName: req.file.originalname,
            uploadedAt: new Date().toISOString(),
        };

        // Update estimation with result file and status
        await adminDb.collection('estimations').doc(estimationId).update({
            status: 'completed',
            resultFile: resultFile,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        res.json({ success: true, message: 'Estimation result uploaded successfully', file: resultFile });
    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({ success: false, message: 'Error uploading estimation result' });
    }
};

export const updateEstimationStatus = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status } = req.body;
        
        const updateData = { 
            status, 
            updatedAt: new Date().toISOString() 
        };
        
        // Add completion timestamp if status is completed
        if (status === 'completed') {
            updateData.completedAt = new Date().toISOString();
        }
        
        await adminDb.collection('estimations').doc(estimationId).update(updateData);
        res.json({ success: true, message: 'Estimation status updated successfully' });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({ success: false, message: 'Error updating estimation status' });
    }
};

export const deleteEstimation = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        // Get estimation data first to delete associated files
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (estimationDoc.exists) {
            const estimationData = estimationDoc.data();
            
            // Delete uploaded files from Firebase Storage
            if (estimationData.uploadedFiles && estimationData.uploadedFiles.length > 0) {
                for (const file of estimationData.uploadedFiles) {
                    try {
                        await bucket.file(file.path).delete();
                    } catch (fileError) {
                        console.error('Error deleting file:', fileError);
                    }
                }
            }
            
            // Delete result file if exists
            if (estimationData.resultFile && estimationData.resultFile.path) {
                try {
                    await bucket.file(estimationData.resultFile.path).delete();
                } catch (fileError) {
                    console.error('Error deleting result file:', fileError);
                }
            }
        }
        
        // Delete the estimation document
        await adminDb.collection('estimations').doc(estimationId).delete();
        res.json({ success: true, message: 'Estimation deleted successfully' });
    } catch (error) {
        console.er
