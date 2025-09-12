// src/routes/admin.js - COMPLETE CORRECTED VERSION with all working routes
import express from 'express';
import multer from 'multer';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';
import { uploadToFirebaseStorage } from '../utils/firebaseStorage.js';

const router.post('/messages/:messageId/reply', async (req, res) => {
    try {
        const { replyContent, subject } = req.body;
        if (!replyContent) return res.status(400).json({ success: false, message: 'Reply content is required' });

        const originalMessageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!originalMessageDoc.exists) return res.status(404).json({ success: false, message: 'Original message not found' });

        const originalMessage = originalMessageDoc.data();

        const replyData = {
            senderEmail: req.user.email,
            senderName: req.user.name || 'Admin',
            recipientEmail: originalMessage.senderEmail,
            recipientName: originalMessage.senderName,
            subject: subject || `Re: ${originalMessage.subject}`,
            content: replyContent,
            messageType: 'admin_reply',
            status: 'sent',
            createdAt: new Date().toISOString(),
            originalMessageId: req.params.messageId
        };

        await adminDb.collection('messages').add(replyData);

        await adminDb.collection('messages').doc(req.params.messageId).update({
            status: 'replied',
            repliedAt: new Date().toISOString(),
            repliedBy: req.user.email
        });

        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error("Reply to Message Error:", error);
        res.status(500).json({ success: false, message: 'Error sending reply' });
    }
});

router.delete('/messages/:id', async (req, res) => {
    try {
        await adminDb.collection('messages').doc(req.params.id).delete();
        res.json({ success: true, message: `Message deleted successfully.` });
    } catch (e) { 
        res.status(500).json({ success: false, message: `Error deleting message` }); 
    }
});

// --- ESTIMATION MANAGEMENT ---
router.get('/estimations', async (req, res) => {
    try {
        console.log('Fetching estimations with user details...');
        
        const snapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            let user = null;
            
            if (data.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(data.contractorId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        user = {
                            _id: userDoc.id,
                            name: userData.name,
                            email: userData.email,
                            type: userData.type,
                            phone: userData.phone,
                            company: userData.companyName,
                            isActive: userData.isActive,
                            createdAt: userData.createdAt
                        };
                    }
                } catch (userError) {
                    console.error(`Error fetching user by ID ${data.contractorId}:`, userError);
                }
            }
            
            if (!user && data.contractorEmail) {
                try {
                    const userSnapshot = await adminDb.collection('users')
                        .where('email', '==', data.contractorEmail)
                        .limit(1)
                        .get();
                    
                    if (!userSnapshot.empty) {
                        const userDoc = userSnapshot.docs[0];
                        const userData = userDoc.data();
                        user = {
                            _id: userDoc.id,
                            name: userData.name,
                            email: userData.email,
                            type: userData.type,
                            phone: userData.phone,
                            company: userData.companyName,
                            isActive: userData.isActive,
                            createdAt: userData.createdAt
                        };
                    }
                } catch (emailError) {
                    console.error(`Error fetching user by email ${data.contractorEmail}:`, emailError);
                }
            }
            
            const estimation = {
                _id: doc.id,
                projectName: data.projectTitle || data.projectName,
                projectDescription: data.description || data.projectDescription,
                userEmail: data.contractorEmail,
                userName: data.contractorName,
                user: user,
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile,
                createdAt: data.createdAt,
                completedAt: data.completedAt,
                description: data.description
            };
            
            estimations.push(estimation);
        }
        
        console.log(`Returning ${estimations.length} estimations with user details`);
        res.json({ success: true, estimations });
    } catch (error) {
        console.error("Fetch Estimations Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimations' });
    }
});

router.get('/estimations/:estimationId/files', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });
        res.json({ success: true, files: estDoc.data().uploadedFiles || [] });
    } catch (error) {
        console.error("Fetch Estimation Files Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching estimation files' });
    }
});

router.get('/estimations/:estimationId/download/:fileIndex', async (req, res) => {
    try {
        const estDoc = await adminDb.collection('estimations').doc(req.params.estimationId).get();
        if (!estDoc.exists) return res.status(404).json({ success: false, message: 'Estimation not found' });

        const files = estDoc.data().uploadedFiles || [];
        const fileIndex = parseInt(req.params.fileIndex);

        if (fileIndex >= files.length || fileIndex < 0) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        const file = files[fileIndex];
        res.json({ success: true, file: { url: file.url, name: file.name, downloadUrl: file.url } });
    } catch (error) {
        console.error("Download Estimation File Error:", error);
        res.status(500).json({ success: false, message: 'Error creating file download link' });
    }
});

