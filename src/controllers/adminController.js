import { adminDb } from '../config/firebase.js';

// 📊 GET DASHBOARD STATS
export const getDashboardStats = async (req, res) => {
    try {
        const getCollectionCount = async (collectionName) => {
            try {
                const snapshot = await adminDb.collection(collectionName).get();
                return snapshot.size || 0;
            } catch (error) {
                console.warn(`⚠️ Could not get count for collection: ${collectionName}`);
                return 0;
            }
        };

        const userCount = await getCollectionCount('users');
        const quoteCount = await getCollectionCount('quotes');
        const messageCount = await getCollectionCount('messages');
        const jobsCount = await getCollectionCount('jobs');
        const subsCount = await getCollectionCount('subscriptions');

        res.json({
            success: true,
            stats: {
                totalUsers: userCount,
                totalQuotes: quoteCount,
                totalMessages: messageCount,
                totalJobs: jobsCount,
                activeSubscriptions: subsCount
            }
        });
    } catch (error) {
        console.error('❌ Error fetching dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching dashboard statistics' });
    }
};

// 📈 GET SYSTEM STATS
export const getSystemStats = async (req, res) => {
    try {
        res.json({
            success: true,
            stats: {
                nodeVersion: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('❌ Error fetching system stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching system statistics' });
    }
};

// 👥 GET ALL USERS
export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').where('type', '!=', 'admin').get();
        const users = snapshot.docs.map(doc => {
            const { password, ...userData } = doc.data();
            return { _id: doc.id, id: doc.id, ...userData };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('❌ Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
};

// 🗑️ DELETE USER
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        await adminDb.collection('users').doc(userId).delete();
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Error deleting user' });
    }
};

// 🗂️ GET ALL QUOTES
export const getAllQuotes = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];
        
        for (const doc of snapshot.docs) {
            const quoteData = doc.data();
            let userData = null;
            
            // Try to get user data if userId exists
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
                ...quoteData,
                userId: userData
            });
        }
        
        res.json({ success: true, quotes });
    } catch (error) {
        console.error('❌ Error fetching quotes:', error);
        res.status(500).json({ success: false, message: 'Error fetching quotes' });
    }
};

// 💼 GET ALL JOBS
export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => ({ 
            _id: doc.id, 
            id: doc.id, 
            ...doc.data() 
        }));
        res.json({ success: true, jobs });
    } catch (error) {
        console.error('❌ Error fetching jobs:', error);
        res.status(500).json({ success: false, message: 'Error fetching jobs' });
    }
};

// 💬 GET ALL MESSAGES
export const getAllMessages = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];
        
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            let userData = null;
            
            // Try to get user data if senderId exists
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
                ...messageData,
                senderId: userData
            });
        }
        
        res.json({ success: true, messages });
    } catch (error) {
        console.error('❌ Error fetching messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
};

// 👑 GET ALL SUBSCRIPTIONS
export const getAllSubscriptions = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscriptions').orderBy('startDate', 'desc').get();
        const subscriptions = [];
        
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            let userData = null;
            
            // Try to get user data if userId exists
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
                ...subData,
                user: userData
            });
        }
        
        res.json({ success: true, subscriptions });
    } catch (error) {
        console.error('❌ Error fetching subscriptions:', error);
        res.status(500).json({ success: false, message: 'Error fetching subscriptions' });
    }
};