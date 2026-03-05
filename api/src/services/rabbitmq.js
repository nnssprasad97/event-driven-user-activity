'use strict';

const amqp = require('amqplib');

const QUEUE_NAME = 'user_activities';
let channel = null;
let isConnecting = false;

/**
 * Connects to RabbitMQ with exponential back-off retry logic.
 * Asserts the durable queue so it survives broker restarts.
 */
const connectRabbitMQ = async (retries = 10, delay = 3000) => {
    if (isConnecting) return;
    isConnecting = true;

    const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const connection = await amqp.connect(url);
            channel = await connection.createChannel();

            // Durable queue survives RabbitMQ restarts
            await channel.assertQueue(QUEUE_NAME, { durable: true });

            console.log('[RabbitMQ] Connected and queue asserted.');

            // Handle unexpected disconnections
            connection.on('error', (err) => {
                console.error('[RabbitMQ] Connection error:', err.message);
                channel = null;
                isConnecting = false;
                setTimeout(() => connectRabbitMQ(), 5000);
            });

            connection.on('close', () => {
                console.warn('[RabbitMQ] Connection closed. Reconnecting…');
                channel = null;
                isConnecting = false;
                setTimeout(() => connectRabbitMQ(), 5000);
            });

            isConnecting = false;
            return;
        } catch (err) {
            console.error(`[RabbitMQ] Attempt ${attempt}/${retries} failed: ${err.message}`);
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }

    console.error('[RabbitMQ] All connection attempts exhausted.');
    isConnecting = false;
};

/**
 * Publishes a serialised activity event to the queue.
 * Messages are marked persistent so they survive broker restarts.
 *
 * @param {object} activity - The validated activity event object.
 * @returns {boolean} True if successfully queued.
 */
const publishActivity = (activity) => {
    if (!channel) {
        throw new Error('[RabbitMQ] Channel not available. Message not sent.');
    }

    const messageBuffer = Buffer.from(JSON.stringify(activity));
    return channel.sendToQueue(QUEUE_NAME, messageBuffer, { persistent: true });
};

/**
 * Returns whether the channel is currently available.
 */
const isConnected = () => channel !== null;

module.exports = { connectRabbitMQ, publishActivity, isConnected };
