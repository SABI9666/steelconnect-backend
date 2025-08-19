import { adminDb, bucket } from '../config/firebase.js';

// ===== USER MANAGEMENT =====
// PERFORMANCE WARNING: This function uses queries inside a loop (N+1 problem),
// which can be slow and expensive with many users. Consider denormalizing
// stats data using Cloud Functions for better performance.
export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = [];
        
        for (const doc of snapshot.docs) {
            const userData = doc.data();
            const { password, ...userInfo } = userData;
            
            // Get user's subscription info
            const subSnapshot = await adminDb.collection('subscriptions')
                .where('userId', '==', doc.id)
                .where('status', '==', 'active')
                .get();
            
            const activeSubscriptions = subSnapshot.docs.map(subDoc => ({
                id: subDoc.id,
                ...subDoc.data()
            }));
            
            // Get user's stats
            const quotesCount = await adminDb.collection('quotes').where('userId', '==', doc.id).get();
            const messagesCount = await adminDb.collection('messages').where('senderId', '==', doc.id).get();
            const jobsCount = await adminDb.collection('jobs').where('userId', '==', doc.id).get();
            
            users.push({
                _id: doc.id,
                ...userInfo,
                activeSubscriptions,
                stats: {
                    quotesCount: quotesCount.size,
                    messagesCount: messagesCount.size,
                    jobsCount: jobsCount.size
                }
            });
        }
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
};

export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        
        await adminDb.collection('users').doc(userId).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'User status updated successfully' });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
};

export const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;
        const userDoc = await adminDb.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const { password, ...userData } = userDoc.data();
        
        // Get detailed user activity
        const [quotes, messages, jobs, subscriptions] = await Promise.all([
            adminDb.collection('quotes').where('userId', '==', userId).get(),
            adminDb.collection('messages').where('senderId', '==', userId).get(),
            adminDb.collection('jobs').where('userId', '==', userId).get(),
            adminDb.collection('subscriptions').where('userId', '==', userId).get()
        ]);
        
        res.json({
            success: true,
            user: {
                _id: userDoc.id,
                ...userData,
                activity: {
                    quotes: quotes.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                    messages: messages.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                    jobs: jobs.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                    subscriptions: subscriptions.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                }
            }
        });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ success: false, message: 'Error fetching user details' });
    }
};

// ===== JOBS MANAGEMENT =====
// PERFORMANCE WARNING: This function uses a query inside a loop (N+1 problem)
// to fetch user data for each job. This can be slow. Consider denormalizing
// essential user info (like name and avatar) into the job document.
export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = [];
        
        for (const doc of snapshot.docs) {
            const jobData = doc.data();
            let userData = null;
            
            if (jobData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(jobData.userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
              _       }
                } catch (userError) {
                    console.warn(`Could not fetch user data for userId: ${jobData.userId}`);
                }
            }
            
            jobs.push({
                _id: doc.id,
                ...jobData,
                user: userData
            });
        }
        
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
        
        await adminDb.collection('jobs').doc(jobId).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
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
export const updateQuoteAmount = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const { amount } = req.body;
        
        await adminDb.collection('quotes').doc(quoteId).update({
            amount: parseFloat(amount),
            updatedAt: new Date().toISOString()
        });
        
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
        
        await adminDb.collection('quotes').doc(quoteId).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
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

export const getQuoteDetails = async (req, res) => {
    try {
        const { quoteId } = req.params;
        const quoteDoc = await adminDb.collection('quotes').doc(quoteId).get();
        
        if (!quoteDoc.exists) {
            return res.status(404).json({ success: false, message: 'Quote not found' });
        }
        
        const quoteData = quoteDoc.data();
        let userData = null;
        
        if (quoteData.userId) {
            const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
            if (userDoc.exists) {
                const { password, ...userInfo } = userDoc.data();
                userData = { id: userDoc.id, ...userInfo };
            }
        }
        
        res.json({
            success: true,
            quote: {
                _id: quoteDoc.id,
                ...quoteData,
                userId: userData
            }
        });
    } catch (error) {
        console.error('Error fetching quote details:', error);
        res.status(500).json({ success: false, message: 'Error fetching quote details' });
    }
};

