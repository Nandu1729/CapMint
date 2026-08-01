# CapMint Infrastructure — STATUS: UNAPPLIED SCAFFOLD

> **None of the infrastructure in this directory is provisioned, deployed, or in use.**
> These are aspirational reference scaffolds only. Do not mistake them for live
> infrastructure. Authoritative project status lives in
> [docs/architecture/ARCHITECTURE_STATUS.md](../docs/architecture/ARCHITECTURE_STATUS.md).

## What is actually here

| Path | Reality |
| :--- | :--- |
| `terraform/` | An AWS blueprint (VPC, RDS PostgreSQL, ElastiCache Redis, security groups). **Never applied. No state file. Secrets are dummy placeholders.** Reference material for a future cloud build — not a deployed environment. |
| `cloud/` | Empty placeholder (`.gitkeep`). No cloud resources exist. |
| `monitoring/` | Empty placeholder (`.gitkeep`). Real monitoring config lives under [`ops/monitoring/`](../ops/monitoring/). |
| `../deployment/kubernetes/` | Empty placeholder (`.gitkeep`). **No Kubernetes manifests, no cluster, no images exist.** |

## What real deployment paths actually exist

- **Local development:** `npm start` (single box, all 7 services + gateway) — see the root README.
- **Free practice deploy:** the single-box Render blueprint (`render.yaml`) on branch
  `feat/ho-025-render-free-deploy`. This is for *learning the go-live process only*, not for real users.
- **Production:** not established. See the
  [Real-World Readiness Checkpoint](../docs/REAL_WORLD_READINESS.md) for what must be true first.

## Why this file exists

Empty placeholder directories and an unapplied Terraform blueprint can read as
"we have cloud infrastructure" when we do not. This note keeps the repository honest so
that architecture and risk decisions are made against reality, not scaffolding.
