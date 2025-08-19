import { adminDb, bucket } from '../config/firebase.js';

// ===== DASHBOARD & ANALYTICS =====

export const getDashboardStats = async (req, res) => {
    try {
        const [users, jobs, quotes] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('quotes').get()
        ]);

        const stats = {
            totalUsers: users.size,
            totalJobs: jobs.size,
            totalQuotes: quotes.size,
        };
        res.json({ success: true, stats });
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
        res.json({ success: true, user: { id: userDoc.id, ...userDoc.data() } });
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
        const quotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        res.json({ success: true, quote: { id: quoteDoc.id, ...quoteDoc.data() } });
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
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, messages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
};

export const replyToMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        // Logic to send a reply...
        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
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
        const subscriptions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
    }
};

export const getSubscriptionPlans = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscription_plans').get();
        const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, plans });
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscription plans' });
    }
};

export const createSubscriptionPlan = async (req, res) => {
    try {
        const planData = req.body;
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
        const planData = req.body;
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
        await adminDb.collection('subscription_plans').doc(planId).delete();
        res.json({ success: true, message: 'Plan deleted successfully' });
    } catch (error) {
        console.error('Error deleting subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error deleting subscription plan' });
    }
};


// ===== ESTIMATION MANAGEMENT =====

export const getAllEstimations = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
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

        await adminDb.collection('estimations').doc(estimationId).update({
            status: 'completed',
            resultFile: resultFile,
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
        await adminDb.collection('estimations').doc(estimationId).update({ status, updatedAt: new Date().toISOString() });
        res.json({ success: true, message: 'Estimation status updated successfully' });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({ success: false, message: 'Error updating estimation status' });
    }
};

export const deleteEstimation = async (req, res) => {
    try {
        const { estimationId } = req.params;
        // Add logic here to also delete the file from Firebase Storage using the `bucket` object
        await adminDb.collection('estimations').doc(estimationId).delete();
        res.json({ success: true, message: 'Estimation deleted successfully' });
    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({ success: false, message: 'Error deleting estimation' });
    }
};
