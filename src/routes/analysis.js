// src/routes/analysis.js - Combined Analysis and Admin Analysis Routes

import express from 'express';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

// Main router for user-facing analysis endpoints
const router = express.Router();

// Middleware to ensure only contractors can access
const contractorOnly = (req, res, next) => {
    if (req.user.type !== 'contractor') {
        return res.status(403).json({ 
            success: false, 
            message: 'Only contractors can access analysis portal' 
        });
    }
    next();
};

// GET /api/analysis/configuration - Get contractor's analysis config
router.get('/configuration', authenticateToken, contractorOnly, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID not found in token.' });
        }
        
        // Get or create analysis configuration
        const configDoc = await adminDb
            .collection('analysis_configs')
            .doc(userId)
            .get();
        
        if (configDoc.exists) {
            const config = configDoc.data();
            res.json({
                success: true,
                config: {
                    sheetUrl: config.sheetUrl || '',
                    dataType: config.dataType || 'Production Update',
                    frequency: config.frequency || 'Daily',
                    vercelHtmlUrl: config.vercelHtmlUrl || '',
                    lastSyncTime: config.lastSyncTime || null,
                    isActive: config.isActive || false
                }
            });
        } else {
            res.json({
                success: true,
                config: {
                    sheetUrl: '',
                    dataType: 'Production Update',
                    frequency: 'Daily',
                    vercelHtmlUrl: '',
                    lastSyncTime: null,
                    isActive: false
                }
            });
        }
    } catch (error) {
        console.error('[ANALYSIS] Error fetching configuration:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching analysis configuration' 
        });
    }
});

// POST /api/analysis/connect-sheet - Connect Google Sheet
router.post('/connect-sheet', authenticateToken, contractorOnly, async (req, res) => {
    try {
        const { sheetUrl, dataType, frequency } = req.body;
        const userId = req.user.uid;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID not found in token.' });
        }
        
        // Validate Google Sheets URL
        if (!sheetUrl || !sheetUrl.includes('docs.google.com/spreadsheets')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Google Sheets URL'
            });
        }
        
        // Extract sheet ID from URL
        const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        const sheetId = sheetIdMatch ? sheetIdMatch[1] : null;
        
        if (!sheetId) {
            return res.status(400).json({
                success: false,
                message: 'Could not extract Sheet ID from URL'
            });
        }
        
        // Save configuration
        const configData = {
            sheetUrl,
            sheetId,
            dataType: dataType || 'Production Update',
            frequency: frequency || 'Daily',
            userId,
            userName: req.user.name,
            userEmail: req.user.email,
            connectedAt: new Date().toISOString(),
            lastSyncTime: new Date().toISOString(),
            isActive: true,
            updatedAt: new Date().toISOString()
        };
        
        await adminDb.collection('analysis_configs').doc(userId).set(configData, { merge: true });
        
        // Log the connection
        await adminDb.collection('analysis_logs').add({
            userId,
            action: 'sheet_connected',
            sheetUrl,
            dataType,
            frequency,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Google Sheet connected successfully',
            config: configData
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error connecting sheet:', error);
        res.status(500).json({
            success: false,
            message: 'Error connecting Google Sheet'
        });
    }
});

// POST /api/analysis/update-config - Update analysis configuration
router.post('/update-config', authenticateToken, contractorOnly, async (req, res) => {
    try {
        const { dataType, frequency } = req.body;
        const userId = req.user.uid;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID not found in token.' });
        }
        
        const updateData = {
            dataType,
            frequency,
            updatedAt: new Date().toISOString()
        };
        
        await adminDb.collection('analysis_configs').doc(userId).update(updateData);
        
        res.json({
            success: true,
            message: 'Configuration updated successfully'
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error updating configuration:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating configuration'
        });
    }
});

// GET /api/analysis/report-url - Get Vercel report URL
router.get('/report-url', authenticateToken, contractorOnly, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID not found in token.' });
        }
        
        const configDoc = await adminDb.collection('analysis_configs').doc(userId).get();
        
        if (configDoc.exists && configDoc.data().vercelHtmlUrl) {
            res.json({
                success: true,
                vercelUrl: configDoc.data().vercelHtmlUrl
            });
        } else {
            res.json({
                success: true,
                vercelUrl: null
            });
        }
        
    } catch (error) {
        console.error('[ANALYSIS] Error fetching report URL:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching report URL'
        });
    }
});

