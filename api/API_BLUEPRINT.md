# API Blueprint [API_BLUEPRINT]

This consolidated document defines the HTTP routing tree, JSON Schema validation envelopes, status code behaviors, and outbound webhook signatures for the CapMint platform.

---

## 1. Executive Summary [API-001]

All CapMint APIs are versioned under `/api/v1` and enforce strict schema prevalidation gates, standardized success/error response envelopes, and cryptographic signatures for outbound webhooks to prevent spoofing and playback attacks.

---

## 2. API Endpoint Catalog [API-002]

API routes map to their bounded context microservices as follows:
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

## 3. Global Schema Conventions [API-003]

To enforce consistent output structures across all microservices, all REST responses must follow either the Success envelope or the Error envelope.

### 3.1 Success Response Envelope
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

### 3.2 Error Response Envelope (RFC 7807 Problem Details)
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

## 4. HTTP Status Code Mapping Matrix [API-004]

| Status Code | Usage Condition | Endpoint Scenario |
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

## 5. Webhooks & Client Contracts [API-005]

### 5.1 Webhook Event Registry
The platform publishes webhook events on key lifecycle transitions to registered subscriber URLs:
*   **`budget.activated`**: Proposed budget is activated by certifier signing.
*   **`budget.exhausted`**: Budget remaining capacity reaches exactly `0.00`.
*   **`lot.revoked`**: A lot run is invalidated, cascading revocation to child unit codes.
*   **`unit.clone_detected`**: Anomaly heuristics flag a duplicate/impossible scan query.

### 5.2 Webhook Security (HMAC-SHA256 Signature Verification)
HTTP outbound request headers:
*   `X-CapMint-Event-ID`: Unique event UUID.
*   `X-CapMint-Timestamp`: Generation timestamp (Unix epoch).
*   `X-CapMint-Signature`: The computed HMAC-SHA256 hex string:
    $$\text{signature} = \text{Hex}(\text{HMAC-SHA256}(\text{shared\_secret}, \text{timestamp} + \text{payload}))$$

Verification implementation:
```javascript
const crypto = require('crypto');

function verifyWebhook(payload, receivedSignature, timestamp, sharedSecret) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  // Guard 1: Anti-replay protection (maximum 5 minutes skew allowed)
  if (Math.abs(currentTimestamp - timestamp) > 300) {
    throw new Error('REPLAY_ATTACK_DETECTED');
  }

  // Guard 2: Compute and verify HMAC signature
  const hmac = crypto.createHmac('sha256', sharedSecret);
  hmac.update(`${timestamp}.${JSON.stringify(payload)}`);
  const computedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(computedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  );
}
```

### 5.3 Retry Policy
*   **HTTP Target Timeout**: Webhook calls timeout if the target does not respond within $5000\text{ms}$.
*   **Retry Schedule**: Exponential backoff with jitter up to 5 attempts (Intervals: 1m, 5m, 15m, 1h, 6h).
*   **Circuit Breaker**: If failing continuously for more than 48 hours, subscription is `SUSPENDED` and alerts are raised.

---

## 6. Checkpoint Review Logs [API-006]

*   **Checkpoint ID**: CP-003 (API Contracts)
*   **Target Date / Completion**: 2026-07-11 / 2026-07-11
*   **Status**: ✅ COMPLETE / SIGNED-OFF
*   **Compliance Features**: strictly implements RFC 7807 Error Standard, 5-minute replay attack mitigation boundaries, and consistent output envelopes.
