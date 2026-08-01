# Render Free-Tier Practice Deployment

This adapter deploys the complete CapMint single-box stack as one Render web service,
with one free Render Postgres database and one free Render Key Value instance. It is a
practice/staging deployment only, not a production cutover.

## What the Blueprint creates

| Resource | Blueprint name | Plan | Purpose |
|---|---|---|---|
| Web service | `capmint-practice` | Free | Gateway on Render's public `$PORT` plus seven backends on localhost ports 8081–8087 |
| PostgreSQL | `capmint-practice-db` | Free | Schema, RLS policies, administrator, and practice data |
| Key Value | `capmint-practice-redis` | Free | Login and verification rate-limit state |

The web service connects to Postgres in two distinct phases:

1. `scripts/render-start.js` uses `ADMIN_DATABASE_URL`, the Render-managed database-owner
   URL, for migrations, `capmint_app` credential provisioning, and first-admin bootstrap.
2. Before `npm start`, it derives `DATABASE_URL` for the literal role `capmint_app`, proves
   that the role is non-owner, non-superuser, and `NOBYPASSRLS`, and removes the owner URL
   and bootstrap secrets from the child-process environment. Every backend then repeats
   the repository's `assertRlsServiceRole` startup guard.

No `.env`, password, JWT secret, or PEM is stored in the repository.

## Before deploying

