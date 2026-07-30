# CapMint Release Notes — v1.0.0 ("Genesis Harvest")

> ⚠️ **Historical / not an architect-verified production release.** This v1.0.0 note predates the
> Security-Hardening + Multi-Tenancy Remediation phase and its "production-ready" framing was never
> ratified by an architect production-readiness assessment. No GA has been established on `main`
> (see `state/MILESTONES.md`: *CP-023 Production Release — NOT ESTABLISHED*). The authoritative current
> state is [docs/architecture/ARCHITECTURE_STATUS.md](../../docs/architecture/ARCHITECTURE_STATUS.md);
> the promotion gate list is [docs/architecture/PROMOTION_READINESS.md](../../docs/architecture/PROMOTION_READINESS.md).

**Release Date:** 2026-07-20  
**Version:** `1.0.0`  
**Compliance Rating:** `52 / 52 Passed (100%)`  

---

## 1. Release Overview
CapMint v1.0.0 is the initial production-ready release of the capacity-backed anti-counterfeiting and provenance registry platform for agricultural and organic supply chains.

> **Correction:** the "production-ready" claim above is historical and unverified. Production readiness
> for `develop → main` is gated by [PROMOTION_READINESS.md](../../docs/architecture/PROMOTION_READINESS.md)
> (Gates A/B/D/E closed; G1/H and soft-gate risk acceptances outstanding).

---

## 2. Key Modules & Features Included

1. **Authentication & Identity Service (Port 8081):**
   * JWT authentication, password hashing, organization registration, and RBAC authorization checks.
2. **CPQ / Budgeting Service (Port 8082):**
   * AgriStack land parcel crop yield allocation, digital signature bundles, and capacity drawdown validation.
3. **Minting Service (Port 8083):**
   * Unit-level serialization, GTIN-14 barcode generation, and GS1 Digital Link URIs.
4. **Resolver Service (Port 8084):**
   * Public GS1 URI resolution (`/01/{gtin}/21/{serial}`) mapping to public UUID identifiers.
5. **Transparency Ledger Service (Port 8085):**
   * Cryptographic SHA-256 block hash chaining, non-blocking full scan verification loop, and genesis block anchor.
6. **Verification & Security Service (Port 8086):**
   * NABL PDF lab test report validation, lot certification constraints, geovelocity clone detection, and automatic risk investigation queue.
7. **External Integration Service (Port 8087):**
   * APEDA TraceNet integration proxy with network timeout handling.

---

## 3. Included Database Migrations
* `0001`: Added `certification_status` and `updated_at` columns.
* `0002`: Formally declared `investigations` table schema.
* `0003`: PL/pgSQL function & automatic `updated_at` DB triggers across 8 tables.
* `0004`: Key field widening to `TEXT` & expanded scan events check constraint.
* `0005`: High-performance foreign key & index additions.
* `0006`: Initial system admin and certifier baseline seeding.

---

## 4. Verification Results
* Total Test Executions: 52
* Passed: 52
* Failed: 0
