# CapMint — Scope Boundary (canonical: what CapMint IS and IS NOT)

> **This is the boundary the whole team builds to.** CapMint is a **serialization + trust
> layer that sits on top of the existing organic-certification ecosystem.** It does **not**
> replace, replicate, or impersonate the authorities that certify organic products. When a
> feature would make CapMint *become* a certifier, a lab, or a government registry, it is out
> of scope — full stop.
>
> Related: the end-to-end [workflow](REAL_WORLD_READINESS.md) and launch gate
> [REAL_WORLD_READINESS.md](REAL_WORLD_READINESS.md).

## What CapMint IS

CapMint owns the layer that the certification ecosystem does **not** provide — per-unit
anti-counterfeiting:

- **Budget / capacity control** — enforce that no more units are issued than were authorized
  (over-issuance guard).
- **Minting / serialization** — a unique, cryptographically-linked QR identity per physical unit.
- **Trust / verification** — a consumer scan that proves *this exact unit* is genuine and maps
  to a real certificate, plus clone/anomaly detection.

## What CapMint IS NOT

- ❌ **Not a Certification Body.** CapMint never *decides* that a product is organic. Only an
  accredited Certification Body can, under NPOP, via APEDA's TraceNet.
- ❌ **Not a laboratory.** CapMint never *issues* a test result. Only NABL-accredited labs can.
- ❌ **Not a government registry.** CapMint never *owns* farmer or land records. AgriStack does.

CapMint **records, links to, and verifies** those authorities' decisions — it does not make them.

## Who holds authority (and CapMint's role)

| External system | What it is | Legal authority | CapMint's role |
| :-- | :-- | :-- | :-- |
| **AgriStack** | Govt of India farmer + land registry | Government owns the records | **Query** to confirm a producer is a real registered farmer with real land |
| **NABL labs** | Accredited testing laboratories | The accredited lab issues the report | **Ingest / verify** a real lab's report |
| **TraceNet (APEDA / NPOP)** | Official organic traceability + certificates | Accredited Certification Bodies issue the certificate | **Link / verify** the certificate — never issue it |

## The trust-separation principle (hold this line)

- **Root of trust for "is this organic"** = the Certification Body / TraceNet. **Not CapMint.**
- **Root of trust for "is this specific physical unit the genuine one that maps to that
  certificate"** = **CapMint.**

CapMint's guarantee is only ever as strong as the external certificate it links to. Therefore,
when APIs go live, CapMint must **verify** a certificate against TraceNet (and a producer
against AgriStack) rather than take a user's word — see RW-09 / RW-11.

## How the external actors map to CapMint roles

The "certifier" and "lab" *users* inside CapMint are the **real external bodies**, not CapMint
functions:

- **Certifier user** = a real accredited **Certification Body** recording its real NPOP decision
  (ideally carrying a real TraceNet certificate reference).
- **Lab user** = a real **NABL-accredited lab** uploading its real report.

CapMint orchestrates and serializes their decisions; it does not originate them.

## Integration posture (current reality + path)

- **Today the integrations are SIMULATED.** `backend/integration-service` returns hardcoded
  mock records (e.g. AgriStack farmers, TraceNet cert `NPOP-IN-90812`). No real government API
  is called. This must be labeled as mock everywhere it is surfaced (**RW-16**).
- **Integrations are built as adapters** so that "mock → real API" is a swap, not a rewrite.
- **Live access is a business/legal track, not a coding task** (**RW-17**): authorized API
  access to AgriStack, APEDA-TraceNet, and NABL requires partnerships/approvals that take time.
- **CapMint can launch before live API access exists** — real Certification Bodies and labs use
  CapMint manually; automated verification is a later upgrade.

## Consequence for scope (why this is good news)

You do **not** build AgriStack, TraceNet, or NABL. You build **budget + minting + trust**, plus
thin adapters to those authorities. This is a **smaller, legal, and defensible** scope — and it
is the only scope the government would permit.

## Open decision (tracked, not yet locked)

- **Mint timing** — mint *before* the lab (with an export/ship certification gate) **or** mint
  *after* certification (single mint-time gate, zero waste, no "pending" window). Decided by one
  operational question: can producers apply the QR label *after* certification (a separate
  labeling step)? If yes → mint-after-certification is preferred. See the workflow discussion.
