import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import * as adminController from '../controllers/adminController.js';
// IMPORT: The new upload middleware
import { multerUpload, uploadToFirebase, handleUploadError } from '../middleware/upload.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(isAdmin);

// Dashboard & Analytics
router.get('/dashboard', adminController.getDashboardStats);
router.get('/stats/advanced', adminController.getAdvancedStats);
// Note: getSystemStats was in your code but might not exist in the controller
// router.get('/system', adminController.getSystemStats); 

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId/status', adminController.updateUserStatus);
// Note: deleteUser was in your code but might not exist in the controller
// router.delete('/users/:userId', adminController.deleteUser);

// Jobs Management
router.get('/jobs', adminController.getAllJobs);
router.put('/jobs/:jobId/status', adminController.updateJobStatus);
router.delete('/jobs/:jobId', adminController.deleteJob);

// Quotes Management
// Note: getAllQuotes was in your code but might not exist in the controller
// router.get('/quotes', adminController.getAllQuotes);
router.get('/quotes/:quoteId', adminController.getQuoteDetails);
router.put('/quotes/:quoteId/amount', adminController.updateQuoteAmount);
router.put('/quotes/:quoteId/status', adminController.updateQuoteStatus);
router.delete('/quotes/:quoteId', adminController.deleteQuote);

// Messages Management
// Note: getAllMessages was in your code but might not exist in the controller
// router.get('/messages', adminController.getAllMessages);
router.post('/messages/reply/:messageId', adminController.replyToMessage);
router.delete('/messages/:messageId', adminController.deleteMessage);

// Subscription Management
router.get('/subscriptions', adminController.getUserSubscriptions);
router.get('/subscription-plans', adminController.getSubscriptionPlans);
router.post('/subscription-plans', adminController.createSubscriptionPlan);
router.put('/subscription-plans/:planId', adminController.updateSubscriptionPlan);
// Note: deleteSubscriptionPlan was in your code but might not exist in the controller
// router.delete('/subscription-plans/:planId', adminController.deleteSubscriptionPlan);

// Estimation Management
router.get('/estimations', adminController.getAllEstimations);
// UPDATED: The route now uses the proper middleware chain for Firebase uploads
router.post(
    '/estimations/:estimationId/upload-result', 
    multerUpload.single('resultFile'), // 1. Multer processes the file into memory
    uploadToFirebase,                  // 2. This middleware uploads it to Firebase
    adminController.uploadEstimationResult, // 3. The controller saves the URL from req.file.publicUrl
    handleUploadError                  // 4. This handles any errors
);
router.put('/estimations/:estimationId/status', adminController.updateEstimationStatus);
router.delete('/estimations/:estimationId', adminController.deleteEstimation);

export default router;