router.post('/estimations/:estimationId/result', upload.single('resultFile'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Result file is required' });

        const filePath = `estimations/results/${req.params.estimationId}/${req.file.originalname}`;
        const fileUrl = await uploadToFirebaseStorage(req.file, filePath);

        const updateData = {
            resultFile: {
                url: fileUrl,
                name: req.file.originalname,
                uploadedAt: new Date().toISOString(),
                uploadedBy: req.user.email
            },
            status: 'completed',
            completedAt: new Date().toISOString()
        };

        await adminDb.collection('estimations').doc(req.params.estimationId).update(updateData);
        res.json({ success: true, message: 'Estimation result uploaded successfully' });
    } catch (error) {
        console.error("Upload Estimation Result Error:", error);
        res.status(500).json({ success: false, message: 'Error uploading result' });
    }
});

router.delete('/estimations/:id', async (req, res) => {
    try {
        await adminDb.collection('estimations').doc(req.params.id).delete();
        res.json({ success: true, message: `Estimation deleted successfully.` });
    } catch (e) { 
        res.status(500).json({ success: false, message: `Error deleting estimation` }); 
    }
});

// --- GENERAL CONTENT MANAGEMENT (JOBS, QUOTES) ---
const createAdminCrudEndpoints = (collectionName) => {
    router.get(`/${collectionName}`, async (req, res) => {
        try {
            const snapshot = await adminDb.collection(collectionName).orderBy('createdAt', 'desc').get();
            const items = snapshot.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
            res.json({ success: true, [collectionName]: items });
        } catch (e) { 
            res.status(500).json({ success: false, message: `Error fetching ${collectionName}` }); 
        }
    });

    router.delete(`/${collectionName}/:id`, async (req, res) => {
        try {
            await adminDb.collection(collectionName).doc(req.params.id).delete();
            res.json({ success: true, message: `${collectionName.slice(0, -1)} deleted successfully.` });
        } catch (e) { 
            res.status(500).json({ success: false, message: `Error deleting item` }); 
        }
    });
};

// Create endpoints for Jobs and Quotes
createAdminCrudEndpoints('jobs');
createAdminCrudEndpoints('quotes');

