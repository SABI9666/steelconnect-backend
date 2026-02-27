// src/routes/voiceCalls.js - Voice Call Logs & History API
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { adminDb } from '../config/firebase.js';

const router = express.Router();

router.use(authenticateToken);

// Get call history for the current user
router.get('/history', async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const limit = parseInt(req.query.limit) || 50;

        // Fetch calls where user was either caller or callee
        // Note: Avoid combining .where() + .orderBy() on different fields
        // as it requires Firestore composite indexes. Sort in JS instead.
        const [callerSnap, calleeSnap] = await Promise.all([
            adminDb.collection('call_logs')
                .where('callerId', '==', userId)
                .limit(limit)
                .get(),
            adminDb.collection('call_logs')
                .where('calleeId', '==', userId)
                .limit(limit)
                .get()
        ]);

        const calls = [];
        callerSnap.forEach(doc => calls.push({ id: doc.id, ...doc.data() }));
        calleeSnap.forEach(doc => calls.push({ id: doc.id, ...doc.data() }));

        // Sort by startedAt descending and deduplicate
        const seen = new Set();
        const uniqueCalls = calls
            .filter(c => { if (seen.has(c.callId)) return false; seen.add(c.callId); return true; })
            .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
            .slice(0, limit);

        res.json({ success: true, data: uniqueCalls });
    } catch (error) {
        console.error('[VOICE-CALLS] Error fetching call history:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call history' });
    }
});

// Get call history for a specific conversation
router.get('/conversation/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.userId || req.user.id;

        const snapshot = await adminDb.collection('call_logs')
            .where('conversationId', '==', conversationId)
            .limit(20)
            .get();

        const calls = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.callerId === userId || data.calleeId === userId) {
                calls.push({ id: doc.id, ...data });
            }
        });

        // Sort by startedAt descending in JS to avoid needing composite index
        calls.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

        res.json({ success: true, data: calls });
    } catch (error) {
        console.error('[VOICE-CALLS] Error fetching conversation calls:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call history' });
    }
});

// Admin: Get all call logs
router.get('/admin/all', async (req, res) => {
    try {
        if (req.user.type !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const limit = parseInt(req.query.limit) || 100;
        const snapshot = await adminDb.collection('call_logs')
            .orderBy('startedAt', 'desc')
            .limit(limit)
            .get();

        const calls = [];
        snapshot.forEach(doc => calls.push({ id: doc.id, ...doc.data() }));

        // Compute stats
        const stats = {
            total: calls.length,
            completed: calls.filter(c => c.status === 'completed').length,
            missed: calls.filter(c => c.status === 'missed').length,
            rejected: calls.filter(c => c.status === 'rejected').length,
            cancelled: calls.filter(c => c.status === 'cancelled').length,
            disconnected: calls.filter(c => c.status === 'disconnected').length,
            totalDuration: calls.reduce((sum, c) => sum + (c.duration || 0), 0)
        };

        res.json({ success: true, data: calls, stats });
    } catch (error) {
        console.error('[VOICE-CALLS] Error fetching admin call logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call logs' });
    }
});

export default router;