1. Sign in to [Render](https://dashboard.render.com/) and connect the GitHub account that
   can read the CapMint repository.
2. Confirm the workspace does not already consume its single free Postgres or single free
   Key Value allowance.
3. Push the reviewed `feat/ho-025-render-free-deploy` branch. The Blueprint temporarily
   targets that branch for the gated practice run. After integration, change `branch` in
   `render.yaml` to the long-lived reviewed branch before deleting the feature branch.
4. Choose these non-secret administrator identity values:

   - `CAPMINT_BOOTSTRAP_ADMIN_USERNAME`: 3–100 letters, digits, `.`, `_`, or `-`.
   - `CAPMINT_BOOTSTRAP_ADMIN_ORG_NAME`: 3–255 characters.
   - `CAPMINT_BOOTSTRAP_ADMIN_EMAIL`: the practice administrator's valid email address.

Render generates `CAPMINT_BOOTSTRAP_ADMIN_PASSWORD`. It must satisfy the bootstrap policy:
16–128 characters with lowercase, uppercase, a number, and a symbol, and it must not contain
the username or email local part. Render's generated 256-bit base64 value normally meets
this policy; if bootstrap reports `WEAK_PASSWORD`, replace it in the dashboard with a new
strong value and redeploy.

## Create the Blueprint

1. In the Render Dashboard, select **New +** → **Blueprint**.
2. Connect `Nandu1729/CapMint` and select the branch containing `render.yaml`.
3. Give the Blueprint a recognizable name such as `capmint-practice`.
4. Render prompts for the three `sync: false` values. Enter the administrator username,
   organization name, and email selected above. Do not paste any database or application
   secret.
5. Review the plan. It must show exactly one free web service, one free Postgres database,
   and one free Key Value instance. Apply the Blueprint.
6. Open the `capmint-practice` web service and watch **Logs**. A safe first boot follows
   this sequence (values and credentials are intentionally absent):

   ```text
   [render-start] database: owner identity and CREATEROLE capability verified
   [render-start] migrate: empty schema detected; applying immutable baseline and migrations 0010-0020
   [render-start] migrate: baseline bootstrap completed
   [render-start] migrate: migration state is current through 0020
   [render-start] role: capmint_app LOGIN configured; elevated attributes and table ownership absent
   [render-start] role: derived service DATABASE_URL authenticated as non-owner capmint_app
   [render-start] bootstrap: first administrator created
   [render-start] boot: starting gateway and seven services; provisioning secrets removed from child environment
   ```

   On a redeploy, the baseline line changes to `recorded schema detected; baseline bootstrap
   skipped`, and bootstrap reports `administrator already exists; idempotent bootstrap skipped`.

If startup stops with `OWNER_CANNOT_CREATE_ROLE`, Render's owner lacks the required
`CREATEROLE` capability. Stop the deployment and escalate; do not edit migration 0015,
pre-create an unsafe owner service role, or bypass `assertRlsServiceRole`.

## Generated and derived environment

| Variable | Source |
|---|---|
| `ADMIN_DATABASE_URL` | Render `fromDatabase.connectionString`; owner-only provisioning URL |
| `DATABASE_URL` | Derived in memory from the owner URL's host/database plus `capmint_app` and `CAPMINT_APP_PASSWORD` |
| `CAPMINT_APP_PASSWORD` | Render `generateValue: true`; never logged |
| `REDIS_URL` | Render Key Value internal `connectionString` |
| `JWT_SECRET`, `WEBHOOK_SECRET` | Render `generateValue: true` |
| `CAPMINT_CERTIFIER_KEY_SEED` | Render `generateValue: true` |
| `CERTIFIER_PRIVATE_KEY`, `CERTIFIER_PUBLIC_KEY` | Deterministically derived in memory from the stable generated seed using a 32-byte SHA-256 seed and Ed25519 PKCS#8; never written to disk or logged |
| `BASE_URL`, `CORS_ORIGIN`, `VERIFY_FRONTEND_URL` | Set at boot to Render's injected `RENDER_EXTERNAL_URL` |
| `PORT` | Render default; consumed only by the gateway. Backend child commands override it with 8081–8087 |
| `TRUST_PROXY` | `1`, because Render is the single trusted ingress hop |

To provide an externally managed certifier key instead, add both
`CERTIFIER_PRIVATE_KEY` and `CERTIFIER_PUBLIC_KEY` in the web service's Environment page.
The adapter accepts actual multiline PEMs or literal `\n` separators, verifies that they
form a matching Ed25519 pair, and refuses partial or mismatched configuration.

## Verify the deployment

1. In the web service **Settings** page, copy the service's `onrender.com` URL. Render also
   exposes it to the process as `RENDER_EXTERNAL_URL`.
2. Open the URL in a browser. The CapMint frontend must load over HTTPS.
3. Confirm the gateway and auth route without exposing credentials:

   ```bash
   curl -i https://<service-name>.onrender.com/
   curl -i https://<service-name>.onrender.com/api/v1/auth/health
   ```

   Both requests return `200`; the second body identifies `auth-service`, proving the
   gateway-to-backend path.
4. Retrieve the generated `CAPMINT_BOOTSTRAP_ADMIN_PASSWORD` from the web service's
   **Environment** page and log in with the administrator username:

   ```bash
   curl -sS -X POST https://<service-name>.onrender.com/api/v1/auth/login \
     -H 'content-type: application/json' \
     --data '{"username":"<admin-username>","password":"<generated-password>"}'
   ```

   Do not paste the response token into logs or tickets.
5. Until a real practice code is minted, verify the public consumer route is live and
   fail-closed with an unknown code:

   ```bash
   curl -i -X POST \
     https://<service-name>.onrender.com/api/v1/verify/00000000000000/UNKNOWN \
     -H 'content-type: application/json' \
     --data '{"lat":0,"lon":0,"device_metadata":{"source":"render-practice"}}'
   ```

   Expected: `404 CODE_NOT_FOUND`, not a gateway error or `500`. After creating and minting
   a practice lot through the UI, repeat with its GTIN/serial and expect the normal verified
   consumer response.
6. Select **Manual Deploy** → **Deploy latest commit**. Confirm the recorded-schema and
   administrator-skip log messages and repeat the checks. This proves redeploy idempotence.

## Logs, limits, and stopping conditions

- Open the web service → **Logs** to search by `[render-start]`, service name, or request ID.
- Free web services spin down after 15 idle minutes; the next request can take about a
  minute. Free Postgres expires after 30 days and has no backups. Free Key Value data is
  in-memory and can disappear on restart. These are acceptable only for practice.
- The free web service has 512 MB RAM. First run the full eight-process stack. If Render
  reports an out-of-memory termination, stop and capture the event. Do not silently omit
  services; a separately reviewed `CAPMINT_SERVICES` subset can be added only after that
  evidence exists.
- Never replace `DATABASE_URL` with `ADMIN_DATABASE_URL`. If any backend's startup guard
  rejects its database identity, treat the deploy as failed and investigate configuration.
