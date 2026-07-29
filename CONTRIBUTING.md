# Contributing to CapMint

## Branch & release flow

- **`feat/*` · `fix/*` · `chore/*`** — short-lived work branches.
- **`develop`** — the shared integration/testing line. Work merges here first and is
  exercised end-to-end (frontend + backend, CI, and the disposable-Postgres compliance
  suites) before any release.
- **`main`** — production. **Only `develop` merges into `main`**, and only after the
  pre-production gate (bounded security review, transparency-ledger hardening, and test
  sign-off).
- Never push directly to `main`. Never force-push a shared branch. Never add AI-tool
  attribution to commits or PRs.

## Setup

`node_modules` is **not** tracked. After cloning:

```
cp .env.example .env      # then fill in the local secret values
npm ci                    # install all workspace dependencies
```

See `.env.example` for every variable the services read, including the **DM-04 role
split** (services connect as `capmint_app`; migrations/seed use `capmint_admin`).

The repo-root `.env` is the only backend environment file. Every service resolves that
exact path regardless of its workspace current directory. Do not create
`backend/*-service/.env` files or symlinks. Service startup queries PostgreSQL before
binding its port and refuses any role other than `capmint_app`, as well as any superuser,
`BYPASSRLS` role, or owner of an RLS-enabled table.

For development fixtures, generate one fresh Ed25519 keypair and use it for both
`CAPMINT_DEVELOPMENT_CERTIFIER_PRIVATE_KEY` / `_PUBLIC_KEY` and
`CERTIFIER_PRIVATE_KEY` / `_PUBLIC_KEY`. Never reuse fixture or compromised key material.

## Database & migration discipline (non-negotiable)

Migrations are validated on **disposable databases** until architect-approved. **Do NOT
apply an unmerged/unapproved migration to the shared `capmint_dev`.**

The migration runner records a checksum for every applied migration and will **hard-error
if an already-applied migration's file later changes.** That is the tamper guard working
as intended — **do not add a checksum-bypass/"reconcile" mode.** If an unmerged migration
needs to change after it was applied to `capmint_dev`, **reprovision `capmint_dev`** (it is
rebuildable, not precious); do not edit `migrations_log` by hand.

- Validate migrations on throwaway databases — the compliance suites create disposable
  databases automatically.
- Keep `capmint_dev` reprovisionable.
- Runner: `playground/run_migrations.js` — modes `--check`, `--plan`, `--apply`,
  `--adopt`, `--bootstrap`. It does **not** create the database itself.

### Reprovisioning `capmint_dev`

Because of the DM-04 role split, run migrations/seed as the **owner** (`capmint_admin`) and
the services as `capmint_app`:

1. Configure the local repo-root `.env`, including matching `DATABASE_URL`
   (`capmint_app`) / `CAPMINT_APP_PASSWORD`, owner-only `ADMIN_DATABASE_URL`, development
   seed password, and one aligned Ed25519 keypair.
2. Preview the guarded local-only reset with `npm run db:reset`; confirm app LOGIN and seed
   are both enabled in the plan.
3. Run `npm run db:reset -- --yes`. It recreates the empty database, bootstraps the
   immutable baseline, applies newer migrations as `capmint_admin`, provisions
   `capmint_app` LOGIN, and seeds development fixtures as the owner.
4. Run `npm run dev`. All seven services load only the root `.env` and fail closed unless
   PostgreSQL identifies the runtime connection as the safe `capmint_app` role.

## Commits

Conventional Commits (`type(scope): description`), imperative and lowercase. Stage explicit
paths (never `git add -A`/`.`). Never `--no-verify`.
