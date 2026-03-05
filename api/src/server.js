'use strict';

const express = require('express');
const activityRoutes = require('./routes/activityRoutes');
const rateLimiter = require('./middlewares/rateLimiter');
const { connectRabbitMQ } = require('./services/rabbitmq');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Trust proxy (required for correct IP detection inside Docker/behind Nginx)
app.set('trust proxy', 1);

// Body parsing middleware
app.use(express.json());

// ── Health check endpoint (used by Docker health check) ───────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ── Apply rate limiter only to /api/v1 routes ─────────────────────────────────
app.use('/api/v1', rateLimiter);

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/activities', activityRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ── Start the server ──────────────────────────────────────────────────────────
const startServer = async () => {
  // Initiate RabbitMQ connection (non-blocking, uses internal retry logic)
  connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`[API] Service listening on port ${PORT}`);
  });
};

startServer();

module.exports = app; // Export for testing
