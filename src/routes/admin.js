import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';
import * as adminController from '../controllers/adminController.js';
import { multerUpload, uploadToFirebase } from '../middleware/fileUpload.js';

const router = express.Router();

// Apply admin middleware to all routes in this file
router.use(isAdmin);

// --- Dashboard & Analytics ---
router.get('/dashboard', adminController.getDashboardStats);
router.get('/stats/advanced', adminController.getAdvancedStats);
router.get('/system', adminController.getSystemStats);

// --- User Management ---
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.delete('/users/:userId', adminController.deleteUser);

// --- Jobs Management ---
router.get('/jobs', adminController.getAllJobs);
router.patch('/jobs/:jobId/status', adminController.updateJobStatus);
router.delete('/jobs/:jobId', adminController.deleteJob);

// --- Quotes Management ---
router.get('/quotes', adminController.getAllQuotes);
router.get('/quotes/:quoteId', adminController.getQuoteDetails);
router.patch('/quotes/:quoteId/amount', adminController.updateQuoteAmount);
router.patch('/quotes/:quoteId/status', adminController.updateQuoteStatus);
router.delete('/quotes/:quoteId', adminController.deleteQuote);

// --- Messages Management ---
router.get('/messages', adminController.getAllMessages);
router.get('/messages/:messageId', adminController.getMessageDetails);
router.post('/messages/:messageId/reply', adminController.replyToMessage);
router.patch('/messages/:messageId/status', adminController.updateMessageStatus);
router.delete('/messages/:messageId', adminController.deleteMessage);

// --- Subscription Management ---
router.get('/subscriptions', adminController.getUserSubscriptions);
router.get('/subscription-plans', adminController.getSubscriptionPlans);
router.post('/subscription-plans', adminController.createSubscriptionPlan);
router.patch('/subscription-plans/:planId', adminController.updateSubscriptionPlan);
router.delete('/subscription-plans/:planId', adminController.deleteSubscriptionPlan);
router.patch('/subscriptions/:subscriptionId/cancel', adminController.cancelSubscription);

// --- Estimation Management ---
router.get('/estimations', adminController.getAllEstimations);
router.get('/estimations/:estimationId', adminController.getEstimationDetails);
router.post(
    '/estimations/:estimationId/result', 
    multerUpload.single('resultFile'),
    uploadToFirebase,
    adminController.uploadEstimationResult
);
router.patch('/estimations/:estimationId/status', adminController.updateEstimationStatus);
router.delete('/estimations/:estimationId', adminController.deleteEstimation);

// --- File Downloads ---
router.get('/estimations/:estimationId/files/:fileName', async (req, res) => {
    try {
        const { estimationId, fileName } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        const estimationData = estimationDoc.data();
        const file = estimationData.uploadedFiles?.find(f => f.fileName === fileName);
        
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Redirect to the file URL or stream the file
        res.redirect(file.url);
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ success: false, message: 'Error downloading file' });
    }
});

router.get('/estimations/:estimationId/result', async (req, res) => {
    try {
        const { estimationId } = req.params;
        const estimationDoc = await adminDb.collection('estimations').doc(estimationId).get();
        
        if (!estimationDoc.exists) {
            return res.status(404).json({ success: false, message: 'Estimation not found' });
        }
        
        const estimationData = estimationDoc.data();
        
        if (!estimationData.resultFile) {
            return res.status(404).json({ success: false, message: 'Result file not found' });
        }
        
        // Redirect to the result file URL
        res.redirect(estimationData.resultFile.url);
    } catch (error) {
        console.error('Error downloading result file:', error);
        res.status(500).json({ success: false, message: 'Error downloading result file' });
    }
});

// --- Export Functions ---
router.get('/users/export', async (req, res) => {
    try {
        const usersSnapshot = await adminDb.collection('users').get();
        const users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Create CSV content
        const csvHeaders = 'ID,Name,Email,Type,Status,Created At,Last Active\n';
        const csvRows = users.map(user => 
            `${user.id},"${user.name || ''}","${user.email || ''}","${user.type || ''}","${user.status || ''}","${user.createdAt || ''}","${user.lastActive || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({ success: false, message: 'Error exporting users' });
    }
});

router.get('/quotes/export', async (req, res) => {
    try {
        const quotesSnapshot = await adminDb.collection('quotes').get();
        const quotes = quotesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const csvHeaders = 'ID,Client Name,Client Email,Project Title,Amount,Status,Created At\n';
        const csvRows = quotes.map(quote => 
            `${quote.id},"${quote.clientName || ''}","${quote.clientEmail || ''}","${quote.projectTitle || ''}","${quote.amount || ''}","${quote.status || ''}","${quote.createdAt || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=quotes_export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting quotes:', error);
        res.status(500).json({ success: false, message: 'Error exporting quotes' });
    }
});

router.get('/jobs/export', async (req, res) => {
    try {
        const jobsSnapshot = await adminDb.collection('jobs').get();
        const jobs = jobsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const csvHeaders = 'ID,Title,Employer Name,Category,Budget Min,Budget Max,Status,Created At\n';
        const csvRows = jobs.map(job => 
            `${job.id},"${job.title || ''}","${job.employerName || ''}","${job.category || ''}","${job.budgetMin || ''}","${job.budgetMax || ''}","${job.status || ''}","${job.createdAt || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=jobs_export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting jobs:', error);
        res.status(500).json({ success: false, message: 'Error exporting jobs' });
    }
});

router.get('/messages/export', async (req, res) => {
    try {
        const messagesSnapshot = await adminDb.collection('messages').get();
        const messages = messagesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const csvHeaders = 'ID,Sender Name,Sender Email,Subject,Status,Created At\n';
        const csvRows = messages.map(message => 
            `${message.id},"${message.senderName || ''}","${message.senderEmail || ''}","${message.subject || ''}","${message.status || ''}","${message.createdAt || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=messages_export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting messages:', error);
        res.status(500).json({ success: false, message: 'Error exporting messages' });
    }
});

router.get('/estimations/export', async (req, res) => {
    try {
        const estimationsSnapshot = await adminDb.collection('estimations').get();
        const estimations = estimationsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        const csvHeaders = 'ID,Project Title,Contractor Name,Status,Created At,Due Date,Completed At\n';
        const csvRows = estimations.map(estimation => 
            `${estimation.id},"${estimation.projectTitle || ''}","${estimation.contractorName || ''}","${estimation.status || ''}","${estimation.createdAt || ''}","${estimation.dueDate || ''}","${estimation.completedAt || ''}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=estimations_export.csv');
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting estimations:', error);
        res.status(500).json({ success: false, message: 'Error exporting estimations' });
    }
});

export default router;
