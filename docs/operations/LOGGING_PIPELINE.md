# CapMint Production Logging Pipeline

## Decision

All seven backend services continue to emit structured Pino JSON to standard output
through `packages/shared/logging.js`. PM2 captures each service's stdout unchanged into
its own JSON Lines file under `/var/log/capmint`; `pm2-logrotate` bounds and compresses
those files. Startup failures and other direct stderr output go to separate
`*.error.log` files because those lines are not guaranteed to be JSON.

The production flow is:

```text
Fastify/Pino JSON stdout
  -> PM2 process supervision
  -> /var/log/capmint/<service>.jsonl
  -> pm2-logrotate (size/daily rotation, compression, retention)
  -> local JSONL investigation and, optionally, Vector shipping
```

This keeps log transport out of application code, preserves the existing O1 redaction
and request-ID behavior, and avoids PM2's JSON wrapper, which would double-encode each
Pino record. There is no application log-destination variable. `LOG_LEVEL` already
controls verbosity and defaults to `info`.

The checked-in sample is
`ops/logging/ecosystem.config.js`. It manages only the seven backends; the frontend or
ingress should be managed separately.

## Prerequisites and filesystem

The examples assume:

- the release is installed at `/opt/capmint` and `npm run build` has completed;
- the single authoritative production environment is `/opt/capmint/.env`;
- a non-login `capmint` operating-system account owns the release runtime and logs;
- Node is `/usr/bin/node`; and
- PM2 and `pm2-logrotate` are installed for the `capmint` account.

Create the restricted log directory and protect the environment file:

```bash
sudo install -d -o capmint -g capmint -m 0750 \
  /var/lib/capmint /var/log/capmint
sudo chown capmint:capmint /opt/capmint/.env
sudo chmod 0600 /opt/capmint/.env
```

Do not copy secrets into the ecosystem file. Every backend resolves
`/opt/capmint/.env` from its module location and still enforces the
`capmint_app` non-owner database-role guard before binding its port.

## Validate the sample

The ecosystem file is CommonJS so Node can validate it without starting a service:

```bash
node --check ops/logging/ecosystem.config.js
node -e '
  const config = require("./ops/logging/ecosystem.config.js");
  const names = config.apps.map(app => app.name);
  const ports = config.apps.map(app => app.env_production.PORT);
  if (config.apps.length !== 7 || new Set(names).size !== 7 ||
      new Set(ports).size !== 7) process.exit(1);
'
```

The second command verifies seven unique application names and seven unique ports. The
sample also deliberately omits PM2's `log_type: "json"` and `log_date_format` settings,
so PM2 writes each Pino JSON object as the original single line.

Validation result on 2026-07-30 with Node 22.22.3: both commands exited zero. An
additional local structural check resolved all seven built `dist/index.js` entry points,
confirmed unique ports 8081–8087, and confirmed raw JSONL stdout plus separate stderr
paths.

`CAPMINT_ROOT`, `CAPMINT_LOG_DIR`, and `CAPMINT_NODE_BINARY` are operator inputs used
only while loading the PM2 sample; they are not application configuration. Override
them if the release, logs, or Node binary are installed elsewhere.

## Start and persist the services

Run PM2 as the `capmint` account. Set a restrictive umask before it creates log files:

```bash
sudo -u capmint sh -c '
  umask 027
  export PM2_HOME=/var/lib/capmint/.pm2
  cd /opt/capmint
  CAPMINT_ROOT=/opt/capmint \
  CAPMINT_LOG_DIR=/var/log/capmint \
  CAPMINT_NODE_BINARY=/usr/bin/node \
  pm2 start ops/logging/ecosystem.config.js --env production
  pm2 save
'
```

The ecosystem sets `PORT` independently for every process (auth 8081 through
integration 8087), preventing a global port collision. It sets `NODE_ENV=production`
and uses `LOG_LEVEL=info` unless the operator supplies another supported Pino level.
PM2 restarts failed processes with a five-second delay and stops retrying after ten
unstable starts.

