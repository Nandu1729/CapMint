# API: [Endpoint Name]

> **API Endpoint Documentation** — CapMint Anti-Counterfeiting Platform

---

## Endpoint Overview

| Field              | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| **Path**           | `/api/v[N]/[resource]`                                                |
| **Method**         | `GET` · `POST` · `PUT` · `PATCH` · `DELETE`                          |
| **API Version**    | `v[N]` <!-- e.g., v1, v2 -->                                         |
| **Module**         | <!-- e.g., auth, labeling, verification, blockchain -->               |
| **Status**         | `DRAFT` · `STABLE` · `DEPRECATED`                                    |
| **Introduced In**  | [CP-NNN](../checkpoints/CP-NNN.md)                                   |
| **Owner**          | @[github-handle]                                                      |

---

## 1. Description

<!-- What does this endpoint do? Describe the business purpose and when a client should use it.
     Reference the feature spec if applicable: [feature-name.md](../docs/features/feature-name.md)
-->

## 2. Authentication & Authorization

| Requirement        | Details                                                        |
| ------------------ | -------------------------------------------------------------- |
| **Auth Method**    | `Bearer Token (JWT)` · `API Key` · `OAuth 2.0` · `None`       |
| **Required Scopes**| <!-- e.g., `labels:read`, `verify:write` -->                   |
| **Required Roles** | <!-- e.g., `admin`, `manufacturer`, `inspector` -->            |
| **RBAC Policy**    | <!-- Link to RBAC doc or describe inline -->                   |

## 3. Request

### 3.1 Path Parameters

| Parameter   | Type     | Required | Description                              |
| ----------- | -------- | -------- | ---------------------------------------- |
| `[param]`   | `string` | Yes/No   | <!-- Description of the path parameter --> |

### 3.2 Query Parameters

| Parameter   | Type      | Required | Default  | Description                             |
| ----------- | --------- | -------- | -------- | --------------------------------------- |
| `page`      | `integer` | No       | `1`      | Page number for paginated results       |
| `limit`     | `integer` | No       | `20`     | Items per page (max: 100)               |
| `[param]`   | `[type]`  | Yes/No   | `[val]`  | <!-- Description -->                    |

### 3.3 Request Headers

| Header           | Required | Value / Description                          |
| ---------------- | -------- | -------------------------------------------- |
| `Authorization`  | Yes      | `Bearer <token>`                             |
| `Content-Type`   | Yes      | `application/json`                           |
| `X-Request-ID`   | No       | UUID for request tracing                     |
| `X-API-Version`  | No       | Override default API version                 |

### 3.4 Request Body

```jsonc
{
  // Field descriptions inline
  "field_name": "[type] — [description] — [constraints]",
  "nested_object": {
    "sub_field": "[type] — [description]"
  }
}
```

**Schema:**

| Field            | Type       | Required | Constraints          | Description                    |
| ---------------- | ---------- | -------- | -------------------- | ------------------------------ |
| `field_name`     | `string`   | Yes      | max 255 chars        | <!-- Description -->           |
| `nested_object`  | `object`   | No       | —                    | <!-- Description -->           |
| `└─ sub_field`   | `string`   | Yes      | enum: `a`, `b`, `c`  | <!-- Description -->           |

## 4. Response

### 4.1 Success Response

**Status:** `200 OK` / `201 Created` / `204 No Content`

```jsonc
{
  "status": "success",
  "data": {
    "id": "string — Unique resource identifier",
    "created_at": "string (ISO 8601) — Creation timestamp",
    "field_name": "[type] — [description]"
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

**Response Fields:**

| Field              | Type       | Description                                   |
| ------------------ | ---------- | --------------------------------------------- |
| `status`           | `string`   | `success` or `error`                          |
| `data`             | `object`   | Response payload                              |
| `data.id`          | `string`   | Unique resource identifier                    |
| `data.created_at`  | `string`   | ISO 8601 timestamp                            |
| `meta`             | `object`   | Pagination metadata (present on list endpoints)|

### 4.2 Error Responses

| Status Code | Error Code            | Description                                   |
| ----------- | --------------------- | --------------------------------------------- |
| `400`       | `INVALID_REQUEST`     | Malformed request body or missing fields       |
| `401`       | `UNAUTHORIZED`        | Missing or invalid authentication token        |
| `403`       | `FORBIDDEN`           | Insufficient permissions for this operation    |
| `404`       | `NOT_FOUND`           | Resource not found                             |
| `409`       | `CONFLICT`            | Resource already exists or version conflict    |
| `422`       | `VALIDATION_ERROR`    | Request validation failed                      |
| `429`       | `RATE_LIMITED`        | Rate limit exceeded                            |
| `500`       | `INTERNAL_ERROR`      | Unexpected server error                        |

**Error Response Body:**

```jsonc
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": [
      {
        "field": "field_name",
        "issue": "Specific validation error"
      }
    ],
    "request_id": "uuid-for-tracing"
  }
}
```

## 5. Rate Limits

| Tier            | Requests/Minute | Burst Limit | Notes                          |
| --------------- | --------------- | ----------- | ------------------------------ |
| **Free**        | 60              | 10          | <!-- Tier-specific notes -->   |
| **Standard**    | 300             | 50          |                                |
| **Enterprise**  | 1000            | 200         |                                |

**Rate Limit Headers:**

| Header                   | Description                        |
| ------------------------ | ---------------------------------- |
| `X-RateLimit-Limit`      | Max requests per window            |
| `X-RateLimit-Remaining`  | Remaining requests in window       |
| `X-RateLimit-Reset`      | Unix timestamp when window resets  |

## 6. Examples

### 6.1 cURL — Success

```bash
curl -X [METHOD] \
  'https://api.capmint.io/api/v1/[resource]' \
  -H 'Authorization: Bearer <YOUR_TOKEN>' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 550e8400-e29b-41d4-a716-446655440000' \
  -d '{
    "field_name": "example_value"
  }'
```

### 6.2 cURL — Error (Unauthorized)

```bash
curl -X [METHOD] \
  'https://api.capmint.io/api/v1/[resource]' \
  -H 'Content-Type: application/json'

# Response: 401 Unauthorized
# {
#   "status": "error",
#   "error": {
#     "code": "UNAUTHORIZED",
#     "message": "Authentication token is missing or invalid"
#   }
# }
```

## 7. Changelog

| Version | Date       | Author    | Change Description                           |
| ------- | ---------- | --------- | -------------------------------------------- |
| `v1.0`  | YYYY-MM-DD | @[handle] | Initial endpoint release                     |
| `v1.1`  | YYYY-MM-DD | @[handle] | <!-- Description of change -->               |

---

> **Related Docs:**
> - Feature Spec: [feature-name.md](../docs/features/feature-name.md)
> - Database Schema: [table-name.md](../docs/database/table-name.md)
> - Threat Model: [threat-model.md](../docs/security/threat-model.md)
> - ADR: [ADR-NNN](../docs/adr/ADR-NNN.md)
