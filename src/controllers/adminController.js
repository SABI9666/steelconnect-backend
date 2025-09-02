// Fixed adminController.js
import { adminDb } from '../config/firebase.js';

// Dashboard stats - return data in expected format
export const getDashboardStats = async (req, res) => {
    try {
        const getCollectionCount = async (collectionName) => {
            try {
                const snapshot = await adminDb.collection(collectionName).get();
                return snapshot.size || 0;
            } catch (error) {
                console.warn(`Could not get count for collection: ${collectionName}`);
                return 0;
            }
        };

        const [userSnapshot, quoteSnapshot, messageSnapshot, jobsSnapshot, estimationSnapshot, subsSnapshot] = await Promise.all([
            adminDb.collection('users').where('type', '!=', 'admin').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get(),
            adminDb.collection('subscriptions').get()
        ]);

        // Count user types
        let contractors = 0;
        let designers = 0;
        userSnapshot.docs.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') contractors++;
            if (userData.type === 'designer') designers++;
        });

        const stats = {
            totalUsers: userSnapshot.size,
            contractors: contractors,
            designers: designers,
            totalQuotes: quoteSnapshot.size,
            totalMessages: messageSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalEstimations: estimationSnapshot.size,
            totalSubscriptions: subsSnapshot.size,
            activeJobs: 0, // Calculate based on job status
            completedJobs: 0 // Calculate based on job status
        };

        // Calculate active/completed jobs
        jobsSnapshot.docs.forEach(doc => {
            const jobData = doc.data();
            if (jobData.status === 'active' || jobData.status === 'open') {
                stats.activeJobs++;
            } else if (jobData.status === 'completed') {
                stats.completedJobs++;
            }
        });

        res.json({
            success: true,
            data: {
                stats: stats,
                adminUser: req.user?.email || 'admin@steelconnect.com'
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
};

// Get all users - fix data structure
export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').where('type', '!=', 'admin').get();
        const users = snapshot.docs.map(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            return { 
                _id: doc.id, 
                id: doc.id,
                name: userData.name || userData.firstName + ' ' + (userData.lastName || ''),
                email: userData.email,
                type: userData.type || 'user',
                role: userData.role || userData.type || 'user',
                isActive: userData.isActive !== false,
                company: userData.company || userData.companyName,
                phone: userData.phone,
                createdAt: userData.createdAt || userData.joinedAt,
                ...userWithoutPassword
            };
        });
        
        res.json({ 
            success: true, 
            data: users // Wrap in data object as expected by frontend
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching users',
            error: error.message
        });
    }
};

// Get all quotes - fix data structure
export const getAllQuotes = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];
        
        for (const doc of snapshot.docs) {
            const quoteData = doc.data();
            let userData = null;
            
            if (quoteData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for userId: ${quoteData.userId}`);
                }
            }
            
            quotes.push({
                _id: doc.id,
                id: doc.id,
                clientName: userData?.name || quoteData.clientName || 'Unknown',
                clientEmail: userData?.email || quoteData.clientEmail || 'N/A',
                projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled',
                projectType: quoteData.projectType || quoteData.category || 'General',
                amount: quoteData.amount || quoteData.estimatedAmount || 0,
                status: quoteData.status || 'pending',
                createdAt: quoteData.createdAt,
                ...quoteData
            });
        }
        
        res.json({ 
            success: true, 
            data: quotes
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching quotes',
            error: error.message
        });
    }
};

// Get all jobs - fix data structure
export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => {
            const jobData = doc.data();
            return { 
                _id: doc.id, 
                id: doc.id,
                title: jobData.title || jobData.projectTitle || 'Untitled Job',
                projectTitle: jobData.title || jobData.projectTitle || 'Untitled Job',
                category: jobData.category || jobData.type || 'General',
                type: jobData.type || jobData.category || 'General',
                status: jobData.status || 'pending',
                budget: jobData.budget || jobData.amount || 0,
                clientName: jobData.clientName || jobData.posterName || 'Unknown',
                clientEmail: jobData.clientEmail || jobData.posterEmail || 'N/A',
                contractorName: jobData.contractorName || jobData.assignedTo || 'Unassigned',
                contractorEmail: jobData.contractorEmail || 'N/A',
                createdAt: jobData.createdAt,
                ...jobData
            };
        });
        
        res.json({ 
            success: true, 
            data: jobs
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching jobs',
            error: error.message
        });
    }
};

// Get all messages - fix data structure
export const getAllMessages = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];
        
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            let userData = null;
            
            if (messageData.senderId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(messageData.senderId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for senderId: ${messageData.senderId}`);
                }
            }
            
            messages.push({
                _id: doc.id,
                id: doc.id,
                senderName: userData?.name || messageData.senderName || messageData.from || 'Anonymous',
                senderEmail: userData?.email || messageData.senderEmail || messageData.email || 'N/A',
                subject: messageData.subject || messageData.title || 'No Subject',
                content: messageData.content || messageData.message || messageData.text || '',
                type: messageData.type || 'general',
                isRead: messageData.isRead || false,
                createdAt: messageData.createdAt,
                ...messageData
            });
        }
        
        res.json({ 
            success: true, 
            data: messages
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Get all subscriptions - fix data structure
export const getAllSubscriptions = async (req, res) => {
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
                id: doc.id,
                userName: userData?.name || subData.userName || 'Unknown',
                userEmail: userData?.email || subData.userEmail || 'N/A',
                planName: subData.planName || subData.plan?.name || 'Unknown Plan',
                planPrice: subData.planPrice || subData.amount || 0,
                planInterval: subData.planInterval || subData.billing || 'month',
                status: subData.status || 'active',
                startDate: subData.startDate || subData.createdAt,
                nextBillingDate: subData.nextBillingDate,
                ...subData,
                user: userData
            });
        }
        
        res.json({ 
            success: true, 
            data: subscriptions
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching subscriptions',
            error: error.message
        });
    }
};

// User status update
export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, status } = req.body;

        await adminDb.collection('users').doc(userId).update({
            isActive: isActive,
            status: status || (isActive ? 'active' : 'inactive'),
            updatedAt: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: 'User status updated successfully.' 
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user status',
            error: error.message
        });
    }
};

// Delete user
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        await adminDb.collection('users').doc(userId).delete();
        res.json({ 
            success: true, 
            message: 'User deleted successfully.' 
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting user',
            error: error.message
        });
    }
};
