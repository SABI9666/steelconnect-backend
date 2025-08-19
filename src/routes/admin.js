import express from 'express';
import multer from 'multer';
import { isAdmin } from '../middleware/authMiddleware.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Apply admin middleware to all routes
router.use(isAdmin);

// Dashboard & Analytics
router.get('/dashboard', adminController.getDashboardStats);
router.get('/stats/advanced', adminController.getAdvancedStats);
router.get('/system', adminController.getSystemStats);

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.delete('/users/:userId', adminController.deleteUser);

// Jobs Management
router.get('/jobs', adminController.getAllJobs);
router.put('/jobs/:jobId/status', adminController.updateJobStatus);
router.delete('/jobs/:jobId', adminController.deleteJob);

// Quotes Management
router.get('/quotes', adminController.getAllQuotes);
router.get('/quotes/:quoteId', adminController.getQuoteDetails);
router.put('/quotes/:quoteId/amount', adminController.updateQuoteAmount);
router.put('/quotes/:quoteId/status', adminController.updateQuoteStatus);
router.delete('/quotes/:quoteId', adminController.deleteQuote);

// Messages Management
router.get('/messages', adminController.getAllMessages);
router.post('/messages/reply/:messageId', adminController.replyToMessage);
router.delete('/messages/:messageId', adminController.deleteMessage);

// Subscription Management
router.get('/subscriptions', adminController.getUserSubscriptions);
router.get('/subscription-plans', adminController.getSubscriptionPlans);
router.post('/subscription-plans', adminController.createSubscriptionPlan);
router.put('/subscription-plans/:planId', adminController.updateSubscriptionPlan);
router.delete('/subscription-plans/:planId', adminController.deleteSubscriptionPlan);

// NEW: Estimation Management
router.get('/estimations', adminController.getAllEstimations);
router.post('/estimations/:estimationId/upload-result', upload.single('resultFile'), adminController.uploadEstimationResult);
router.put('/estimations/:estimationId/status', adminController.updateEstimationStatus);
router.delete('/estimations/:estimationId', adminController.deleteEstimation);

export default router;
