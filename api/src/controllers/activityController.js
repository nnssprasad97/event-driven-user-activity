'use strict';

const { v4: uuidv4 } = require('uuid');
const { publishActivity, isConnected } = require('../services/rabbitmq');

/**
 * Validates a single field and returns an error message if invalid.
 */
const validate = (body) => {
    const { userId, eventType, timestamp, payload } = body;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return 'Invalid or missing "userId". Must be a non-empty string.';
    }
    if (!eventType || typeof eventType !== 'string' || eventType.trim() === '') {
        return 'Invalid or missing "eventType". Must be a non-empty string.';
    }
    if (!timestamp) {
        return 'Missing "timestamp". Must be a valid ISO-8601 date string.';
    }
    if (isNaN(Date.parse(timestamp))) {
        return 'Invalid "timestamp". Must be a valid ISO-8601 date string (e.g., 2023-10-27T10:00:00Z).';
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return 'Invalid or missing "payload". Must be a JSON object (not an array).';
    }

    return null; // No error
};

/**
 * POST /api/v1/activities
 * Ingests a user activity event, validates it, and publishes it to RabbitMQ.
 */
const ingestActivity = async (req, res) => {
    // ── 1. Validate input ─────────────────────────────────────────────────────
    const validationError = validate(req.body);
    if (validationError) {
        return res.status(400).json({ error: 'Bad Request', message: validationError });
    }

    // ── 2. Check broker availability ──────────────────────────────────────────
    if (!isConnected()) {
        return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Message broker is temporarily unavailable. Try again shortly.',
        });
    }

    // ── 3. Build the canonical event object ───────────────────────────────────
    const { userId, eventType, timestamp, payload } = req.body;
    const eventId = uuidv4();

    const activityEvent = {
        id: eventId,
        userId: userId.trim(),
        eventType: eventType.trim(),
        timestamp,
        payload,
    };

    // ── 4. Publish to RabbitMQ ────────────────────────────────────────────────
    try {
        publishActivity(activityEvent);
        return res.status(202).json({
            message: 'Event successfully received and queued for processing.',
            eventId,
        });
    } catch (err) {
        console.error('[Controller] Failed to publish activity:', err.message);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to queue the event. Please try again later.',
        });
    }
};

module.exports = { ingestActivity };
