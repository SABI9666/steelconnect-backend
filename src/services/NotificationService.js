// src/services/NotificationService.js - Complete Implementation
import { adminDb } from '../config/firebase.js';

export class NotificationService {
    /**
     * Create a new notification in the database
     */
    static async createNotification(userId, title, message, type, metadata = {}) {
        try {
            const notificationData = {
                userId,
                title,
                message,
                type,
                metadata,
                isRead: false,
                read: false, // For compatibility
                seen: false,
                deleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            const notificationRef = await adminDb.collection('notifications').add(notificationData);
            console.log(`✅ Notification created: ${notificationRef.id} for user ${userId}`);
            
            return notificationRef.id;
        } catch (error) {
            console.error('❌ Error creating notification:', error);
            throw error;
        }
    }

    /**
     * Get user details for notifications
     */
    static async getUserDetails(userId) {
        try {
            const userDoc = await adminDb.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                return {
                    id: userId,
                    name: userData.name,
                    email: userData.email,
                    type: userData.type
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching user details:', error);
            return null;
        }
    }

    // QUOTE NOTIFICATIONS
    static async notifyQuoteSubmitted(quoteData, jobData) {
        try {
            console.log('📬 Creating quote submission notification...');
            
            // Get job poster details
            const jobPoster = await this.getUserDetails(jobData.posterId);
            if (!jobPoster) {
                console.error('Job poster not found for notification');
                return;
            }

            // Notification to job poster (contractor)
            await this.createNotification(
                jobData.posterId,
                'New Quote Received',
                `${quoteData.designerName} submitted a quote of ${quoteData.quoteAmount} for your project "${jobData.title}"`,
                'quote',
                {
                    action: 'quote_submitted',
                    quoteId: quoteData.id,
                    jobId: jobData.id,
                    designerId: quoteData.designerId,
                    designerName: quoteData.designerName,
                    quoteAmount: quoteData.quoteAmount,
                    jobTitle: jobData.title
                }
            );

            // Confirmation notification to designer
            await this.createNotification(
                quoteData.designerId,
                'Quote Submitted Successfully',
                `Your quote for "${jobData.title}" has been submitted to ${jobPoster.name}`,
                'quote',
                {
                    action: 'quote_submitted_confirmation',
                    quoteId: quoteData.id,
                    jobId: jobData.id,
                    contractorId: jobData.posterId,
                    contractorName: jobPoster.name,
                    jobTitle: jobData.title
                }
            );

            console.log('✅ Quote submission notifications sent');
        } catch (error) {
            console.error('❌ Error in quote submission notifications:', error);
            throw error;
        }
    }

    static async notifyQuoteStatusChanged(quoteData, jobData, newStatus) {
        try {
            console.log(`📬 Creating quote ${newStatus} notification...`);
            
            const isApproved = newStatus === 'approved';
            const title = isApproved ? 'Quote Approved!' : 'Quote Status Updated';
            const message = isApproved 
                ? `Congratulations! Your quote for "${jobData.title}" has been approved. The project has been assigned to you.`
                : `Your quote for "${jobData.title}" has been ${newStatus}.`;

            // Notify the designer about status change
            await this.createNotification(
                quoteData.designerId,
                title,
                message,
                'quote',
                {
                    action: `quote_${newStatus}`,
                    quoteId: quoteData.id,
                    jobId: jobData.id,
                    contractorId: jobData.posterId,
                    jobTitle: jobData.title,
                    newStatus: newStatus,
                    ...(isApproved && { approvedAmount: quoteData.quoteAmount })
                }
            );

            // If approved, also notify contractor
            if (isApproved) {
                await this.createNotification(
                    jobData.posterId,
                    'Quote Approved',
                    `You have successfully approved ${quoteData.designerName}'s quote for "${jobData.title}". The project is now assigned.`,
                    'quote',
                    {
                        action: 'quote_approved_confirmation',
                        quoteId: quoteData.id,
                        jobId: jobData.id,
                        designerId: quoteData.designerId,
                        designerName: quoteData.designerName,
                        jobTitle: jobData.title,
                        approvedAmount: quoteData.quoteAmount
                    }
                );
            }

            console.log(`✅ Quote ${newStatus} notifications sent`);
        } catch (error) {
            console.error(`❌ Error in quote ${newStatus} notifications:`, error);
            throw error;
        }
    }

    // JOB NOTIFICATIONS
    static async notifyJobCreated(jobData) {
        try {
            console.log('📬 Creating job creation notifications...');
            
            // Get all designers to notify them about the new job
            const designersSnapshot = await adminDb.collection('users')
                .where('type', '==', 'designer')
                .where('profileStatus', '==', 'approved')
                .get();

            const notificationPromises = [];

            designersSnapshot.docs.forEach(doc => {
                const designer = doc.data();
                notificationPromises.push(
                    this.createNotification(
                        doc.id,
                        'New Project Available',
                        `A new project "${jobData.title}" with budget ${jobData.budget} is now available for quotes`,
                        'job',
                        {
                            action: 'job_created',
                            jobId: jobData.id,
                            contractorId: jobData.posterId,
                            contractorName: jobData.posterName,
                            jobTitle: jobData.title,
                            budget: jobData.budget,
                            deadline: jobData.deadline
                        }
                    )
                );
            });

            await Promise.all(notificationPromises);

            // Confirmation to job poster
            await this.createNotification(
                jobData.posterId,
                'Project Posted Successfully',
                `Your project "${jobData.title}" has been posted and is now visible to all qualified designers`,
                'job',
                {
                    action: 'job_posted_confirmation',
                    jobId: jobData.id,
                    jobTitle: jobData.title
                }
            );

            console.log(`✅ Job creation notifications sent to ${designersSnapshot.size} designers`);
        } catch (error) {
            console.error('❌ Error in job creation notifications:', error);
            throw error;
        }
    }

    static async notifyJobStatusChanged(jobData, oldStatus, newStatus) {
        try {
            console.log(`📬 Creating job status change notification: ${oldStatus} -> ${newStatus}`);
            
            if (newStatus === 'completed') {
                // Notify the assigned designer
                if (jobData.assignedTo) {
                    await this.createNotification(
                        jobData.assignedTo,
                        'Project Completed',
                        `The project "${jobData.title}" has been marked as completed by the client`,
                        'job',
                        {
                            action: 'job_completed',
                            jobId: jobData.id,
                            jobTitle: jobData.title,
                            contractorId: jobData.posterId
                        }
                    );
                }
            }

            console.log('✅ Job status change notifications sent');
        } catch (error) {
            console.error('❌ Error in job status change notifications:', error);
            throw error;
        }
    }

    // MESSAGE NOTIFICATIONS
    static async notifyNewMessage(messageData, conversationData) {
        try {
            console.log('📬 Creating message notification...');
            
            if (!conversationData.participants || conversationData.participants.length === 0) {
                console.warn('No participants found for message notification');
                return;
            }

            // Find recipients (everyone except the sender)
            const recipients = conversationData.participants.filter(p => p.id !== messageData.senderId);
            
            if (recipients.length === 0) {
                console.warn('No recipients found for message notification');
                return;
            }

            const notificationPromises = recipients.map(recipient => {
                const preview = messageData.text.length > 50 
                    ? messageData.text.substring(0, 50) + '...'
                    : messageData.text;

                return this.createNotification(
                    recipient.id,
                    `New message from ${messageData.senderName}`,
                    preview,
                    'message',
                    {
                        action: 'message_received',
                        messageId: messageData.id,
                        conversationId: conversationData.id,
                        senderId: messageData.senderId,
                        senderName: messageData.senderName,
                        jobTitle: conversationData.jobTitle || 'Project Discussion',
                        preview: preview
                    }
                );
            });

            await Promise.all(notificationPromises);

            // Delivery confirmation to sender
            await this.createNotification(
                messageData.senderId,
                'Message Delivered',
                `Your message has been delivered to ${recipients.map(r => r.name).join(', ')}`,
                'message',
                {
                    action: 'message_delivered',
                    messageId: messageData.id,
                    conversationId: conversationData.id,
                    recipientCount: recipients.length,
                    recipients: recipients.map(r => ({ id: r.id, name: r.name }))
                }
            );

            console.log(`✅ Message notifications sent to ${recipients.length} recipients`);
        } catch (error) {
            console.error('❌ Error in message notifications:', error);
            throw error;
        }
    }

    // ESTIMATION NOTIFICATIONS
    static async notifyEstimationSubmitted(estimationData) {
        try {
            console.log('📬 Creating estimation submission notifications...');
            
            // Get admin users to notify them about new estimation request
            const adminSnapshot = await adminDb.collection('users')
                .where('type', '==', 'admin')
                .get();

            const adminNotificationPromises = adminSnapshot.docs.map(doc => 
                this.createNotification(
                    doc.id,
                    'New Estimation Request',
                    `${estimationData.contractorName} submitted a new estimation request for "${estimationData.projectTitle}"`,
                    'estimation',
                    {
                        action: 'estimation_submitted',
                        estimationId: estimationData.id,
                        contractorId: estimationData.contractorId,
                        contractorName: estimationData.contractorName,
                        projectTitle: estimationData.projectTitle,
                        fileCount: estimationData.uploadedFiles?.length || 0
                    }
                )
            );

            await Promise.all(adminNotificationPromises);

            // Confirmation to contractor
            await this.createNotification(
                estimationData.contractorId,
                'Estimation Request Submitted',
                `Your estimation request for "${estimationData.projectTitle}" has been submitted and is being processed`,
                'estimation',
                {
                    action: 'estimation_submitted_confirmation',
                    estimationId: estimationData.id,
                    projectTitle: estimationData.projectTitle
                }
            );

            console.log(`✅ Estimation submission notifications sent to ${adminSnapshot.size} admins`);
        } catch (error) {
            console.error('❌ Error in estimation submission notifications:', error);
            throw error;
        }
    }

    static async notifyEstimationCompleted(estimationData) {
        try {
            console.log('📬 Creating estimation completion notification...');
            
            await this.createNotification(
                estimationData.contractorId,
                'Estimation Complete',
                `Your estimation for "${estimationData.projectTitle}" is ready for download${estimationData.estimatedAmount ? ` - Estimated cost: $${estimationData.estimatedAmount.toLocaleString()}` : ''}`,
                'estimation',
                {
                    action: 'estimation_completed',
                    estimationId: estimationData.id,
                    projectTitle: estimationData.projectTitle,
                    estimatedAmount: estimationData.estimatedAmount,
                    hasResultFile: !!estimationData.resultFile
                }
            );

            console.log('✅ Estimation completion notification sent');
        } catch (error) {
            console.error('❌ Error in estimation completion notification:', error);
            throw error;
        }
    }

    // PROFILE NOTIFICATIONS
    static async notifyProfileStatusChanged(userId, newStatus, rejectionReason = null) {
        try {
            console.log(`📬 Creating profile status notification: ${newStatus}`);
            
            let title, message;
            
            switch (newStatus) {
                case 'approved':
                    title = 'Profile Approved!';
                    message = 'Congratulations! Your profile has been approved. You now have full access to all platform features.';
                    break;
                case 'rejected':
                    title = 'Profile Needs Updates';
                    message = `Your profile submission needs some updates before approval. ${rejectionReason ? `Reason: ${rejectionReason}` : 'Please review and resubmit.'}`;
                    break;
                case 'pending':
                    title = 'Profile Under Review';
                    message = 'Your profile has been submitted and is currently under review. We\'ll notify you once it\'s processed.';
                    break;
                default:
                    return;
            }

            await this.createNotification(
                userId,
                title,
                message,
                'profile',
                {
                    action: `profile_${newStatus}`,
                    newStatus,
                    ...(rejectionReason && { rejectionReason })
                }
            );

            console.log(`✅ Profile ${newStatus} notification sent`);
        } catch (error) {
            console.error(`❌ Error in profile ${newStatus} notification:`, error);
            throw error;
        }
    }

    // UTILITY METHODS
    static async markAsRead(notificationId, userId) {
        try {
            const notificationRef = adminDb.collection('notifications').doc(notificationId);
            const notificationDoc = await notificationRef.get();
            
            if (!notificationDoc.exists) {
                throw new Error('Notification not found');
            }
            
            const notification = notificationDoc.data();
            if (notification.userId !== userId) {
                throw new Error('Access denied');
            }
            
            await notificationRef.update({
                isRead: true,
                read: true, // For compatibility
                readAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            
            return true;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    static async markAllAsRead(userId) {
        try {
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('isRead', '==', false)
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
                    isRead: true,
                    read: true, // For compatibility
                    readAt: timestamp,
                    updatedAt: timestamp
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
            throw error;
        }
    }

    static async getNotificationCounts(userId) {
        try {
            const snapshot = await adminDb.collection('notifications')
                .where('userId', '==', userId)
                .where('deleted', '!=', true)
                .get();
            
            let unreadCount = 0;
            let unseenCount = 0;
            
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (!data.isRead && !data.read) unreadCount++;
                if (!data.seen) unseenCount++;
            });
            
            return {
                total: snapshot.size,
                unread: unreadCount,
                unseen: unseenCount
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

    static async deleteNotification(notificationId, userId) {
        try {
            const notificationRef = adminDb.collection('notifications').doc(notificationId);
            const notificationDoc = await notificationRef.get();
            
            if (!notificationDoc.exists) {
                throw new Error('Notification not found');
            }
            
            const notification = notificationDoc.data();
            if (notification.userId !== userId) {
                throw new Error('Access denied');
            }
            
            await notificationRef.update({
                deleted: true,
                deletedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            
            return {
                success: true,
                message: 'Notification deleted'
            };
        } catch (error) {
            console.error('Error deleting notification:', error);
            throw error;
        }
    }
}
