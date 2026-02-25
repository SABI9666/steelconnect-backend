// src/services/userActivityLogger.js
// Tracks ALL user activities (registrations, logins, profile completions, job posts,
// quote submissions, estimations, messages) and sends real-time admin notifications
// with visitor analytics summary.

import { adminDb } from '../config/firebase.js';
import { sendComprehensiveActivityAlert } from './adminActivityReportService.js';

const COLLECTION = 'user_activity_logs';

/**
 * Log a user activity and send real-time admin notification with visitor stats.
 *
 * @param {Object} opts
 * @param {string} opts.userEmail   - Email of the user
 * @param {string} opts.userName    - Name of the user
 * @param {string} opts.userId      - Firestore user ID
 * @param {string} opts.userType    - User type (designer/contractor/admin)
 * @param {string} opts.category    - Activity category
 * @param {string} opts.action      - Short action label
 * @param {string} opts.description - Human-readable description
 * @param {Object} opts.metadata    - Extra data
 * @param {string} opts.ip          - Client IP address
 */
export async function logUserActivity({
    userEmail,
    userName = '',
    userId = '',
    userType = '',
    category,
    action,
    description,
    metadata = {},
    ip = ''
}) {
    try {
        const logEntry = {
            userEmail,
            userName,
            userId,
            userType,
            category,
            action,
            description,
            metadata,
            ip,
            timestamp: new Date().toISOString(),
            createdAt: new Date()
        };

        await adminDb.collection(COLLECTION).add(logEntry);
        console.log(`[USER-ACTIVITY] ${userEmail} — ${action}: ${description}`);

        // Fetch quick visitor stats and send comprehensive alert (fire-and-forget)
        sendComprehensiveActivityAlert(logEntry, 'user').catch(err => {
            console.error('[USER-ACTIVITY] Alert failed (non-blocking):', err.message);
        });
    } catch (error) {
        console.error('[USER-ACTIVITY] Failed to write activity log:', error.message);
    }
}

/**
 * Fetch user activity logs for the last N hours.
 */
export async function getRecentUserActivities(hours = 24) {
    try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('timestamp', '>=', since.toISOString())
            .orderBy('timestamp', 'desc')
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('[USER-ACTIVITY] Failed to fetch recent activities:', error.message);
        return [];
    }
}

/**
 * Get quick visitor analytics summary for the report.
 */
export async function getVisitorAnalyticsSummary() {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        // Get today's visitors
        const todaySnap = await adminDb.collection('visitor_sessions')
            .where('startedAt', '>=', today)
            .orderBy('startedAt', 'desc')
            .get();

        // Get active visitors (last 5 min)
        const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
        let activeNow = 0;
        const todayVisitors = [];
        const devices = { Desktop: 0, Mobile: 0, Tablet: 0 };
        const browsers = {};
        const countries = {};
        let totalTime = 0;
        let identifiedCount = 0;

        todaySnap.forEach(doc => {
            const v = doc.data();
            todayVisitors.push(v);
            if (v.isActive && new Date(v.lastActiveAt) > fiveMinAgo) activeNow++;
            devices[v.deviceType] = (devices[v.deviceType] || 0) + 1;
            if (v.browser) browsers[v.browser] = (browsers[v.browser] || 0) + 1;
            if (v.location?.country) countries[v.location.country] = (countries[v.location.country] || 0) + 1;
            totalTime += (v.totalTimeSeconds || 0);
            if (v.userEmail || v.contactEmail) identifiedCount++;
        });

        // Get last 24h total
        const last24hSnap = await adminDb.collection('visitor_sessions')
            .where('startedAt', '>=', last24h)
            .orderBy('startedAt', 'desc')
            .get();

        // Recent visitor details (last 5)
        const recentVisitors = [];
        todaySnap.docs.slice(0, 5).forEach(doc => {
            const v = doc.data();
            recentVisitors.push({
                email: v.userEmail || v.contactEmail || 'Anonymous',
                device: v.deviceType || 'Unknown',
                browser: v.browser || 'Unknown',
                country: v.location?.country || 'Unknown',
                city: v.location?.city || '',
                time: v.startedAt,
                timeSpent: v.totalTimeSeconds || 0,
                pages: (v.pagesViewed || []).length
            });
        });

        return {
            todayTotal: todayVisitors.length,
            last24hTotal: last24hSnap.size,
            activeNow,
            avgTimeSeconds: todayVisitors.length > 0 ? Math.round(totalTime / todayVisitors.length) : 0,
            identifiedVisitors: identifiedCount,
            devices,
            topBrowsers: Object.entries(browsers).sort((a, b) => b[1] - a[1]).slice(0, 5),
            topCountries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5),
            recentVisitors
        };
    } catch (error) {
        console.error('[USER-ACTIVITY] Visitor summary failed:', error.message);
        return {
            todayTotal: 0, last24hTotal: 0, activeNow: 0,
            avgTimeSeconds: 0, identifiedVisitors: 0,
            devices: {}, topBrowsers: [], topCountries: [],
            recentVisitors: []
        };
    }
}

export default { logUserActivity, getRecentUserActivities, getVisitorAnalyticsSummary };