// ===== MESSAGES MANAGEMENT =====
export const replyToMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const adminUser = req.user;
        
        // Get the original message
        const originalMessage = await adminDb.collection('messages').doc(messageId).get();
        if (!originalMessage.exists) {
            return res.status(404).json({ success: false, message: 'Original message not found' });
        }
        
        const originalData = originalMessage.data();
        
        // Create reply message
        await adminDb.collection('messages').add({
            senderId: adminUser.userId,
            receiverId: originalData.senderId,
            content,
            type: 'admin_reply',
            threadId: messageId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        // Mark original message as replied
        await adminDb.collection('messages').doc(messageId).update({
            replied: true,
            repliedAt: new Date().toISOString(),
            repliedBy: adminUser.userId
        });
        
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

// ===== NEW ESTIMATION MANAGEMENT =====
// PERFORMANCE WARNING: This function uses a query inside a loop (N+1 problem)
// to fetch user data for each estimation. This can be slow.
export const getAllEstimations = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const estimationData = doc.data();
            let userData = null;
            
            if (estimationData.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for contractorId: ${estimationData.contractorId}`);
                }
            }
            
            estimations.push({
                _id: doc.id,
                ...estimationData,
                contractor: userData
            });
        }
        
        res.json({ success: true, estimations });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
};

export const uploadEstimationResult = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const file = req.file; // Assuming multer middleware for file upload
        
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        // Upload to Firebase Storage
        const fileName = `estimations/results/${estimationId}_${Date.now()}_${file.originalname}`;
        const fileUpload = bucket.file(fileName);
        
        await fileUpload.save(file.buffer, {
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    uploadedBy: req.user.userId,
                    uploadedAt: new Date().toISOString(),
                    estimationId: estimationId
                }
            }
        });
        
        // Make file publicly accessible
        await fileUpload.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        // Update estimation document
        await adminDb.collection('estimations').doc(estimationId).update({
            status: 'completed',
            resultFile: {
                url: publicUrl,
                path: fileName, // <-- FIXED: Added the file path for deletion purposes
                fileName: file.originalname,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.userId
            },
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({ 
            success: true, 
            message: 'Estimation result uploaded successfully',
            fileUrl: publicUrl
        });
    } catch (error) {
        console.error('Error uploading estimation result:', error);
        res.status(500).json({ success: false, message: 'Error uploading estimation result' });
    }
};

export const updateEstimationStatus = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status } = req.body;
        
        await adminDb.collection('estimations').doc(estimationId).update({
            status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({ success: true, message: 'Estimation status updated successfully' });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({ success: false, message: 'Error updating estimation status' });
    }
};

export const deleteEstimation = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        // Get estimation data to delete associated files
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (estimationDoc.exists) {
            const estimationData = estimationDoc.data();
            
            // Delete uploaded files from storage
            if (estimationData.uploadedFile && estimationData.uploadedFile.path) {
                try {
                    const file = bucket.file(estimationData.uploadedFile.path);
                    await file.delete();
                } catch (deleteError) {
                    console.warn('Could not delete uploaded file:', deleteError);
                }
            }
            
            if (estimationData.resultFile && estimationData.resultFile.path) {
                try {
                    const resultFile = bucket.file(estimationData.resultFile.path);
                    await resultFile.delete();
                } catch (deleteError) {
                    console.warn('Could not delete result file:', deleteError);
                }
            }
        }
        
        await adminDb.collection('estimations').doc(estimationId).delete();
        res.json({ success: true, message: 'Estimation deleted successfully' });
    } catch (error) {
        console.error('Error deleting estimation:', error);
        res.status(500).json({ success: false, message: 'Error deleting estimation' });
    }
};

// ===== SUBSCRIPTION MANAGEMENT =====
export const createSubscriptionPlan = async (req, res) => {
    try {
        const { userType, activityName, subscriptionType, amount, description } = req.body;
        
        const planData = {
            userType,
            activityName,
            subscriptionType,
            amount: parseFloat(amount),
            description: description || '',
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: req.user.userId
        };
        
        const planRef = await adminDb.collection('subscription_plans').add(planData);
        
        res.json({
            success: true,
            message: 'Subscription plan created successfully',
            planId: planRef.id
        });
    } catch (error) {
        console.error('Error creating subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error creating subscription plan' });
    }
};

export const updateSubscriptionPlan = async (req, res) => {
    try {
        const { planId } = req.params;
        const updateData = { ...req.body, updatedAt: new Date().toISOString() };
        
        await adminDb.collection('subscription_plans').doc(planId).update(updateData);
        
        res.json({ success: true, message: 'Subscription plan updated successfully' });
    } catch (error) {
        console.error('Error updating subscription plan:', error);
        res.status(500).json({ success: false, message: 'Error updating subscription plan' });
    }
};

export const getSubscriptionPlans = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscription_plans').orderBy('createdAt', 'desc').get();
        const plans = snapshot.docs.map(doc => ({
            _id: doc.id,
            ...doc.data()
        }));
        
        res.json({ success: true, plans });
    } catch (error) {
        console.error('Error fetching subscription plans:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscription plans' });
    }
};

// PERFORMANCE WARNING: This function uses a query inside a loop (N+1 problem)
// to fetch user data for each subscription. This can be slow.
export const getUserSubscriptions = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscriptions').orderBy('startDate', 'desc').get();
        const subscriptions = [];
        
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            let userData = null;
            
            if (subData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(subData.userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for userId: ${subData.userId}`);
                }
            }
            
            subscriptions.push({
                _id: doc.id,
                ...subData,
                user: userData
            });
        }
        
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error('Error fetching user subscriptions:', error);
        res.status(500).json({ success: false, message: 'Error fetching user subscriptions' });
    }
};