// --- EXPORT FUNCTIONALITY ---
router.get('/export/:dataType', async (req, res) => {
    try {
        const { dataType } = req.params;
        const { format = 'csv' } = req.query;
        
        console.log(`[ADMIN-EXPORT] Exporting ${dataType} as ${format}`);
        
        let data = [];
        let filename = `${dataType}_export_${new Date().toISOString().split('T')[0]}.${format}`;
        
        switch(dataType) {
            case 'users':
                const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
                data = usersSnapshot.docs.map(doc => {
                    const userData = doc.data();
                    return {
                        id: doc.id,
                        name: userData.name || 'N/A',
                        email: userData.email || 'N/A',
                        role: userData.type || 'N/A',
                        isActive: userData.isActive !== false,
                        isBlocked: userData.isBlocked || false,
                        canSendMessages: userData.canSendMessages !== false,
                        profileStatus: userData.profileStatus || 'incomplete',
                        createdAt: userData.createdAt || 'N/A'
                    };
                });
                break;
                
            case 'conversations':
                const conversationsSnapshot = await adminDb.collection('conversations').orderBy('updatedAt', 'desc').get();
                data = [];
                for (const doc of conversationsSnapshot.docs) {
                    const convData = doc.data();
                    
                    // Get participant names
                    const participantNames = [];
                    const participantEmails = [];
                    if (convData.participantIds) {
                        for (const participantId of convData.participantIds) {
                            try {
                                const userDoc = await adminDb.collection('users').doc(participantId).get();
                                if (userDoc.exists) {
                                    const userData = userDoc.data();
                                    participantNames.push(userData.name || 'Unknown');
                                    participantEmails.push(userData.email || 'Unknown');
                                }
                            } catch (error) {
                                participantNames.push('Unknown');
                                participantEmails.push('Unknown');
                            }
                        }
                    }
                    
                    // Get message count
                    const messagesSnapshot = await doc.ref.collection('messages').get();
                    
                    data.push({
                        id: doc.id,
                        participants: participantNames.join('; '),
                        emails: participantEmails.join('; '),
                        messageCount: messagesSnapshot.size,
                        lastMessage: convData.lastMessage || 'No messages',
                        lastActivity: convData.updatedAt || 'N/A',
                        createdAt: convData.createdAt || 'N/A'
                    });
                }
                break;
                
            case 'messages':
                const messagesSnapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
                data = messagesSnapshot.docs.map(doc => {
                    const msgData = doc.data();
                    return {
                        id: doc.id,
                        from: msgData.senderName || 'Unknown',
                        email: msgData.senderEmail || 'Unknown',
                        subject: msgData.subject || 'No Subject',
                        status: msgData.status || 'unread',
                        senderBlocked: msgData.senderBlocked || false,
                        createdAt: msgData.createdAt || 'N/A'
                    };
                });
                break;
                
            case 'estimations':
                const estimationsSnapshot = await adminDb.collection('estimations').orderBy('createdAt', 'desc').get();
                data = estimationsSnapshot.docs.map(doc => {
                    const estData = doc.data();
                    return {
                        id: doc.id,
                        projectName: estData.projectTitle || estData.projectName || 'N/A',
                        contractorEmail: estData.contractorEmail || 'N/A',
                        contractorName: estData.contractorName || 'N/A',
                        status: estData.status || 'pending',
                        filesCount: (estData.uploadedFiles && estData.uploadedFiles.length) || 0,
                        hasResult: estData.resultFile ? 'Yes' : 'No',
                        createdAt: estData.createdAt || 'N/A',
                        completedAt: estData.completedAt || 'N/A'
                    };
                });
                break;
                
            case 'jobs':
                const jobsSnapshot = await adminDb.collection('jobs').orderBy('createdAt', 'desc').get();
                data = jobsSnapshot.docs.map(doc => {
                    const jobData = doc.data();
                    return {
                        id: doc.id,
                        title: jobData.title || 'N/A',
                        userEmail: jobData.userEmail || jobData.clientEmail || 'N/A',
                        status: jobData.status || 'N/A',
                        budget: jobData.budget || 'N/A',
                        createdAt: jobData.createdAt || 'N/A'
                    };
                });
                break;
                
            case 'quotes':
                const quotesSnapshot = await adminDb.collection('quotes').orderBy('createdAt', 'desc').get();
                data = quotesSnapshot.docs.map(doc => {
                    const quoteData = doc.data();
                    return {
                        id: doc.id,
                        userEmail: quoteData.userEmail || quoteData.clientEmail || 'N/A',
                        status: quoteData.status || 'N/A',
                        amount: quoteData.amount || 'N/A',
                        createdAt: quoteData.createdAt || 'N/A'
                    };
                });
                break;
                
            default:
                return res.status(400).json({ success: false, message: 'Invalid data type for export' });
        }
        
        if (format === 'csv') {
            // Generate CSV
            if (data.length === 0) {
                return res.status(404).json({ success: false, message: 'No data to export' });
            }
            
            const headers = Object.keys(data[0]);
            let csvContent = headers.join(',') + '\n';
            
            data.forEach(row => {
                const values = headers.map(header => {
                    let value = row[header];
                    if (value === null || value === undefined) value = '';
                    // Escape quotes and wrap in quotes if contains comma or quotes
                    value = String(value).replace(/"/g, '""');
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = `"${value}"`;
                    }
                    return value;
                });
                csvContent += values.join(',') + '\n';
            });
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvContent);
            
        } else if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json({
                exportDate: new Date().toISOString(),
                dataType: dataType,
                totalRecords: data.length,
                data: data
            });
            
        } else {
            return res.status(400).json({ success: false, message: 'Unsupported export format' });
        }
        
        console.log(`[ADMIN-EXPORT] Successfully exported ${data.length} ${dataType} records as ${format}`);
        
    } catch (error) {
        console.error('[ADMIN-EXPORT] Export error:', error);
        res.status(500).json({ success: false, message: 'Error exporting data' });
    }
});

