import admin from 'firebase-admin';
const db = admin.firestore();

// 📊 GET DASHBOARD STATS (WITH DETAILED LOGGING)
export const getDashboardStats = async (req, res) => {
    console.log('--- 📊 Dashboard stats request started ---');
    try {
        const getCollectionCount = async (collectionName) => {
            try {
                const snapshot = await db.collection(collectionName).get();
                return snapshot.size || 0;
            } catch (error) {
                console.warn(`⚠️ Could not get count for collection: ${collectionName}`);
                return 0;
            }
        };

        console.log('Step 1: Fetching user count...');
        const userCount = await getCollectionCount('users');
        console.log(` -> Found ${userCount} users.`);

        console.log('Step 2: Fetching quote count...');
        const quoteCount = await getCollectionCount('quotes');
        console.log(` -> Found ${quoteCount} quotes.`);
        
        console.log('Step 3: Fetching message count...');
        const messageCount = await getCollectionCount('messages');
        console.log(` -> Found ${messageCount} messages.`);

        console.log('Step 4: Fetching jobs count...');
        const jobsCount = await getCollectionCount('jobs');
        console.log(` -> Found ${jobsCount} jobs.`);

        console.log('Step 5: Fetching subscriptions count...');
        const subsCount = await getCollectionCount('subscriptions');
        console.log(` -> Found ${subsCount} subscriptions.`);
        
        console.log('--- ✅ All counts fetched successfully. Sending response. ---');
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

// ... (rest of your controller functions remain the same)
