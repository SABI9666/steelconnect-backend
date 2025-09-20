// src/routes/notifications.js - CORRECTED VERSION with proper support notification handling

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user notifications with enhanced filtering (CORRECTED)
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
        
        const notifications = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // CORRECTED: Ensure createdAt is properly formatted
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || data.createdAt || new Date().toISOString()
            };
        });
        
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
        const counts = await getNotificationCounts(userId);
        
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

// CORRECTED: Local notification counts function
async function getNotificationCounts(userId) {
    try {
        const [totalSnapshot, unreadSnapshot, unseenSnapshot] = await Promise.all([
            adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .get(),
            adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .where('isRead', '==', false)
                .get(),
            adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .where('seen', '==', false)
                .get()
        ]);

        return {
            total: totalSnapshot.size,
            unread: unreadSnapshot.size,
            unseen: unseenSnapshot.size
        };
    } catch (error) {
        console.error('Error getting notification counts:', error);
        return { total: 0, unread: 0, unseen: 0 };
    }
}

// Mark notification as read (CORRECTED)
router.patch('/:notificationId/read', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        // Verify notification belongs to user
        const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
        
        if (!notificationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        const notificationData = notificationDoc.data();
        if (notificationData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        await adminDb.collection('notifications').doc(notificationId).update({
            isRead: true,
            readAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notification'
        });
    }
});

// Mark all notifications as read
router.post('/mark-all-read', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const unreadNotifications = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('deleted', '!=', true)
            .where('isRead', '==', false)
            .get();

        if (unreadNotifications.empty) {
            return res.json({
                success: true,
                message: 'No unread notifications to update',
                updated: 0
            });
        }

        const batch = adminDb.batch();
        const timestamp = new Date().toISOString();
        
        unreadNotifications.docs.forEach(doc => {
            batch.update(doc.ref, {
                isRead: true,
                readAt: timestamp,
                updatedAt: timestamp
            });
        });

        await batch.commit();

        res.json({
            success: true,
            message: `${unreadNotifications.size} notifications marked as read`,
            updated: unreadNotifications.size
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
        
        // Verify notification belongs to user
        const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
        
        if (!notificationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        const notificationData = notificationDoc.data();
        if (notificationData.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        await adminDb.collection('notifications').doc(notificationId).update({
            deleted: true,
            deletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Notification deleted'
        });
        
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting notification'
        });
    }
});

// Get notification counts only
router.get('/counts', async (req, res) => {
    try {
        const userId = req.user.userId;
        const counts = await getNotificationCounts(userId);
        
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

// CORRECTED: Create notification (for admin/system use)
router.post('/create', async (req, res) => {
    try {
        // Allow admins and system to create notifications
        if (req.user.type !== 'admin' && !req.body.systemGenerated) {
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
        
        const notificationData = {
            userId: userId,
            title: title,
            message: message,
            type: type || 'info',
            metadata: metadata || {},
            isRead: false,
            seen: false,
            deleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: req.user.email || 'system'
        };
        
        const notificationRef = await adminDb.collection('notifications').add(notificationData);
        
        res.json({
            success: true,
            message: 'Notification created',
            notificationId: notificationRef.id
        });
        
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating notification'
        });
    }
});

// CORRECTED: Support update notification (called by admin system)
router.post('/support-update', async (req, res) => {
    try {
        const { userId, ticketId, adminMessage, ticketSubject, action } = req.body;
        
        if (!userId || !ticketId) {
            return res.status(400).json({
                success: false,
                message: 'userId and ticketId are required'
            });
        }
        
        let title = 'Support Update';
        let message = 'Your support ticket has been updated.';
        
        // Customize message based on action
        if (action === 'response') {
            title = 'Support Response';
            message = `Your support ticket "${ticketSubject || 'Support Request'}" has received a response from our team.`;
        } else if (action === 'status_update') {
            title = 'Support Status Update';
            message = `Your support ticket "${ticketSubject || 'Support Request'}" status has been updated.`;
        }
        
        const notificationData = {
            userId: userId,
            title: title,
            message: message,
            type: 'support',
            metadata: {
                action: action || 'support_update',
                ticketId: ticketId,
                ticketSubject: ticketSubject,
                adminMessage: adminMessage ? adminMessage.substring(0, 100) : null
            },
            isRead: false,
            seen: false,
            deleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: req.user?.email || 'admin'
        };
        
        const notificationRef = await adminDb.collection('notifications').add(notificationData);
        
        res.json({
            success: true,
            message: 'Support notification created',
            notificationId: notificationRef.id
        });
        
    } catch (error) {
        console.error('Error creating support notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating support notification'
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
        const timestamp = new Date().toISOString();
        let updateCount = 0;
        
        for (const notificationId of notificationIds) {
            try {
                const notificationRef = adminDb.collection('notifications').doc(notificationId);
                const notificationDoc = await notificationRef.get();
                
                if (notificationDoc.exists) {
                    const notification = notificationDoc.data();
                    // Verify ownership and unread status
                    if (notification.userId === userId && !notification.isRead) {
                        batch.update(notificationRef, {
                            isRead: true,
                            readAt: timestamp,
                            updatedAt: timestamp
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
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const oldNotifications = await adminDb.collection('notifications')
            .where('createdAt', '<', cutoffDate.toISOString())
            .get();

        if (oldNotifications.empty) {
            return res.json({
                success: true,
                message: 'No old notifications to clean up',
                deleted: 0
            });
        }

        const batch = adminDb.batch();
        oldNotifications.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        
        res.json({
            success: true,
            message: `Cleaned up ${oldNotifications.size} old notifications`,
            deleted: oldNotifications.size
        });
        
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error cleaning up notifications'
        });
    }
});

export default router;