Ask PM2 to generate the host-specific startup command as the `capmint` account, execute
the privileged command it prints, and save the process list again:

```bash
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 startup
# Review and execute the privileged command printed by PM2.
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 pm2 save
```

`pm2 startup` prints a privileged installation command tailored to the host. Review it
before running it; do not copy a command generated on another server.

## Configure bounded rotation

Install and configure the rotation module under the same PM2 account:

```bash
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 install pm2-logrotate
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:max_size 100M
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:retain 14
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:compress true
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:workerInterval 30
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 pm2 save
```

This rotates when a file reaches 100 MiB and also at midnight, compresses rotated files,
and retains 14 rotations. These settings apply to all applications managed by that PM2
home. Confirm them with:

```bash
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 pm2 conf
```

Disk-capacity monitoring remains required: retention limits the number of files, while
actual compressed size depends on traffic.

## End-to-end verification

Confirm process health, generate one request, and parse a completion record:

```bash
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 pm2 status
curl --fail --silent http://localhost:8081/health >/dev/null
tail -n 50 /var/log/capmint/auth.jsonl |
  jq -e 'select(.msg == "request completed") |
    has("reqId") and .method == "GET" and .statusCode == 200'
```

Repeat `/health` for ports 8082 through 8087 and verify all PM2 processes are `online`.
The JSONL files should contain request templates rather than concrete route IDs, one
request completion record per request, and `[REDACTED]` in place of configured secret
fields. JWTs, passwords, cookies, PEMs, and raw authorization headers must never appear.

Useful local operations:

```bash
sudo -u capmint env PM2_HOME=/var/lib/capmint/.pm2 \
  pm2 logs capmint-auth --lines 100 --raw
jq -c 'select(.level >= 50)' /var/log/capmint/*.jsonl
ls -lh /var/log/capmint
```

PM2's own state lives under the `capmint` account's PM2 home. Application JSONL files
remain in `/var/log/capmint` so access, disk usage, backup exclusion, and optional
shipping can be managed independently.

## Optional centralized shipping: Vector

Use Vector if centralized retention or cross-host search is required. It is preferred
over adding a transport to each Node service because one agent can:

- checkpoint and tail `/var/log/capmint/*.jsonl` across rotations;
- parse each line as JSON and derive the service from the filename;
- preserve `reqId` for cross-service correlation;
- add only host/environment metadata, without increasing application log cardinality;
- buffer to disk during an upstream outage; and
- ship through TLS to Loki, OpenSearch, or another supported backend.

Configure Vector's file source to include only `*.jsonl`; ingest `*.error.log` through a
separate raw-text source. The transform should attempt `parse_json(.message)`, retain the
original line on parse failure, and reject or redact any additional deployment-specific
secret fields. Enable a bounded disk buffer and authenticated TLS on the selected sink.
Run Vector as a user in the `capmint` group with read-only access to
`/var/log/capmint`.

Vector is optional: PM2 capture, local JSONL inspection, and rotation are the baseline
production pipeline. The centralized sink endpoint, credentials, retention, and tenant
access policy belong to deployment configuration and must not be committed to this
repository.

## Failure handling and security

- A service must not fail merely because a remote log backend is unavailable; Vector's
  disk buffer isolates that failure when shipping is enabled.
- Alert when `/var/log/capmint` approaches its filesystem limit and when Vector drops or
  rejects events.
- Keep the log directory mode `0750` or stricter. Logs include request IDs and may include
  organization IDs, so treat them as operationally sensitive.
- Redaction is defense in depth, not permission to log secrets. Never add JWTs,
  passwords, private keys, full request bodies, or database URLs to log calls.
- Preserve JSON stdout. Do not add shell redirection, PM2 timestamps, or PM2 JSON
  wrapping around the service streams.
