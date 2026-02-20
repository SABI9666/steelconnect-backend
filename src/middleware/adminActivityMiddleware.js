// src/middleware/adminActivityMiddleware.js
// Middleware that automatically logs all admin write-operations (POST/PUT/PATCH/DELETE).
// Placed on the admin router AFTER authentication, it captures every mutating request
// and writes a structured log entry via the adminActivityLogger service.

import { logAdminActivity } from '../services/adminActivityLogger.js';

// ─── Route → (category, action) mapping ─────────────────────────────────────
// Each key is a regex that is tested against "METHOD /relative-path".
// The value is a function(req, resBody) → { category, action, description }.
const ROUTE_MAP = [
    // ── User Management ─────────────────────────────────────────────────────
    {
        test: /^PATCH \/users\/([^/]+)\/status$/,
        resolve: (req, m) => ({
            category: 'User Management',
            action: req.body.isActive ? 'Activated User' : 'Deactivated User',
            description: `User ${m[1]} was ${req.body.isActive ? 'activated' : 'deactivated'}`
        })
    },
    {
        test: /^POST \/users\/([^/]+)\/send-reminder$/,
        resolve: (req, m) => ({
            category: 'User Management',
            action: 'Sent Profile Reminder',
            description: `Profile completion reminder sent to user ${m[1]}`
        })
    },
    {
        test: /^POST \/send-manual-invite$/,
        resolve: (req) => ({
            category: 'User Management',
            action: 'Sent Manual Invite',
            description: `Manual invite sent to ${req.body.email || 'unknown'} (${req.body.userType || 'contractor'})`
        })
    },
    {
        test: /^POST \/users\/block-user$/,
        resolve: (req) => ({
            category: 'User Management',
            action: req.body.blocked ? 'Blocked User' : 'Unblocked User',
            description: `User ${req.body.email || 'unknown'} was ${req.body.blocked ? 'blocked' : 'unblocked'}${req.body.reason ? ` — Reason: ${req.body.reason}` : ''}`
        })
    },

    // ── Profile Reviews ─────────────────────────────────────────────────────
    {
        test: /^POST \/profile-reviews\/([^/]+)\/approve$/,
        resolve: (req, m) => ({
            category: 'Profile Review',
            action: 'Approved Profile',
            description: `Profile review ${m[1]} approved${req.body.notes ? ` — Notes: ${req.body.notes}` : ''}`
        })
    },
    {
        test: /^POST \/profile-reviews\/([^/]+)\/reject$/,
        resolve: (req, m) => ({
            category: 'Profile Review',
            action: 'Rejected Profile',
            description: `Profile review ${m[1]} rejected — Reason: ${req.body.reason || 'No reason provided'}`
        })
    },

    // ── Estimations ─────────────────────────────────────────────────────────
    {
        test: /^POST \/estimations\/([^/]+)\/result$/,
        resolve: (req, m) => ({
            category: 'Estimation',
            action: 'Uploaded Estimation Result',
            description: `Estimation result uploaded for estimation ${m[1]}`
        })
    },
    {
        test: /^POST \/estimations\/([^/]+)\/send-ai-report$/,
        resolve: (req, m) => ({
            category: 'Estimation',
            action: 'Sent AI Report',
            description: `AI estimation report sent for estimation ${m[1]}`
        })
    },
    {
        test: /^POST \/estimations\/([^/]+)\/retry-ai$/,
        resolve: (req, m) => ({
            category: 'Estimation',
            action: 'Retried AI Estimation',
            description: `AI estimation retried for estimation ${m[1]}`
        })
    },
    {
        test: /^POST \/estimations\/([^/]+)\/accuracy-feedback$/,
        resolve: (req, m) => ({
            category: 'Estimation',
            action: 'Submitted Accuracy Feedback',
            description: `Accuracy feedback submitted for estimation ${m[1]}`
        })
    },
    {
        test: /^DELETE \/estimations\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Estimation',
            action: 'Deleted Estimation',
            description: `Estimation ${m[1]} deleted`
        })
    },

    // ── Support ─────────────────────────────────────────────────────────────
    {
        test: /^POST \/support-messages\/([^/]+)\/respond$/,
        resolve: (req, m) => ({
            category: 'Support',
            action: 'Responded to Ticket',
            description: `Admin responded to support ticket ${m[1]}`
        })
    },
    {
        test: /^PATCH \/support-messages\/([^/]+)\/status$/,
        resolve: (req, m) => ({
            category: 'Support',
            action: 'Changed Ticket Status',
            description: `Support ticket ${m[1]} status changed to ${req.body.status || req.body.ticketStatus || 'unknown'}`
        })
    },
    {
        test: /^POST \/support-messages\/([^/]+)\/internal-note$/,
        resolve: (req, m) => ({
            category: 'Support',
            action: 'Added Internal Note',
            description: `Internal note added to support ticket ${m[1]}`
        })
    },
    {
        test: /^DELETE \/support-messages\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Support',
            action: 'Deleted Support Ticket',
            description: `Support ticket ${m[1]} deleted`
        })
    },
    {
        test: /^POST \/support-messages\/([^/]+)\/assign$/,
        resolve: (req, m) => ({
            category: 'Support',
            action: 'Assigned Ticket',
            description: `Support ticket ${m[1]} assigned to ${req.body.assignee || 'unknown'}`
        })
    },
    {
        test: /^POST \/support-messages\/bulk-action$/,
        resolve: (req) => ({
            category: 'Support',
            action: 'Bulk Ticket Action',
            description: `Bulk action "${req.body.action || 'unknown'}" on ${(req.body.ticketIds || []).length} tickets`
        })
    },

    // ── Marketing ───────────────────────────────────────────────────────────
    {
        test: /^POST \/marketing\/send$/,
        resolve: (req) => ({
            category: 'Marketing',
            action: 'Sent Marketing Email',
            description: `Marketing email "${req.body.subject || ''}" sent to ${(req.body.recipients || []).length || 'unknown number of'} recipients`
        })
    },
    {
        test: /^POST \/prospects\/send-invite$/,
        resolve: (req) => ({
            category: 'Marketing',
            action: 'Sent Prospect Invite',
            description: `Invite sent to ${(req.body.emails || []).length || 1} prospect(s)`
        })
    },
    {
        test: /^DELETE \/prospects\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Marketing',
            action: 'Deleted Prospect',
            description: `Prospect ${m[1]} removed`
        })
    },

    // ── Business Analytics ──────────────────────────────────────────────────
    {
        test: /^POST \/business-analytics\/upload-report$/,
        resolve: (req) => ({
            category: 'Business Analytics',
            action: 'Uploaded Report',
            description: `Business analytics report uploaded for request ${req.body.requestId || 'unknown'}`
        })
    },
    {
        test: /^DELETE \/business-analytics\/request\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Business Analytics',
            action: 'Deleted Analytics Request',
            description: `Analytics request ${m[1]} deleted`
        })
    },

    // ── Jobs & Quotes ───────────────────────────────────────────────────────
    {
        test: /^DELETE \/jobs\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Jobs',
            action: 'Deleted Job',
            description: `Job ${m[1]} deleted`
        })
    },
    {
        test: /^DELETE \/quotes\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Quotes',
            action: 'Deleted Quote',
            description: `Quote ${m[1]} deleted`
        })
    },

    // ── System Admin ────────────────────────────────────────────────────────
    {
        test: /^DELETE \/system-admin\/data\/([^/]+)\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Deleted Document',
            description: `Document ${m[2]} deleted from collection "${m[1]}"`
        })
    },
    {
        test: /^POST \/system-admin\/bulk-delete\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Bulk Delete',
            description: `Bulk delete in collection "${m[1]}" — ${(req.body.docIds || []).length} documents`
        })
    },
    {
        test: /^POST \/system-admin\/restore\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Restored Document',
            description: `Document ${m[1]} restored from trash`
        })
    },
    {
        test: /^DELETE \/system-admin\/trash\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Permanently Deleted (Trash)',
            description: `Trash item ${m[1]} permanently deleted`
        })
    },
    {
        test: /^DELETE \/system-admin\/trash-empty$/,
        resolve: () => ({
            category: 'System Admin',
            action: 'Emptied Trash',
            description: 'All trash items permanently deleted'
        })
    },
    {
        test: /^POST \/system-admin\/hold\/([^/]+)\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Put on Hold',
            description: `Document ${m[2]} in "${m[1]}" placed on hold`
        })
    },
    {
        test: /^POST \/system-admin\/unhold\/([^/]+)\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Removed Hold',
            description: `Hold removed from document ${m[2]} in "${m[1]}"`
        })
    },
    {
        test: /^POST \/system-admin\/permanent-delete\/([^/]+)\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'System Admin',
            action: 'Permanent Delete',
            description: `Document ${m[2]} in "${m[1]}" permanently deleted`
        })
    },

    // ── Dashboards ──────────────────────────────────────────────────────────
    {
        test: /^POST \/dashboards\/upload$/,
        resolve: (req) => ({
            category: 'Dashboard',
            action: 'Uploaded Dashboard',
            description: `Dashboard spreadsheet uploaded: "${req.body.title || 'untitled'}"`
        })
    },
    {
        test: /^POST \/dashboards\/([^/]+)\/approve$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Approved Dashboard',
            description: `Dashboard ${m[1]} approved`
        })
    },
    {
        test: /^POST \/dashboards\/([^/]+)\/reject$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Rejected Dashboard',
            description: `Dashboard ${m[1]} rejected`
        })
    },
    {
        test: /^POST \/dashboards\/([^/]+)\/sync$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Synced Dashboard',
            description: `Dashboard ${m[1]} synced`
        })
    },
    {
        test: /^PUT \/dashboards\/([^/]+)\/sync-settings$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Updated Sync Settings',
            description: `Sync settings updated for dashboard ${m[1]}`
        })
    },
    {
        test: /^DELETE \/dashboards\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Deleted Dashboard',
            description: `Dashboard ${m[1]} deleted`
        })
    },
    {
        test: /^PUT \/dashboards\/([^/]+)\/chart$/,
        resolve: (req, m) => ({
            category: 'Dashboard',
            action: 'Updated Chart Config',
            description: `Chart configuration updated for dashboard ${m[1]}`
        })
    },

    // ── Community Posts ─────────────────────────────────────────────────────
    {
        test: /^POST \/community-posts\/([^/]+)\/approve$/,
        resolve: (req, m) => ({
            category: 'Community',
            action: 'Approved Post',
            description: `Community post ${m[1]} approved`
        })
    },
    {
        test: /^POST \/community-posts\/([^/]+)\/reject$/,
        resolve: (req, m) => ({
            category: 'Community',
            action: 'Rejected Post',
            description: `Community post ${m[1]} rejected${req.body.reason ? ` — Reason: ${req.body.reason}` : ''}`
        })
    },
    {
        test: /^DELETE \/community-posts\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Community',
            action: 'Deleted Post',
            description: `Community post ${m[1]} deleted`
        })
    },

    // ── Announcements ───────────────────────────────────────────────────────
    {
        test: /^POST \/announcements$/,
        resolve: (req) => ({
            category: 'Announcements',
            action: 'Created Announcement',
            description: `Announcement created: "${req.body.title || 'untitled'}"`
        })
    },
    {
        test: /^PUT \/announcements\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Announcements',
            action: 'Updated Announcement',
            description: `Announcement ${m[1]} updated`
        })
    },
    {
        test: /^DELETE \/announcements\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Announcements',
            action: 'Deleted Announcement',
            description: `Announcement ${m[1]} deleted`
        })
    },

    // ── Chatbot ─────────────────────────────────────────────────────────────
    {
        test: /^POST \/chatbot\/reply$/,
        resolve: (req) => ({
            category: 'Chatbot',
            action: 'Replied to Chatbot Report',
            description: `Admin replied to chatbot report ${req.body.reportId || 'unknown'}`
        })
    },

    // ── Bulk Email ──────────────────────────────────────────────────────────
    {
        test: /^POST \/bulk-email\/send$/,
        resolve: (req) => ({
            category: 'Bulk Email',
            action: 'Sent Bulk Email',
            description: `Bulk email "${req.body.subject || ''}" sent to ${(req.body.recipients || []).length} recipients`
        })
    },

    // ── Messages ────────────────────────────────────────────────────────────
    {
        test: /^PATCH \/messages\/([^/]+)\/read$/,
        resolve: (req, m) => ({
            category: 'Messaging',
            action: 'Marked Message Read',
            description: `Message ${m[1]} marked as read`
        })
    },
    {
        test: /^PATCH \/messages\/([^/]+)\/status$/,
        resolve: (req, m) => ({
            category: 'Messaging',
            action: 'Changed Message Status',
            description: `Message ${m[1]} status changed to ${req.body.status || 'unknown'}`
        })
    },
    {
        test: /^POST \/messages\/([^/]+)\/reply$/,
        resolve: (req, m) => ({
            category: 'Messaging',
            action: 'Replied to Message',
            description: `Admin replied to message ${m[1]}`
        })
    },
    {
        test: /^DELETE \/messages\/([^/]+)$/,
        resolve: (req, m) => ({
            category: 'Messaging',
            action: 'Deleted Message',
            description: `Message ${m[1]} deleted`
        })
    },

    // ── Operations Portal ───────────────────────────────────────────────────
    {
        test: /^POST \/operations-portal\/toggle$/,
        resolve: (req) => ({
            category: 'Operations Portal',
            action: req.body.enabled ? 'Enabled Operations Portal' : 'Disabled Operations Portal',
            description: `Operations portal ${req.body.enabled ? 'enabled' : 'disabled'}`
        })
    }
];

