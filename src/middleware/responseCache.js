// src/middleware/responseCache.js
// High-performance in-memory response cache for frequently accessed endpoints.
// Reduces Firestore reads by caching GET responses.
// Designed for 100,000+ concurrent users.

const cache = new Map();
const STATS = { hits: 0, misses: 0, sets: 0, evictions: 0 };

// Max cache entries to prevent unbounded memory growth
const MAX_ENTRIES = 500;

// Cleanup expired entries periodically
const CLEANUP_INTERVAL = 30_000; // 30 seconds
let cleanupHandle = null;

function startCleanup() {
    if (cleanupHandle) return;
    cleanupHandle = setInterval(() => {
        const now = Date.now();
        let expired = 0;
        for (const [key, entry] of cache) {
            if (now >= entry.expiresAt) {
                cache.delete(key);
                expired++;
            }
        }
        if (expired > 0) {
            console.log(`[CACHE] Cleaned ${expired} expired entries, active: ${cache.size}`);
        }
    }, CLEANUP_INTERVAL);
    cleanupHandle.unref();
}

function evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
        if (entry.createdAt < oldestTime) {
            oldestTime = entry.createdAt;
            oldestKey = key;
        }
    }
    if (oldestKey) {
        cache.delete(oldestKey);
        STATS.evictions++;
    }
}

/**
 * Create a response caching middleware for GET requests.
 * @param {number} ttlSeconds - Cache TTL in seconds (default 30)
 * @param {Function} keyGenerator - Custom cache key generator (default: URL + auth user)
 */
export function cacheResponse(ttlSeconds = 30, keyGenerator = null) {
    startCleanup();

    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') return next();

        const key = keyGenerator
            ? keyGenerator(req)
            : `${req.originalUrl}::${req.user?.id || 'anon'}`;

        const cached = cache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            STATS.hits++;
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Age', Math.floor((Date.now() - cached.createdAt) / 1000));
            return res.status(cached.statusCode).json(cached.data);
        }

        STATS.misses++;

        // Intercept res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (data) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                if (cache.size >= MAX_ENTRIES) {
                    evictOldest();
                }
                cache.set(key, {
                    data,
                    statusCode: res.statusCode,
                    createdAt: Date.now(),
                    expiresAt: Date.now() + (ttlSeconds * 1000)
                });
                STATS.sets++;
            }
            res.setHeader('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
}

/**
 * Invalidate cache entries matching a pattern.
 * Call this after mutations (POST/PUT/DELETE) to keep cache fresh.
 */
export function invalidateCache(pattern) {
    let invalidated = 0;
    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
            invalidated++;
        }
    }
    if (invalidated > 0) {
        console.log(`[CACHE] Invalidated ${invalidated} entries matching "${pattern}"`);
    }
    return invalidated;
}

/**
 * Clear all cache entries.
 */
export function clearResponseCache() {
    const size = cache.size;
    cache.clear();
    return size;
}

/**
 * Get cache statistics.
 */
export function getCacheStats() {
    return {
        ...STATS,
        size: cache.size,
        maxSize: MAX_ENTRIES,
        hitRate: STATS.hits + STATS.misses > 0
            ? ((STATS.hits / (STATS.hits + STATS.misses)) * 100).toFixed(1) + '%'
            : '0%'
    };
}

/**
 * Middleware that invalidates cache patterns on mutating requests.
 * Attach to routes so that POST/PUT/DELETE automatically bust relevant caches.
 */
export function autoCacheInvalidation(patterns) {
    return (req, res, next) => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const originalJson = res.json.bind(res);
            res.json = (data) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    for (const pattern of patterns) {
                        invalidateCache(pattern);
                    }
                }
                return originalJson(data);
            };
        }
        next();
    };
}

export default {
    cacheResponse,
    invalidateCache,
    clearResponseCache,
    getCacheStats,
    autoCacheInvalidation
};
