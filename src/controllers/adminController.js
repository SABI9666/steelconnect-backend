// Fixed adminController.js - PDF Downloads & Message Blocking
import { adminDb } from '../config/firebase.js';

// Dashboard stats - return data in expected format
export const getDashboardStats = async (req, res) => {
    try {
        const getCollectionCount = async (collectionName) => {
            try {
                const snapshot = await adminDb.collection(collectionName).get();
                return snapshot.size || 0;
            } catch (error) {
                console.warn(`Could not get count for collection: ${collectionName}`);
                return 0;
            }
        };

        const [userSnapshot, quoteSnapshot, messageSnapshot, jobsSnapshot, estimationSnapshot, subsSnapshot] = await Promise.all([
            adminDb.collection('users').where('type', '!=', 'admin').get(),
            adminDb.collection('quotes').get(),
            adminDb.collection('messages').get(),
            adminDb.collection('jobs').get(),
            adminDb.collection('estimations').get(),
            adminDb.collection('subscriptions').get()
        ]);

        // Count user types
        let contractors = 0;
        let designers = 0;
        userSnapshot.docs.forEach(doc => {
            const userData = doc.data();
            if (userData.type === 'contractor') contractors++;
            if (userData.type === 'designer') designers++;
        });

        const stats = {
            totalUsers: userSnapshot.size,
            contractors: contractors,
            designers: designers,
            totalQuotes: quoteSnapshot.size,
            totalMessages: messageSnapshot.size,
            totalJobs: jobsSnapshot.size,
            totalEstimations: estimationSnapshot.size,
            totalSubscriptions: subsSnapshot.size,
            activeJobs: 0,
            completedJobs: 0
        };

        // Calculate active/completed jobs
        jobsSnapshot.docs.forEach(doc => {
            const jobData = doc.data();
            if (jobData.status === 'active' || jobData.status === 'open') {
                stats.activeJobs++;
            } else if (jobData.status === 'completed') {
                stats.completedJobs++;
            }
        });

        res.json({
            success: true,
            data: {
                stats: stats,
                adminUser: req.user?.email || 'admin@steelconnect.com'
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching dashboard statistics',
            error: error.message 
        });
    }
};

// Get all users - fix data structure
export const getAllUsers = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').where('type', '!=', 'admin').get();
        const users = snapshot.docs.map(doc => {
            const userData = doc.data();
            const { password, ...userWithoutPassword } = userData;
            return { 
                _id: doc.id, 
                id: doc.id,
                name: userData.name || userData.firstName + ' ' + (userData.lastName || ''),
                email: userData.email,
                type: userData.type || 'user',
                role: userData.role || userData.type || 'user',
                isActive: userData.isActive !== false,
                company: userData.company || userData.companyName,
                phone: userData.phone,
                createdAt: userData.createdAt || userData.joinedAt,
                ...userWithoutPassword
            };
        });
        
        res.json({ 
            success: true, 
            data: users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching users',
            error: error.message
        });
    }
};

