# CI Over-Issuance Data Integrity Canary

## Purpose

The `Over-Issuance Data Integrity Canary` runs
`scripts/check-overfilled-lots.mjs` against a persistent integration database. It fails
when any lot has more issued unit codes than its capacity ceiling.

The report SQL starts an explicit `READ ONLY` transaction. The job does not migrate,
seed, repair, or otherwise mutate the database.

## Required GitHub configuration

Configure both values at **repository** scope under
**Settings → Secrets and variables → Actions**:

| Kind | Exact name | Exact value |
|---|---|---|
| Repository secret | `CAPMINT_INTEGRATION_DATABASE_URL` | One complete PostgreSQL connection URL, described below |
| Repository variable | `RUN_DATA_INTEGRITY_CANARY` | The string `1` |

The secret value must be a single unquoted line in this format:

```text
postgresql://capmint_admin:<percent-encoded-password>@<integration-host>:5432/<integration-database>?sslmode=require
```

Use the dedicated integration database, not production or a developer's
`capmint_dev`. The database must:

- be reachable from GitHub-hosted Ubuntu runners;
- have the promoted schema and RLS policies applied;
- require TLS (`sslmode=require`, or the stronger certificate-verification mode
  required by the provider); and
- expose all `lots` and `unit_codes` rows to the canary connection.

The last requirement matters because this is a global integrity report. A
`capmint_app` connection without a tenant GUC would be filtered by RLS and could return
a false green. The supported current credential is therefore the integration
`capmint_admin` owner. The SQL transaction is read-only, but the credential remains
privileged and must stay exclusively in the GitHub secret.

Percent-encode reserved characters in the username or password. Do not add shell quotes
around the stored URL, and never place it in a repository variable, workflow file,
issue, or job output.

Using the GitHub CLI, the operator can enter the secret interactively and then enable
the repository variable:

```bash
gh secret set CAPMINT_INTEGRATION_DATABASE_URL --repo <owner>/<repository>
gh variable set RUN_DATA_INTEGRITY_CANARY \
  --body 1 \
  --repo <owner>/<repository>
```

The first command prompts for the secret value without requiring it on the command
line. The operator owns these repository settings; this change only wires their use.

## Gate behavior

GitHub does not permit direct `secrets.*` references in a job-level `if`. The workflow
therefore uses `Over-Issuance Canary Configuration Gate` to emit only
`database_configured=true|false`; it never emits the URL. The canary job's `if` requires:

1. `vars.RUN_DATA_INTEGRITY_CANARY == '1'`;
2. the gate's `database_configured` output to equal `true`; and
3. the event not to be a pull request from a fork.

| Repository variable | Repository secret | Event | Canary job |
|---|---|---|---|
| `1` | Present and non-empty | Push or same-repository PR | Runs |
| Missing, empty, or not `1` | Any | Any | Skipped |
| `1` | Missing or empty | Push or same-repository PR | Skipped |
| `1` | Any | Fork pull request | Skipped |

The existing `Require Integration Database` step remains as a defensive assertion after
the job-level gate. GitHub injects the secret only as the canary process's
`DATABASE_URL`; the workflow never prints it.

To disable the check without deleting the secret, set
`RUN_DATA_INTEGRITY_CANARY` to `0` or delete that repository variable.

## Workflow validation

From the repository root:

```bash
actionlint .github/workflows/ci.yml
```

Validation result on 2026-07-30 with `actionlint` 1.7.12: the command exited zero with
no findings. After the operator configures both repository settings, confirm the next
`develop` push shows:

- `Over-Issuance Canary Configuration Gate` passing; and
- `Over-Issuance Data Integrity Canary` running and printing
  `Capacity integrity canary passed: no over-issued lots found.`

If the canary reports rows, treat the run as a data-integrity incident. Do not weaken
the query or delete issued unit codes to force a green result.