// Bulk export endpoint
router.post('/export/bulk', async (req, res) => {
    try {
        const { dataTypes, format = 'json' } = req.body;
        
        if (!dataTypes || !Array.isArray(dataTypes) || dataTypes.length === 0) {
            return res.status(400).json({ success: false, message: 'Data types array is required' });
        }
        
        console.log(`[ADMIN-EXPORT] Bulk exporting: ${dataTypes.join(', ')} as ${format}`);
        
        const exportData = {
            exportDate: new Date().toISOString(),
            format: format,
            data: {}
        };
        
        for (const dataType of dataTypes) {
            try {
                // Make internal call to single export logic
                const mockReq = { params: { dataType }, query: { format: 'json' } };
                const mockRes = {
                    json: (data) => exportData.data[dataType] = data.data,
                    status: () => mockRes,
                    setHeader: () => {},
                    send: (data) => exportData.data[dataType] = data
                };
                
                // This is a simplified version - you might want to refactor the export logic into a shared function
                switch(dataType) {
                    case 'users':
                        const usersSnapshot = await adminDb.collection('users').get();
                        exportData.data.users = usersSnapshot.docs.map(doc => {
                            const userData = doc.data();
                            return {
                                id: doc.id,
                                name: userData.name || 'N/A',
                                email: userData.email || 'N/A',
                                role: userData.type || 'N/A',
                                isActive: userData.isActive !== false,
                                isBlocked: userData.isBlocked || false,
                                profileStatus: userData.profileStatus || 'incomplete',
                                createdAt: userData.createdAt || 'N/A'
                            };
                        });
                        break;
                    // Add other cases as needed
                }
                
            } catch (error) {
                console.error(`Error exporting ${dataType}:`, error);
                exportData.data[dataType] = { error: 'Export failed for this data type' };
            }
        }
        
        const filename = `bulk_export_${new Date().toISOString().split('T')[0]}.json`;
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(exportData);
        
    } catch (error) {
        console.error('[ADMIN-EXPORT] Bulk export error:', error);
        res.status(500).json({ success: false, message: 'Error performing bulk export' });
    }
});

export default router; = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Protect all admin routes with authentication and admin role checks
router.use(authenticateToken);
router.use(isAdmin);

// --- DASHBOARD (UPDATED WITH CONVERSATIONS COUNT) ---
router.get('/dashboard', async (req, res) => {
    try {
        const users = await adminDb.collection('users').get();
        const pendingReviews = await adminDb.collection('profile_reviews').where('status', '==', 'pending').get();
        const jobs = await adminDb.collection('jobs').get();
        const quotes = await adminDb.collection('quotes').get();
        const conversations = await adminDb.collection('conversations').get();
        
        res.json({ 
            success: true, 
            stats: { 
                totalUsers: users.size, 
                totalJobs: jobs.size, 
                totalQuotes: quotes.size, 
                totalConversations: conversations.size,
                pendingProfileReviews: pendingReviews.size 
            } 
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ success: false, message: 'Error loading dashboard data' });
    }
});

