import express from 'express';
import {
  getDashboardStats,
  getAllUsers,
  getAllJobs,
  getAllQuotes,
  getAllMessages,
  createSubscription,
  uploadResultForContractor,
  adminLogin
} from '../controllers/admincontroller.js';
import { isAdmin } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js'; // Assuming you have this for file uploads

const router = express.Router();

// --- ADMIN AUTHENTICATION ---
// This route is public for logging in
router.post('/login', adminLogin);


// --- PROTECTED ADMIN ROUTES ---
// All routes below this point will require a valid admin token
router.use(isAdmin);

// Dashboard
router.get('/dashboard', getDashboardStats);

// User Management
router.get('/users', getAllUsers);

// Content Management
router.get('/jobs', getAllJobs);
router.get('/quotes', getAllQuotes);
router.get('/messages', getAllMessages);

// Feature Management
router.post('/subscriptions', createSubscription);

// For the "Result Upload" feature
router.post('/results', upload.single('resultFile'), uploadResultForContractor);


export default router;
