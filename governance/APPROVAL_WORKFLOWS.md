# Approval Workflows

This document establishes the step-by-step cryptographic and administrative approval workflows required for quota allocations, lot clearance, and revocations in CapMint.

---

## 1. Quota Budget Approval Workflow

Producers cannot unilaterally allocate their own organic crop limits. The approval sequence is defined as follows:

```
[ Producer ]                [ Certifier ]                   [ System DB ]
  Submit draft budget  ──>  Review plot sizes &  ─────>  Approve, cryptographically
  with requested limit.     theoretical crop yield caps.   sign budget, and set ACTIVE.
```

1.  **Submission:** Producer enters the crop type and requested capacity limits in their console workspace.
2.  **Audit:** Certifier reviews the request against the historical yield records and AgriStack coordinates.
3.  **Cryptographic Sign:** Certifier approves the budget by calculating an Ed25519 signature over the budget envelope using their private key.
4.  **Activation:** The signature bundle is stored in the database, transitioning the budget status to `ACTIVE`.

---

## 2. Lot Clearance & Shipping Workflow

A physical product lot cannot be cleared for shipment until it passes quality assurance gates:

1.  **Lot Registration:** Producer defines a packaging run, linking it to an active budget.
2.  **Lab Sample Check:** Samples are sent to an accredited laboratory.
3.  **Lab Report Upload:** NABL Laboratory posts NMR pesticide test reports containing the pass verdict and the report's PDF file hash.
4.  **Release:** Once the lab status moves to `PASSED`, the lot state is cleared, allowing child unit codes to transition to `IN_TRANSIT` when dispatched.

---

## 3. Revocation Approval Workflow

*   **Trigger:** Certifier manually orders revocation or a lab report fails.
*   **Signature:** Certifier submits a signed revocation payload containing the target Lot ID and revocation reason.
*   **Cascade Execution:** The system updates the lot status to `REVOKED` and propagates the state to all child unit codes, immediately invalidating them in the market.
