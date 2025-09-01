import express from 'express';
import { adminDb } from '../config/firebase.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

// GET all notifications for the logged-in user
router.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
    }
});

// PUT to mark notifications as read
router.put('/mark-read', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'Notification IDs are required.' });
        }

        const batch = adminDb.batch();
        ids.forEach(id => {
            const docRef = adminDb.collection('notifications').doc(id);
            batch.update(docRef, { isRead: true });
        });

        await batch.commit();
        res.status(200).json({ success: true, message: 'Notifications marked as read.' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ success: false, error: 'Failed to update notifications.' });
    }
});

// DELETE all notifications for the logged-in user
router.delete('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const snapshot = await adminDb.collection('notifications').where('userId', '==', userId).get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: 'No notifications to delete.' });
        }

        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        res.status(200).json({ success: true, message: 'All notifications cleared.' });
    } catch (error) {
        console.error('Error deleting notifications:', error);
        res.status(500).json({ success: false, error: 'Failed to clear notifications.' });
    }
});

export default router;
