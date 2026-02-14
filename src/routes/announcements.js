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
        const snapshot = await adminDb.collection('announcements')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        const announcements = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Filter out expired announcements
            if (data.expiresAt && data.expiresAt < now) return;
            // Filter by target audience
            const userType = req.user.type || 'all';
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

        res.json({ success: true, data: announcements });
    } catch (error) {
        console.error('[ANNOUNCEMENTS] Error fetching:', error);
        res.status(500).json({ success: false, message: 'Error fetching announcements' });
    }
});

export default router;
