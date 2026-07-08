# CapMint — Roadmap

> **Last Updated:** 2026-07-08  
> **Current Position:** Near-Term Phase (CP-000 ✅ → CP-001 ⏳)

---

## Roadmap Overview

```
Near-Term          Medium-Term              Long-Term
CP-000 → CP-005    CP-006 → CP-009          CP-010 → CP-020
Foundation →       Interfaces →             Scale →
Core Build         Intelligence →           Operations →
                   Integration              Launch 🚀
     ◄─── WE ARE HERE
```

---

## Phase 1: Near-Term (CP-000 → CP-005)

**Focus:** Foundation, architecture, and core services.  
**Goal:** A working anti-counterfeiting system that can mint and verify products.

| CP     | Name                    | Status        | Est. Duration | Key Outcome                    |
|--------|-------------------------|---------------|---------------|--------------------------------|
| CP-000 | Foundation Initialized  | ✅ COMPLETE    | < 1 day       | Governance & state tracking    |
| CP-001 | Brain Complete          | ⏳ PENDING     | ~2 days       | Full BRAIN/ documentation      |
| CP-002 | Core Architecture       | ⬜ NOT STARTED | ~3 days       | System design & API contracts  |
| CP-003 | Authentication Service  | ⬜ NOT STARTED | ~5 days       | Auth & authorization working   |
| CP-004 | Mint Engine             | ⬜ NOT STARTED | ~7 days       | Product minting operational    |
| CP-005 | Verification API        | ⬜ NOT STARTED | ~5 days       | Public verification endpoint   |

### Near-Term Exit Criteria
- [ ] Products can be registered and assigned unique cryptographic identifiers
- [ ] Verification API returns authenticity status for any minted product
- [ ] Authentication controls access to minting and admin operations
- [ ] Architecture documented and reviewed

### Near-Term Risks
| Risk                              | Likelihood | Impact | Mitigation                     |
|-----------------------------------|------------|--------|--------------------------------|
| Architecture scope creep          | Medium     | High   | Strict CP-002 acceptance criteria |
| Crypto algorithm selection delays | Low        | Medium | Pre-research in CP-001          |
| Auth complexity underestimated    | Medium     | Medium | Use established frameworks      |

---

## Phase 2: Medium-Term (CP-006 → CP-009)

**Focus:** User interfaces, AI intelligence, and integrations.  
**Goal:** A complete platform with dashboard, ML detection, and supply chain tracking.

| CP     | Name                 | Status        | Est. Duration | Key Outcome                   |
|--------|----------------------|---------------|---------------|-------------------------------|
| CP-006 | Dashboard UI         | ⬜ NOT STARTED | ~7 days       | Admin & brand management UI   |
| CP-007 | Blockchain Anchor    | ⬜ NOT STARTED | ~5 days       | On-chain proof anchoring      |
| CP-008 | ML Detection         | ⬜ NOT STARTED | ~10 days      | AI counterfeit detection      |
| CP-009 | Supply Chain Tracker | ⬜ NOT STARTED | ~7 days       | Product journey tracking      |

### Medium-Term Exit Criteria
- [ ] Brand owners can manage products via a web dashboard
- [ ] Proofs are anchored to a public blockchain
- [ ] ML models can flag suspected counterfeits with confidence scores
- [ ] Full product journey is tracked from manufacturing to consumer

### Medium-Term Risks
| Risk                              | Likelihood | Impact | Mitigation                      |
|-----------------------------------|------------|--------|---------------------------------|
| ML model accuracy insufficient    | Medium     | High   | Iterative training pipeline     |
| Blockchain gas costs too high     | Medium     | Medium | Batch anchoring strategy        |
| UI/UX complexity                  | Low        | Medium | Component library approach      |

---

## Phase 3: Long-Term (CP-010 → CP-020)

**Focus:** Scale, harden, integrate, and launch.  
**Goal:** Production-ready platform with mobile SDK, partner integrations, and GA.

| CP     | Name                  | Status        | Est. Duration | Key Outcome                  |
|--------|-----------------------|---------------|---------------|------------------------------|
| CP-010 | Mobile SDK            | ⬜ NOT STARTED | ~7 days       | Consumer verification app    |
| CP-011 | Analytics Pipeline    | ⬜ NOT STARTED | ~5 days       | Data insights & reporting    |
| CP-012 | Notification Service  | ⬜ NOT STARTED | ~3 days       | Real-time alerts             |
| CP-013 | Partner Integration   | ⬜ NOT STARTED | ~7 days       | Third-party connectors       |
| CP-014 | Compliance Module     | ⬜ NOT STARTED | ~5 days       | Regulatory compliance        |
| CP-015 | Infrastructure / CI/CD| ⬜ NOT STARTED | ~5 days       | Deployment automation        |
| CP-016 | Security Hardening    | ⬜ NOT STARTED | ~5 days       | Pen testing & hardening      |
| CP-017 | Performance Tuning    | ⬜ NOT STARTED | ~5 days       | Load testing & optimization  |
| CP-018 | Documentation Site    | ⬜ NOT STARTED | ~3 days       | Public docs & API reference  |
| CP-019 | Beta Program          | ⬜ NOT STARTED | ~14 days      | Closed beta with partners    |
| CP-020 | Production Launch     | ⬜ NOT STARTED | ~7 days       | General availability 🚀      |

### Long-Term Exit Criteria
- [ ] Mobile SDK available for iOS and Android
- [ ] At least 3 partner integrations operational
- [ ] Security audit passed with no critical findings
- [ ] Performance benchmarks met under load
- [ ] Beta program completed with positive partner feedback
- [ ] Production environment live and monitored

### Long-Term Risks
| Risk                             | Likelihood | Impact | Mitigation                       |
|----------------------------------|------------|--------|----------------------------------|
| Partner integration complexity   | High       | High   | Standardized connector framework |
| Compliance requirements vary     | High       | Medium | Modular compliance architecture  |
| Beta feedback requires rework    | Medium     | High   | Build in buffer time             |
| Scaling bottlenecks at launch    | Medium     | High   | Progressive rollout strategy     |

---

## Timeline Summary

| Phase       | Checkpoints     | Est. Total Duration | Target Completion |
|-------------|-----------------|---------------------|-------------------|
| Near-Term   | CP-000 → CP-005 | ~3 weeks            | TBD               |
| Medium-Term | CP-006 → CP-009 | ~4 weeks            | TBD               |
| Long-Term   | CP-010 → CP-020 | ~10 weeks           | TBD               |
| **Total**   | **CP-000 → CP-020** | **~17 weeks**   | TBD               |

> ⚠️ Estimates are preliminary and will be refined as each checkpoint is planned.

---

## Cross-References

| Document                                          | Purpose                        |
|---------------------------------------------------|--------------------------------|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) | Authoritative project roadmap  |
| [MILESTONES.md](MILESTONES.md)                    | Detailed milestone descriptions|
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md)      | Current checkpoint status      |
| [PROGRESS.md](PROGRESS.md)                        | Completion metrics             |
| [SPRINT.md](SPRINT.md)                            | Sprint-level planning          |