// Get all quotes - fix data structure
export const getAllQuotes = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
        const quotes = [];
        
        for (const doc of snapshot.docs) {
            const quoteData = doc.data();
            let userData = null;
            
            if (quoteData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(quoteData.userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for userId: ${quoteData.userId}`);
                }
            }
            
            quotes.push({
                _id: doc.id,
                id: doc.id,
                clientName: userData?.name || quoteData.clientName || 'Unknown',
                clientEmail: userData?.email || quoteData.clientEmail || 'N/A',
                projectTitle: quoteData.projectTitle || quoteData.title || 'Untitled',
                projectType: quoteData.projectType || quoteData.category || 'General',
                amount: quoteData.amount || quoteData.estimatedAmount || 0,
                status: quoteData.status || 'pending',
                createdAt: quoteData.createdAt,
                ...quoteData
            });
        }
        
        res.json({ 
            success: true, 
            data: quotes
        });
    } catch (error) {
        console.error('Error fetching quotes:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching quotes',
            error: error.message
        });
    }
};

// Get all jobs - fix data structure
export const getAllJobs = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
        const jobs = snapshot.docs.map(doc => {
            const jobData = doc.data();
            return { 
                _id: doc.id, 
                id: doc.id,
                title: jobData.title || jobData.projectTitle || 'Untitled Job',
                projectTitle: jobData.title || jobData.projectTitle || 'Untitled Job',
                category: jobData.category || jobData.type || 'General',
                type: jobData.type || jobData.category || 'General',
                status: jobData.status || 'pending',
                budget: jobData.budget || jobData.amount || 0,
                clientName: jobData.clientName || jobData.posterName || 'Unknown',
                clientEmail: jobData.clientEmail || jobData.posterEmail || 'N/A',
                contractorName: jobData.contractorName || jobData.assignedTo || 'Unassigned',
                contractorEmail: jobData.contractorEmail || 'N/A',
                createdAt: jobData.createdAt,
                ...jobData
            };
        });
        
        res.json({ 
            success: true, 
            data: jobs
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching jobs',
            error: error.message
        });
    }
};

// FIXED: Get all messages with blocking control
export const getAllMessages = async (req, res) => {
    try {
        console.log('Fetching messages for admin...');
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        console.log(`Found ${snapshot.size} messages in database`);
        
        const messages = [];
        
        for (const doc of snapshot.docs) {
            const messageData = doc.data();
            let userData = null;
            
            // Try to fetch user data if senderId exists
            if (messageData.senderId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(messageData.senderId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for senderId: ${messageData.senderId}`);
                }
            }
            
            // Create standardized message object
            const message = {
                _id: doc.id,
                id: doc.id,
                senderName: userData?.name || messageData.senderName || messageData.from || messageData.name || 'Anonymous',
                senderEmail: userData?.email || messageData.senderEmail || messageData.email || messageData.fromEmail || 'N/A',
                subject: messageData.subject || messageData.title || messageData.topic || 'No Subject',
                content: messageData.content || messageData.message || messageData.text || messageData.body || '',
                type: messageData.type || messageData.category || 'general',
                status: messageData.status || (messageData.isRead ? 'read' : 'unread'),
                isRead: messageData.isRead || false,
                isBlocked: messageData.isBlocked || false, // Added blocking status
                blockedAt: messageData.blockedAt || null,
                blockedBy: messageData.blockedBy || null,
                createdAt: messageData.createdAt || messageData.sentAt || messageData.timestamp,
                senderId: messageData.senderId,
                thread: messageData.thread || [],
                attachments: messageData.attachments || [],
                ...messageData
            };
            
            messages.push(message);
        }
        
        console.log(`Processed ${messages.length} messages for admin response`);
        
        res.json({ 
            success: true, 
            data: {
                messages: messages
            }
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching messages',
            error: error.message
        });
    }
};

