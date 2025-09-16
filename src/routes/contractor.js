// Add these endpoints to your contractor routes file (e.g., src/routes/contractor.js)

import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { db } from '../config/firebase.js'; // Your main database connection

const router = express.Router();

// Protect contractor routes
router.use(authenticateToken);

// Get contractor's estimations with results
router.get('/estimations', async (req, res) => {
    try {
        console.log(`[CONTRACTOR] Fetching estimations for user: ${req.user.email}`);
        
        // Get estimations for the current contractor
        const snapshot = await db.collection('estimations')
            .where('contractorEmail', '==', req.user.email)
            .orderBy('createdAt', 'desc')
            .get();
        
        const estimations = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                projectName: data.projectTitle || data.projectName,
                projectDescription: data.description || data.projectDescription,
                status: data.status || 'pending',
                uploadedFiles: data.uploadedFiles || [],
                resultFile: data.resultFile || null, // This contains the admin's result
                createdAt: data.createdAt,
                completedAt: data.completedAt,
                hasResult: !!(data.resultFile && data.resultFile.url) // Boolean flag
            };
        });
        
        console.log(`[CONTRACTOR] Found ${estimations.length} estimations`);
        res.json({ success: true, estimations });
        
    } catch (error) {
        console.error("[CONTRACTOR] Fetch Estimations Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching your estimations' 
        });
    }
});

// Get specific estimation details with result
router.get('/estimations/:estimationId', async (req, res) => {
    try {
        const estimationDoc = await db.collection('estimations').doc(req.params.estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Estimation not found' 
            });
        }
        
        const data = estimationDoc.data();
        
        // Verify this estimation belongs to the current contractor
        if (data.contractorEmail !== req.user.email && data.contractorId !== req.user.uid) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied to this estimation' 
            });
        }
        
        const estimation = {
            _id: estimationDoc.id,
            projectName: data.projectTitle || data.projectName,
            projectDescription: data.description || data.projectDescription,
            status: data.status || 'pending',
            uploadedFiles: data.uploadedFiles || [],
            resultFile: data.resultFile || null,
            createdAt: data.createdAt,
            completedAt: data.completedAt,
            hasResult: !!(data.resultFile && data.resultFile.url)
        };
        
        res.json({ success: true, estimation });
        
    } catch (error) {
        console.error("[CONTRACTOR] Get Estimation Details Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching estimation details' 
        });
    }
});

// Download estimation result file
router.get('/estimations/:estimationId/download-result', async (req, res) => {
    try {
        console.log(`[CONTRACTOR] Download request for estimation: ${req.params.estimationId} by ${req.user.email}`);
        
        const estimationDoc = await db.collection('estimations').doc(req.params.estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({ 
                success: false, 
                message: 'Estimation not found' 
            });
        }
        
        const data = estimationDoc.data();
        
        // Verify this estimation belongs to the current contractor
        if (data.contractorEmail !== req.user.email && data.contractorId !== req.user.uid) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied to this estimation' 
            });
        }
        
        // Check if result file exists
        if (!data.resultFile || !data.resultFile.url) {
            return res.status(404).json({ 
                success: false, 
                message: 'No result file available for this estimation yet' 
            });
        }
        
        // Return the download information
        res.json({ 
            success: true, 
            downloadInfo: {
                url: data.resultFile.url,
                filename: data.resultFile.name || 'estimation_result.pdf',
                uploadedAt: data.resultFile.uploadedAt,
                uploadedBy: data.resultFile.uploadedBy || 'Admin'
            }
        });
        
        console.log(`[CONTRACTOR] Providing download link for: ${data.resultFile.name}`);
        
    } catch (error) {
        console.error("[CONTRACTOR] Download Result Error:", error);
        res.status(500).json({ 
            success: false, 
            message: 'Error accessing result file' 
        });
    }
});

export default router;
