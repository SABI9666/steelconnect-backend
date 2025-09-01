import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Helper function to be used by other routes (e.g., when a quote is approved)
export async function createNotification(userId, message, type = 'info', link = '#') {
    try {
        const notification = {
            userId,
            message,
            type,
            link,
            isRead: false,
            createdAt: new Date().toISOString()
        };
        await adminDb.collection('notifications').add(notification);
        console.log(`Notification created for user ${userId}: ${message}`);
    } catch (error) {
        console.error('Failed to create notification:', error);
    }
}

// GET all notifications for the logged-in user
router.get('/', authenticate, async (req, res) => {
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
        res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
    }
});

// PUT mark all notifications as read
router.put('/mark-read', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('isRead', '==', false)
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: 'No unread notifications.' });
        }

        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });
        await batch.commit();

        res.status(200).json({ success: true, message: 'Notifications marked as read.' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update notifications.' });
    }
});

export default router;
