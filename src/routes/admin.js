import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';

// Import all the controller functions
import {
    getDashboardStats,
    getAllUsers,
    updateUserStatus,
    deleteUser,
    getSystemStats,
    getAllQuotes,
    getAllJobs,
    getAllMessages,
    getAllSubscriptions
} from '../controllers/adminController.js';

const router = express.Router();

// Apply the 'isAdmin' security check to ALL routes in this file
router.use(isAdmin);


// --- DEFINE THE API ROUTES ---

// Dashboard & System
router.get('/dashboard', getDashboardStats);
router.get('/system-stats', getSystemStats);

// Users
router.get('/users', getAllUsers);
router.put('/users/:userId/status', updateUserStatus);
router.delete('/users/:userId', deleteUser);

// Quotes, Jobs, Messages, Subscriptions
router.get('/quotes', getAllQuotes);
router.get('/jobs', getAllJobs);
router.get('/messages', getAllMessages);
router.get('/subscriptions', getAllSubscriptions);


export default router;