// ===== ANALYTICS & REPORTING =====
export const getAdvancedStats = async (req, res) => {
    try {
        const { period = '30' } = req.query; // days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(period));
        
        const [users, quotes, messages, jobs, subscriptions] = await Promise.all([
            adminDb.collection('users').where('createdAt', '>=', startDate.toISOString()).get(),
            adminDb.collection('quotes').where('createdAt', '>=', startDate.toISOString()).get(),
            adminDb.collection('messages').where('createdAt', '>=', startDate.toISOString()).get(),
            adminDb.collection('jobs').where('createdAt', '>=', startDate.toISOString()).get(),
            adminDb.collection('subscriptions').where('startDate', '>=', startDate.toISOString()).get()
        ]);
        
        // Calculate revenue
        let totalRevenue = 0;
        subscriptions.docs.forEach(doc => {
            const sub = doc.data();
            if (sub.amount && sub.status === 'active') {
                totalRevenue += sub.amount;
            }
        });
        
        res.json({
            success: true,
            stats: {
                period: `${period} days`,
                newUsers: users.size,
                newQuotes: quotes.size,
                newMessages: messages.size,
                newJobs: jobs.size,
                newSubscriptions: subscriptions.size,
                totalRevenue: totalRevenue,
                // User type breakdown
                usersByType: {
                    contractors: users.docs.filter(doc => doc.data().type === 'contractor').length,
                    designers: users.docs.filter(doc => doc.data().type === 'designer').length
                },
                // Quote status breakdown
                quotesByStatus: {
                    pending: quotes.docs.filter(doc => doc.data().status === 'pending').length,
                    approved: quotes.docs.filter(doc => doc.data().status === 'approved').length,
                    rejected: quotes.docs.filter(doc => doc.data().status === 'rejected').length,
                    completed: quotes.docs.filter(doc => doc.data().status === 'completed').length
                }
            }
        });
    } catch (error) {
        console.error('Error fetching advanced stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching advanced statistics' });
    }
};
