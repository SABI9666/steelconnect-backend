// src/routes/admin.js
import express from 'express';
// FIX: Added .js extension to the import path for authMiddleware
import { isAdmin } from '../middleware/authMiddleware.js'; 
// FIX: Added .js extension to the import path for the controller
import {
    getDashboardStats,
    getAllUsers,
    updateUserStatus,
    deleteUser,
    getSystemStats
} from '../controllers/adminController.js';

const router = express.Router();

// --- Protected Admin Routes ---
// All routes in this file are protected by the isAdmin middleware.

router.get('/dashboard', isAdmin, getDashboardStats);
router.get('/users', isAdmin, getAllUsers);
router.put('/users/:userId/status', isAdmin, updateUserStatus);
router.delete('/users/:userId', isAdmin, deleteUser);
router.get('/system-stats', isAdmin, getSystemStats);

export default router;
