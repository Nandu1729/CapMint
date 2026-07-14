# CapMint — Cloud Infrastructure Blueprint (CP-004.3)

## 1. Executive Summary

This document represents the deliverables for **CP-004.3 (Terraform configurations & variables mapping)** under the Infrastructure phase. It maps the cloud resources, isolated subnets, network routing boundaries, and database/cache engine node types required to deploy the CapMint system onto professional public cloud providers (e.g. AWS).

The canonical configuration files are stored in the workspace at:
- Variables Schema: [variables.tf](file:///Users/nandyyy/project/CapMint/infrastructure/terraform/variables.tf)
- Main Cloud Architecture: [main.tf](file:///Users/nandyyy/project/CapMint/infrastructure/terraform/main.tf)

---

## 2. Infrastructure Configuration Blueprint

The Terraform stack creates an isolated virtual network containing private data tiers to secure our operational data against public intrusion:

```
[ Internet ]
      │
      ▼
[ Public Subnets ] (API Gateways / Proxies)
      │
      ▼ (VPC routing security group check)
[ Private Subnets ]
      ├── RDS PostgreSQL 15 Instance (operational database)
      └── ElastiCache Redis Cluster (real-time telemetry cache)
```

### 2.1 Core Sub-systems

1.  **Virtual Private Cloud (VPC)**: Creates a logical network boundary using IP range `10.0.0.0/16`.
2.  **Public/Private Subnets**:
    -   *Public Subnets*: Map to availability zones for routing traffic to Nginx API gateways.
    -   *Private Subnets*: Map to secure internal database clusters, fully isolated from direct internet access.
3.  **Relational Database Service (RDS)**: Launches a PostgreSQL 15.3 database engine inside private subnet groups, secured using VPC-wide security ingress rules.
4.  **ElastiCache Replication Group**: Launches a multi-node Redis 7 cluster with transit and at-rest encryption enabled to process geovelocity check telemetry.

---

## 3. Deployment Variables Schema

The following parameters are configured inside [variables.tf](file:///Users/nandyyy/project/CapMint/infrastructure/terraform/variables.tf) to support multiple target environments (development, staging, production):

| Variable Name | Data Type | Default (Staging) | Description / Purpose |
| :--- | :--- | :--- | :--- |
| `project_name` | `string` | `"capmint"` | Prefix naming tag for all cloud resources. |
| `environment` | `string` | `"staging"` | Target runtime environment name. |
| `region` | `string` | `"us-east-1"` | Cloud data center region location. |
| `vpc_cidr` | `string` | `"10.0.0.0/16"` | VPC network CIDR range. |
| `db_instance_class`| `string` | `"db.t4g.medium"` | CPU/RAM hardware tier for PostgreSQL DB. |
| `db_allocated_storage`| `number` | `20` | Storage quota limit in gigabytes. |
| `redis_node_type` | `string` | `"cache.t4g.medium"`| CPU/RAM hardware tier for Redis Cache. |
| `redis_num_cache_nodes`| `number` | `2` | Number of replication cluster nodes. |

---
*End of terraform.md*