// Get all subscriptions - fix data structure
export const getAllSubscriptions = async (req, res) => {
    try {
        const snapshot = await adminDb.collection('subscriptions').orderBy('startDate', 'desc').get();
        const subscriptions = [];
        
        for (const doc of snapshot.docs) {
            const subData = doc.data();
            let userData = null;
            
            if (subData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(subData.userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for userId: ${subData.userId}`);
                }
            }
            
            subscriptions.push({
                _id: doc.id,
                id: doc.id,
                userName: userData?.name || subData.userName || 'Unknown',
                userEmail: userData?.email || subData.userEmail || 'N/A',
                planName: subData.planName || subData.plan?.name || 'Unknown Plan',
                planPrice: subData.planPrice || subData.amount || 0,
                planInterval: subData.planInterval || subData.billing || 'month',
                status: subData.status || 'active',
                startDate: subData.startDate || subData.createdAt,
                nextBillingDate: subData.nextBillingDate,
                ...subData,
                user: userData
            });
        }
        
        res.json({ 
            success: true, 
            data: subscriptions
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching subscriptions',
            error: error.message
        });
    }
};

// FIXED: Get all estimations with proper file handling
export const getAllEstimations = async (req, res) => {
    try {
        console.log('Fetching estimations for admin...');
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        console.log(`Found ${snapshot.size} estimations in database`);
        
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const estimationData = doc.data();
            let userData = null;
            
            // Try to fetch contractor data
            if (estimationData.contractorId || estimationData.userId) {
                try {
                    const userId = estimationData.contractorId || estimationData.userId;
                    const userDoc = await adminDb.collection('users').doc(userId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for contractor: ${estimationData.contractorId || estimationData.userId}`);
                }
            }
            
            // Create standardized estimation object
            const estimation = {
                _id: doc.id,
                id: doc.id,
                projectTitle: estimationData.projectTitle || estimationData.title || 'Untitled Project',
                projectType: estimationData.projectType || estimationData.category || 'General',
                contractorName: userData?.name || estimationData.contractorName || 'Unknown',
                contractorEmail: userData?.email || estimationData.contractorEmail || 'N/A',
                contractorCompany: userData?.company || estimationData.contractorCompany || '',
                status: estimationData.status || 'pending',
                description: estimationData.description || '',
                uploadedFiles: estimationData.uploadedFiles || estimationData.files || [],
                resultFile: estimationData.resultFile || null,
                dueDate: estimationData.dueDate,
                createdAt: estimationData.createdAt,
                updatedAt: estimationData.updatedAt,
                ...estimationData
            };
            
            estimations.push(estimation);
        }
        
        console.log(`Processed ${estimations.length} estimations for admin response`);
        
        res.json({ 
            success: true, 
            data: {
                estimations: estimations
            }
        });
    } catch (error) {
        console.error('Error fetching estimations:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching estimations',
            error: error.message
        });
    }
};

// FIXED: Get single estimation with files
export const getEstimationById = async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`Fetching estimation details for ID: ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        let userData = null;
        
        // Fetch contractor data
        if (estimationData.contractorId || estimationData.userId) {
            try {
                const userId = estimationData.contractorId || estimationData.userId;
                const userDoc = await adminDb.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    const { password, ...userInfo } = userDoc.data();
                    userData = { id: userDoc.id, ...userInfo };
                }
            } catch (userError) {
                console.warn(`Could not fetch user data for estimation: ${estimationId}`);
            }
        }
        
        const estimation = {
            _id: doc.id,
            id: doc.id,
            projectTitle: estimationData.projectTitle || estimationData.title || 'Untitled Project',
            projectType: estimationData.projectType || estimationData.category || 'General',
            contractorName: userData?.name || estimationData.contractorName || 'Unknown',
            contractorEmail: userData?.email || estimationData.contractorEmail || 'N/A',
            contractorCompany: userData?.company || estimationData.contractorCompany || '',
            status: estimationData.status || 'pending',
            description: estimationData.description || '',
            uploadedFiles: estimationData.uploadedFiles || estimationData.files || [],
            resultFile: estimationData.resultFile || null,
            dueDate: estimationData.dueDate,
            createdAt: estimationData.createdAt,
            updatedAt: estimationData.updatedAt,
            ...estimationData
        };
        
        res.json({
            success: true,
            data: {
                estimation: estimation
            }
        });
    } catch (error) {
        console.error('Error fetching estimation details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation details',
            error: error.message
        });
    }
};

// FIXED: Get estimation files with downloadable URLs
export const getEstimationFiles = async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`Fetching files for estimation ID: ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        const files = estimationData.uploadedFiles || estimationData.files || [];
        
        console.log(`Found ${files.length} files for estimation ${estimationId}`);
        
        // Ensure files have proper structure with accessible URLs
        const formattedFiles = files.map((file, index) => {
            console.log(`Processing file ${index + 1}:`, file);
            
            // Create download URL that goes through our API
            const downloadUrl = file.url || file.downloadURL;
            const apiDownloadUrl = `/api/admin/estimations/${estimationId}/files/${encodeURIComponent(file.name || `file_${index}`)}/download`;
            
            return {
                name: file.name || file.filename || file.originalName || `file_${index + 1}`,
                url: downloadUrl, // Direct Firebase URL
                downloadUrl: apiDownloadUrl, // API endpoint for secure download
                size: file.size || 0,
                type: file.type || file.mimetype || file.contentType || '',
                uploadedAt: file.uploadedAt || file.createdAt || estimationData.createdAt,
                id: file.id || `${estimationId}_file_${index}`,
                bucket: file.bucket || '',
                path: file.path || file.filePath || ''
            };
        }).filter(file => file.url); // Only include files with valid URLs
        
        console.log(`Returning ${formattedFiles.length} files with valid URLs`);
        
        res.json({
            success: true,
            data: {
                files: formattedFiles,
                estimationId: estimationId,
                totalFiles: formattedFiles.length
            }
        });
    } catch (error) {
        console.error('Error fetching estimation files:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation files',
            error: error.message
        });
    }
};

