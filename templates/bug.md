# BUG-[NNN]: [Bug Title]

> **Bug Report** — CapMint Anti-Counterfeiting Platform

---

## Metadata

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| **Bug ID**       | BUG-[NNN] <!-- Sequential: BUG-001, BUG-002 -->                 |
| **Title**        | [Concise bug title describing the symptom]                       |
| **Reported By**  | @[github-handle]                                                 |
| **Reported On**  | YYYY-MM-DD                                                       |
| **Assigned To**  | @[github-handle]                                                 |
| **Module**       | <!-- e.g., auth, labeling, verification, blockchain, api -->     |
| **Checkpoint**   | [CP-NNN](../checkpoints/CP-NNN.md)                              |
| **Status**       | `OPEN` · `IN_PROGRESS` · `RESOLVED` · `CLOSED` · `WONT_FIX`    |
| **Resolved On**  | YYYY-MM-DD                                                       |

---

## Classification

| Attribute        | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| **Severity**     | `S0 - Critical` · `S1 - Major` · `S2 - Moderate` · `S3 - Minor`|
| **Priority**     | `P0 - Immediate` · `P1 - High` · `P2 - Medium` · `P3 - Low`    |
| **Type**         | `Functional` · `Security` · `Performance` · `Data` · `UI/UX`    |
| **Reproducible** | `Always` · `Intermittent` · `Rare` · `Unable to Reproduce`      |

**Severity Guide:**
- **S0 — Critical:** System down, data loss, security breach, no workaround
- **S1 — Major:** Core feature broken, workaround exists but painful
- **S2 — Moderate:** Feature partially broken, acceptable workaround exists
- **S3 — Minor:** Cosmetic issue, edge case, minor inconvenience

---

## 1. Environment

| Component          | Details                                              |
| ------------------ | ---------------------------------------------------- |
| **Environment**    | `Production` · `Staging` · `Development` · `Local`   |
| **OS / Platform**  | <!-- e.g., Ubuntu 22.04, macOS 14.5, Docker -->      |
| **Browser**        | <!-- e.g., Chrome 125, Firefox 127 (if applicable) -->|
| **App Version**    | <!-- e.g., v0.1.0, commit SHA -->                    |
| **API Version**    | <!-- e.g., v1 -->                                    |
| **Database**       | <!-- e.g., PostgreSQL 16.2 -->                       |
| **Node / Runtime** | <!-- e.g., Node 20.14.0 -->                          |

## 2. Steps to Reproduce

<!-- Numbered steps that reliably trigger the bug. Be precise. -->

1. <!-- Step 1: e.g., "Navigate to /api/v1/labels" -->
2. <!-- Step 2: e.g., "Send POST request with body: { ... }" -->
3. <!-- Step 3: e.g., "Observe response" -->

**Preconditions:**
<!-- Any required state: logged-in user, specific data, feature flags, etc. -->

## 3. Expected Behavior

<!-- What SHOULD happen when following the steps above. -->

## 4. Actual Behavior

<!-- What ACTUALLY happens. Include exact error messages, status codes, and behavior. -->

## 5. Logs & Evidence

### Error Logs

```
<!-- Paste relevant log output. Redact any PII, tokens, or secrets. -->
```

### Screenshots / Recordings

<!-- Attach screenshots, screen recordings, or network traces if applicable. -->

### Stack Trace

```
<!-- Paste the full stack trace if available. -->
```

### Related Request/Response

```jsonc
// Request
{
  // Paste the request that triggered the bug
}

// Response
{
  // Paste the error response
}
```

## 6. Root Cause Analysis

<!-- Fill this section AFTER investigating the bug. -->

**Root Cause:**
<!-- Explain why the bug occurs. Reference specific code, logic errors, or config issues. -->

**Affected Code:**
<!-- Link to the file(s) and line(s) where the bug originates. -->
- `src/[module]/[file]:[line]` — [description]

**Impact Radius:**
<!-- What else might be affected? Other endpoints, modules, or data? -->

## 7. Fix

**Fix Description:**
<!-- Describe the fix at a high level. -->

**PR:** #[PR-number] <!-- Link to the fix PR -->

**Fix Verified By:** @[github-handle] on YYYY-MM-DD

## 8. Regression Test

| Test ID              | Type        | File                           | Description                     |
| -------------------- | ----------- | ------------------------------ | ------------------------------- |
| `TEST-[NNN]`         | Unit/Integ  | `tests/[module]/[file]`        | <!-- What does this test? -->   |

- [ ] Regression test added and passing
- [ ] Existing tests updated if behavior changed
- [ ] No regressions in related test suites

---

## Related Documents

- **Feature Spec:** [feature-name.md](../docs/features/feature-name.md)
- **API Doc:** [api-endpoint.md](../docs/api/api-endpoint.md)
- **Threat Model:** [threat-model.md](../docs/security/threat-model.md) <!-- if security bug -->

---

> **Usage:** Copy this template → rename to `BUG-NNN-short-title.md` → fill metadata + sections 1–5 on report → fill sections 6–8 after investigation and fix.
