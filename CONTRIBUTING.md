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

### Reprovisioning `capmint_dev` (shape)

Because of the DM-04 role split, run migrations/seed as the **owner** (`capmint_admin`) and
the services as `capmint_app`:

1. Drop and recreate the `capmint_dev` database (owner/superuser connection).
2. Apply migrations with `DATABASE_URL` set to the **admin** URL
   (`node playground/run_migrations.js --apply`), ending `SAFE / NO PENDING ACTIONS`.
3. Provision the app login once `0015` exists:
   `ALTER ROLE capmint_app LOGIN PASSWORD '<capmint_app_password>';`
4. Seed development fixtures as the owner (`CAPMINT_ALLOW_DEVELOPMENT_SEED=1`,
   `NODE_ENV=development`, admin `DATABASE_URL`): `npm run seed:development`.

> A guarded `npm run db:reset` wrapper — using `CAPMINT_EXPECTED_DATABASE_PREFIX` to refuse
> dropping any database whose name is not a dev database — is a planned follow-up so this
> is a single safe command.

## Commits

Conventional Commits (`type(scope): description`), imperative and lowercase. Stage explicit
paths (never `git add -A`/`.`). Never `--no-verify`.