// FIXED: Download specific estimation file
export const downloadEstimationFile = async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        console.log(`File download requested: ${fileName} from estimation ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        const files = estimationData.uploadedFiles || estimationData.files || [];
        
        // Find the specific file
        const file = files.find(f => 
            (f.name === decodeURIComponent(fileName)) || 
            (f.filename === decodeURIComponent(fileName)) ||
            (f.originalName === decodeURIComponent(fileName))
        );
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }
        
        const fileUrl = file.url || file.downloadURL;
        if (!fileUrl) {
            return res.status(404).json({
                success: false,
                message: 'File URL not available'
            });
        }
        
        console.log(`Redirecting to file URL: ${fileUrl}`);
        
        // Set appropriate headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${file.name || fileName}"`);
        res.setHeader('Content-Type', file.type || 'application/octet-stream');
        
        // Redirect to the file URL
        res.redirect(fileUrl);
        
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading file',
            error: error.message
        });
    }
};

// FIXED: Get estimation result file
export const getEstimationResult = async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`Fetching result file for estimation ID: ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        const resultFile = estimationData.resultFile;
        
        if (!resultFile) {
            return res.status(404).json({
                success: false,
                message: 'No result file found for this estimation'
            });
        }
        
        res.json({
            success: true,
            data: {
                resultFile: {
                    name: resultFile.name || resultFile.filename || 'estimation_result.pdf',
                    url: resultFile.url || resultFile.downloadURL || '',
                    downloadUrl: `/api/admin/estimations/${estimationId}/result/download`,
                    size: resultFile.size || 0,
                    type: resultFile.type || resultFile.mimetype || 'application/pdf',
                    uploadedAt: resultFile.uploadedAt || estimationData.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Error fetching estimation result:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching estimation result',
            error: error.message
        });
    }
};

// FIXED: Download estimation result file
export const downloadEstimationResult = async (req, res) => {
    try {
        const { estimationId } = req.params;
        console.log(`Result download requested for estimation ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        const resultFile = estimationData.resultFile;
        
        if (!resultFile) {
            return res.status(404).json({
                success: false,
                message: 'Result file not found'
            });
        }
        
        const fileUrl = resultFile.url || resultFile.downloadURL;
        if (!fileUrl) {
            return res.status(404).json({
                success: false,
                message: 'Result file URL not available'
            });
        }
        
        console.log(`Redirecting to result file URL: ${fileUrl}`);
        
        // Set appropriate headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${resultFile.name || 'estimation_result.pdf'}"`);
        res.setHeader('Content-Type', resultFile.type || 'application/pdf');
        
        // Redirect to the file URL
        res.redirect(fileUrl);
        
    } catch (error) {
        console.error('Error downloading result:', error);
        res.status(500).json({
            success: false,
            message: 'Error downloading result',
            error: error.message
        });
    }
};