// ─── The Middleware ──────────────────────────────────────────────────────────

/**
 * Express middleware that logs admin write-operations.
 * Only logs POST / PUT / PATCH / DELETE (skips GET / OPTIONS / HEAD).
 * Uses `res.on('finish')` so logging happens AFTER the response is sent,
 * meaning it never slows down the actual request.
 */
export function adminActivityLoggerMiddleware(req, res, next) {
    const method = req.method.toUpperCase();

    // Only log mutating requests
    if (['GET', 'OPTIONS', 'HEAD'].includes(method)) {
        return next();
    }

    // Capture the original end so we can intercept the status code
    const originalEnd = res.end;
    let responseBody = '';

    res.end = function (chunk, encoding) {
        if (chunk) {
            responseBody = chunk.toString();
        }
        originalEnd.call(this, chunk, encoding);
    };

    res.on('finish', () => {
        // Only log successful requests (2xx)
        if (res.statusCode < 200 || res.statusCode >= 300) return;

        // Skip activity report endpoints to avoid recursive logging
        if (req.path.includes('activity-report') || req.path.includes('activity-logs')) return;

        const routeKey = `${method} ${req.route ? req.route.path : req.path}`;
        const actualPath = `${method} ${req.path}`;

        let logData = null;

        // Try each mapped route
        for (const mapping of ROUTE_MAP) {
            const match = actualPath.match(mapping.test);
            if (match) {
                logData = mapping.resolve(req, match);
                break;
            }
        }

        // Fallback: log any unmapped write operation generically
        if (!logData) {
            logData = {
                category: guessCategory(req.path),
                action: `${method} Operation`,
                description: `${method} ${req.path}`
            };
        }

        const adminEmail = req.user?.email || 'unknown';
        const adminName = req.user?.name || '';
        const clientIP = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';

        // Fire-and-forget — don't await
        logAdminActivity({
            adminEmail,
            adminName,
            category: logData.category,
            action: logData.action,
            description: logData.description,
            metadata: {
                params: req.params,
                statusCode: res.statusCode
            },
            method,
            endpoint: req.originalUrl || req.path,
            ip: clientIP
        }).catch(() => {});
    });

    next();
}

/**
 * Best-effort category guess from the URL path.
 */
function guessCategory(path) {
    if (path.includes('user')) return 'User Management';
    if (path.includes('profile-review')) return 'Profile Review';
    if (path.includes('estimation')) return 'Estimation';
    if (path.includes('support')) return 'Support';
    if (path.includes('marketing') || path.includes('prospect')) return 'Marketing';
    if (path.includes('community')) return 'Community';
    if (path.includes('announcement')) return 'Announcements';
    if (path.includes('business-analytics')) return 'Business Analytics';
    if (path.includes('system-admin')) return 'System Admin';
    if (path.includes('dashboard')) return 'Dashboard';
    if (path.includes('bulk-email')) return 'Bulk Email';
    if (path.includes('message') || path.includes('conversation')) return 'Messaging';
    if (path.includes('chatbot')) return 'Chatbot';
    if (path.includes('job')) return 'Jobs';
    if (path.includes('quote')) return 'Quotes';
    if (path.includes('operations-portal')) return 'Operations Portal';
    return 'Other';
}

export default adminActivityLoggerMiddleware;