// --- USER MANAGEMENT ---
router.get('/users', async (req, res) => {
    try {
        const snapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                _id: doc.id, 
                name: data.name, 
                email: data.email, 
                role: data.type, 
                isActive: data.isActive !== false,
                isBlocked: data.isBlocked || false,
                canSendMessages: data.canSendMessages !== false,
                profileStatus: data.profileStatus || 'incomplete',
                createdAt: data.createdAt
            };
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Fetch Users Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

router.patch('/users/:userId/status', async (req, res) => {
    try {
        const { isActive } = req.body;
        await adminDb.collection('users').doc(req.params.userId).update({ 
            isActive: isActive, 
            canAccess: isActive,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: `User has been ${isActive ? 'activated' : 'deactivated'}.` });
    } catch (error) {
        console.error("Update User Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating user status' });
    }
});

// FIXED: User blocking endpoint with proper error handling and logging
router.post('/users/block-user', async (req, res) => {
    try {
        const { email, blocked, reason } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'User email is required' 
            });
        }

        console.log(`[ADMIN-BLOCK] ${blocked ? 'Blocking' : 'Unblocking'} user: ${email}, Reason: ${reason}`);

        // Find user by email
        const userQuery = await adminDb.collection('users')
            .where('email', '==', email)
            .limit(1)
            .get();
            
        if (userQuery.empty) {
            return res.status(404).json({ 
                success: false, 
                message: `User with email ${email} not found` 
            });
        }

        const userDoc = userQuery.docs[0];
        const userId = userDoc.id;
        const currentData = userDoc.data();
        
        console.log(`[ADMIN-BLOCK] Found user: ${userId} - ${currentData.name}`);
        
        // Update user's blocked status with explicit boolean values
        const updateData = {
            isBlocked: Boolean(blocked),
            canSendMessages: !Boolean(blocked),
            blockedReason: blocked ? (reason || 'Blocked by administrator') : null,
            blockedAt: blocked ? new Date().toISOString() : null,
            blockedBy: blocked ? (req.user.email || req.user.name) : null,
            updatedAt: new Date().toISOString()
        };
        
        console.log(`[ADMIN-BLOCK] Updating user ${userId} with data:`, updateData);

        await adminDb.collection('users').doc(userId).update(updateData);
        
        // Update all messages from this user to reflect block status
        const messagesQuery = await adminDb.collection('messages')
            .where('senderEmail', '==', email)
            .get();
        
        if (!messagesQuery.empty) {
            const batch = adminDb.batch();
            messagesQuery.docs.forEach(doc => {
                batch.update(doc.ref, {
                    senderBlocked: Boolean(blocked),
                    blockedUpdatedAt: new Date().toISOString()
                });
            });
            await batch.commit();
            console.log(`[ADMIN-BLOCK] Updated ${messagesQuery.size} messages for user ${email}`);
        }
        
        res.json({ 
            success: true, 
            message: `User ${email} has been ${blocked ? 'blocked' : 'unblocked'} successfully. ${blocked ? 'They cannot send messages.' : 'They can now send messages.'}` 
        });
        
    } catch (error) {
        console.error('[ADMIN-BLOCK] Error blocking/unblocking user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating user block status',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// --- PROFILE REVIEWS ---
router.get('/profile-reviews', async (req, res) => {
    try {
        console.log('Fetching profile reviews...');
        
        const reviewsSnapshot = await adminDb.collection('profile_reviews')
            .orderBy('createdAt', 'desc')
            .get();
        
        console.log(`Found ${reviewsSnapshot.size} profile review documents`);
        
        const reviews = [];
        
        for (const reviewDoc of reviewsSnapshot.docs) {
            const reviewData = reviewDoc.data();
            
            let userData = null;
            if (reviewData.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
                    if (userDoc.exists) {
                        userData = userDoc.data();
                    }
                } catch (userError) {
                    console.error(`Error fetching user ${reviewData.userId}:`, userError);
                }
            }
            
            const review = {
                _id: reviewDoc.id,
                status: reviewData.status || 'pending',
                submittedAt: reviewData.createdAt,
                reviewNotes: reviewData.reviewNotes || '',
                adminComments: reviewData.adminComments || null,
                user: {
                    name: userData?.name || reviewData.userName || 'Unknown',
                    email: userData?.email || reviewData.userEmail || 'Unknown',
                    type: userData?.type || reviewData.userType || 'Unknown',
                    phone: userData?.phone || '',
                    company: userData?.companyName || '',
                    address: userData?.address || '',
                    adminComments: userData?.adminComments || null,
                    documents: [
                        ...(userData?.resume ? [{
                            filename: userData.resume.filename || 'Resume',
                            url: userData.resume.url,
                            type: 'resume'
                        }] : []),
                        ...(userData?.certificates || []).map(cert => ({
                            filename: cert.filename || 'Certificate',
                            url: cert.url,
                            type: 'certificate'
                        })),
                        ...(userData?.businessLicense ? [{
                            filename: userData.businessLicense.filename || 'Business License',
                            url: userData.businessLicense.url,
                            type: 'license'
                        }] : []),
                        ...(userData?.insurance ? [{
                            filename: userData.insurance.filename || 'Insurance',
                            url: userData.insurance.url,
                            type: 'insurance'
                        }] : [])
                    ]
                }
            };
            
            reviews.push(review);
        }
        
        res.json({ success: true, reviews });
        
    } catch (error) {
        console.error("Fetch Profile Reviews Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile reviews' });
    }
});

router.get('/profile-reviews/:reviewId/details', async (req, res) => {
    try {
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        // Get the actual user data
        let userData = null;
        if (reviewData.userId) {
            const userDoc = await adminDb.collection('users').doc(reviewData.userId).get();
            if (userDoc.exists) {
                userData = userDoc.data();
            }
        }
        
        res.json({
            success: true,
            profile: {
                _id: req.params.reviewId,
                ...reviewData,
                userData: userData
            }
        });
    } catch (error) {
        console.error("Get Profile Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching profile details' });
    }
});

router.post('/profile-reviews/:reviewId/approve', async (req, res) => {
    try {
        const { adminComments } = req.body;
        
        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        const userUpdateData = {
            profileStatus: 'approved',
            canAccess: true,
            isActive: true,
            rejectionReason: null,
            approvedAt: new Date().toISOString(),
            approvedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        if (adminComments && adminComments.trim()) {
            userUpdateData.adminComments = adminComments.trim();
            userUpdateData.hasAdminComments = true;
        }

        await adminDb.collection('users').doc(reviewData.userId).update(userUpdateData);
        await adminDb.collection('profile_reviews').doc(req.params.reviewId).update({
            status: 'approved',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: adminComments || '',
            adminComments: adminComments || null
        });
        
        res.json({ success: true, message: 'Profile approved successfully. User can see your comments in their profile.' });
    } catch (error) {
        console.error("Approve Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error approving profile' });
    }
});

router.post('/profile-reviews/:reviewId/reject', async (req, res) => {
    try {
        const { reason, adminComments } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required' });
        }

        const reviewDoc = await adminDb.collection('profile_reviews').doc(req.params.reviewId).get();
        if (!reviewDoc.exists) {
            return res.status(404).json({ success: false, message: 'Profile review not found' });
        }
        
        const reviewData = reviewDoc.data();
        
        const userUpdateData = {
            profileStatus: 'rejected',
            rejectionReason: reason,
            rejectedAt: new Date().toISOString(),
            rejectedBy: req.user.email,
            updatedAt: new Date().toISOString()
        };

        const fullComment = adminComments ? `${reason}\n\nAdditional Comments: ${adminComments}` : reason;
        userUpdateData.adminComments = fullComment.trim();
        userUpdateData.hasAdminComments = true;

        await adminDb.collection('users').doc(reviewData.userId).update(userUpdateData);
        await adminDb.collection('profile_reviews').doc(req.params.reviewId).update({
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.user.email,
            reviewNotes: reason,
            adminComments: adminComments || null
        });

        res.json({ success: true, message: 'Profile rejected. The user can see your feedback in their profile and can resubmit after corrections.' });
    } catch (error) {
        console.error("Reject Profile Error:", error);
        res.status(500).json({ success: false, message: 'Error rejecting profile' });
    }
});

// --- USER CONVERSATIONS MANAGEMENT (FIXED ROUTES) ---
router.get('/conversations', async (req, res) => {
    try {
        console.log('[ADMIN-CONVERSATIONS] Fetching all user conversations...');
        
        const snapshot = await adminDb.collection('conversations')
            .orderBy('updatedAt', 'desc')
            .get();
        
        const conversations = [];
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            
            // Get participant details
            const participants = [];
            if (data.participantIds && data.participantIds.length > 0) {
                for (const participantId of data.participantIds) {
                    try {
                        const userDoc = await adminDb.collection('users').doc(participantId).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            participants.push({
                                id: participantId,
                                name: userData.name || 'Unknown',
                                email: userData.email || 'Unknown',
                                type: userData.type || 'Unknown'
                            });
                        }
                    } catch (userError) {
                        console.error(`Error fetching participant ${participantId}:`, userError);
                    }
                }
            }
            
            // Get job details if exists
            let jobDetails = null;
            if (data.jobId) {
                try {
                    const jobDoc = await adminDb.collection('jobs').doc(data.jobId).get();
                    if (jobDoc.exists) {
                        const jobData = jobDoc.data();
                        jobDetails = {
                            id: data.jobId,
                            title: jobData.title || 'Unknown Job',
                            description: jobData.description || '',
                            budget: jobData.budget || null
                        };
                    }
                } catch (jobError) {
                    console.error(`Error fetching job ${data.jobId}:`, jobError);
                }
            }
            
            // Get message count
            const messagesSnapshot = await adminDb.collection('conversations')
                .doc(doc.id)
                .collection('messages')
                .get();
            
            const conversation = {
                _id: doc.id,
                participants: participants,
                participantNames: participants.map(p => p.name).join(', '),
                participantEmails: participants.map(p => p.email).join(', '),
                jobDetails: jobDetails,
                lastMessage: data.lastMessage || 'No messages',
                lastMessageBy: data.lastMessageBy || 'Unknown',
                messageCount: messagesSnapshot.size,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                status: data.status || 'active'
            };
            
            conversations.push(conversation);
        }
        
        console.log(`[ADMIN-CONVERSATIONS] Returning ${conversations.length} conversations`);
        res.json({ success: true, conversations });
        
    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversations:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversations' });
    }
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;
        
        console.log(`[ADMIN-CONVERSATIONS] Fetching messages for conversation ${conversationId}`);
        
        // Get conversation details first
        const conversationDoc = await adminDb.collection('conversations').doc(conversationId).get();
        if (!conversationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }
        
        const conversationData = conversationDoc.data();
        
        // Get participant details
        const participants = [];
        if (conversationData.participantIds) {
            for (const participantId of conversationData.participantIds) {
                try {
                    const userDoc = await adminDb.collection('users').doc(participantId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        participants.push({
                            id: participantId,
                            name: userData.name || 'Unknown',
                            email: userData.email || 'Unknown',
                            type: userData.type || 'Unknown'
                        });
                    }
                } catch (userError) {
                    console.error(`Error fetching participant ${participantId}:`, userError);
                }
            }
        }
        
        // Get messages
        let messagesQuery = adminDb.collection('conversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(parseInt(limit));
        
        if (offset > 0) {
            messagesQuery = messagesQuery.offset(parseInt(offset));
        }
        
        const messagesSnapshot = await messagesQuery.get();
        const messages = messagesSnapshot.docs.map(doc => {
            const messageData = doc.data();
            const sender = participants.find(p => p.id === messageData.senderId);
            
            return {
                _id: doc.id,
                text: messageData.text,
                senderId: messageData.senderId,
                senderName: messageData.senderName || (sender ? sender.name : 'Unknown'),
                senderEmail: sender ? sender.email : 'Unknown',
                senderType: sender ? sender.type : 'Unknown',
                createdAt: messageData.createdAt,
                readBy: messageData.readBy || {}
            };
        }).reverse(); // Show oldest first
        
        res.json({
            success: true,
            conversation: {
                id: conversationId,
                participants: participants,
                jobId: conversationData.jobId,
                createdAt: conversationData.createdAt,
                updatedAt: conversationData.updatedAt
            },
            messages: messages,
            totalMessages: messagesSnapshot.size,
            hasMore: messagesSnapshot.size === parseInt(limit)
        });
        
    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversation messages:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversation messages' });
    }
});

router.post('/conversations/search', async (req, res) => {
    try {
        const { query, type = 'all' } = req.body;
        
        if (!query || query.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }
        
        console.log(`[ADMIN-CONVERSATIONS] Searching conversations for: ${query}`);
        
        // Find users matching the search query
        const usersSnapshot = await adminDb.collection('users')
            .where('email', '>=', query.toLowerCase())
            .where('email', '<=', query.toLowerCase() + '\uf8ff')
            .get();
        
        const nameSearchSnapshot = await adminDb.collection('users')
            .where('name', '>=', query)
            .where('name', '<=', query + '\uf8ff')
            .get();
        
        // Combine results and remove duplicates
        const userIds = new Set();
        const matchedUsers = [];
        
        [...usersSnapshot.docs, ...nameSearchSnapshot.docs].forEach(doc => {
            if (!userIds.has(doc.id)) {
                userIds.add(doc.id);
                const userData = doc.data();
                if (type === 'all' || userData.type === type) {
                    matchedUsers.push({
                        id: doc.id,
                        name: userData.name,
                        email: userData.email,
                        type: userData.type
                    });
                }
            }
        });
        
        if (matchedUsers.length === 0) {
            return res.json({ success: true, conversations: [], message: 'No users found matching the search query' });
        }
        
        // Find conversations involving these users
        const conversations = [];
        const userIdsList = Array.from(userIds);
        
        for (const userId of userIdsList) {
            const conversationsSnapshot = await adminDb.collection('conversations')
                .where('participantIds', 'array-contains', userId)
                .get();
            
            for (const doc of conversationsSnapshot.docs) {
                if (!conversations.find(c => c._id === doc.id)) {
                    const data = doc.data();
                    
                    const participants = [];
                    for (const participantId of data.participantIds) {
                        const participant = matchedUsers.find(u => u.id === participantId) || 
                                          await getUserById(participantId);
                        if (participant) {
                            participants.push(participant);
                        }
                    }
                    
                    conversations.push({
                        _id: doc.id,
                        participants: participants,
                        participantNames: participants.map(p => p.name).join(', '),
                        lastMessage: data.lastMessage || 'No messages',
                        updatedAt: data.updatedAt,
                        createdAt: data.createdAt
                    });
                }
            }
        }
        
        conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        res.json({ success: true, conversations, matchedUsers });
        
    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error searching conversations:', error);
        res.status(500).json({ success: false, message: 'Error searching conversations' });
    }
});

// Helper function to get user by ID
async function getUserById(userId) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            return {
                id: userId,
                name: userData.name || 'Unknown',
                email: userData.email || 'Unknown',
                type: userData.type || 'Unknown'
            };
        }
    } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
    }
    return null;
}

