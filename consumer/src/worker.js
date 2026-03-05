'use strict';

const amqp = require('amqplib');
const mongoose = require('mongoose');
const { processMessage } = require('./services/activityProcessor');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const DATABASE_URL = process.env.DATABASE_URL || 'mongodb://user:password@localhost:27017/activity_db?authSource=admin';
const QUEUE_NAME = 'user_activities';
const PREFETCH = 10; // Max unacknowledged messages per worker instance

// ── Database connection ───────────────────────────────────────────────────────
const connectDB = async (retries = 10, delay = 3000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await mongoose.connect(DATABASE_URL, { serverSelectionTimeoutMS: 5000 });
            console.log('[Worker] Connected to MongoDB');
            return;
        } catch (err) {
            console.error(`[Worker] MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
            if (attempt < retries) await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw new Error('[Worker] Could not connect to MongoDB after maximum retries');
};

// ── RabbitMQ consumer ──────────────────────────────────────────────────────────
const startWorker = async (retries = 10, delay = 5000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const connection = await amqp.connect(RABBITMQ_URL);
            const channel = await connection.createChannel();

            // Assert same durable queue as the publisher
            await channel.assertQueue(QUEUE_NAME, { durable: true });

            // Limit how many unacked messages this worker holds at once
            channel.prefetch(PREFETCH);

            console.log(`[Worker] Waiting for messages in "${QUEUE_NAME}"…`);

            channel.consume(QUEUE_NAME, async (msg) => {
                if (!msg) return; // Consumer cancelled by server

                try {
                    const result = await processMessage(msg.content);

                    if (result.success) {
                        console.log(`[Worker] ✓ Processed event: ${result.eventId}`);
                        channel.ack(msg); // ✅ Acknowledge ONLY on success
                    } else {
                        console.error(`[Worker] ✗ Processing failed (non-retriable): ${result.error.message}`);
                        // Malformed/parse errors – reject without requeue to avoid poison-pill loops
                        channel.nack(msg, false, false);
                    }
                } catch (unexpectedErr) {
                    // Transient / DB errors – requeue for another attempt
                    console.error('[Worker] Unexpected error, requeuing message:', unexpectedErr.message);
                    channel.nack(msg, false, true);
                }
            });

            // Handle connection-level errors
            connection.on('error', (err) => {
                console.error('[Worker] Connection error:', err.message);
                setTimeout(() => startWorker(), delay);
            });

            connection.on('close', () => {
                console.warn('[Worker] Connection closed. Reconnecting…');
                setTimeout(() => startWorker(), delay);
            });

            return; // Successfully started
        } catch (err) {
            console.error(`[Worker] RabbitMQ attempt ${attempt}/${retries} failed: ${err.message}`);
            if (attempt < retries) await new Promise((r) => setTimeout(r, delay));
        }
    }

    console.error('[Worker] Exhausted all RabbitMQ connection retries. Exiting.');
    process.exit(1);
};

// ── Entry point ───────────────────────────────────────────────────────────────
(async () => {
    try {
        await connectDB();
        await startWorker();
    } catch (err) {
        console.error('[Worker] Fatal startup error:', err.message);
        process.exit(1);
    }
})();
