# El-Elyon API Documentation

**Version:** 1.0.0  
**Base URL:** `https://your-domain.com/api`  
**Authentication:** Clerk (Cookie-based sessions)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Health Check](#health-check)
3. [Users](#users)
4. [Memos](#memos)
5. [Vacation Requests](#vacation-requests)
6. [Residents](#residents)
7. [Shifts](#shifts)
8. [Documents](#documents)
9. [Audit Logs](#audit-logs)
10. [Error Responses](#error-responses)

---

## Authentication

All API endpoints require authentication via Clerk. Requests must include valid session cookies.

### Headers

```
Cookie: __session=<clerk_session_token>
```

### Authorization Levels

- **Admin**: Full access to all endpoints
- **Supervisor**: Access to location-specific data and team management
- **Staff**: Access to own data and assigned locations

### Unauthorized Response

```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

---

## Health Check

### GET /api/health

Check system health and connectivity.

**Authentication:** None required

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T12:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "up",
      "responseTime": 45
    },
    "environment": {
      "status": "valid",
      "nodeEnv": "production"
    },
    "redis": {
      "status": "up"
    }
  }
}
```

**Status Codes:**
- `200` - Healthy or degraded
- `503` - Unhealthy

---

## Users

### GET /api/users/current

Get current authenticated user's profile.

**Authentication:** Required

**Response:**

```json
{
  "id": "uuid",
  "clerkUserId": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "staff",
  "locations": ["Location A", "Location B"],
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### PUT /api/users/update-profile

Update user profile information.

**Authentication:** Required

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**

```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "user@example.com"
  }
}
```

**Error Response:**

```json
{
  "error": "Validation failed",
  "fields": {
    "firstName": "First name is required"
  }
}
```

### GET /api/users/role

Get current user's role and permissions.

**Authentication:** Required

**Response:**

```json
{
  "role": "supervisor",
  "locations": ["Location A", "Location B"],
  "assignedAt": "2026-01-01T00:00:00.000Z"
}
```

---

## Memos

### GET /api/memos

List memos for authenticated user.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional): Number of memos to return (default: 50)
- `unreadOnly` (optional): Return only unread memos (true/false)

**Response:**

```json
[
  {
    "id": "uuid",
    "title": "Important Update",
    "content": "Memo content here...",
    "senderClerkUserId": "user_123",
    "senderName": "Admin User",
    "recipientType": "all-staff",
    "priority": "high",
    "createdAt": "2026-02-04T10:00:00.000Z",
    "expiresAt": null
  }
]
```

### POST /api/memos

Create a new memo.

**Authentication:** Required (Admin or Supervisor)

**Request Body:**

```json
{
  "title": "Important Update",
  "content": "Memo content here...",
  "recipientType": "all-staff",
  "targetLocations": [],
  "targetUsers": [],
  "priority": "normal",
  "expiresAt": "2026-03-01T00:00:00.000Z"
}
```

**Validation Rules:**
- `title`: Required, max 500 characters
- `content`: Required, max 10,000 characters
- `recipientType`: One of: location, all-staff, all-supervisors, all-employees, selected-locations, selected-users
- `priority`: One of: normal, high, urgent
- `expiresAt`: Optional, ISO 8601 datetime

**Response:**

```json
{
  "id": "uuid",
  "title": "Important Update",
  "content": "Memo content here...",
  "priority": "high",
  "createdAt": "2026-02-04T10:00:00.000Z"
}
```

**Error Response:**

```json
{
  "error": "Validation failed",
  "fields": {
    "title": "Title is required",
    "recipientType": "Invalid recipient type"
  }
}
```

### GET /api/memos/:id

Get a specific memo by ID.

**Authentication:** Required

**Response:**

```json
{
  "id": "uuid",
  "title": "Important Update",
  "content": "Memo content...",
  "senderName": "Admin User",
  "priority": "high",
  "createdAt": "2026-02-04T10:00:00.000Z"
}
```

### POST /api/memos/:id/read

Mark a memo as read.

**Authentication:** Required

**Response:**

```json
{
  "success": true
}
```

### DELETE /api/memos/:id

Delete a memo (Admin only).

**Authentication:** Required (Admin)

**Response:**

```json
{
  "success": true
}
```

### GET /api/memos/unread-count

Get count of unread memos.

**Authentication:** Required

**Response:**

```json
{
  "count": 5
}
```

---

## Vacation Requests

### GET /api/vacation-requests

List vacation requests.

**Authentication:** Required

**Query Parameters:**
- `status` (optional): Filter by status (pending, approved, denied)
- `limit` (optional): Number of requests to return (default: 100)

**Response:**

```json
[
  {
    "id": "uuid",
    "employeeClerkUserId": "user_123",
    "employeeName": "John Doe",
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-03-05T00:00:00.000Z",
    "reason": "Family vacation",
    "status": "pending",
    "createdAt": "2026-02-04T10:00:00.000Z"
  }
]
```

### POST /api/vacation-requests

Create a new vacation request.

**Authentication:** Required

**Request Body:**

```json
{
  "startDate": "2026-03-01T00:00:00.000Z",
  "endDate": "2026-03-05T00:00:00.000Z",
  "reason": "Family vacation"
}
```

**Validation Rules:**
- `startDate`: Required, ISO 8601 datetime
- `endDate`: Required, ISO 8601 datetime, must be after startDate
- `reason`: Required, max 1000 characters

**Response:**

```json
{
  "id": "uuid",
  "employeeName": "John Doe",
  "startDate": "2026-03-01T00:00:00.000Z",
  "endDate": "2026-03-05T00:00:00.000Z",
  "status": "pending",
  "createdAt": "2026-02-04T10:00:00.000Z"
}
```

### PATCH /api/vacation-requests/:id

Approve or deny a vacation request (Admin only).

**Authentication:** Required (Admin)

**Request Body:**

```json
{
  "status": "approved",
  "adminComments": "Approved for requested dates"
}
```

**Validation Rules:**
- `status`: Required, one of: approved, denied
- `adminComments`: Optional, max 1000 characters

**Response:**

```json
{
  "id": "uuid",
  "status": "approved",
  "adminComments": "Approved for requested dates",
  "adminName": "Admin User",
  "respondedAt": "2026-02-04T12:00:00.000Z"
}
```

### DELETE /api/vacation-requests/:id

Delete a vacation request.

**Authentication:** Required (Own requests only, or Admin)

**Response:**

```json
{
  "success": true
}
```

### GET /api/vacation-requests/pending-count

Get count of pending vacation requests.

**Authentication:** Required (Admin/Supervisor)

**Response:**

```json
{
  "count": 3
}
```

---

## Residents

### GET /api/residents

List residents accessible to authenticated user.

**Authentication:** Required

**Query Parameters:**
- `location` (optional): Filter by location

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "Resident Name",
    "dateOfBirth": "1990-01-01",
    "location": "Location A",
    "medicalInfo": "...",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

## Shifts

### GET /api/shifts/current

Get current active shift for authenticated user.

**Authentication:** Required

**Response:**

```json
{
  "id": "uuid",
  "clerkUserId": "user_123",
  "location": "Location A",
  "clockInTime": "2026-02-04T08:00:00.000Z",
  "clockOutTime": null,
  "deviceId": "device_123"
}
```

**No Active Shift:**

```json
{
  "shift": null
}
```

### POST /api/shifts/clock-in

Clock in to start a shift.

**Authentication:** Required

**Request Body:**

```json
{
  "location": "Location A",
  "deviceId": "device_123"
}
```

**Response:**

```json
{
  "id": "uuid",
  "clerkUserId": "user_123",
  "location": "Location A",
  "clockInTime": "2026-02-04T08:00:00.000Z",
  "deviceId": "device_123"
}
```

### POST /api/shifts/clock-out

Clock out from current shift.

**Authentication:** Required

**Request Body:**

```json
{
  "deviceId": "device_123"
}
```

**Response:**

```json
{
  "id": "uuid",
  "clockInTime": "2026-02-04T08:00:00.000Z",
  "clockOutTime": "2026-02-04T16:00:00.000Z"
}
```

---

## Documents

### GET /api/documents/fire-drills

List fire drills.

**Authentication:** Required

**Query Parameters:**
- `location` (optional): Filter by location
- `year` (optional): Filter by year

**Response:**

```json
[
  {
    "id": "uuid",
    "location": "Location A",
    "year": 2026,
    "sequence": 1,
    "drillDate": "2026-02-01T10:00:00.000Z",
    "conductedBy": "John Doe",
    "evacuationTime": "3 minutes",
    "notes": "Successful drill"
  }
]
```

### POST /api/documents/fire-drills

Create a fire drill record.

**Authentication:** Required (Admin/Supervisor)

**Request Body:**

```json
{
  "location": "Location A",
  "year": 2026,
  "sequence": 1,
  "drillDate": "2026-02-01T10:00:00.000Z",
  "conductedBy": "John Doe",
  "evacuationTime": "3 minutes",
  "notes": "Successful drill"
}
```

**Response:**

```json
{
  "id": "uuid",
  "location": "Location A",
  "drillDate": "2026-02-01T10:00:00.000Z",
  "createdAt": "2026-02-04T10:00:00.000Z"
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Validation Error Format

```json
{
  "error": "Validation failed",
  "fields": {
    "fieldName": "Error message for this field",
    "anotherField": "Another error message"
  }
}
```

### Common Error Codes

- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VALIDATION_ERROR` (400): Invalid request data
- `RATE_LIMIT` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `413` - Payload Too Large
- `429` - Too Many Requests
- `500` - Internal Server Error
- `503` - Service Unavailable

---

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **API Routes**: 20 requests per 10 seconds
- **Auth Routes**: 5 requests per 60 seconds
- **Upload Routes**: 5 requests per 60 seconds

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 15
X-RateLimit-Reset: 2026-02-04T12:00:10.000Z
```

---

## Request Tracing

All responses include trace headers for debugging:

```
X-Trace-Id: trace_1738675200000_a1b2c3d4e5f6g7h8
X-Request-Id: req_1234567890abcdef
```

Include these IDs when reporting issues.

---

## File Uploads

### Allowed File Types

**Images**: .jpg, .jpeg, .png, .gif, .webp (max 10MB)
**Documents**: .pdf, .doc, .docx, .xls, .xlsx, .txt, .csv (max 50MB)
**Videos**: .mp4, .mpeg, .mov, .avi (max 500MB)
**Audio**: .mp3, .wav, .ogg (max 50MB)

### Security

- MIME type validation
- File extension verification
- Automatic filename sanitization
- Virus scanning (future)

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit`: Number of items to return (default varies by endpoint)
- `offset`: Number of items to skip (default: 0)

**Response:**

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

## Changelog

### v1.0.0 (2026-02-04)
- Initial API documentation
- Implemented Zod validation
- Added rate limiting
- Enhanced error handling
- File upload security
- Request tracing

---

**Need Help?**

Contact: support@el-elyon.com  
Sentry Issues: https://sentry.io/organizations/your-org/issues