router.get('/conversations/stats', async (req, res) => {
    try {
        const conversationsSnapshot = await adminDb.collection('conversations').get();
        const totalConversations = conversationsSnapshot.size;
        
        let totalMessages = 0;
        let activeConversations = 0;
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        for (const doc of conversationsSnapshot.docs) {
            const data = doc.data();
            
            const messagesSnapshot = await doc.ref.collection('messages').get();
            totalMessages += messagesSnapshot.size;
            
            if (data.updatedAt && new Date(data.updatedAt) > last7Days) {
                activeConversations++;
            }
        }
        
        res.json({
            success: true,
            stats: {
                totalConversations,
                totalMessages,
                activeConversations,
                averageMessagesPerConversation: totalConversations > 0 ? Math.round(totalMessages / totalConversations) : 0
            }
        });
        
    } catch (error) {
        console.error('[ADMIN-CONVERSATIONS] Error fetching conversation stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching conversation statistics' });
    }
});

// --- MESSAGE MANAGEMENT ---
router.get('/messages', async (req, res) => {
    try {
        console.log('[ADMIN-MESSAGES] Fetching messages with user block status...');
        
        const snapshot = await adminDb.collection('messages').orderBy('createdAt', 'desc').get();
        const messages = [];
        
        const userBlockStatusCache = new Map();
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const senderEmail = data.senderEmail || data.from;
            
            let senderBlocked = false;
            if (senderEmail && !userBlockStatusCache.has(senderEmail)) {
                try {
                    const userQuery = await adminDb.collection('users')
                        .where('email', '==', senderEmail)
                        .limit(1)
                        .get();
                    
                    if (!userQuery.empty) {
                        const userData = userQuery.docs[0].data();
                        senderBlocked = userData.isBlocked === true || userData.canSendMessages === false;
                        userBlockStatusCache.set(senderEmail, senderBlocked);
                    } else {
                        userBlockStatusCache.set(senderEmail, false);
                    }
                } catch (userError) {
                    console.error('[ADMIN-MESSAGES] Error checking user block status:', userError);
                    userBlockStatusCache.set(senderEmail, false);
                }
            } else {
                senderBlocked = userBlockStatusCache.get(senderEmail) || false;
            }
            
            const message = {
                _id: doc.id,
                senderEmail: senderEmail,
                senderName: data.senderName || data.fromName || 'Unknown',
                recipientEmail: data.recipientEmail || data.to || 'admin@steelconnect.com',
                recipientName: data.recipientName || data.toName || 'Admin',
                subject: data.subject || 'No Subject',
                content: data.content || data.message || '',
                messageType: data.messageType || 'general',
                status: senderBlocked ? 'blocked' : (data.status || 'unread'),
                createdAt: data.createdAt,
                readAt: data.readAt || null,
                attachments: data.attachments || [],
                senderBlocked: senderBlocked,
                adminRead: data.adminRead || false,
                adminReadAt: data.adminReadAt || null,
                adminReadBy: data.adminReadBy || null
            };
            
            messages.push(message);
        }
        
        console.log(`[ADMIN-MESSAGES] Returning ${messages.length} messages`);
        res.json({ success: true, messages });
    } catch (error) {
        console.error("[ADMIN-MESSAGES] Fetch Messages Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching messages' });
    }
});