// POST /api/analysis/sync-data - Manual sync with Google Sheets
router.post('/sync-data', authenticateToken, contractorOnly, async (req, res) => {
    try {
        const userId = req.user.uid;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID not found in token.' });
        }
        
        const configDoc = await adminDb.collection('analysis_configs').doc(userId).get();
        
        if (!configDoc.exists || !configDoc.data().sheetUrl) {
            return res.status(400).json({
                success: false,
                message: 'No Google Sheet connected'
            });
        }
        
        const config = configDoc.data();
        
        // Log sync attempt
        await adminDb.collection('analysis_logs').add({
            userId,
            action: 'manual_sync',
            sheetId: config.sheetId,
            dataType: config.dataType,
            frequency: config.frequency,
            timestamp: new Date().toISOString()
        });
        
        // Update last sync time
        await adminDb.collection('analysis_configs').doc(userId).update({
            lastSyncTime: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Data sync initiated successfully',
            lastSyncTime: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error syncing data:', error);
        res.status(500).json({
            success: false,
            message: 'Error syncing data'
        });
    }
});

// Admin sub-router for analysis management
const adminRouter = express.Router();

// Protect all admin routes with admin authentication
adminRouter.use(authenticateToken);
adminRouter.use(isAdmin);

// GET /api/admin/analysis/contractors - Get all contractor analysis configs
adminRouter.get('/contractors', async (req, res) => {
    try {
        console.log('[ADMIN-ANALYSIS] Fetching contractor analysis configurations');
        
        const configsSnapshot = await adminDb.collection('analysis_configs').get();
        const contractors = [];
        
        for (const doc of configsSnapshot.docs) {
            const config = doc.data();
            
            // Get user details
            let userDetails = null;
            if (config.userId) {
                try {
                    const userDoc = await adminDb.collection('users').doc(config.userId).get();
                    if (userDoc.exists) {
                        userDetails = userDoc.data();
                    }
                } catch (userError) {
                    console.error(`Error fetching user ${config.userId}:`, userError);
                }
            }
            
            contractors.push({
                id: doc.id,
                name: userDetails?.name || config.userName || 'Unknown',
                email: userDetails?.email || config.userEmail || 'Unknown',
                dataType: config.dataType,
                frequency: config.frequency,
                sheetUrl: config.sheetUrl,
                sheetId: config.sheetId,
                vercelUrl: config.vercelHtmlUrl,
                isActive: config.isActive,
                lastSyncTime: config.lastSyncTime,
                connectedAt: config.connectedAt
            });
        }
        
        // Sort by most recent first
        contractors.sort((a, b) => {
            const dateA = new Date(a.connectedAt || 0);
            const dateB = new Date(b.connectedAt || 0);
            return dateB - dateA;
        });
        
        res.json({
            success: true,
            contractors,
            total: contractors.length
        });
        
    } catch (error) {
        console.error('[ADMIN-ANALYSIS] Error fetching contractors:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching contractor analysis data'
        });
    }
});

// POST /api/admin/analysis/upload-report - Upload Vercel report URL
adminRouter.post('/upload-report', async (req, res) => {
    try {
        const { contractorId, vercelUrl, notes } = req.body;
        
        if (!contractorId || !vercelUrl) {
            return res.status(400).json({
                success: false,
                message: 'Contractor ID and Vercel URL are required'
            });
        }
        
        // Validate URL format
        try {
            new URL(vercelUrl);
        } catch (urlError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid URL format'
            });
        }
        
        // Update contractor's analysis config
        const updateData = {
            vercelHtmlUrl: vercelUrl,
            vercelUploadedAt: new Date().toISOString(),
            vercelUploadedBy: req.user.email,
            vercelNotes: notes || '',
            updatedAt: new Date().toISOString()
        };
        
        await adminDb.collection('analysis_configs').doc(contractorId).update(updateData);
        
        // Log the upload
        await adminDb.collection('analysis_logs').add({
            contractorId,
            adminId: req.user.uid,
            adminEmail: req.user.email,
            action: 'vercel_report_uploaded',
            vercelUrl,
            notes,
            timestamp: new Date().toISOString()
        });
        
        // Create notification for contractor
        try {
            const configDoc = await adminDb.collection('analysis_configs').doc(contractorId).get();
            if (configDoc.exists) {
                const config = configDoc.data();
                
                await adminDb.collection('notifications').add({
                    userId: contractorId,
                    title: 'Analytics Report Available',
                    message: 'Your analytics report has been uploaded and is now available in the Analysis Portal.',
                    type: 'info',
                    metadata: {
                        action: 'report_uploaded',
                        vercelUrl,
                        uploadedBy: req.user.email
                    },
                    isRead: false,
                    seen: false,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (notifError) {
            console.error('Error creating notification:', notifError);
        }
        
        res.json({
            success: true,
            message: 'Vercel report URL uploaded successfully'
        });
        
    } catch (error) {
        console.error('[ADMIN-ANALYSIS] Error uploading report:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading report URL'
        });
    }
});

// GET /api/admin/analysis/logs - Get analysis activity logs
adminRouter.get('/logs', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        
        const logsSnapshot = await adminDb
            .collection('analysis_logs')
            .orderBy('timestamp', 'desc')
            .limit(parseInt(limit))
            .offset(parseInt(offset))
            .get();
        
        const logs = logsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        res.json({
            success: true,
            logs,
            total: logs.length
        });
        
    } catch (error) {
        console.error('[ADMIN-ANALYSIS] Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching activity logs'
        });
    }
});

// DELETE /api/admin/analysis/:contractorId/report - Remove Vercel report
adminRouter.delete('/:contractorId/report', async (req, res) => {
    try {
        const { contractorId } = req.params;
        
        await adminDb.collection('analysis_configs').doc(contractorId).update({
            vercelHtmlUrl: null,
            vercelUploadedAt: null,
            vercelUploadedBy: null,
            vercelNotes: null,
            updatedAt: new Date().toISOString()
        });
        
        // Log the removal
        await adminDb.collection('analysis_logs').add({
            contractorId,
            adminId: req.user.uid,
            adminEmail: req.user.email,
            action: 'vercel_report_removed',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Vercel report removed successfully'
        });
        
    } catch (error) {
        console.error('[ADMIN-ANALYSIS] Error removing report:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing report'
        });
    }
});

// Mount the admin router under the '/admin' path
router.use('/admin', adminRouter);

export default router;
