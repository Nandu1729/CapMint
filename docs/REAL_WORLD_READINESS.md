# CapMint — Real-World Readiness Checkpoint

> **This is a launch gate.** Every 🔴 item here must be **fixed or consciously accepted in
> writing** before any *real user* touches CapMint or any *real customer/farmer/consumer data*
> is stored. 🟠 items must be resolved before onboarding external organizations or scaling.
> 🟡 items must be resolved before meaningful volume.
>
> This document is the single source of truth for "what stands between us and real users."
> It is a living checklist — update status as items close. It complements, and is derived
> from, the risk analysis; it does **not** replace the authoritative
> [ARCHITECTURE_STATUS.md](architecture/ARCHITECTURE_STATUS.md).

**Legend** — Status: ☐ not started · ◐ in progress · ☑ done · ⊘ accepted-as-risk (needs sign-off).
Severity: 🔴 blocker · 🟠 high · 🟡 watch. Owner: **OP** operator/founder · **CX** Codex (impl) · **AR** architect.

---

## 🔴 Blockers — must be true before ANY real user

| ID | Fix | Why it blocks real-world launch | Owner | Status |
| :-- | :-- | :-- | :--: | :--: |
| RW-01 | **Verification must tell the truth.** A code must never display "Laboratory Verified ✓ / Organic Certificate Approved ✓" unless it actually is. Either gate minting on `certification_status = CERTIFIED`, **or** make verification return `PENDING / NOT CERTIFIED` until the lab passes. Remove the hardcoded happy-path timeline (`verification-service` ~L582–586). | Shipping product that falsely scans "genuine/organic" is **false labelling** — grounds for EU/NPOP/APEDA shipment rejection, delisting, and fraud liability. | CX/AR | ☐ |
| RW-02 | **Certifier signing keys in an HSM/KMS**, not DB or env. Add key rotation + revocation. | These Ed25519 keys ARE the anti-counterfeiting guarantee. One leak = an attacker forges unlimited valid certifications, silently. | OP/CX | ☐ |
| RW-03 | **MFA for certifier + admin accounts**; short JWT TTL; documented `JWT_SECRET` rotation. | Single HS256 secret + password-only auth = one phish/leak → total cross-tenant takeover, including approving fake budgets. | CX | ☐ |
| RW-04 | **Privacy/PII program**: consent, retention, and deletion for farmer identities, land records, lab reports, and **consumer scan geolocation**. Minimize what's stored. | India **DPDP Act 2023** and **GDPR** (EU buyers) make this mandatory; scan geolocation is exactly what regulators scrutinize. | OP | ☐ |
| RW-05 | **Real hosting** (not free tier) + explicit **data-residency** decision (region). | Free tier loses data and cold-starts; hosting Indian/EU data in the wrong region breaks localization/transfer law. | OP | ☐ |
| RW-06 | **Backups + tested restore** + recoverable pre-cutover snapshot. | No proven restore path = one bad migration or breach is unrecoverable customer-data loss. | OP | ☐ |

## 🟠 High — before onboarding external orgs / scaling

| ID | Fix | Why | Owner | Status |
| :-- | :-- | :-- | :--: | :--: |
| RW-07 | **QR anti-clone decision**: adopt a covert layer (scratch-off one-time code or NFC) **and** keep digital verification idempotent (re-scannable) — see design note below. | Pure QR is copyable; geovelocity alone is a weak, GPS-dependent signal. | AR/OP | ☐ |
| RW-08 | **Transparency ledger external anchoring**: periodically publish the chain head hash somewhere we don't control. | Today the chain is tamper-*evident* only within our own DB; an insider/breach can rewrite it undetectably (accepted risk C2 — close it for real users). | CX/AR | ⊘ |
| RW-09 | **Integration degraded-mode**: define fail-open vs fail-closed for AgriStack/TraceNet/NABL; confirm real, sanctioned API access. | Govt registries have downtime, rate limits, and gatekeeping; undefined behavior = either unsafe onboarding or outages. | OP/CX | ☐ |
| RW-10 | **Rate limiting fails closed when Redis is down** (verify, don't assume). | A fail-open limiter leaves login/scan brute-forceable during a cache outage. | CX | ☐ |
| RW-11 | **Trust-anchor vetting**: a documented process for who approves certifiers and NABL labs. | A rogue/compromised certifier or lab undermines the entire trust model. | OP | ☐ |
| RW-12 | **Certifier key compromise playbook** (revoke key → mark affected budgets suspect). | Without it, a key leak has no containment path. | AR/OP | ☐ |

## 🟡 Watch — before meaningful volume

| ID | Fix | Why | Owner | Status |
| :-- | :-- | :-- | :--: | :--: |
| RW-13 | Index/partition `unit_codes`, `log_entries`, `scan_events`. | Verification is the hot path; these tables only grow — millions of rows degrade scan latency. | CX | ☐ |
| RW-14 | Tune geovelocity thresholds for real logistics (air freight > 500 km/h); don't auto-escalate on location alone. | Prevents false "CRITICAL" on legitimate fast shipments and GPS-denied scans. | CX | ☐ |
| RW-15 | Consumer result page: i18n (EU/US buyers), anti-phishing trust cues, offline/cold-start UX. | Buyers won't install an app; the web result page IS the product's face and a spoofing target. | CX | ☐ |

## ☑ Already done (context)

- RLS multi-tenancy, capacity/over-issuance guard, observability O1–O4, security verification pass, CI green, promotion to `main` (v1.1.0). See ARCHITECTURE_STATUS.
- **Part 8 repo honesty** — infrastructure scaffolds labeled as unapplied (this branch).

## Not a launch item (tracked separately)

- Render free-tier practice deploy (`feat/ho-025-render-free-deploy`) — **learning only**, never for real users (RW-05 supersedes it for production).

---

## Design note — RW-07: re-scannable QR without weakening anti-clone

**The concern:** if the code is "one-time scan," a buyer who scans again to double-check gets blocked or scared. **That would be a bad design — and it's not the right one.** Separate two ideas:

- **Digital verification = idempotent.** The visible QR can be scanned *unlimited* times and always returns an answer. Re-checking is encouraged, never punished. The system shows transparent history: *"Genuine · first verified 3 days ago near Hamburg · 4 total scans."*
- **The "one-time" property belongs to the physical covert layer, not the scan count.** A scratch-off panel (or NFC) hides a secret code. Scratching it is the one-time act — if a buyer finds it *already* scratched at purchase, that's the tamper signal. The counterfeiter who copied only the *visible* QR can't produce the hidden secret.
- **Flags come from anomalous patterns, not repeat scans:** the same hidden secret being *first-activated* in two far-apart places, or mass-simultaneous activations, indicates cloning. A single buyer re-scanning for peace of mind is normal and safe.

**Net:** re-scanning is always fine; security comes from (a) a covert secret the copier can't see and (b) first-activation anomaly detection — never from burning the code on first scan.
