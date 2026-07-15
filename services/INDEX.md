# Folder Index: Core Services [SERVICES-INDEX]

This directory houses the logical bounded context services that implement the CapMint business domain.

## 1. Service Catalog

| Service | Purpose | Canonical Owner | Related Blueprint | Link to Code / README |
|---|---|---|---|---|
| **Auth Service** (`auth-service`) | Manages user credentials, logins, JWT signing, and RBAC evaluation. | Security Officer | [SECURITY_ARCHITECTURE.md](../architecture/security/SECURITY_ARCHITECTURE.md) | [auth-service/README.md](auth-service/README.md) |
| **CPQ Service** (`cpq-service`) | Manages organic producers, plot registries, and budget allocations. | Service Engineers | [SERVICE_BOUNDARIES.md](../architecture/system/SERVICE_BOUNDARIES.md) | [cpq-service/README.md](cpq-service/README.md) |
| **Mint Service** (`mint-service`) | Enforces capacity allocations and executes serial code minting drawdowns. | Service Engineers | [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md) | [mint-service/](mint-service/) |
| **Verification Service** (`verification-service`) | Computes scan verdicts, maps lab evidence, and logs telemetry. | Service Engineers | [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md) | [verification-service/](verification-service/) |
| **Transparency Service** (`transparency-service`) | Constructs the append-only event ledger and anchors roots. | SRE Team | [DATA_FLOW.md](../architecture/sequence/DATA_FLOW.md) | [transparency-service/](transparency-service/) |
| **Resolver Service** (`resolver-service`) | Redirects consumer GS1 Digital Link calls to verifier web apps. | Integration Team | [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md) | [resolver-service/](resolver-service/) |
| **Integration Service** (`integration-service`) | Manages APEDA TraceNet and government AgriStack integrations. | Integration Team | [SYSTEM_CONTEXT.md](../architecture/system/SYSTEM_CONTEXT.md) | [integration-service/README.md](integration-service/README.md) |
| **End-to-End Tests** (`e2e-tests`) | Integration test suite verifying multi-service transactions. | QA Lead | None | [e2e-tests/README.md](e2e-tests/README.md) |
