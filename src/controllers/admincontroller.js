const { db } = require('../config/firebase');

const getDashboardStats = async (req, res, next) => {
    try {
        const usersPromise = db.collection('users').get();
        const jobsPromise = db.collection('jobs').get();
        const quotesPromise = db.collection('quotes').get();

        const [usersSnapshot, jobsSnapshot, quotesSnapshot] = await Promise.all([usersPromise, jobsPromise, quotesPromise]);

        res.json({
            success: true,
            stats: {
                totalUsers: usersSnapshot.size,
                totalJobs: jobsSnapshot.size,
                totalQuotes: quotesSnapshot.size,
            }
        });
    } catch (error) {
        next(error);
    }
};

const getAllUsers = async (req, res, next) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        const users = usersSnapshot.docs.map(doc => {
            const { password, ...data } = doc.data();
            return { id: doc.id, ...data };
        });
        res.json({ success: true, users });
    } catch (error) {
        next(error);
    }
};

// Add more admin functions like deleteUser, deleteJob, etc. as needed.

module.exports = { getDashboardStats, getAllUsers };

