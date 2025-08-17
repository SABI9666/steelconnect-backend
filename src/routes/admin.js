// src/routes/admin.js
import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js'; // Assuming middleware is in src/middleware
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

// GET /api/admin/dashboard - Fetches dashboard statistics
router.get('/dashboard', isAdmin, getDashboardStats);

// GET /api/admin/users - Retrieves all users
router.get('/users', isAdmin, getAllUsers);

// PUT /api/admin/users/:userId/status - Updates a user's status
router.put('/users/:userId/status', isAdmin, updateUserStatus);

// DELETE /api/admin/users/:userId - Deletes a user
router.delete('/users/:userId', isAdmin, deleteUser);

// GET /api/admin/system-stats - Gets server and process information
router.get('/system-stats', isAdmin, getSystemStats);

export default router;
