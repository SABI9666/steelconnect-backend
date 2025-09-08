// FIXED: src/controllers/adminController.js - Estimation-related functions
// Add these functions to your existing admin controller

// Get all estimations for admin
export const getAllEstimations = async (req, res) => {
    try {
        console.log('Admin estimations list requested by:', req.user?.email);
        
        const snapshot = await adminDb.collection('estimations')
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = [];
        
        for (const doc of snapshot.docs) {
            const estimationData = doc.data();
            
            // Get contractor user data if available
            let userData = null;
            if (estimationData.contractorId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
                    if (userDoc.exists) {
                        const { password, ...userInfo } = userDoc.data();
                        userData = { id: userDoc.id, ...userInfo };
                    }
                } catch (userError) {
                    console.warn(`Could not fetch user data for estimation: ${doc.id}`);
                }
            }
            
            const estimation = {
                _id: doc.id,
                id: doc.id,
                projectTitle: estimationData.projectTitle || 'Untitled',
                projectType: estimationData.projectType || 'General',
                description: estimationData.description || '',
                contractorName: userData?.name || estimationData.contractorName || 'Unknown',
                contractorEmail: userData?.email || estimationData.contractorEmail || 'N/A',
                contractorCompany: userData?.company || estimationData.contractorCompany || 'Not specified',
                contractorId: estimationData.contractorId,
                uploadedFiles: estimationData.uploadedFiles || [],
                resultFile: estimationData.resultFile || null,
                status: estimationData.status || 'pending',
                estimatedAmount: estimationData.estimatedAmount || null,
                notes: estimationData.notes || '',
                dueDate: estimationData.dueDate || null,
                createdAt: estimationData.createdAt,
                updatedAt: estimationData.updatedAt || estimationData.createdAt,
                completedAt: estimationData.completedAt || null,
                ...estimationData
            };
            
            estimations.push(estimation);
        }
        
        console.log(`Found ${estimations.length} estimations for admin`);
        
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

// Get single estimation by ID (admin access)
export const getEstimationById = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        console.log(`Admin fetching estimation details for ID: ${estimationId}`);
        
        const doc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }
        
        const estimationData = doc.data();
        
        // Get user data if available
        let userData = null;
        if (estimationData.contractorId) {
            try {
                const userDoc = await adminDb.collection('users').doc(estimationData.contractorId).get();
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
            projectTitle: estimationData.projectTitle || 'Untitled',
            projectType: estimationData.projectType || 'General',
            description: estimationData.description || '',
            contractorName: userData?.name || estimationData.contractorName || 'Unknown',
            contractorEmail: userData?.email || estimationData.contractorEmail || 'N/A',
            contractorCompany: userData?.company || estimationData.contractorCompany || 'Not specified',
            contractorId: estimationData.contractorId,
            uploadedFiles: estimationData.uploadedFiles || [],
            resultFile: estimationData.resultFile || null,
            status: estimationData.status || 'pending',
            estimatedAmount: estimationData.estimatedAmount || null,
            notes: estimationData.notes || '',
            dueDate: estimationData.dueDate || null,
            createdAt: estimationData.createdAt,
            updatedAt: estimationData.updatedAt || estimationData.createdAt,
            completedAt: estimationData.completedAt || null,
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

// Get estimation files (admin access)
export const getEstimationFiles = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        res.json({
            success: true,
            files: estimationData.uploadedFiles || []
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

// Get estimation result (admin access)
export const getEstimationResult = async (req, res) => {
    try {
        const { estimationId } = req.params;
        
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        if (!estimationDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Estimation not found'
            });
        }

        const estimationData = estimationDoc.data();

        if (!estimationData.resultFile) {
            return res.status(404).json({
                success: false,
                message: 'Result file not available'
            });
        }

        res.json({
            success: true,
            resultFile: estimationData.resultFile
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

// REMOVED: Download functions - Files are accessed directly via their public Firebase Storage URLs
// The frontend will use the file URLs directly for downloads

// Update estimation status
export const updateEstimationStatus = async (req, res) => {
    try {
        const { estimationId } = req.params;
        const { status, notes } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        const updateData = {
            status: status,
            updatedAt: new Date().toISOString()
        };
        
        if (notes) {
            updateData.notes = notes;
        }
        
        if (status === 'completed' && !updateData.completedAt) {
            updateData.completedAt = new Date().toISOString();
        }
        
        await adminDb.collection('estimations').doc(estimationId).update(updateData);
        
        console.log(`Estimation ${estimationId} status updated to ${status} by admin`);
        
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
        
        console.log(`Estimation ${estimationId} due date set to ${dueDate} by admin`);
        
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

// Block/Unblock individual message
export const blockMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { block, reason } = req.body;
        
        if (block === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Block parameter is required'
            });
        }
        
        const updateData = {
            isBlocked: block,
            updatedAt: new Date().toISOString()
        };
        
        if (block) {
            updateData.blockedAt = new Date().toISOString();
            updateData.blockedBy = req.user?.email || 'admin';
            updateData.blockReason = reason || 'No reason provided';
            updateData.status = 'blocked';
        } else {
            updateData.blockedAt = null;
            updateData.blockedBy = null;
            updateData.blockReason = null;
            updateData.status = 'unread'; // Reset to unread when unblocked
        }
        
        await adminDb.collection('messages').doc(messageId).update(updateData);
        
        console.log(`Message ${messageId} ${block ? 'blocked' : 'unblocked'} by ${req.user?.email}`);
        
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

// Block/Unblock user from sending messages
export const blockUserMessages = async (req, res) => {
    try {
        const { userEmail } = req.params;
        const { block, reason } = req.body;
        
        if (block === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Block parameter is required'
            });
        }
        
        // Update all messages from this user
        const messagesSnapshot = await adminDb.collection('messages')
            .where('senderEmail', '==', userEmail)
            .get();
        
        const batch = adminDb.batch();
        
        messagesSnapshot.docs.forEach(doc => {
            const updateData = {
                isBlocked: block,
                updatedAt: new Date().toISOString()
            };
            
            if (block) {
                updateData.blockedAt = new Date().toISOString();
                updateData.blockedBy = req.user?.email || 'admin';
                updateData.blockReason = reason || 'User blocked from messaging';
                updateData.status = 'blocked';
            } else {
                updateData.blockedAt = null;
                updateData.blockedBy = null;
                updateData.blockReason = null;
                updateData.status = 'unread';
            }
            
            batch.update(doc.ref, updateData);
        });
        
        // Also update user's messaging status if user exists
        try {
            const userSnapshot = await adminDb.collection('users')
                .where('email', '==', userEmail)
                .limit(1)
                .get();
            
            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                batch.update(userDoc.ref, {
                    messagingBlocked: block,
                    messagingBlockedAt: block ? new Date().toISOString() : null,
                    messagingBlockedBy: block ? (req.user?.email || 'admin') : null,
                    messagingBlockReason: block ? reason : null,
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (userError) {
            console.warn(`Could not update user messaging status for ${userEmail}:`, userError);
        }
        
        await batch.commit();
        
        console.log(`User ${userEmail} ${block ? 'blocked' : 'unblocked'} from messaging by ${req.user?.email}`);
        
        res.json({
            success: true,
            message: `User ${block ? 'blocked' : 'unblocked'} from messaging successfully`
        });
    } catch (error) {
        console.error('Error blocking/unblocking user messages:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user messaging block status',
            error: error.message
        });
    }
};

// Update user status (activate/deactivate)
export const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        
        if (isActive === undefined) {
            return res.status(400).json({
                success: false,
                message: 'isActive parameter is required'
            });
        }
        
        await adminDb.collection('users').doc(userId).update({
            isActive: isActive,
            status: isActive ? 'active' : 'inactive',
            updatedAt: new Date().toISOString()
        });
        
        console.log(`User ${userId} ${isActive ? 'activated' : 'deactivated'} by admin`);
        
        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
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
        
        // Check if user exists
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Delete user
        await adminDb.collection('users').doc(userId).delete();
        
        console.log(`User ${userId} deleted by admin`);
        
        res.json({
            success: true,
            message: 'User deleted successfully'
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
