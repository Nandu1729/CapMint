# Exception & Fallback Governance

This document establishes the policies for managing system exceptions, handling clone alarms, and utilizing manual operational fallbacks during network outages.

---

## 1. Clone Detection & Security Escalation

When geovelocity heuristics flag a unit code as `CLONE-SUSPECT`:

1.  **Immediate Verdict Invalidation:** Public scans for that serial number immediately resolve as `CLONE-SUSPECT`, with a clear warning displayed to consumers.
2.  **Investigation Case Ticket:** The `verification-service` automatically generates a new record in the `investigations` table containing all scan evidence (timestamps, IP geohashes, device metadata).
3.  **Auditor Notification:** An alert notification is dispatched to the associated Certifier organization.
4.  **Case Resolution:** The verifier status remains blocked until a certifier audits the evidence and manually closes the investigation case (either marking it as `REVOKED` or resetting the flag if a false positive is confirmed).

---

## 2. Integration Fallback Policies

If external government registries (AgriStack, TraceNet) become unreachable:

*   **Producer Onboarding Fallback:** The PWA saves plot coordinates locally and flags them as `PENDING_REGISTRY_SYNC` until connectivity is recovered.
*   **Certifier Verification Fallback:** Certifiers can review and upload a physical scanned NPOP/APEDA PDF certificate, overriding automated TraceNet API validations to keep processing lines active.
*   **Audit Lock:** Manual overrides must be logged to the transparency ledger as explicit `MANUAL_OVERRIDE_APPLIED` events with a clear reason.

---

## 3. Standardized Error Handling (RFC 7807)

CapMint microservices must not leak internal stack traces to clients. All application errors must return HTTP 4xx or 5xx codes formatted as RFC 7807 Problem Details:

```json
{
  "success": false,
  "error": {
    "statusCode": 403,
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource.",
    "details": []
  }
}
```
