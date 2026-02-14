// src/routes/announcements.js - Public announcements endpoint for portal users
import express from 'express';
import { adminDb } from '../config/firebase.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// All announcements routes require authentication
router.use(authenticateToken);

// GET /api/announcements - Get active announcements for portal users
router.get('/', async (req, res) => {
    try {
        const now = new Date().toISOString();
        const userType = req.user.type || 'all';

        // Fetch all announcements and filter in memory to avoid composite index requirement
        const snapshot = await adminDb.collection('announcements').get();

        const announcements = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Only active announcements
            if (data.status !== 'active') return;
            // Filter out expired announcements
            if (data.expiresAt && data.expiresAt < now) return;
            // Filter by target audience
            if (data.targetAudience && data.targetAudience !== 'all' && data.targetAudience !== userType) return;

            announcements.push({
                id: doc.id,
                title: data.title,
                content: data.content,
                type: data.type,
                priority: data.priority,
                createdAt: data.createdAt,
                createdByName: data.createdByName || 'Admin'
            });
        });

        // Sort by createdAt descending and limit to 20
        announcements.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        const limited = announcements.slice(0, 20);

        res.json({ success: true, data: limited });
    } catch (error) {
        console.error('[ANNOUNCEMENTS] Error fetching:', error);
        res.status(500).json({ success: false, message: 'Error fetching announcements' });
    }
});

export default router;
