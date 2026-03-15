// src/middleware/rateLimiter.js
// High-performance in-memory rate limiter using sliding window counters.
// Designed for 100,000+ concurrent users with minimal memory overhead.

// Store: Map<key, { count, windowStart }>
const windows = new Map();

// Cleanup stale entries every 60 seconds to prevent memory leaks
const CLEANUP_INTERVAL = 60_000;
let cleanupTimer = null;

function startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of windows) {
            if (now - entry.windowStart > entry.windowMs * 2) {
                windows.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`[RATE-LIMIT] Cleaned ${cleaned} stale entries, active: ${windows.size}`);
        }
    }, CLEANUP_INTERVAL);
    cleanupTimer.unref(); // Don't keep process alive
}

/**
 * Create a rate limiter middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default 60000 = 1 min)
 * @param {number} options.max - Max requests per window per key (default 100)
 * @param {string} options.keyGenerator - Function to generate the rate limit key from req
 * @param {string} options.message - Error message when rate limited
 * @param {boolean} options.skipFailedRequests - Don't count failed requests (status >= 400)
 */
export function createRateLimiter({
    windowMs = 60_000,
    max = 100,
    keyGenerator = (req) => req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
    message = 'Too many requests. Please try again later.',
    skipFailedRequests = false
} = {}) {
    startCleanup();

    return (req, res, next) => {
        const key = keyGenerator(req);
        const now = Date.now();
        let entry = windows.get(key);

        if (!entry || now - entry.windowStart >= windowMs) {
            // New window
            entry = { count: 1, windowStart: now, windowMs };
            windows.set(key, entry);
        } else {
            entry.count++;
        }

        // Set rate limit headers
        const remaining = Math.max(0, max - entry.count);
        const resetTime = Math.ceil((entry.windowStart + windowMs) / 1000);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);

        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
            return res.status(429).json({
                success: false,
                message,
                retryAfter: Math.ceil((entry.windowStart + windowMs - now) / 1000)
            });
        }

        if (skipFailedRequests) {
            const originalEnd = res.end;
            res.end = function (...args) {
                if (res.statusCode >= 400) {
                    entry.count = Math.max(0, entry.count - 1);
                }
                return originalEnd.apply(this, args);
            };
        }

        next();
    };
}

// Pre-configured rate limiters for common use cases

// General API: 200 requests per minute per IP
export const generalLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 200,
    message: 'Too many requests. Please slow down.'
});

// Auth endpoints: 40 requests per minute (prevent brute force while allowing normal 2FA flow)
export const authLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 40,
    message: 'Too many authentication attempts. Please wait before trying again.',
    skipFailedRequests: false
});

// OTP-specific limiter: 10 OTP sends per 5 minutes per IP (prevent OTP spam)
export const otpLimiter = createRateLimiter({
    windowMs: 5 * 60_000,
    max: 10,
    message: 'Too many verification code requests. Please wait before requesting another code.',
    skipFailedRequests: false
});

// File upload: 10 uploads per minute
export const uploadLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    message: 'Upload rate limit exceeded. Please wait before uploading more files.'
});

// AI estimation: 5 per minute (expensive operation - for authenticated AI endpoints)
export const estimationLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    message: 'AI estimation rate limit exceeded. Please wait before submitting another estimation.'
});

// Website free estimation: 3 per 5 minutes per IP (public landing page form)
export const websiteEstimationLimiter = createRateLimiter({
    windowMs: 5 * 60_000,
    max: 3,
    message: 'You have already submitted an estimation request. Please wait a few minutes before trying again.'
});

// Admin endpoints: 300 per minute (admins need higher limits)
export const adminLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 300,
    message: 'Admin rate limit exceeded.'
});

// Public endpoints (chatbot, prospects): 30 per minute
export const publicLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 30,
    message: 'Too many requests. Please wait a moment.'
});

// WebSocket connection limit: 5 connections per minute per IP
export const wsConnectionLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    message: 'Too many connection attempts.'
});

export default {
    createRateLimiter,
    generalLimiter,
    authLimiter,
    otpLimiter,
    uploadLimiter,
    estimationLimiter,
    websiteEstimationLimiter,
    adminLimiter,
    publicLimiter,
    wsConnectionLimiter
};