// Update estimation status
export const updateEstimationStatus = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        await adminDb.collection('estimations').doc(estimationId).update({
            status: status,
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Estimation status updated successfully'
        });
    } catch (error) {
        console.error('Error updating estimation status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating estimation status',
            error: error.message
        });
    }
};

// Set estimation due date
export const setEstimationDueDate = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { dueDate } = req.body;
        
        if (!dueDate) {
            return res.status(400).json({
                success: false,
                message: 'Due date is required'
            });
        }
        
        await adminDb.collection('estimations').doc(estimationId).update({
            dueDate: dueDate,
            updatedAt: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Due date set successfully'
        });
    } catch (error) {
        console.error('Error setting due date:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting due date',
            error: error.message
        });
    }
};

// ADDED: Block/Unblock message functionality
export const blockMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { block = true, reason = '' } = req.body;
        
        const updateData = {
            isBlocked: block,
            updatedAt: new Date().toISOString()
        };
        
        if (block) {
            updateData.blockedAt = new Date().toISOString();
            updateData.blockedBy = req.user?.email || 'admin';
            updateData.blockReason = reason;
            updateData.status = 'blocked';
        } else {
            updateData.blockedAt = null;
            updateData.blockedBy = null;
            updateData.blockReason = null;
            updateData.status = updateData.isRead ? 'read' : 'unread';
        }
        
        await adminDb.collection('messages').doc(messageId).update(updateData);
        
        res.json({
            success: true,
            message: `Message ${block ? 'blocked' : 'unblocked'} successfully`
        });
    } catch (error) {
        console.error('Error blocking/unblocking message:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating message block status',
            error: error.message
        });
    }
};

// ADDED: Block user from sending messages
export const blockUserMessages = async (req, res) => {
    try {
        const { userEmail } = req.params;
        const { block = true, reason = '' } = req.body;
        
        // Update user's message blocking status
        const userSnapshot = await adminDb.collection('users').where('email', '==', userEmail).get();
        
        if (userSnapshot.empty) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const userDoc = userSnapshot.docs[0];
        await userDoc.ref.update({
            messagesBlocked: block,
            messageBlockReason: block ? reason : null,
            messageBlockedAt: block ? new Date().toISOString() : null,
            messageBlockedBy: block ? (req.user?.email || 'admin') : null,
            updatedAt: new Date().toISOString()
        });
        
        // Also block all existing messages from this user
        const messagesSnapshot = await adminDb.collection('messages').where('senderEmail', '==', userEmail).get();
        
        const batch = adminDb.batch();
        messagesSnapshot.docs.forEach(messageDoc => {
            batch.update(messageDoc.ref, {
                isBlocked: block,
                blockedAt: block ? new Date().toISOString() : null,
                blockedBy: block ? (req.user?.email || 'admin') : null,
                blockReason: block ? reason : null,
                status: block ? 'blocked' : (messageDoc.data().isRead ? 'read' : 'unread'),
                updatedAt: new Date().toISOString()
            });
        });
        
        await batch.commit();
        
        res.json({
            success: true,
            message: `User ${block ? 'blocked' : 'unblocked'} from sending messages. ${messagesSnapshot.size} existing messages updated.`
        });
    } catch (error) {
        console.error('Error blocking/unblocking user messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user message block status',
            error: error.message
        });
    }
};

// User status update
export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, status } = req.body;

        await adminDb.collection('users').doc(userId).update({
            isActive: isActive,
            status: status || (isActive ? 'active' : 'inactive'),
            updatedAt: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: 'User status updated successfully.' 
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user status',
            error: error.message
        });
    }
};

// Delete user
export const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        await adminDb.collection('users').doc(userId).delete();
        res.json({ 
            success: true, 
            message: 'User deleted successfully.' 
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting user',
            error: error.message
        });
    }
};
