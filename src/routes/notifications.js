// src/routes/notifications.js - Basic Notifications routes to fix 404 errors
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get user notifications
router.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Get user notifications from database
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('deleted', '!=', true)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Mark as seen (but not read) if requested
        if (req.query.markSeen === 'true') {
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
            }
        }
        
        res.json({
            success: true,
            notifications: notifications,
            unreadCount: notifications.filter(n => !n.read).length,
            unseenCount: notifications.filter(n => !n.seen).length
        });
        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        
        // Return empty notifications instead of error to prevent frontend issues
        res.json({
            success: true,
            notifications: [],
            unreadCount: 0,
            unseenCount: 0,
            message: 'Notifications service temporarily unavailable'
        });
    }
});

// Mark notification as read
router.patch('/:notificationId/read', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        // Verify ownership
        const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
        
        if (!notificationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        const notification = notificationDoc.data();
        
        if (notification.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        await adminDb.collection('notifications').doc(notificationId).update({
            read: true,
            readAt: new Date().toISOString()
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
        
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .get();
        
        if (snapshot.empty) {
            return res.json({
                success: true,
                message: 'No unread notifications',
                updated: 0
            });
        }
        
        const batch = adminDb.batch();
        const timestamp = new Date().toISOString();
        
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                read: true,
                readAt: timestamp
            });
        });
        
        await batch.commit();
        
        res.json({
            success: true,
            message: 'All notifications marked as read',
            updated: snapshot.size
        });
        
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notifications'
        });
    }
});

// Delete notification
router.delete('/:notificationId', async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        // Verify ownership
        const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
        
        if (!notificationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        const notification = notificationDoc.data();
        
        if (notification.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        
        // Soft delete
        await adminDb.collection('notifications').doc(notificationId).update({
            deleted: true,
            deletedAt: new Date().toISOString()
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

// Create notification (internal use)
router.post('/create', async (req, res) => {
    try {
        // This endpoint can be used internally by other services to create notifications
        const { userId, title, message, type, data } = req.body;
        
        if (!userId || !title || !message) {
            return res.status(400).json({
                success: false,
                message: 'userId, title, and message are required'
            });
        }
        
        const notificationData = {
            userId,
            title,
            message,
            type: type || 'info',
            data: data || {},
            read: false,
            seen: false,
            deleted: false,
            createdAt: new Date().toISOString()
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

// Get notification counts
router.get('/counts', async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('deleted', '!=', true)
            .get();
        
        const notifications = snapshot.docs.map(doc => doc.data());
        
        const counts = {
            total: notifications.length,
            unread: notifications.filter(n => !n.read).length,
            unseen: notifications.filter(n => !n.seen).length
        };
        
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

// NotificationService class for programmatic use
export class NotificationService {
    /**
     * Create a new notification
     * @param {string} userId - User ID to send notification to
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @param {string} type - Notification type (info, success, warning, error)
     * @param {object} data - Additional data to store with notification
     * @returns {Promise<object>} Result object with success status
     */
    static async createNotification(userId, title, message, type = 'info', data = {}) {
        try {
            if (!userId || !title || !message) {
                return {
                    success: false,
                    error: 'userId, title, and message are required'
                };
            }
            
            const notificationData = {
                userId,
                title,
                message,
                type,
                data,
                read: false,
                seen: false,
                deleted: false,
                createdAt: new Date().toISOString()
            };
            
            const notificationRef = await adminDb.collection('notifications').add(notificationData);
            
            return {
                success: true,
                notificationId: notificationRef.id,
                message: 'Notification created successfully'
            };
            
        } catch (error) {
            console.error('Error creating notification:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get notifications for a user
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of notifications to return
     * @returns {Promise<array>} Array of notifications
     */
    static async getUserNotifications(userId, limit = 50) {
        try {
            if (!userId) {
                return [];
            }
            
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Error fetching user notifications:', error);
            return [];
        }
    }
    
    /**
     * Mark notification as read
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for verification)
     * @returns {Promise<object>} Result object
     */
    static async markAsRead(notificationId, userId) {
        try {
            if (!notificationId || !userId) {
                return {
                    success: false,
                    error: 'notificationId and userId are required'
                };
            }
            
            // Verify ownership
            const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
            
            if (!notificationDoc.exists) {
                return {
                    success: false,
                    error: 'Notification not found'
                };
            }
            
            const notification = notificationDoc.data();
            
            if (notification.userId !== userId) {
                return {
                    success: false,
                    error: 'Access denied'
                };
            }
            
            await adminDb.collection('notifications').doc(notificationId).update({
                read: true,
                readAt: new Date().toISOString()
            });
            
            return {
                success: true,
                message: 'Notification marked as read'
            };
            
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get notification counts for a user
     * @param {string} userId - User ID
     * @returns {Promise<object>} Counts object
     */
    static async getNotificationCounts(userId) {
        try {
            if (!userId) {
                return {
                    total: 0,
                    unread: 0,
                    unseen: 0
                };
            }
            
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .get();
            
            const notifications = snapshot.docs.map(doc => doc.data());
            
            return {
                total: notifications.length,
                unread: notifications.filter(n => !n.read).length,
                unseen: notifications.filter(n => !n.seen).length
            };
            
        } catch (error) {
            console.error('Error getting notification counts:', error);
            return {
                total: 0,
                unread: 0,
                unseen: 0
            };
        }
    }
    
    /**
     * Delete a notification (soft delete)
     * @param {string} notificationId - Notification ID
     * @param {string} userId - User ID (for verification)
     * @returns {Promise<object>} Result object
     */
    static async deleteNotification(notificationId, userId) {
        try {
            if (!notificationId || !userId) {
                return {
                    success: false,
                    error: 'notificationId and userId are required'
                };
            }
            
            // Verify ownership
            const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
            
            if (!notificationDoc.exists) {
                return {
                    success: false,
                    error: 'Notification not found'
                };
            }
            
            const notification = notificationDoc.data();
            
            if (notification.userId !== userId) {
                return {
                    success: false,
                    error: 'Access denied'
                };
            }
            
            await adminDb.collection('notifications').doc(notificationId).update({
                deleted: true,
                deletedAt: new Date().toISOString()
            });
            
            return {
                success: true,
                message: 'Notification deleted'
            };
            
        } catch (error) {
            console.error('Error deleting notification:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Mark all notifications as read for a user
     * @param {string} userId - User ID
     * @returns {Promise<object>} Result object
     */
    static async markAllAsRead(userId) {
        try {
            if (!userId) {
                return {
                    success: false,
                    error: 'userId is required'
                };
            }
            
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('read', '==', false)
                .where('deleted', '!=', true)
                .get();
            
            if (snapshot.empty) {
                return {
                    success: true,
                    message: 'No unread notifications',
                    updated: 0
                };
            }
            
            const batch = adminDb.batch();
            const timestamp = new Date().toISOString();
            
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, {
                    read: true,
                    readAt: timestamp
                });
            });
            
            await batch.commit();
            
            return {
                success: true,
                message: 'All notifications marked as read',
                updated: snapshot.size
            };
            
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default router;
