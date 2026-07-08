# CapMint — Milestones

> **Last Updated:** 2026-07-08  
> **Total Milestones:** 24 (CP-000 through CP-023)  
> **Completed:** 1 (CP-000)

---

## Milestone Dependency Chain

```
[CP-000 Project Operating System] (Completed)
  │
  ▼
[CP-001 Architecture Lock]
  │
  ▼
[CP-002 Database Design]
  │
  ▼
[CP-003 API Contracts]
  │
  ▼
[CP-004 Infrastructure]
  │
  ▼
[CP-005 Development Ready]
  │
  ├─► [CP-006 Authentication] ──► [CP-007 Authorization]
  ├─► [CP-008 CPQ]
  ├─► [CP-009 GS1 Engine] ──► [CP-010 Mint Engine] ──► [CP-011 QR Engine]
  │                                                      │
  ├─► [CP-013 Transparency Log]                          ▼
  │                                   [CP-012 Resolver] ◄┘
  │                                     │
  │                                     ▼
  ├──────────────────────────────────► [CP-014 Verification]
  │
  ├─► [CP-015 Clone Detection] (Depends on CP-012, CP-013)
  ├─► [CP-016 Revocation] (Depends on CP-011, CP-013)
  ├─► [CP-017 Dashboards] (Depends on CP-012, CP-013, CP-015)
  ├─► [CP-018 PWA] (Depends on CP-012, CP-017)
  ├─► [CP-019 TraceNet Integration] (Depends on CP-013)
  ├─► [CP-020 AgriStack Integration] (Depends on CP-013)
  ├─► [CP-021 Testing]
  │
  ▼
[CP-022 Pilot Release] (Depends on CP-006 to CP-021)
  │
  ▼
[CP-023 Production Release]
```

---

## Milestone Descriptions

### CP-000: Project Operating System ✅
- **Status:** COMPLETE
- **Dependencies:** None
- **Key Deliverable:** Repository initialized, standard workflows and governance folders established, AI development guidelines, and templates added.

### CP-001: Architecture Lock ⏳
- **Status:** PENDING
- **Dependencies:** CP-000
- **Key Deliverable:** System architecture blueprint finalized, C4 container and component diagrams locked, security/threat models defined.

### CP-002: Database Design
- **Status:** NOT STARTED
- **Dependencies:** CP-001
- **Key Deliverable:** Relational database entity relationship diagrams (ERD) designed, schemas locked, and indexing strategies defined.

### CP-003: API Contracts
- **Status:** NOT STARTED
- **Dependencies:** CP-002
- **Key Deliverable:** API specifications (OpenAPI/GraphQL schema definitions) for all services defined and verified.

### CP-004: Infrastructure
- **Status:** NOT STARTED
- **Dependencies:** CP-003
- **Key Deliverable:** Container configurations (Dockerfiles, Docker Compose stacks) and local/cloud environment definitions completed.

### CP-005: Development Ready
- **Status:** NOT STARTED
- **Dependencies:** CP-004
- **Key Deliverable:** CI pipelines verified, seed scripts completed, and initial project repository ready for active application code development.

### CP-006: Authentication
- **Status:** NOT STARTED
- **Dependencies:** CP-005
- **Key Deliverable:** Secure login, token issuance (JWT/RS256), session management, and authentication gateways implemented.

### CP-007: Authorization
- **Status:** NOT STARTED
- **Dependencies:** CP-006
- **Key Deliverable:** Role-based access control (RBAC) middleware and scopes enforced across API gateways.

### CP-008: CPQ
- **Status:** NOT STARTED
- **Dependencies:** CP-005
- **Key Deliverable:** Pricing, quoting, and product catalog management logic built.

### CP-009: GS1 Engine
- **Status:** NOT STARTED
- **Dependencies:** CP-005
- **Key Deliverable:** GTIN/SGTIN generation and GS1 Digital Link parsing logic built.

### CP-010: Mint Engine
- **Status:** NOT STARTED
- **Dependencies:** CP-009
- **Key Deliverable:** Unique serial code generation and product registration mechanisms built.

### CP-011: QR Engine
- **Status:** NOT STARTED
- **Dependencies:** CP-010
- **Key Deliverable:** Branded, cryptographically signed QR code creation built.

### CP-012: Resolver
- **Status:** NOT STARTED
- **Dependencies:** CP-009, CP-011
- **Key Deliverable:** Resolution logic for mapping GS1 Digital Links to target destination redirects.

### CP-013: Transparency Log
- **Status:** NOT STARTED
- **Dependencies:** CP-005
- **Key Deliverable:** Append-only event store and audit trail built using Merkle trees.

### CP-014: Verification
- **Status:** NOT STARTED
- **Dependencies:** CP-012
- **Key Deliverable:** Public authenticity checks and certificate verification APIs built.

### CP-015: Clone Detection
- **Status:** NOT STARTED
- **Dependencies:** CP-012, CP-013
- **Key Deliverable:** AI-driven anomaly identification algorithms implemented.

### CP-016: Revocation
- **Status:** NOT STARTED
- **Dependencies:** CP-011, CP-013
- **Key Deliverable:** Code revocation lists and verification rejection logic built.

### CP-017: Dashboards
- **Status:** NOT STARTED
- **Dependencies:** CP-012, CP-013, CP-015
- **Key Deliverable:** Brand portal analytics, threat mapping, and system monitoring UIs built.

### CP-018: PWA
- **Status:** NOT STARTED
- **Dependencies:** CP-012, CP-017
- **Key Deliverable:** Consumer scan Progressive Web App with offline scan caching built.

### CP-019: TraceNet Integration
- **Status:** NOT STARTED
- **Dependencies:** CP-013
- **Key Deliverable:** Supply-chain logistics event ingestion connectors implemented.

### CP-020: AgriStack Integration
- **Status:** NOT STARTED
- **Dependencies:** CP-013
- **Key Deliverable:** Farm registry data mappings and regulatory compliance exports built.

### CP-021: Testing
- **Status:** NOT STARTED
- **Dependencies:** CP-005
- **Key Deliverable:** Comprehensive load-testing, penetration testing, and QA cycles completed.

### CP-022: Pilot Release
- **Status:** NOT STARTED
- **Dependencies:** CP-006 through CP-021
- **Key Deliverable:** Staging environment pilot run with select brand partners completed.

### CP-023: Production Release
- **Status:** NOT STARTED
- **Dependencies:** CP-022
- **Key Deliverable:** Production deployment, GA release, SLA tracking, and post-launch monitoring live.

---

## Cross-References

| Document | Purpose |
|----------|---------|
| [MASTER_PLAN.md](../../governance/MASTER_PLAN.md) | Authoritative project roadmap |
| [ACTIVE_CHECKPOINT.md](ACTIVE_CHECKPOINT.md) | Current checkpoint status |
| [ROADMAP.md](ROADMAP.md) | Phased delivery plan |
| [PROGRESS.md](PROGRESS.md) | Completion metrics |
