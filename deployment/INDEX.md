# Folder Index: Deployment & Infrastructure [DEPLOYMENT-INDEX]

This directory acts as the index pointer for all deployment architectures, environment variables, subnets, database replication pools, and infrastructure configurations.

## 1. Canonical Deployment Blueprints

*   **[Deployment Architecture](../architecture/deployment/DEPLOYMENT_ARCHITECTURE.md)**
    *   *Purpose*: Maps the target cloud deployment layout, SRE performance requirements, load balancing, CDN edge caches, and disaster recovery.
    *   *Canonical Owner*: DevOps / SRE Lead.

---

## 2. Infrastructure Configurations

*   **[Docker Compose Configuration](../infrastructure/docker/docker-compose.yml)**
    *   *Purpose*: Local container orchestration orchestration definition for multi-service development, database (Postgres), cache (Redis), Nginx Gateway, and mock key environments.
    *   *Canonical Owner*: DevOps / SRE Lead.
*   **[Nginx Proxy Configuration](../infrastructure/nginx/nginx.conf)**
    *   *Purpose*: Directs inbound gateway HTTP requests to appropriate microservices.
    *   *Canonical Owner*: SRE Team / Integration Team.
