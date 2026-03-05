# API Documentation

## Base URL

```
http://localhost:3000
```

---

## Endpoints

### 1. POST `/api/v1/activities`

Ingests a user activity event. The event is validated, then published to the `user_activities` RabbitMQ queue for asynchronous processing.

#### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | `string` | ✅ | Unique user identifier (e.g., UUID) |
| `eventType` | `string` | ✅ | Non-empty event category (e.g., `user_login`, `page_view`) |
| `timestamp` | `string` | ✅ | Valid ISO-8601 datetime string |
| `payload` | `object` | ✅ | Arbitrary JSON object with event metadata |

**Example Request**:
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

#### Responses

| Status | Meaning | Body |
|---|---|---|
| `202 Accepted` | Event queued successfully | `{ "message": "...", "eventId": "uuid" }` |
| `400 Bad Request` | Invalid or missing field | `{ "error": "Bad Request", "message": "..." }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "error": "Too Many Requests", "message": "...", "retryAfter": N }` + `Retry-After: N` header |
| `500 Internal Server Error` | Queue publish failure | `{ "error": "Internal Server Error", "message": "..." }` |
| `503 Service Unavailable` | Broker not connected | `{ "error": "Service Unavailable", "message": "..." }` |

**202 Response Example**:
```json
{
  "message": "Event successfully received and queued for processing.",
  "eventId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**400 Response Examples**:
```json
{ "error": "Bad Request", "message": "Invalid or missing \"userId\". Must be a non-empty string." }
{ "error": "Bad Request", "message": "Invalid \"timestamp\". Must be a valid ISO-8601 date string." }
{ "error": "Bad Request", "message": "Invalid or missing \"payload\". Must be a JSON object (not an array)." }
```

**429 Response Example**:
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

---

### 2. GET `/health`

Health check endpoint used by Docker Compose to confirm the API service is running.

**Response (200)**:
```json
{
  "status": "ok",
  "uptime": 42.5
}
```

---

## Rate Limiting

- **Algorithm**: Fixed-window counter per unique client IP
- **Limit**: 50 requests per 60-second window
- **IP Detection**: Uses `X-Forwarded-For` header (respects Docker/proxy IPs)
- **Retry-After**: Included in the response header and body on 429

---

## Error Codes Summary

| HTTP Code | Scenario |
|---|---|
| `202` | Event accepted and queued |
| `400` | Missing or malformed required field |
| `404` | Unknown route |
| `429` | Rate limit exceeded |
| `500` | Publish failure or unhandled error |
| `503` | RabbitMQ broker unavailable |
