# AGENTS.md — CapMint Repository Brain

> **Read this first, every session.** This is the single source of orientation for any AI agent
> (Claude Code, Codex, GPT) working in this repo. It carries what the code and git history don't:
> the architecture, the rules, the roles, the current state, and the discipline. When this file and
> a README disagree, **this file and `docs/architecture/ARCHITECTURE_STATUS.md` win.**

---

## 1. What CapMint is
An **anti-counterfeiting / origin-provenance platform** for organic agricultural exports (India,
NPOP/APEDA regime). It caps issuance to certified capacity, serializes every unit as a QR, and lets
anyone verify authenticity with a scan. **Core value = the metered mint** (see §4).

## 2. Architecture (verify against code before relying on details)
- **Stack:** TypeScript · Node + **Fastify** · **PostgreSQL** (Row-Level Security) · **Redis** (rate limiting).
- **7 real backend services**, each a single `backend/<name>-service/src/index.ts`:
  `auth :8081` · `cpq/budgets :8082` · `mint :8083` · `resolver :8084` · `transparency :8085` ·
  `verification :8086` · `integration :8087`. (`identity-service` is a placeholder/stub.)
- **Gateway:** `scripts/frontend-server.js` (:8080) serves the static frontend and proxies `/api/*`,
  `/01/`, `/log` to the services. Not a production gateway.
- **Shared:** `packages/shared/` — `logging`, `readiness`, `errors`, `metrics`, `tenant-db`, `capacity`.
- **Frontends:** original `frontend/index.html` (served at `/`); newer clean console
  `frontend/app.html` (served at `/app.html`, wired to the real backend, isolated).
- **Migrations:** `playground/run_migrations.js` (`--bootstrap` / `--apply`), migrations `0001–0020`.

## 3. Roles & SOP  *(idea adapted from MetaGPT's `Code = SOP(Team)`)*
- **Architect (Claude / this agent):** design, review, governance, and **verification**. Owns
  architecture decisions (AD-NNN), records reviews. Does NOT bulk-implement when budget is tight.
- **Implementer (Codex):** implementation, via handoffs (HO-NNN). Runs the heavy code changes.
- **Operator (Nandu):** final sign-off, real-world actions, credentials, go-live. The human gate.
- **Division rule:** Architect designs + writes the Codex handoff + verifies the result; Codex
  builds. Conserve the architect's budget by delegating large implementation to Codex.

## 4. The core invariant — Metered Mint
**You can never issue more genuine unit codes than were certified.** Minting is gated by a
certifier-signed capacity budget (`packages/shared/capacity.js`, `reserveLotIssuance`). This is
CapMint's differentiator — competitors (Acviss, etc.) do anti-copy, **not** anti-over-issuance.
Never weaken this guard.

## 5. The Self-Evaluation Loop (the "guardian")  *(idea validated by nexo's guardian/preflight/doctor)*
Run before claiming any task done. Full detail in memory `capmint-self-eval-loop`.
1. **ALIGN** — re-read memory; am I contradicting a settled decision or drifting off what was asked?
2. **GROUND** — never guess; fetch the *real* API shape / read the *real* file; isolate changes.
3. **VERIFY** — run the concrete test (HTTP status, `node --check`, DB query, the real flow). Don't
   write "works/fixed/done" unless I *just observed it*.
4. **HONESTY** — state what I verified vs. did NOT ("serves 200" ≠ "flow works" ≠ "looks right").
5. **PERSIST** — new durable fact/decision → write/update a memory + one line in `MEMORY.md`.

**Drift alarms (stop):** claiming success from memory not observation · "should work" with no test ·
editing working code I don't understand · reopening a settled decision · reporting done without evidence.

## 6. Working conventions (non-negotiable)
- **NO AI attribution — anywhere.** No "Generated with…", no "Co-Authored-By: Claude", no 🤖, in any
  commit, PR, branch, comment, doc, or artifact. (Founder directive.)
- **Conventional Commits:** `type(scope): description` (lowercase, imperative, ≤70-char subject).
  CapMint scopes: `auth, cpq, mint, resolver, transparency, verification, integration, console, ops,
  docs, adr, architecture`.
- **Branches:** feature branch off `develop` (integration) → PR. **Never push to `main`.** Never
  force-push shared branches (`--force-with-lease` only on your own unpushed work). Delete after merge.
