# CapMint — Webhooks & Client Contracts (CP-003.3)

## 1. Executive Summary

This document represents the deliverables for **CP-003.3 (Webhooks & Client Contracts validation)** under the API Contracts phase. It defines the payload structures, security validation mechanisms (HMAC-SHA256 signature verification), event registries, and retry policies for asynchronous outbound webhooks published by the CapMint platform.

---

## 2. Webhook Event Registry

The platform publishes webhook events on key lifecycle transitions to registered subscriber URLs:

| Event Type | Trigger Condition | Bounded Context Owner |
| :--- | :--- | :--- |
| **`budget.activated`** | Proposed budget is activated by certifier signing. | Budget Service |
| **`budget.exhausted`** | Budget remaining capacity reaches exactly `0.00`. | Budget Service |
| **`lot.revoked`** | A lot run is invalidated, cascading revocation to child unit codes. | Minting Service |
| **`unit.clone_detected`** | Anomaly heuristics flag a duplicate/impossible scan query. | Verification Service |

---

## 3. Webhook Delivery Protocol & Security

To protect subscribers from spoofing and payload tampering:

1.  **Shared Secret Exchange**: During subscriber registration, a cryptographically random shared secret is generated (minimum 32 bytes) and securely stored.
2.  **Signature Generation**: The outbound payload is signed using HMAC-SHA256:
    $$\text{signature} = \text{Hex}(\text{HMAC-SHA256}(\text{shared\_secret}, \text{timestamp} + \text{payload}))$$
3.  **HTTP Request Headers**: The request contains the following headers:
    -   `X-CapMint-Event-ID`: Unique event UUID.
    -   `X-CapMint-Timestamp`: Generation timestamp (Unix epoch).
    -   `X-CapMint-Signature`: The computed HMAC-SHA256 hex string.

### 3.1 Subscriber Signature Verification Logic
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

---

## 4. Delivery Retry & Error Policy

*   **HTTP Target Timeout**: Webhook calls must timeout if the target subscriber server does not respond within $5000\text{ms}$.
*   **Retry Schedule**: On failure (timeouts or status codes outside the `2xx` range), the system retries using exponential backoff with jitter:
    -   Maximum retries: 5 attempts.
    -   Intervals: 1m, 5m, 15m, 1h, 6h.
*   **Circuit Breaker**: If a subscriber endpoint fails continuously for more than 48 hours, its webhook subscription status is set to `SUSPENDED` and an administrator alert is issued.

---
*End of webhooks.md*
