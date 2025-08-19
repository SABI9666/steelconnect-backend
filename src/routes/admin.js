import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import * as adminController from '../controllers/adminController.js';
import { multerUpload, uploadToFirebase } from '../middleware/fileUpload.js';

const router = express.Router();

// Apply admin middleware to all routes in this file
router.use(isAdmin);

// --- Dashboard & Analytics ---
// Note: Assuming getDashboardStats and getAdvancedStats exist.
router.get('/dashboard', adminController.getDashboardStats);
router.get('/stats/advanced', adminController.getAdvancedStats);
// router.get('/system', adminController.getSystemStats); // TEMP DISABLED: This function was missing.

// --- User Management ---
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId/status', adminController.updateUserStatus);
// router.delete('/users/:userId', adminController.deleteUser); // TEMP DISABLED: Likely missing.

// --- Jobs Management ---
router.get('/jobs', adminController.getAllJobs);
router.put('/jobs/:jobId/status', adminController.updateJobStatus);
router.delete('/jobs/:jobId', adminController.deleteJob);

// --- Quotes Management ---
// router.get('/quotes', adminController.getAllQuotes); // TEMP DISABLED: Likely missing.
router.get('/quotes/:quoteId', adminController.getQuoteDetails);
router.put('/quotes/:quoteId/amount', adminController.updateQuoteAmount);
router.put('/quotes/:quoteId/status', adminController.updateQuoteStatus);
router.delete('/quotes/:quoteId', adminController.deleteQuote);

// --- Messages Management ---
// router.get('/messages', adminController.getAllMessages); // TEMP DISABLED: Likely missing.
router.post('/messages/reply/:messageId', adminController.replyToMessage);
router.delete('/messages/:messageId', adminController.deleteMessage);

// --- Subscription Management ---
router.get('/subscriptions', adminController.getUserSubscriptions);
router.get('/subscription-plans', adminController.getSubscriptionPlans);
router.post('/subscription-plans', adminController.createSubscriptionPlan);
router.put('/subscription-plans/:planId', adminController.updateSubscriptionPlan);
// router.delete('/subscription-plans/:planId', adminController.deleteSubscriptionPlan); // TEMP DISABLED: Likely missing.

// --- Estimation Management ---
router.get('/estimations', adminController.getAllEstimations);
router.post(
    '/estimations/:estimationId/upload-result', 
    multerUpload.single('resultFile'),
    uploadToFirebase,
    adminController.uploadEstimationResult
);
router.put('/estimations/:estimationId/status', adminController.updateEstimationStatus);
router.delete('/estimations/:estimationId', adminController.deleteEstimation);

export default router;