router.patch('/messages/:messageId/read', async (req, res) => {
    try {
        console.log(`[ADMIN-MESSAGES] Marking message ${req.params.messageId} as read by ${req.user.email}`);
        
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        await adminDb.collection('messages').doc(req.params.messageId).update({
            adminRead: true,
            adminReadAt: new Date().toISOString(),
            adminReadBy: req.user.email,
            status: 'read'
        });

        console.log(`[ADMIN-MESSAGES] Message ${req.params.messageId} marked as read`);
        res.json({
            success: true,
            message: 'Message marked as read'
        });
    } catch (error) {
        console.error("[ADMIN-MESSAGES] Mark Message as Read Error:", error);
        res.status(500).json({ success: false, message: 'Error marking message as read' });
    }
});

router.get('/messages/:messageId', async (req, res) => {
    try {
        const messageDoc = await adminDb.collection('messages').doc(req.params.messageId).get();
        if (!messageDoc.exists) return res.status(404).json({ success: false, message: 'Message not found' });

        const messageData = messageDoc.data();

        await adminDb.collection('messages').doc(req.params.messageId).update({
            adminRead: true,
            adminReadAt: new Date().toISOString(),
            adminReadBy: req.user.email
        });

        res.json({
            success: true,
            message: {
                _id: messageDoc.id,
                ...messageData
            }
        });
    } catch (error) {
        console.error("Get Message Details Error:", error);
        res.status(500).json({ success: false, message: 'Error fetching message details' });
    }
});

router.patch('/messages/:messageId/status', async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        const updateData = {
            status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.email
        };

        if (adminNotes) {
            updateData.adminNotes = adminNotes;
        }

        await adminDb.collection('messages').doc(req.params.messageId).update(updateData);
        res.json({ success: true, message: 'Message status updated successfully' });
    } catch (error) {
        console.error("Update Message Status Error:", error);
        res.status(500).json({ success: false, message: 'Error updating message status' });
    }
});

router
