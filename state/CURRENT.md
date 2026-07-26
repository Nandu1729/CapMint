# CapMint — Current State

> **Last updated:** 2026-07-26
>
> [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md) is the
> authoritative status record under AD-002.

## Current phase

CapMint is in an active **security-hardening and multi-tenancy remediation**
phase. Earlier state cards describing the platform as 100% complete or
production-ready are not verified release assessments.

| Property | Current state |
|---|---|
| Baseline branch | `feat/dm03-tenant-column` |
| Current milestone | DM-03 — enforceable scope **COMPLETE** |
| Next tenancy milestone | DM-04 — PostgreSQL Row-Level Security **OPEN** |
| Open security defect | Capacity / over-issuance enforcement **OPEN** pending bounded verification and closure |
| Overall status | Remediation in progress; production readiness is not established |

## Approved DM-03 scope

DM-03 C2, C3a, C3b, and C3c passed architect review. The approved scope
establishes FK-backed tenant ownership and application-layer enforcement,
including fail-closed lab controls and tightened ownership constraints.

DM-03 does not provide database-enforced tenant isolation. PostgreSQL RLS is
separately gated as DM-04.

## Immediate priorities

1. Design and implement DM-04 PostgreSQL RLS through its architect gate.
2. Verify and close the capacity / over-issuance defect on the primary
   issuance path.
3. Continue bounded verification of previously asserted security closures.
4. Treat production-release claims as unverified until an architect-approved
   release assessment establishes them.

## Resume checklist

1. Read [Architecture Status](../docs/architecture/ARCHITECTURE_STATUS.md).
2. Confirm the checked-out branch and review boundary.
3. Read the relevant architect decision and handoff before implementation.
4. Run the repository's documented setup and test commands.
