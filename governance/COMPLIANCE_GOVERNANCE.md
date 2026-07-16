# Compliance Governance

This document outlines the compliance verification rules, TraceNet NPOP registry gates, and NABL laboratory checks required to preserve the organic integrity of physical shipments.

---

## 1. APEDA TraceNet Registry Integration

Every organic budget must be backed by a valid, active APEDA TraceNet license. The system enforces the following validations:

*   **License Mapping:** During registration, the operator’s TraceNet certificate ID (e.g. `NPOP-IN-90812`) is checked against the APEDA registry proxy.
*   **Validity Check:** The license state in the registry must return `VALID`.
*   **Date Window:** The current system date must fall between `effective_start` and `effective_end`.
*   **Crop Allowance Matching:** The crop type associated with the lot must be explicitly listed within the license's `crop_allowances` array.

---

## 2. Laboratory Evidence Compliance Gate

Before a lot run can leave the cooperative warehouse or enter the retail supply chain:

1.  **NABL Lab Report:** The lot must have an associated NMR (Nuclear Magnetic Resonance) / pesticide residue test report uploaded.
2.  **Pass/Fail status:** The lab result status must be recorded as `PASSED` / `PASS`.
3.  **PDF Hash Binding:** A SHA-256 hash of the lab certificate PDF must be calculated by the client-side system and locked in the database record. If the PDF is altered post-upload, verification calls will fail.
4.  **Automatic Revocation Trigger:** If a lab report returns `FAILED`, the associated lot status is immediately set to `REVOKED`, triggering the cascade invalidation of all related serial codes.
