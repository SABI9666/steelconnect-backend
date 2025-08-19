// routes/admin/estimations.js
const express = require('express');
const router = express.Router();
const {
    getAllEstimations,
    getEstimation,
    updateStatus,
    updateAmount,
    updateDetails,
    uploadResult,
    deleteEstimation,
    downloadFile,
    deleteUploadedFile,
    assignEstimation,
    addNotes,
    getEstimationStats,
    bulkUpdateStatus
} = require('../../controllers/adminEstimationController');

const { uploadConfigs, handleUploadError } = require('../../middleware/fileUpload');
const auth = require('../../middleware/auth'); // Your existing auth middleware
const adminAuth = require('../../middleware/adminAuth'); // Middleware to ensure user is admin

// Apply authentication to all routes
router.use(auth);
router.use(adminAuth);

// GET /api/admin/estimations - Get all estimations with filtering and pagination
router.get('/', getAllEstimations);

// GET /api/admin/estimations/stats - Get estimation statistics for dashboard
router.get('/stats', getEstimationStats);

// GET /api/admin/estimations/:id - Get specific estimation details
router.get('/:id', getEstimation);

// PUT /api/admin/estimations/:id/status - Update estimation status
router.put('/:id/status', updateStatus);

// PUT /api/admin/estimations/:id/amount - Update estimation amount
router.put('/:id/amount', updateAmount);

// PUT /api/admin/estimations/:id/details - Update estimation breakdown details
router.put('/:id/details', updateDetails);

// PUT /api/admin/estimations/:id/assign - Assign estimation to admin
router.put('/:id/assign', assignEstimation);

// PUT /api/admin/estimations/:id/notes - Add/update admin notes
router.put('/:id/notes', addNotes);

// POST /api/admin/estimations/:id/result - Upload result PDF
router.post('/:id/result', 
    uploadConfigs.singleResult, 
    handleUploadError, 
    uploadResult
);

// PUT /api/admin/estimations/bulk/status - Bulk status update
router.put('/bulk/status', bulkUpdateStatus);

// DELETE /api/admin/estimations/:id - Delete estimation
router.delete('/:id', deleteEstimation);

// DELETE /api/admin/estimations/:id/files/:fileId - Delete specific uploaded file
router.delete('/:id/files/:fileId', deleteUploadedFile);

// GET /api/admin/estimations/:id/download/:fileId - Download uploaded file
router.get('/:id/download/:fileId', downloadFile);

// GET /api/admin/estimations/:id/result - Download result PDF
router.get('/:id/result', (req, res, next) => {
    req.query.type = 'result';
    downloadFile(req, res, next);
});

module.exports = router;