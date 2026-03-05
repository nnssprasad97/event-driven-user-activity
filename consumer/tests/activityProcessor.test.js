'use strict';

/**
 * Consumer - Activity Processor Unit Tests
 * Tests the processMessage function in isolation by mocking Mongoose.
 */

// ── Mock Mongoose Activity model ──────────────────────────────────────────────
jest.mock('../src/models/activitySchema', () => ({
    findOneAndUpdate: jest.fn(),
}));

const Activity = require('../src/models/activitySchema');
const { processMessage } = require('../src/services/activityProcessor');

const VALID_EVENT = {
    id: 'evt-uuid-1234',
    userId: 'user-uuid-5678',
    eventType: 'page_view',
    timestamp: '2023-10-27T10:00:00.000Z',
    payload: { page: '/home' },
};

describe('processMessage()', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        Activity.findOneAndUpdate.mockResolvedValue({ ...VALID_EVENT });
    });

    // ── Successful processing ───────────────────────────────────────────────
    it('should return success=true for a valid event message', async () => {
        const content = Buffer.from(JSON.stringify(VALID_EVENT));
        const result = await processMessage(content);

        expect(result.success).toBe(true);
        expect(result.eventId).toBe(VALID_EVENT.id);
        expect(result.error).toBeNull();
        expect(Activity.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should call findOneAndUpdate with upsert:true and the correct filter', async () => {
        const content = Buffer.from(JSON.stringify(VALID_EVENT));
        await processMessage(content);

        const [filter, , options] = Activity.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ id: VALID_EVENT.id });
        expect(options.upsert).toBe(true);
    });

    // ── JSON parse errors ────────────────────────────────────────────────────
    it('should return success=false for invalid JSON', async () => {
        const content = Buffer.from('{ not json }');
        const result = await processMessage(content);

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toMatch(/JSON parse failed/i);
        expect(Activity.findOneAndUpdate).not.toHaveBeenCalled();
    });

    // ── Missing required field ────────────────────────────────────────────────
    it('should return success=false when required fields are missing', async () => {
        const { id, ...incomplete } = VALID_EVENT;
        const content = Buffer.from(JSON.stringify(incomplete));
        const result = await processMessage(content);

        expect(result.success).toBe(false);
        expect(result.error.message).toMatch(/missing required fields/i);
        expect(Activity.findOneAndUpdate).not.toHaveBeenCalled();
    });

    // ── Database error ─────────────────────────────────────────────────────────
    it('should return success=false on a database error', async () => {
        Activity.findOneAndUpdate.mockRejectedValueOnce(new Error('DB timeout'));
        const content = Buffer.from(JSON.stringify(VALID_EVENT));
        const result = await processMessage(content);

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('DB timeout');
    });

    // ── Idempotency: duplicate key ─────────────────────────────────────────────
    it('should treat duplicate key error (code 11000) as success', async () => {
        const dupKeyErr = Object.assign(new Error('Duplicate key'), { code: 11000 });
        Activity.findOneAndUpdate.mockRejectedValueOnce(dupKeyErr);

        const content = Buffer.from(JSON.stringify(VALID_EVENT));
        const result = await processMessage(content);

        expect(result.success).toBe(true);
        expect(result.eventId).toBe(VALID_EVENT.id);
    });
});
