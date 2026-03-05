'use strict';

/**
 * IP-based Rate Limiter Middleware
 * Implements a fixed-window counter: 50 requests per 60 seconds per unique IP.
 * Uses an in-memory Map – no Redis required for this implementation.
 */

// Map<ip: string, { count: number, resetTime: number }>
const rateLimitStore = new Map();

// Read env vars dynamically so tests can override them at runtime
const getWindowMs = () => parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000;
const getMaxRequests = () => parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 50;

const rateLimiter = (req, res, next) => {
    // Read limits dynamically to allow test overrides
    const WINDOW_MS = getWindowMs();
    const MAX_REQUESTS = getMaxRequests();

    // Prefer the real IP forwarded by a proxy/load-balancer
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now();

    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetTime) {
        // No record yet OR the window has expired – start a fresh window
        rateLimitStore.set(ip, { count: 1, resetTime: now + WINDOW_MS });
        return next();
    }

    if (record.count >= MAX_REQUESTS) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter);
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            retryAfter,
        });
    }

    // Increment and continue
    record.count += 1;
    return next();
};

/**
 * Periodic cleanup: remove expired entries to prevent memory leaks.
 * Runs every 5 minutes.
 */
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
            rateLimitStore.delete(ip);
        }
    }
}, 5 * 60_000);

// Allow Jest to terminate without hanging on the interval
if (process.env.NODE_ENV === 'test') {
    cleanupInterval.unref();
}

// Expose the store for testing purposes
rateLimiter.store = rateLimitStore;

module.exports = rateLimiter;
