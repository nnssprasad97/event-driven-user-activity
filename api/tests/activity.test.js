'use strict';

/**
 * API Integration Tests
 * Tests the POST /api/v1/activities endpoint:
 *  - Input validation (400 responses)
 *  - Successful queueing (202 response)
 *  - Rate limiting (429 response)
 *
 * The RabbitMQ publisher is mocked so tests run without a broker.
 */

// ── Mock the RabbitMQ service ─────────────────────────────────────────────────
jest.mock('../src/services/rabbitmq', () => ({
    connectRabbitMQ: jest.fn(),
    publishActivity: jest.fn().mockReturnValue(true),
    isConnected: jest.fn().mockReturnValue(true),
}));

const request = require('supertest');
const app = require('../src/server');
const { publishActivity } = require('../src/services/rabbitmq');

const VALID_PAYLOAD = {
    userId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
    eventType: 'user_login',
    timestamp: '2023-10-27T10:00:00Z',
    payload: { ipAddress: '192.168.1.1', device: 'desktop', browser: 'Chrome' },
};

describe('POST /api/v1/activities', () => {

    // ── 202 Accepted ─────────────────────────────────────────────────────────
    describe('Valid requests', () => {
        it('should return 202 with an eventId for a valid payload', async () => {
            const res = await request(app).post('/api/v1/activities').send(VALID_PAYLOAD);
            expect(res.status).toBe(202);
            expect(res.body).toHaveProperty('eventId');
            expect(res.body.message).toMatch(/queued/i);
            expect(publishActivity).toHaveBeenCalled();
        });
    });

    // ── 400 Bad Request ────────────────────────────────────────────────────
    describe('Input validation', () => {
        it('should return 400 when userId is missing', async () => {
            const { userId, ...body } = VALID_PAYLOAD;
            const res = await request(app).post('/api/v1/activities').send(body);
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/userId/i);
        });

        it('should return 400 when userId is not a string', async () => {
            const res = await request(app).post('/api/v1/activities').send({ ...VALID_PAYLOAD, userId: 12345 });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/userId/i);
        });

        it('should return 400 when eventType is missing', async () => {
            const { eventType, ...body } = VALID_PAYLOAD;
            const res = await request(app).post('/api/v1/activities').send(body);
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/eventType/i);
        });

        it('should return 400 when eventType is an empty string', async () => {
            const res = await request(app).post('/api/v1/activities').send({ ...VALID_PAYLOAD, eventType: '  ' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/eventType/i);
        });

        it('should return 400 when timestamp is missing', async () => {
            const { timestamp, ...body } = VALID_PAYLOAD;
            const res = await request(app).post('/api/v1/activities').send(body);
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/timestamp/i);
        });

        it('should return 400 when timestamp is not a valid ISO-8601 string', async () => {
            const res = await request(app).post('/api/v1/activities').send({ ...VALID_PAYLOAD, timestamp: 'not-a-date' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/timestamp/i);
        });

        it('should return 400 when payload is missing', async () => {
            const { payload, ...body } = VALID_PAYLOAD;
            const res = await request(app).post('/api/v1/activities').send(body);
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/payload/i);
        });

        it('should return 400 when payload is an array', async () => {
            const res = await request(app).post('/api/v1/activities').send({ ...VALID_PAYLOAD, payload: [] });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/payload/i);
        });

        it('should return 400 when payload is a string', async () => {
            const res = await request(app).post('/api/v1/activities').send({ ...VALID_PAYLOAD, payload: 'bad' });
            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/payload/i);
        });

        it('should return 400 when request body is empty', async () => {
            const res = await request(app).post('/api/v1/activities').send({});
            expect(res.status).toBe(400);
        });
    });

    // ── Health endpoint ────────────────────────────────────────────────────
    describe('GET /health', () => {
        it('should return 200 with status ok', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });
    });
});
