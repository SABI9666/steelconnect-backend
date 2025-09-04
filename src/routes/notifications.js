// src/routes/notifications.js - COMPLETE FILE TO PASTE
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Notification Service Class
class NotificationService {
    static async createNotification(userId, type, message, metadata = {}) {
        try {
            const notification = {
                userId,
                type, // 'job', 'quote', 'message', 'user', 'file', 'estimation'
                message,
                metadata, // Additional data (jobId, quoteId, etc.)
                isRead: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const notificationRef = await adminDb.collection('notifications').add(notification);
            console.log(`Notification created: ${notificationRef.id} for user ${userId}`);
            
            return { id: notificationRef.id, ...notification };
        } catch (error) {
            console.error('Failed to create notification:', error);
            throw error;
        }
    }

    static async createNotificationForMultipleUsers(userIds, type, message, metadata = {}) {
        try {
            const batch = adminDb.batch();
            const notifications = [];

            for (const userId of userIds) {
                const notification = {
                    userId,
                    type,
                    message,
                    metadata,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                const notificationRef = adminDb.collection('notifications').doc();
                batch.set(notificationRef, notification);
                notifications.push({ id: notificationRef.id, ...notification });
            }

            await batch.commit();
            console.log(`Batch notifications created for ${userIds.length} users`);
            return notifications;
        } catch (error) {
            console.error('Failed to create batch notifications:', error);
            throw error;
        }
    }

    static async getUserNotifications(userId, limit = 50, unreadOnly = false) {
        try {
            let query = adminDb.collection('notifications')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc');

            if (unreadOnly) {
                query = query.where('isRead', '==', false);
            }

            const snapshot = await query.limit(limit).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('Failed to get user notifications:', error);
            throw error;
        }
    }

    static async markAsRead(notificationId, userId = null) {
        try {
            const updateData = {
                isRead: true,
                readAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (userId) {
                const notificationDoc = await adminDb.collection('notifications').doc(notificationId).get();
                if (!notificationDoc.exists || notificationDoc.data().userId !== userId) {
                    throw new Error('Notification not found or access denied');
                }
            }

            await adminDb.collection('notifications').doc(notificationId).update(updateData);
            return true;
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
            throw error;
        }
    }

    static async markAllAsReadForUser(userId) {
        try {
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('isRead', '==', false)
                .get();

            if (snapshot.empty) return 0;

            const batch = adminDb.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, {
                    isRead: true,
                    readAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            });

            await batch.commit();
            return snapshot.size;
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
            throw error;
        }
    }

    // Job-related notifications
    static async notifyJobCreated(jobData) {
        try {
            const designersSnapshot = await adminDb.collection('users')
                .where('type', '==', 'designer')
                .where('isActive', '==', true)
                .get();

            const designerIds = designersSnapshot.docs.map(doc => doc.id);
            
            if (designerIds.length > 0) {
                await this.createNotificationForMultipleUsers(
                    designerIds,
                    'job',
                    `New project available: "${jobData.title}"`,
                    { jobId: jobData.id, action: 'created' }
                );
            }
        } catch (error) {
            console.error('Failed to notify job created:', error);
        }
    }

    static async notifyJobStatusChanged(jobData, oldStatus, newStatus) {
        try {
            let recipients = [];
            let message = '';

            if (jobData.posterId) {
                recipients.push(jobData.posterId);
                message = `Your project "${jobData.title}" status changed from ${oldStatus} to ${newStatus}`;
            }

            if (jobData.assignedTo && jobData.assignedTo !== jobData.posterId) {
                recipients.push(jobData.assignedTo);
                message = `Project "${jobData.title}" status changed to ${newStatus}`;
            }

            if (recipients.length > 0) {
                await this.createNotificationForMultipleUsers(
                    recipients,
                    'job',
                    message,
                    { jobId: jobData.id, action: 'status_changed', oldStatus, newStatus }
                );
            }
        } catch (error) {
            console.error('Failed to notify job status changed:', error);
        }
    }

    // Quote-related notifications
    static async notifyQuoteSubmitted(quoteData, jobData) {
        try {
            if (jobData.posterId) {
                await this.createNotification(
                    jobData.posterId,
                    'quote',
                    `New quote received for "${jobData.title}" from ${quoteData.designerName}`,
                    { 
                        quoteId: quoteData.id, 
                        jobId: jobData.id, 
                        action: 'submitted',
                        designerId: quoteData.designerId 
                    }
                );
            }
        } catch (error) {
            console.error('Failed to notify quote submitted:', error);
        }
    }

    static async notifyQuoteStatusChanged(quoteData, jobData, newStatus) {
        try {
            if (quoteData.designerId) {
                let message = '';
                switch (newStatus) {
                    case 'approved':
                        message = `Your quote for "${jobData.title}" has been approved!`;
                        break;
                    case 'rejected':
                        message = `Your quote for "${jobData.title}" was not selected`;
                        break;
                    default:
                        message = `Your quote for "${jobData.title}" status changed to ${newStatus}`;
                }

                await this.createNotification(
                    quoteData.designerId,
                    'quote',
                    message,
                    { 
                        quoteId: quoteData.id, 
                        jobId: jobData.id, 
                        action: 'status_changed',
                        status: newStatus 
                    }
                );
            }
        } catch (error) {
            console.error('Failed to notify quote status changed:', error);
        }
    }

    // Message-related notifications
    static async notifyNewMessage(messageData, conversationData) {
        try {
            const recipientIds = conversationData.participants
                .filter(p => p.id !== messageData.senderId)
                .map(p => p.id);

            if (recipientIds.length > 0) {
                const messagePreview = messageData.text.length > 50 
                    ? messageData.text.substring(0, 50) + '...' 
                    : messageData.text;
                    
                await this.createNotificationForMultipleUsers(
                    recipientIds,
                    'message',
                    `New message from ${messageData.senderName}: "${messagePreview}"`,
                    { 
                        messageId: messageData.id, 
                        conversationId: conversationData.id,
                        senderId: messageData.senderId,
                        action: 'new_message'
                    }
                );
            }
        } catch (error) {
            console.error('Failed to notify new message:', error);
        }
    }

    // User management notifications
    static async notifyUserStatusChanged(userId, isActive, adminEmail) {
        try {
            const message = isActive 
                ? 'Your account has been activated' 
                : 'Your account has been deactivated';

            await this.createNotification(
                userId,
                'user',
                message,
                { 
                    action: 'status_changed', 
                    isActive, 
                    adminEmail 
                }
            );
        } catch (error) {
            console.error('Failed to notify user status changed:', error);
        }
    }

    // File-related notifications
    static async notifyFileUploaded(uploaderId, recipientIds, fileName, context) {
        try {
            const uploader = await adminDb.collection('users').doc(uploaderId).get();
            const uploaderName = uploader.exists ? uploader.data().name : 'Someone';

            await this.createNotificationForMultipleUsers(
                recipientIds.filter(id => id !== uploaderId),
                'file',
                `${uploaderName} uploaded a file: "${fileName}" in ${context}`,
                { 
                    uploaderId, 
                    fileName, 
                    context,
                    action: 'uploaded'
                }
            );
        } catch (error) {
            console.error('Failed to notify file uploaded:', error);
        }
    }

    // Estimation notifications
    static async notifyEstimationStatusChanged(estimationData, newStatus) {
        try {
            let message = '';
            switch (newStatus) {
                case 'in-progress':
                    message = `Your estimation request "${estimationData.projectTitle}" is now being processed`;
                    break;
                case 'completed':
                    message = `Your estimation for "${estimationData.projectTitle}" is ready for download`;
                    break;
                case 'rejected':
                    message = `Your estimation request "${estimationData.projectTitle}" could not be processed`;
                    break;
                default:
                    message = `Your estimation request "${estimationData.projectTitle}" status changed to ${newStatus}`;
            }

            const contractorSnapshot = await adminDb.collection('users')
                .where('email', '==', estimationData.contractorEmail)
                .limit(1)
                .get();

            if (!contractorSnapshot.empty) {
                const contractorId = contractorSnapshot.docs[0].id;
                
                await this.createNotification(
                    contractorId,
                    'estimation',
                    message,
                    { 
                        estimationId: estimationData.id, 
                        action: 'status_changed',
                        status: newStatus 
                    }
                );
            }
        } catch (error) {
            console.error('Failed to notify estimation status changed:', error);
        }
    }
}

// Export the service for use in other routes
export { NotificationService };

// Routes
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { limit = 50, unreadOnly = false } = req.query;
        
        const notifications = await NotificationService.getUserNotifications(
            userId, 
            parseInt(limit), 
            unreadOnly === 'true'
        );
        
        res.json({ 
            success: true, 
            data: notifications,
            unreadCount: notifications.filter(n => !n.isRead).length
        });
    } catch (error) {
        console.error('Failed to fetch notifications:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch notifications' 
        });
    }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const unreadNotifications = await NotificationService.getUserNotifications(
            userId, 
            100, 
            true
        );
        
        res.json({ 
            success: true, 
            unreadCount: unreadNotifications.length 
        });
    } catch (error) {
        console.error('Failed to get unread count:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get unread count' 
        });
    }
});

router.put('/:notificationId/read', authenticateToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.userId;
        
        await NotificationService.markAsRead(notificationId, userId);
        
        res.json({ 
            success: true, 
            message: 'Notification marked as read' 
        });
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notification as read' 
        });
    }
});

router.put('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const updatedCount = await NotificationService.markAllAsReadForUser(userId);
        
        res.json({ 
            success: true, 
            message: `${updatedCount} notifications marked as read` 
        });
    } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark all notifications as read' 
        });
    }
});

export default router;