- **Never** `git commit --no-verify` · never `git add -A`/`.` (stage explicit paths) · never commit
  `.env`, `.codex/`, or any secret/key material.
- **Secrets:** Ed25519 certifier keys and JWT secret stay out of anything an agent/log can leak.
  Validate on the disposable local DB; never print key material.

## 7. Run it locally
Full detail in memory `capmint-local-dev-runbook`. Quick start:
```
export PATH="$(brew --prefix postgresql@16)/bin:$PATH"   # Postgres 16 (Homebrew) + Redis already set up
npm start                                                 # gateway :8080 + 7 services :8081-8087
# open http://localhost:8080/app.html  (clean console)   stop: lsof -ti:8080,8081,...,8087 | xargs kill
```
**Mock login:** users `admin`/`producer`/`certifier`/`lab`/`exporter`; password = value of
`CAPMINT_DEVELOPMENT_SEED_PASSWORD` in `.env`. DB `capmint_dev` is disposable (`dropdb capmint_dev`).

## 8. The product workflow (the flow to build to)
`Producer requests BUDGET → Certifier approves + cryptographically SIGNS → Lot created → NABL lab
tests → Certifier CERTIFIES lot → MINT QR codes → export gate → Consumer scans → verdict.`
- **Open decision (RW-01):** mint *before* the lab (with an export/attach-after-cert gate) **or**
  mint *after* certification. Leaning: physically **attach the QR after certification** (real-world
  practice), and **verification must never show "certified" until it truly is** (delete the hardcoded
  happy-path timeline). CapMint links to authorities (AgriStack/NABL/TraceNet) — it never *becomes* one.

## 9. Current state & strategy (as of 2026-08-02)
- **Built + hardened**, v1.1.0 promoted to `main`. RLS, capacity guard, observability all in.
- **Not deployed** — go-live deferred until a first real user (memory `capmint-deployment-posture`).
- **Strategy verdict** (memory `capmint-competitive-strategy`): CapMint is a **portfolio / validate-a-buyer**
  effort, **not** a beat-Acviss-head-on business. The metered mint is the only real edge, and it's a
  copyable feature — a real business needs a buyer-mandate/network moat. **Validate demand before building more.**
- **Real-world advisory** (memory `capmint-realworld-advisory-directive`): reason as a real-world
  product architect; surface regulatory/security/UX/ops risks proactively. Launch gate: `docs/REAL_WORLD_READINESS.md`.

## 10. Verified API shapes — do NOT guess these
(Confirmed 2026-08-02; the frontend got these wrong by guessing.)
- login → `data.token` + `data.user{id,username,role,orgId,orgType}`
- `GET /api/v1/budgets` → `data.budgets[]`: `allocated, consumed, status, crop, producer, start, end` (remaining = allocated−consumed)
- `GET /api/v1/verify/lots` → `data.lots[]`: `id, budgetId, crop, weight, status, lab_status, certification_status`
- `GET /log/api/v1/log/entries` → `data.logs[]`: `index, entity, id, event, payloadHash, prevHash, currentHash`
- create lot `POST /api/v1/lots {budget_id, batch_size, product_metadata}` · mint `POST /api/v1/mint {lot_id, gtin, quantity}` · verify `POST /api/v1/verify/:gtin/:serial`

## 11. Where the brain lives
- **Persistent memory (loads every session):** `~/.claude/projects/-Users-nandyyy-Project-CapMint/memory/`
  — index in `MEMORY.md`. Keep it current; **prune/consolidate stale entries** *(idea from nexo's
  memory-consolidation)*; delete memories that turn out wrong.
- **In-repo governance:** `docs/architecture/{ARCHITECTURE_STATUS,DECISIONS,PROMOTION_READINESS}.md`,
  `ARCHITECT_REVIEW_HISTORY.md`, `docs/{SCOPE_BOUNDARY,ORGANIC_PIPELINE,REAL_WORLD_READINESS}.md`.

## 12. Preflight (before you act)  *(idea from nexo's preflight/doctor)*
1. Read this file + `MEMORY.md`. 2. Confirm the task doesn't reopen a settled decision. 3. If touching
data/APIs, check the real shapes (§10) — don't guess. 4. Prefer new files / feature branches over
editing working code. 5. When done, **verify with evidence** and **persist** what's durable.
