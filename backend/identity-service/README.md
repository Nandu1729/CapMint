# identity-service — approved future boundary (not implemented)

This directory is a documented future build, not a shipped service: it has no package manifest
or `src/index.ts` and is not part of the running system. Its bounded purpose is tenant-scoped
organization, producer, certifier, and agricultural-origin profile ownership; user credentials,
JWT issuance, and RBAC remain with auth-service.

Implementation requires a separate architecture and migration gate. See the current
[placeholder-service disposition](../../docs/architecture/PLACEHOLDER_SERVICES.md).
