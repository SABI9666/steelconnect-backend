// Add these routes to your main backend API (not admin routes)
// File: src/routes/analysis.js

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Protect all routes with authentication
router.use(authenticateToken);

// GET /api/analysis/my-request - Get contractor's analysis request
router.get('/my-request', async (req, res) => {
    try {
        // FIX: Changed req.user.id to req.user.uid
        const userId = req.user.uid;
        
        // Find the most recent request for this contractor
        const snapshot = await adminDb.collection('analysis_requests')
            .where('contractorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return res.json({
                success: true,
                request: null
            });
        }
        
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        res.json({
            success: true,
            request: {
                _id: doc.id,
                dataType: data.dataType,
                frequency: data.frequency,
                description: data.description,
                googleSheetUrl: data.googleSheetUrl,
                vercelUrl: data.vercelUrl || null,
                status: data.vercelUrl ? 'completed' : 'pending',
                adminNotes: data.adminNotes || '',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            }
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error fetching contractor request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analysis request'
        });
    }
});

// POST /api/analysis/submit-request - Submit new analysis request
router.post('/submit-request', async (req, res) => {
    try {
        const { dataType, frequency, googleSheetUrl, description } = req.body;
        // FIX: Changed req.user.id to req.user.uid
        const userId = req.user.uid;
        
        // Validate required fields
        if (!googleSheetUrl || !description) {
            return res.status(400).json({
                success: false,
                message: 'Google Sheet URL and description are required'
            });
        }
        
        // Validate Google Sheets URL
        if (!googleSheetUrl.includes('docs.google.com/spreadsheets')) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Google Sheets URL'
            });
        }
        
        // Check if user already has a pending request
        const existingSnapshot = await adminDb.collection('analysis_requests')
            .where('contractorId', '==', userId)
            .where('vercelUrl', '==', null)
            .get();
        
        if (!existingSnapshot.empty) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending analysis request'
            });
        }
        
        // Create new analysis request
        const requestData = {
            contractorId: userId,
            contractorName: req.user.name,
            contractorEmail: req.user.email,
            dataType: dataType || 'Production Update',
            frequency: frequency || 'Daily',
            googleSheetUrl: googleSheetUrl,
            description: description,
            vercelUrl: null,
            adminNotes: '',
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const docRef = await adminDb.collection('analysis_requests').add(requestData);
        
        // Create notification for admin
        await adminDb.collection('admin_notifications').add({
            type: 'new_analysis_request',
            message: `New analysis request from ${req.user.name}`,
            requestId: docRef.id,
            contractorId: userId,
            contractorName: req.user.name,
            createdAt: new Date().toISOString(),
            read: false
        });
        
        res.json({
            success: true,
            message: 'Analysis request submitted successfully',
            requestId: docRef.id
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error submitting request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit analysis request'
        });
    }
});

// PUT /api/analysis/request/:requestId - Update analysis request
router.put('/request/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { dataType, frequency, googleSheetUrl, description } = req.body;
        // FIX: Changed req.user.id to req.user.uid
        const userId = req.user.uid;
        
        // Verify ownership
        const requestDoc = await adminDb.collection('analysis_requests').doc(requestId).get();
        if (!requestDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Analysis request not found'
            });
        }
        
        const requestData = requestDoc.data();
        if (requestData.contractorId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this request'
            });
        }
        
        // Only allow updates if report hasn't been uploaded
        if (requestData.vercelUrl) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update request after report has been uploaded'
            });
        }
        
        // Update request
        const updateData = {
            dataType: dataType || requestData.dataType,
            frequency: frequency || requestData.frequency,
            googleSheetUrl: googleSheetUrl || requestData.googleSheetUrl,
            description: description || requestData.description,
            updatedAt: new Date().toISOString()
        };
        
        await adminDb.collection('analysis_requests').doc(requestId).update(updateData);
        
        res.json({
            success: true,
            message: 'Analysis request updated successfully'
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error updating request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update analysis request'
        });
    }
});

// DELETE /api/analysis/request/:requestId - Cancel analysis request
router.delete('/request/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        // FIX: Changed req.user.id to req.user.uid
        const userId = req.user.uid;
        
        // Verify ownership
        const requestDoc = await adminDb.collection('analysis_requests').doc(requestId).get();
        if (!requestDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Analysis request not found'
            });
        }
        
        const requestData = requestDoc.data();
        if (requestData.contractorId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to cancel this request'
            });
        }
        
        // Delete request
        await adminDb.collection('analysis_requests').doc(requestId).delete();
        
        res.json({
            success: true,
            message: 'Analysis request cancelled successfully'
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error cancelling request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel analysis request'
        });
    }
});

// GET /api/analysis/history - Get contractor's analysis history
router.get('/history', async (req, res) => {
    try {
        // FIX: Changed req.user.id to req.user.uid
        const userId = req.user.uid;
        
        const snapshot = await adminDb.collection('analysis_requests')
            .where('contractorId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();
        
        const requests = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                dataType: data.dataType,
                frequency: data.frequency,
                description: data.description,
                googleSheetUrl: data.googleSheetUrl,
                vercelUrl: data.vercelUrl || null,
                status: data.vercelUrl ? 'completed' : 'pending',
                adminNotes: data.adminNotes || '',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            };
        });
        
        res.json({
            success: true,
            requests: requests
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error fetching history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analysis history'
        });
    }
});

export default router;
