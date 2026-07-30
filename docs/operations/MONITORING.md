# CapMint Prometheus Monitoring

CapMint exposes Prometheus metrics from all seven backend services. The checked-in
configuration scrapes each service every 15 seconds and loads baseline availability,
application-error, RLS, signature, and ledger-append alert rules.

## Service targets

| Prometheus job | Service | Target |
|---|---|---|
| `capmint-auth` | Auth | `localhost:8081/metrics` |
| `capmint-cpq` | CPQ | `localhost:8082/metrics` |
| `capmint-mint` | Mint | `localhost:8083/metrics` |
| `capmint-resolver` | Resolver | `localhost:8084/metrics` |
| `capmint-transparency` | Transparency | `localhost:8085/metrics` |
| `capmint-verification` | Verification | `localhost:8086/metrics` |
| `capmint-integration` | Integration | `localhost:8087/metrics` |

The shipped targets assume Prometheus runs in the same network namespace as the
services. For a distributed deployment, replace only the target hostnames with the
services' internal DNS names; retain the job names because the alert rules use them as
stable, low-cardinality service identifiers.

## Validate the configuration

Run both checks from `ops/monitoring`:

```bash
cd ops/monitoring
promtool check config prometheus.yml
promtool check rules alerts.yml
```

Expected output includes `SUCCESS` for the configuration and the rule file. These checks
validate syntax and rule expressions; they do not require the CapMint services to be
running.

## Run Prometheus

Start all seven backend services first, then run Prometheus from the monitoring
directory so the relative rule-file path resolves:

```bash
cd ops/monitoring
prometheus \
  --config.file=prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus-capmint
```

Open `http://localhost:9090/targets` and confirm all seven jobs are `UP`. The expression
`up{job=~"capmint-.*"}` should return one sample per service. Active and pending alerts
are visible at `http://localhost:9090/alerts`.

From the repository root, a Linux container with host networking can use the
checked-in files directly:

```bash
docker run --rm --network=host \
  -v "$PWD/ops/monitoring:/etc/prometheus:ro" \
  prom/prometheus:v3.13.2 \
  --config.file=/etc/prometheus/prometheus.yml
```

Docker Desktop does not always map container `localhost` to the host. In that case,
run Prometheus natively or use deployment-specific internal service hostnames in a
mounted copy of the scrape configuration.

## Baseline alert behavior

| Alert | Condition | Severity |
|---|---|---|
| `CapMintServiceDown` | A configured service has `up == 0` for one minute | Critical |
| `CapMintHigh5xxRate` | More than 0.1 HTTP 5xx responses/second for five minutes | Warning |
| `CapMintHighHandledErrorRate` | More than 0.5 `errors_total` events/second for five minutes | Warning |
| `CapMintRlsDenialSpike` | At least five `FORBIDDEN` errors in five minutes | Critical |
| `CapMintSignatureVerificationFailureSpike` | At least three signature failures in five minutes | Critical |
| `CapMintLedgerAppendFailure` | Any failed ledger append in five minutes | Critical |

`errors_total{code="FORBIDDEN"}` is the available normalized signal for PostgreSQL
`42501`/RLS denials. It can also represent an explicit application `FORBIDDEN` error, so
operators should correlate this alert with the structured request log and PostgreSQL log
before attributing the cause.

The ledger rule uses a five-minute increase instead of testing the lifetime counter
directly. This makes the alert recover after the incident window rather than remaining
permanently active after the first failure.

Prometheus evaluates rules but does not send notifications by itself. Configure
Alertmanager separately for the deployment and route `critical` and `warning` severities
to the appropriate operator channels. Restrict network access to Prometheus and backend
`/metrics` endpoints; the metrics are intended for the trusted operations network.

## Validation report

Validated on 2026-07-30 with `promtool` 3.13.2:

```bash
cd ops/monitoring
promtool check config prometheus.yml
promtool check rules alerts.yml
```

Both commands exited zero. The config check reported `SUCCESS: 1 rule files found`
and valid Prometheus config syntax; the rules check reported
`SUCCESS: 6 rules found`.
