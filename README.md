# Event-Driven User Activity Service

A production-grade, event-driven microservice for tracking user activities built with **Node.js**, **Express**, **RabbitMQ**, and **MongoDB** — fully containerised with Docker Compose.

---

## Architecture Overview

```
Client ──► API Service (Express) ──► RabbitMQ ──► Consumer Worker ──► MongoDB
              │                        (Queue)
              └── Rate Limiter (50 req/min per IP)
```

- **API Service**: Validates incoming events, applies IP-based rate limiting, and publishes messages to RabbitMQ.
- **RabbitMQ**: Durable message broker decoupling ingestion from processing.
- **Consumer Worker**: Pulls messages from the queue, persists them to MongoDB with idempotent upserts, and acks / nacks appropriately.
- **MongoDB**: Flexible document store for activity events.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Git (to clone the repo)

---

## Quick Start (One-Command Setup)

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd event-driven-user-activity

# 2. Start all services
docker-compose up --build -d

# 3. Check all containers are healthy
docker-compose ps
```

The API will be available at **http://localhost:3000**.  
The RabbitMQ Management UI will be at **http://localhost:15672** (guest / guest).

---

## Running Tests

### API Service Tests
```bash
# Run inside the container (recommended)
docker-compose exec api npm test

# Or locally (requires Node 18+)
cd api
npm install
npm test
```

### Consumer Service Tests
```bash
# Run inside the container
docker-compose exec consumer npm test

# Or locally
cd consumer
npm install
npm test
```

---

## API Usage

### POST /api/v1/activities

```bash
curl -X POST http://localhost:3000/api/v1/activities \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "eventType": "user_login",
    "timestamp": "2023-10-27T10:00:00Z",
    "payload": {
      "ipAddress": "192.168.1.1",
      "device": "desktop",
      "browser": "Chrome"
    }
  }'
```

**Success Response (202)**:
```json
{
  "message": "Event successfully received and queued for processing.",
  "eventId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Rate limit exceeded (429)**:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

### GET /health

```bash
curl http://localhost:3000/health
```

---

## Environment Variables

Copy `.env.example` and customise as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | RabbitMQ connection string |
| `DATABASE_URL` | `mongodb://user:password@localhost:27017/activity_db?authSource=admin` | MongoDB connection string |
| `API_PORT` | `3000` | Port the API listens on |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `50` | Max requests per window per IP |

---

## Project Structure

```
event-driven-user-activity/
├── api/
│   ├── src/
│   │   ├── controllers/activityController.js   # Request handler & validation
│   │   ├── middlewares/rateLimiter.js           # IP-based rate limiting
│   │   ├── routes/activityRoutes.js             # Express router
│   │   ├── services/rabbitmq.js                 # RabbitMQ publisher
│   │   └── server.js                            # Express app entry point
│   ├── tests/
│   │   ├── activity.test.js                     # API integration tests
│   │   └── rateLimiter.test.js                  # Rate limiter unit tests
│   ├── Dockerfile
│   └── package.json
├── consumer/
│   ├── src/
│   │   ├── models/activitySchema.js             # Mongoose schema
│   │   ├── services/activityProcessor.js        # Message processing logic
│   │   └── worker.js                            # RabbitMQ consumer entry
│   ├── tests/
│   │   └── activityProcessor.test.js            # Consumer unit tests
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── README.md
├── API_DOCS.md
└── ARCHITECTURE.md
```

---

## Key Architecture Decisions

1. **Fixed-Window Rate Limiter (In-Memory)**: Chosen for simplicity and zero operational overhead. A Redis-backed sliding window would be the production upgrade for multi-instance deployments.

2. **Durable Queue + Persistent Messages**: Both the queue and individual messages are marked persistent so no data is lost during RabbitMQ restarts.

3. **Manual Message Acknowledgment**: The consumer only calls `channel.ack()` after a successful MongoDB write. Transient errors trigger `channel.nack(..., true)` (requeue); malformed messages trigger `channel.nack(..., false)` (dead-letter, no loop).

4. **Idempotent Upserts**: Using `findOneAndUpdate` with `$setOnInsert` on the unique `id` field means redelivered messages are safely ignored.

5. **Retry on Startup**: Both services implement exponential back-off retry loops to handle the race condition where Node.js starts before RabbitMQ / MongoDB are ready.

---

## RabbitMQ Management UI

Once running, visit [http://localhost:15672](http://localhost:15672) and log in with **guest / guest** to:
- View the `user_activities` queue
- Monitor message rates
- Inspect unacknowledged messages
