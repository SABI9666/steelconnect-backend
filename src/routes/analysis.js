// src/routes/analysis.js - FINAL FIXED VERSION
import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

// Protect all routes with authentication
router.use(authenticateToken);

// GET /api/analysis/my-request - Get contractor's analysis request
router.get('/my-request', async (req, res) => {
    try {
        console.log('[ANALYSIS] Fetching request for user:', req.user);
        
        // Use email as primary identifier
        const userEmail = req.user.email;
        
        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email not found'
            });
        }
        
        // Find the most recent request for this contractor using email
        const snapshot = await adminDb.collection('analysis_requests')
            .where('contractorEmail', '==', userEmail)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            console.log('[ANALYSIS] No requests found for user:', userEmail);
            return res.json({
                success: true,
                request: null
            });
        }
        
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        console.log('[ANALYSIS] Found request:', doc.id);
        
        res.json({
            success: true,
            request: {
                _id: doc.id,
                dataType: data.dataType || 'Production Update',
                frequency: data.frequency || 'Daily',
                description: data.description || '',
                googleSheetUrl: data.googleSheetUrl || '',
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
        
        // FIXED: Get user data properly, handle undefined values
        const userEmail = req.user.email;
        const userName = req.user.name || req.user.displayName || 'Unknown User';
        const userId = req.user.uid || req.user.id || null; // Allow null if not available
        
        console.log('[ANALYSIS] Submitting request for user:', userEmail);
        console.log('[ANALYSIS] User data:', { userEmail, userName, userId });
        
        // Validate required fields
        if (!googleSheetUrl || !description) {
            return res.status(400).json({
                success: false,
                message: 'Data source URL and description are required'
            });
        }
        
        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email is required'
            });
        }
        
        // Basic URL validation - allow any URL format for flexibility
        if (!googleSheetUrl.includes('http')) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid URL'
            });
        }
        
        // Check if user already has a pending request
        const existingSnapshot = await adminDb.collection('analysis_requests')
            .where('contractorEmail', '==', userEmail)
            .where('vercelUrl', '==', null)
            .get();
        
        if (!existingSnapshot.empty) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending analysis request'
            });
        }
        
        // Create new analysis request - FIXED: Handle undefined contractorId
        const requestData = {
            contractorEmail: userEmail,
            contractorName: userName,
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
        
        // Only add contractorId if it exists
        if (userId) {
            requestData.contractorId = userId;
        }
        
        console.log('[ANALYSIS] Creating request with data:', requestData);
        
        const docRef = await adminDb.collection('analysis_requests').add(requestData);
        
        console.log('[ANALYSIS] Request created with ID:', docRef.id);
        
        res.json({
            success: true,
            message: 'Business analytics request submitted successfully',
            requestId: docRef.id
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error submitting request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit business analytics request',
            error: error.message // Include error details for debugging
        });
    }
});

// PUT /api/analysis/request/:requestId - Update analysis request
router.put('/request/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { dataType, frequency, googleSheetUrl, description } = req.body;
        const userEmail = req.user.email;
        
        console.log('[ANALYSIS] Updating request:', requestId, 'for user:', userEmail);
        
        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email is required'
            });
        }
        
        // Verify ownership
        const requestDoc = await adminDb.collection('analysis_requests').doc(requestId).get();
        if (!requestDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Analysis request not found'
            });
        }
        
        const requestData = requestDoc.data();
        if (requestData.contractorEmail !== userEmail) {
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
        
        console.log('[ANALYSIS] Request updated successfully:', requestId);
        
        res.json({
            success: true,
            message: 'Business analytics request updated successfully'
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error updating request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update business analytics request'
        });
    }
});

// DELETE /api/analysis/request/:requestId - Cancel analysis request
router.delete('/request/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const userEmail = req.user.email;
        
        console.log('[ANALYSIS] Cancelling request:', requestId, 'for user:', userEmail);
        
        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email is required'
            });
        }
        
        // Verify ownership
        const requestDoc = await adminDb.collection('analysis_requests').doc(requestId).get();
        if (!requestDoc.exists) {
            return res.status(404).json({
                success: false,
                message: 'Analysis request not found'
            });
        }
        
        const requestData = requestDoc.data();
        if (requestData.contractorEmail !== userEmail) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to cancel this request'
            });
        }
        
        // Delete request
        await adminDb.collection('analysis_requests').doc(requestId).delete();
        
        console.log('[ANALYSIS] Request cancelled successfully:', requestId);
        
        res.json({
            success: true,
            message: 'Business analytics request cancelled successfully'
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error cancelling request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel business analytics request'
        });
    }
});

// GET /api/analysis/history - Get contractor's analysis history
router.get('/history', async (req, res) => {
    try {
        const userEmail = req.user.email;
        
        console.log('[ANALYSIS] Fetching history for user:', userEmail);
        
        if (!userEmail) {
            return res.status(400).json({
                success: false,
                message: 'User email is required'
            });
        }
        
        const snapshot = await adminDb.collection('analysis_requests')
            .where('contractorEmail', '==', userEmail)
            .orderBy('createdAt', 'desc')
            .get();
        
        const requests = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                dataType: data.dataType || 'Production Update',
                frequency: data.frequency || 'Daily',
                description: data.description || '',
                googleSheetUrl: data.googleSheetUrl || '',
                vercelUrl: data.vercelUrl || null,
                status: data.vercelUrl ? 'completed' : 'pending',
                adminNotes: data.adminNotes || '',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            };
        });
        
        console.log('[ANALYSIS] Found', requests.length, 'requests in history');
        
        res.json({
            success: true,
            requests: requests
        });
        
    } catch (error) {
        console.error('[ANALYSIS] Error fetching history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch business analytics history'
        });
    }
});

export default router;
