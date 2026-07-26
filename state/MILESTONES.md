# CapMint — Milestones

> **Last updated:** 2026-07-26
>
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) is the
> authoritative status record under AD-002.

## Status summary

CapMint is in an active **security-hardening and multi-tenancy remediation**
phase. The CP-000 through CP-023 milestone series predates the current
architect-review process. Those milestones describe asserted implementation
history; they are not evidence that the platform is production-ready.

| Milestone or series | Status | Evidence boundary |
|---|---|---|
| CP-000–CP-021 | **ASSERTED / UNVERIFIED** | Historical deliverables have not received a bounded architect review under the current governance process |
| CP-022 Pilot Release | **NOT ESTABLISHED** | No current architect-approved pilot-release assessment |
| CP-023 Production Release | **NOT ESTABLISHED** | No current architect-approved production-readiness or GA assessment |
| DM-03 Multi-tenancy data migration | **ENFORCEABLE SCOPE COMPLETE** | C2, C3a, C3b, and C3c approved through architect Review #4 |
| DM-04 PostgreSQL RLS | **OPEN** | Database-enforced tenant isolation remains separately gated |
| Capacity / over-issuance defect | **OPEN** | Primary issuance-path enforcement still requires bounded verification and closure |

## Historical CP catalog

The following catalog is retained as a record of intended or asserted
capabilities, not as a completion claim.

| ID | Capability | Recorded status |
|---|---|---|
| CP-000 | Project Operating System | Asserted / unverified |
| CP-001 | Architecture Lock | Asserted / unverified |
| CP-002 | Database Design | Asserted / unverified |
| CP-003 | API Contracts | Asserted / unverified |
| CP-004 | Infrastructure | Asserted / unverified |
| CP-005 | Development Ready | Asserted / unverified |
| CP-006 | Authentication | Asserted / unverified |
| CP-007 | Authorization | Asserted / unverified |
| CP-008 | CPQ | Asserted / unverified |
| CP-009 | GS1 Engine | Asserted / unverified |
| CP-010 | Mint Engine | Asserted / unverified |
| CP-011 | QR Engine | Asserted / unverified |
| CP-012 | Resolver | Asserted / unverified |
| CP-013 | Transparency Log | Asserted / unverified |
| CP-014 | Verification | Asserted / unverified |
| CP-015 | Clone Detection | Asserted / unverified |
| CP-016 | Revocation | Asserted / unverified |
| CP-017 | Dashboards | Asserted / unverified |
| CP-018 | PWA | Asserted / unverified |
| CP-019 | TraceNet Integration | Asserted / unverified |
| CP-020 | AgriStack Integration | Asserted / unverified |
| CP-021 | Testing | Asserted / unverified |
| CP-022 | Pilot Release | Not established |
| CP-023 | Production Release | Not established |

## Active milestone sequence

1. **DM-03 — enforceable scope COMPLETE.** Application-layer tenant ownership
   and approved constraint tightening are in place.
2. **DM-04 — OPEN.** Add PostgreSQL RLS as the database-enforced isolation
   boundary.
3. **Capacity / over-issuance remediation — OPEN.** Verify the primary
   issuance path and close the defect through a bounded review.
4. **Release readiness — NOT ESTABLISHED.** Pilot and production milestones
   require explicit evidence and architect approval.
