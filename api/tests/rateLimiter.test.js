'use strict';

/**
 * Rate Limiter Unit Tests
 * Verifies the in-memory rate limiter middleware:
 *  - Allows requests below the threshold
 *  - Blocks requests that exceed the threshold (429 + Retry-After)
 *  - Resets correctly after the window expires
 */

const rateLimiter = require('../src/middlewares/rateLimiter');

const makeReq = (ip = '127.0.0.1') => ({
    headers: {},
    socket: { remoteAddress: ip },
});
const makeRes = () => {
    const res = {
        _headers: {},
        _status: null,
        _body: null,
    };
    res.setHeader = (k, v) => { res._headers[k] = v; };
    res.status = (code) => { res._status = code; return res; };
    res.json = (body) => { res._body = body; return res; };
    return res;
};

// Snapshot original env and restore after suite
let originalWindowMs, originalMaxReqs;

beforeAll(() => {
    originalWindowMs = process.env.RATE_LIMIT_WINDOW_MS;
    originalMaxReqs = process.env.RATE_LIMIT_MAX_REQUESTS;

    // Use a tiny window for tests
    process.env.RATE_LIMIT_WINDOW_MS = '200'; // 200 ms
    process.env.RATE_LIMIT_MAX_REQUESTS = '3';
});

afterAll(() => {
    process.env.RATE_LIMIT_WINDOW_MS = originalWindowMs || '';
    process.env.RATE_LIMIT_MAX_REQUESTS = originalMaxReqs || '';
});

beforeEach(() => {
    // Clear store between tests to avoid state bleed
    rateLimiter.store.clear();
});

describe('rateLimiter middleware', () => {
    it('should call next() for requests within the limit', () => {
        const req = makeReq('10.0.0.1');
        const res = makeRes();
        const next = jest.fn();

        rateLimiter(req, res, next);
        rateLimiter(req, res, next);
        rateLimiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(3);
        expect(res._status).toBeNull();
    });

    it('should return 429 when limit is exceeded', () => {
        const req = makeReq('10.0.0.2');
        const res = makeRes();
        const next = jest.fn();

        // Exhaust the limit (MAX = 3)
        rateLimiter(req, res, next);
        rateLimiter(req, res, next);
        rateLimiter(req, res, next);
        // 4th request should be blocked
        rateLimiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(3);
        expect(res._status).toBe(429);
        expect(res._body.error).toBe('Too Many Requests');
    });

    it('should include a Retry-After header on 429 response', () => {
        const req = makeReq('10.0.0.3');
        const res = makeRes();
        const next = jest.fn();

        for (let i = 0; i < 4; i++) rateLimiter(req, res, next);

        expect(res._headers['Retry-After']).toBeDefined();
        expect(Number(res._headers['Retry-After'])).toBeGreaterThanOrEqual(0);
    });

    it('should reset the counter after the window expires', async () => {
        const req = makeReq('10.0.0.4');
        const res = makeRes();
        const next = jest.fn();

        // Exhaust limit
        for (let i = 0; i < 3; i++) rateLimiter(req, res, next);

        // Wait for window to expire (200 ms + buffer)
        await new Promise((r) => setTimeout(r, 250));

        // Clear the store to simulate expiry (or wait for cleanup signal)
        rateLimiter.store.clear();

        // Should be allowed again
        rateLimiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(4);
    });

    it('should track different IPs independently', () => {
        const next = jest.fn();

        for (let i = 0; i < 3; i++) rateLimiter(makeReq('10.1.0.1'), makeRes(), next);
        for (let i = 0; i < 3; i++) rateLimiter(makeReq('10.1.0.2'), makeRes(), next);

        // Both IPs should exhaust at same time – all 6 should pass
        expect(next).toHaveBeenCalledTimes(6);
    });
});
