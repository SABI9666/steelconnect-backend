import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js';

// Import all the controller functions
import {
    getDashboardStats,
    getAllUsers,
    deleteUser,
    getSystemStats,
    getAllQuotes,
    getAllJobs,
    getAllMessages,
    getAllSubscriptions
} from '../controllers/adminController.js';

const router = express.Router();

// This security check applies to all routes in this file
router.use(isAdmin);


// --- API ROUTES ---

// Dashboard & System
router.get('/dashboard', getDashboardStats);
router.get('/system-stats', getSystemStats);

// Users
router.get('/users', getAllUsers);
router.delete('/users/:userId', deleteUser);

// Quotes, Jobs, Messages, Subscriptions
router.get('/quotes', getAllQuotes);
router.get('/jobs', getAllJobs);
router.get('/messages', getAllMessages);
router.get('/subscriptions', getAllSubscriptions);


export default router;
