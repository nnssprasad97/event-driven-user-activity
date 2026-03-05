'use strict';

const Activity = require('../models/activitySchema');

/**
 * Parses a raw RabbitMQ message buffer and attempts to persist it.
 * Uses findOneAndUpdate with `$setOnInsert` + `upsert: true` for idempotency:
 * if the exact same event is redelivered (after a nack), it won't be saved
 * twice because the unique `id` field will prevent the insert.
 *
 * @param {Buffer} content - The raw message content from RabbitMQ.
 * @returns {Promise<{ success: boolean, eventId: string|null, error: Error|null }>}
 */
const processMessage = async (content) => {
    let eventData;

    // ── 1. Parse JSON safely ──────────────────────────────────────────────────
    try {
        eventData = JSON.parse(content.toString());
    } catch (parseErr) {
        return { success: false, eventId: null, error: new Error(`JSON parse failed: ${parseErr.message}`) };
    }

    // ── 2. Validate minimum required fields ───────────────────────────────────
    if (!eventData.id || !eventData.userId || !eventData.eventType || !eventData.timestamp) {
        return {
            success: false,
            eventId: eventData.id || null,
            error: new Error('Malformed event: missing required fields (id, userId, eventType, timestamp).'),
        };
    }

    // ── 3. Upsert to MongoDB ───────────────────────────────────────────────────
    try {
        await Activity.findOneAndUpdate(
            { id: eventData.id },
            {
                $setOnInsert: {
                    id: eventData.id,
                    userId: eventData.userId,
                    eventType: eventData.eventType,
                    timestamp: new Date(eventData.timestamp),
                    processedAt: new Date(),
                    payload: eventData.payload || {},
                },
            },
            { upsert: true, new: true }
        );

        return { success: true, eventId: eventData.id, error: null };
    } catch (dbErr) {
        // Duplicate key error (code 11000) means already saved – treat as success
        if (dbErr.code === 11000) {
            console.warn(`[Processor] Duplicate event skipped: ${eventData.id}`);
            return { success: true, eventId: eventData.id, error: null };
        }
        return { success: false, eventId: eventData.id, error: dbErr };
    }
};

module.exports = { processMessage };
