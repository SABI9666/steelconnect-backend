import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Get all notifications for the logged-in user
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const notificationsSnapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();
            
        const notifications = notificationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        res.status(500).json({ success: false, error: 'Server error while fetching notifications.' });
    }
});

// Mark all notifications as read
router.put('/mark-read', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const unreadNotifsSnapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('isRead', '==', false)
            .get();

        if (unreadNotifsSnapshot.empty) {
            return res.status(200).json({ success: true, message: 'No unread notifications to mark.' });
        }

        const batch = adminDb.batch();
        unreadNotifsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });
        await batch.commit();

        res.status(200).json({ success: true, message: 'Notifications marked as read.' });
    } catch (error) {
        console.error('Failed to mark notifications as read:', error);
        res.status(500).json({ success: false, error: 'Server error while updating notifications.' });
    }
});

export default router;
