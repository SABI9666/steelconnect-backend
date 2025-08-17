// src/routes/admin.js
import express from 'express';
import { isAdmin } from '../middleware/authMiddleware.js'; 
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

// 📊 Dashboard and Analytics
router.get('/dashboard', isAdmin, getDashboardStats);
router.get('/system-stats', isAdmin, getSystemStats);

// 👥 User Management
router.get('/users', isAdmin, getAllUsers);
router.put('/users/:userId/status', isAdmin, updateUserStatus);
router.delete('/users/:userId', isAdmin, deleteUser);

// 💼 Job Management (if you need these routes)
router.get('/jobs', isAdmin, async (req, res) => {
  try {
    // Implementation for getting all jobs
    // This can be moved to a separate controller if needed
    res.json({ success: true, message: "Jobs endpoint - implement in controller" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching jobs" });
  }
});

// 📊 Quote Management
router.get('/quotes', isAdmin, async (req, res) => {
  try {
    // Implementation for getting all quotes
    res.json({ success: true, message: "Quotes endpoint - implement in controller" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching quotes" });
  }
});

// 💬 Message Management
router.get('/messages', isAdmin, async (req, res) => {
  try {
    // Implementation for getting all messages
    res.json({ success: true, message: "Messages endpoint - implement in controller" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching messages" });
  }
});

export default router;
