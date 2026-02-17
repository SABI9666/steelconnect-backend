// src/services/estimationCache.js
// In-memory cache for AI estimation results keyed by PDF content hash.
// Prevents re-processing the same documents and saves API costs.

import crypto from 'crypto';

// Cache config
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_CACHE_SIZE = 50; // Max cached estimates

// In-memory store: Map<hash, { result, timestamp, projectKey }>
const cache = new Map();

/**
 * Generate a deterministic hash from file buffers + project metadata.
 * Same files + same project params = same hash = cache hit.
 */
export function generateCacheKey(fileBuffers, projectInfo, answers) {
    const hash = crypto.createHash('sha256');

    // Hash file contents (sorted by name for determinism)
    if (fileBuffers && fileBuffers.length > 0) {
        const sorted = [...fileBuffers].sort((a, b) =>
            (a.originalname || '').localeCompare(b.originalname || '')
        );
        for (const file of sorted) {
            hash.update(file.originalname || '');
            hash.update(file.buffer);
        }
    }

    // Hash key project parameters that affect estimate output
    const projectKey = JSON.stringify({
        type: projectInfo?.projectType || '',
        area: projectInfo?.totalArea || '',
        region: projectInfo?.region || '',
        standard: projectInfo?.designStandard || ''
    });
    hash.update(projectKey);

    // Hash relevant questionnaire answers
    if (answers && typeof answers === 'object') {
        hash.update(JSON.stringify(answers));
    }

    return hash.digest('hex').substring(0, 16); // 16 char hex key
}

/**
 * Look up a cached estimation result.
 * Returns the cached result if found and not expired, null otherwise.
 */
export function getCachedEstimate(cacheKey) {
    const entry = cache.get(cacheKey);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(cacheKey);
        console.log(`[CACHE] Expired entry removed: ${cacheKey}`);
        return null;
    }

    console.log(`[CACHE] HIT for key ${cacheKey} (age: ${Math.round((Date.now() - entry.timestamp) / 1000)}s)`);
    return entry.result;
}

/**
 * Store an estimation result in cache.
 */
export function setCachedEstimate(cacheKey, result) {
    // Evict oldest entries if at capacity
    if (cache.size >= MAX_CACHE_SIZE) {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of cache) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            cache.delete(oldestKey);
            console.log(`[CACHE] Evicted oldest entry: ${oldestKey}`);
        }
    }

    cache.set(cacheKey, {
        result,
        timestamp: Date.now()
    });
    console.log(`[CACHE] STORED estimate for key ${cacheKey} (cache size: ${cache.size})`);
}

/**
 * Get cache statistics.
 */
export function getCacheStats() {
    let validCount = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const [, entry] of cache) {
        if (now - entry.timestamp > CACHE_TTL_MS) expiredCount++;
        else validCount++;
    }

    return {
        totalEntries: cache.size,
        validEntries: validCount,
        expiredEntries: expiredCount,
        maxSize: MAX_CACHE_SIZE,
        ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
    };
}

/**
 * Clear all cached entries.
 */
export function clearCache() {
    const size = cache.size;
    cache.clear();
    console.log(`[CACHE] Cleared ${size} entries`);
    return size;
}

export default { generateCacheKey, getCachedEstimate, setCachedEstimate, getCacheStats, clearCache };
