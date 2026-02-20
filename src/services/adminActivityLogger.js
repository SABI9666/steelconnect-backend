// src/services/adminActivityLogger.js - Tracks all admin actions in Firestore
import { adminDb } from '../config/firebase.js';

const COLLECTION = 'admin_activity_logs';

/**
 * Log an admin activity to Firestore.
 *
 * @param {Object} opts
 * @param {string} opts.adminEmail   - Email of the admin performing the action
 * @param {string} opts.adminName    - Name of the admin (optional)
 * @param {string} opts.category     - Activity category (e.g. "User Management", "Profile Review", "Estimation", etc.)
 * @param {string} opts.action       - Short action label (e.g. "Approved Profile", "Blocked User")
 * @param {string} opts.description  - Human-readable description of what happened
 * @param {Object} opts.metadata     - Any extra data (userId affected, reviewId, etc.)
 * @param {string} opts.method       - HTTP method (GET/POST/PUT/DELETE/PATCH)
 * @param {string} opts.endpoint     - The route that was hit
 * @param {string} opts.ip           - Client IP address
 */
export async function logAdminActivity({
    adminEmail,
    adminName = '',
    category,
    action,
    description,
    metadata = {},
    method = '',
    endpoint = '',
    ip = ''
}) {
    try {
        const logEntry = {
            adminEmail,
            adminName,
            category,
            action,
            description,
            metadata,
            method,
            endpoint,
            ip,
            timestamp: new Date().toISOString(),
            createdAt: new Date()
        };

        await adminDb.collection(COLLECTION).add(logEntry);
        console.log(`[ACTIVITY-LOG] ${adminEmail} — ${action}: ${description}`);
    } catch (error) {
        // Never let logging failures break the main flow
        console.error('[ACTIVITY-LOG] Failed to write activity log:', error.message);
    }
}

/**
 * Fetch activity logs for the last N hours (default: 1 hour).
 *
 * @param {number} hours - How many hours back to look (default 1)
 * @returns {Array} Array of activity log objects, sorted newest-first
 */
export async function getRecentActivities(hours = 1) {
    try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('timestamp', '>=', since.toISOString())
            .orderBy('timestamp', 'desc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('[ACTIVITY-LOG] Failed to fetch recent activities:', error.message);
        return [];
    }
}

/**
 * Fetch activity logs between two dates.
 */
export async function getActivitiesBetween(startDate, endDate) {
    try {
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('timestamp', '>=', startDate.toISOString())
            .where('timestamp', '<=', endDate.toISOString())
            .orderBy('timestamp', 'desc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('[ACTIVITY-LOG] Failed to fetch activities between dates:', error.message);
        return [];
    }
}

export default { logAdminActivity, getRecentActivities, getActivitiesBetween };
