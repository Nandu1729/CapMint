# CapMint — Lessons Learned

> **Purpose:** Repository of key discoveries, design revisions, and lessons learned during development.
> **Rule:** Future AI agents must consult this document before proposing or making significant design or architectural decisions.

---

## Lessons Log

### 1. Refinement of Project Operating System & Non-Speculative ADRs

- **Date:** 2026-07-08
- **Checkpoint:** CP-000 (Project Operating System)
- **Problem:** Initial project documentation contained speculative ADRs and target milestones that did not reflect actual approved decisions or realistic project phases. It also included premature progress percentages and complex, over-engineered quality gates that added friction without adding quality.
- **Discovery:** AI-first engineering works best with a highly deterministic, simplified structure. Complex processes, non-locked placeholder decisions (speculative ADRs), and fake progression metrics degrade trust and readability.
- **Resolution:**
  1. Purged all speculative/future ADRs from `BRAIN/DECISIONS.md`, leaving only locked foundation choices (TypeScript, PostgreSQL, Microservices, GS1 Digital Link, JWT/OAuth2, AI-first workflow, Sequential checkpoints).
  2. Simplified Quality Gates from 8 gates down to 6 clear gating phases (Gate 0 through Gate 5).
  3. Re-mapped the checkpoint roadmap sequence into a logical, 24-step incremental timeline (CP-000 to CP-023).
  4. Removed all arbitrary percentage completion indicators for unstarted features, establishing a binary tracking model ("Foundation Completed", "Application Not Started").
- **Impact:** Clearer project state, reduced documentation maintenance overhead, higher signal-to-noise ratio, and a solid baseline for the next developer/AI agent to begin architecture lock.
- **Action for Future Agents:** Keep all state and tracking metrics binary or strictly evidence-based. Do not write placeholder decisions or speculative ADRs.

---

*This document is a living record of architectural and engineering lessons learned.*
