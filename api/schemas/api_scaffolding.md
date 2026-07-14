# CapMint — API Scaffolding (CP-003.1)

## 1. Executive Summary

This document represents the deliverables for **CP-003.1 (API Scaffolding)** under the API Contracts phase. It establishes the HTTP routing tree, JSON Schema validation structures, error handling schema standards, and status code behaviors for all microservices in the CapMint system.

---

## 2. API Endpoint Catalog (Routing Tree)

All API endpoints are versioned under `/api/v1` and map to the respective bounded context owner services:

```
/api/v1/
├── identity/                  # Identity Service
│   ├── POST /certifiers       - Register accreditation & public key
│   ├── POST /certifiers/:id/rotate-key - Rotate signing keys
│   ├── POST /producers        - Onboard Farmer/FPO/Brand
│   └── POST /producers/:id/plots - Register land parcels
├── budgets/                   # Budget Service
│   ├── POST /budgets          - Propose yield quota balance (Draft)
│   ├── POST /budgets/:id/activate - Activate quota with certifier signature
│   └── GET  /budgets/:id      - Query capacity balance
├── mint/                      # Minting Service
│   ├── POST /lots             - Mint unit serials & group under lot batch
│   ├── GET  /lots/:id         - Fetch lot details & verification codes
│   └── POST /lots/:id/revoke  - Invalidate batch (cascade to unit codes)
├── verify/                    # Verification Service
│   ├── GET  /verify/:gtin/:serial - Ingest scan verification request
│   └── POST /scans            - Register verification query telemetry
└── evidence/                  # Evidence Service
    └── POST /lots/:id/lab-results - Ingest NABL laboratory NMR PDF report
```

---

## 3. Global Schema Conventions

### 3.1 Standard Response Envelopes
To enforce consistent output structures across all 14 services, all REST responses must follow either the Success envelope or the Error envelope.

#### 3.1.1 Success Response Envelope
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean", "const": true },
    "data": { "type": "object" },
    "meta": {
      "type": "object",
      "properties": {
        "timestamp": { "type": "string", "format": "date-time" },
        "requestId": { "type": "string", "format": "uuid" }
      },
      "required": ["timestamp", "requestId"]
    }
  },
  "required": ["success", "data", "meta"]
}
```

#### 3.1.2 Error Response Envelope (RFC 7807 Problem Details)
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean", "const": false },
    "error": {
      "type": "object",
      "properties": {
        "statusCode": { "type": "integer" },
        "code": { "type": "string" },
        "message": { "type": "string" },
        "details": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "field": { "type": "string" },
              "issue": { "type": "string" }
            },
            "required": ["field", "issue"]
          }
        }
      },
      "required": ["statusCode", "code", "message"]
    }
  },
  "required": ["success", "error"]
}
```

---

## 4. HTTP Status Code Mapping Matrix

| Status Code | Usage Condition | Example Endpoint Scenario |
| :--- | :--- | :--- |
| **`200 OK`** | Successful read or non-creation write. | `GET /api/v1/budgets/:id` |
| **`201 Created`** | Successful creation of a resource. | `POST /api/v1/mint/lots` |
| **`400 Bad Request`**| Schema mismatch or syntax error. | Invalid JSON payload sent. |
| **`401 Unauthorized`**| Missing or expired JWT credentials. | Querying endpoints without valid auth header. |
| **`403 Forbidden`** | Insufficient RBAC privileges. | Producer attempting to rotate certifier keys. |
| **`404 Not Found`** | Resource does not exist. | Requesting a non-existent budget UUID. |
| **`409 Conflict`** | Duplicate unique keys or state clash. | Onboarding a certifier name that already exists. |
| **`422 Unprocessable`**| Business constraint violation. | Budget drawdown requested exceeds remaining capacity. |
| **`500 Server Error`**| Unhandled system exception. | Database timeout or connection drop. |

---
*End of api_scaffolding.md*
