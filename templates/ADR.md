# ADR-[NNN]: [Decision Title]

> **Architecture Decision Record** — CapMint Anti-Counterfeiting Platform

---

| Field             | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| **ADR Number**    | ADR-[NNN] <!-- Sequential, zero-padded: ADR-001, ADR-002 --> |
| **Title**         | [Concise decision title]                                     |
| **Date Proposed** | YYYY-MM-DD                                                   |
| **Date Decided**  | YYYY-MM-DD                                                   |
| **Status**        | `PROPOSED` · `ACCEPTED` · `DEPRECATED` · `SUPERSEDED`        |
| **Superseded By** | ADR-[NNN] <!-- If status is SUPERSEDED; otherwise remove --> |
| **Author(s)**     | @[github-handle], @[github-handle]                           |
| **Reviewers**     | @[github-handle], @[github-handle]                           |
| **Module(s)**     | <!-- e.g., auth, labeling, verification, blockchain -->      |
| **Checkpoint**    | [CP-NNN](../checkpoints/CP-NNN.md)                          |

---

## 1. Context

<!-- Describe the forces at play, including technical, business, and regulatory constraints.
     - What problem are we solving?
     - What is the current state of the system?
     - What constraints exist (security, compliance, scalability, team expertise)?
     - Link to any relevant issues, RFCs, or prior discussions.
-->

## 2. Decision

<!-- State the decision clearly and concisely.
     - Use active voice: "We will use…", "The system will…"
     - Be specific about scope — which modules, services, or layers are affected.
-->

## 3. Alternatives Considered

### 3.1 [Alternative A Name]

| Aspect       | Details                                      |
| ------------ | -------------------------------------------- |
| **Summary**  | <!-- Brief description of the alternative --> |
| **Pros**     | <!-- Key advantages -->                       |
| **Cons**     | <!-- Key disadvantages -->                    |
| **Why Not?** | <!-- Reason for rejection -->                 |

### 3.2 [Alternative B Name]

| Aspect       | Details                                      |
| ------------ | -------------------------------------------- |
| **Summary**  | <!-- Brief description of the alternative --> |
| **Pros**     | <!-- Key advantages -->                       |
| **Cons**     | <!-- Key disadvantages -->                    |
| **Why Not?** | <!-- Reason for rejection -->                 |

<!-- Add more alternatives as needed. Keep at least two. -->

## 4. Consequences

### 4.1 Positive

- <!-- Benefit 1 -->
- <!-- Benefit 2 -->

### 4.2 Negative

- <!-- Trade-off or cost 1 -->
- <!-- Trade-off or cost 2 -->

### 4.3 Risks

| Risk                  | Likelihood | Impact | Mitigation                  |
| --------------------- | ---------- | ------ | --------------------------- |
| <!-- Risk summary -->  | Low/Med/High | Low/Med/High | <!-- Mitigation plan --> |

## 5. Compliance Check

<!-- CapMint handles anti-counterfeiting data — every ADR must address compliance. -->

| Requirement                          | Status | Notes                                     |
| ------------------------------------ | ------ | ----------------------------------------- |
| GDPR / Data Privacy                  | ✅ / ❌ / N/A | <!-- How does this decision affect PII? -->     |
| Supply-Chain Security (SLSA/SBOM)    | ✅ / ❌ / N/A | <!-- Artifact integrity implications -->        |
| Audit Logging                        | ✅ / ❌ / N/A | <!-- Does this produce auditable events? -->    |
| Blockchain Immutability Constraints  | ✅ / ❌ / N/A | <!-- On-chain vs off-chain implications -->     |
| Regulatory (FDA/EU MDR if relevant)  | ✅ / ❌ / N/A | <!-- Industry-specific compliance -->           |

## 6. Related Documents

- **Feature Spec:** [feature-name.md](../docs/features/feature-name.md)
- **Threat Model:** [threat-model-name.md](../docs/security/threat-model-name.md)
- **API Doc:** [api-endpoint.md](../docs/api/api-endpoint.md)
- **Prior ADR:** [ADR-NNN](./ADR-NNN.md)
- **Checkpoint:** [CP-NNN](../checkpoints/CP-NNN.md)

## 7. Approval

| Role               | Name            | Date       | Decision |
| ------------------ | --------------- | ---------- | -------- |
| **Tech Lead**      | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Security Lead**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Product Owner**  | @[handle]       | YYYY-MM-DD | ✅ / ❌   |
| **Module Owner**   | @[handle]       | YYYY-MM-DD | ✅ / ❌   |

---

> **Usage:** Copy this template → rename to `ADR-NNN-short-title.md` → fill in all sections → submit for review via PR using [PR-template.md](./PR-template.md).
