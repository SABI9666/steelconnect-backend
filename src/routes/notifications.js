// src/routes/notifications.js - COMPLETE UPDATED IMPLEMENTATION
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user notifications with enhanced filtering
router.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50, type, unreadOnly, markSeen } = req.query;
        
        console.log(`Fetching notifications for user: ${userId}`);
        
        let query = adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('deleted', '!=', true);
            
        // Add type filter if specified
        if (type && type !== 'all') {
            query = query.where('type', '==', type);
        }
        
        // Add unread filter if specified
        if (unreadOnly === 'true') {
            query = query.where('isRead', '==', false);
        }
        
        const snapshot = await query
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .get();
        
        const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Ensure createdAt is properly formatted
            createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : doc.data().createdAt
        }));
        
        // Mark as seen if requested
        if (markSeen === 'true') {
            const unseenNotifications = notifications.filter(n => !n.seen);
            if (unseenNotifications.length > 0) {
                const batch = adminDb.batch();
                unseenNotifications.forEach(notification => {
                    const notificationRef = adminDb.collection('notifications').doc(notification.id);
                    batch.update(notificationRef, { 
                        seen: true, 
                        seenAt: new Date().toISOString() 
                    });
                });
                await batch.commit();
                console.log(`Marked ${unseenNotifications.length} notifications as seen`);
            }
        }
        
        // Get counts
        const counts = await NotificationService.getNotificationCounts(userId);
        
        res.json({
            success: true,
            notifications: notifications,
            unreadCount: counts.unread,
            unseenCount: counts.unseen,
            totalCount: counts.total
        });
        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        
        // Return empty notifications instead of error to prevent frontend issues
        res.json({
            success: true,
            notifications: [],
            unreadCount: 0,
            unseenCount: 0,
            totalCount: 0,
            message: 'Notifications service temporarily unavailable'
        });
    }
});

// Mark notification as read
router.patch('/:notificationId/read', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        await NotificationService.markAsRead(notificationId, userId);
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error updating notification'
        });
    }
});

// Mark all notifications as read
router.post('/mark-all-read', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const result = await NotificationService.markAllAsRead(userId);
        
        res.json({
            success: true,
            message: result.message,
            updated: result.updated
        });
        
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notifications'
        });
    }
});

// Delete notification (soft delete)
router.delete('/:notificationId', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        await NotificationService.deleteNotification(notificationId, userId);
        
        res.json({
            success: true,
            message: 'Notification deleted'
        });
        
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting notification'
        });
    }
});

// Get notification counts only
router.get('/counts', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const counts = await NotificationService.getNotificationCounts(userId);
        
        res.json({
            success: true,
            counts
        });
        
    } catch (error) {
        console.error('Error getting notification counts:', error);
        
        // Return zero counts instead of error
        res.json({
            success: true,
            counts: {
                total: 0,
                unread: 0,
                unseen: 0
            }
        });
    }
});

// Get unread count only (lightweight endpoint for frequent polling)
router.get('/unread-count', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('deleted', '!=', true)
            .where('isRead', '==', false)
            .get();
        
        res.json({
            success: true,
            unreadCount: snapshot.size
        });
        
    } catch (error) {
        console.error('Error getting unread count:', error);
        res.json({
            success: true,
            unreadCount: 0
        });
    }
});

// Create notification (internal/admin use)
router.post('/create', async (req, res) => {
    try {
        // Only allow admins to create notifications via API
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const { userId, title, message, type, metadata } = req.body;
        
        if (!userId || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'userId, title, and message are required'
            });
        }
        
        const notificationId = await NotificationService.createNotification(
            userId, 
            title, 
            message, 
            type || 'info', 
            metadata || {}
        );
        
        res.json({
            success: true,
            message: 'Notification created',
            notificationId
        });
        
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating notification'
        });
    }
});

// Bulk mark as read
router.post('/bulk-read', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { notificationIds } = req.body;
        
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'notificationIds array is required'
            });
        }
        
        const batch = adminDb.batch();
        let updateCount = 0;
        
        for (const notificationId of notificationIds) {
            try {
                const notificationRef = adminDb.collection('notifications').doc(notificationId);
                const notificationDoc = await notificationRef.get();
                
                if (notificationDoc.exists) {
                    const notification = notificationDoc.data();
                    if (notification.userId === userId && !notification.isRead) {
                        batch.update(notificationRef, {
                            isRead: true,
                            readAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        });
                        updateCount++;
                    }
                }
            } catch (error) {
                console.warn(`Failed to process notification ${notificationId}:`, error);
            }
        }
        
        if (updateCount > 0) {
            await batch.commit();
        }
        
        res.json({
            success: true,
            message: `${updateCount} notifications marked as read`,
            updated: updateCount
        });
        
    } catch (error) {
        console.error('Error bulk marking notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notifications'
        });
    }
});

// Clean up old notifications (admin only)
router.post('/cleanup', async (req, res) => {
    try {
        if (req.user.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        const { daysToKeep = 90 } = req.body;
        
        const deletedCount = await NotificationService.cleanupOldNotifications(daysToKeep);
        
        res.json({
            success: true,
            message: `Cleaned up ${deletedCount} old notifications`,
            deleted: deletedCount
        });
        
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error cleaning up notifications'
        });
    }
});

// Create support update notification
router.post('/support-update', async (req, res) => {
    try {
        const { userId, ticketId, adminMessage } = req.body;
        
        if (!userId || !ticketId) {
            return res.status(400).json({
                success: false,
                message: 'userId and ticketId are required'
            });
        }
        
        const notificationId = await NotificationService.createNotification(
            userId,
            'Support Ticket Update',
            `Admin has responded to your support ticket: "${adminMessage?.substring(0, 100)}..."`,
            'support',
            {
                action: 'support_reply',
                ticketId,
                adminMessage
            }
        );
        
        res.json({
            success: true,
            message: 'Support notification created',
            notificationId
        });
        
    } catch (error) {
        console.error('Error creating support notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating support notification'
        });
    }
});

export default router;
