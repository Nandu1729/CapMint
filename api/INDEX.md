# Folder Index: API Contract [API-INDEX]

This directory houses the OpenAPI contracts, JSON validation schemas, and webhook endpoint specifications for CapMint services.

## 1. Canonical Documents

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[schemas/api_scaffolding.md](schemas/api_scaffolding.md)** | Route registry and request-response payload scaffolding. | Integration Team | None | None |
| **[schemas/webhooks.md](schemas/webhooks.md)** | Outbound webhook models and validation signatures. | Integration Team | None | None |
| **[openapi/checkpoint_review.md](openapi/checkpoint_review.md)** | Contract verification checklists and API quality gate logs. | Integration Team | None | None |

---

## 2. API Contract Specifications

*   **[openapi/openapi.yaml](openapi/openapi.yaml)** - Production OpenAPI 3.0 contract definition.
*   **[openapi/openapi-local.yaml](openapi/openapi-local.yaml)** - Local Gateway development proxy contract mapping.

---

## 3. JSON Validation Schemas

These are the strict JSON schemas loaded at route prevalidation gates:
*   **[schemas/v1/identity.json](schemas/v1/identity.json)** - Producer, certifier, and plot validation.
*   **[schemas/v1/budgets.json](schemas/v1/budgets.json)** - Capacity allocation and signature envelope.
*   **[schemas/v1/mint.json](schemas/v1/mint.json)** - Serial assignment and capacity drawdown checks.
*   **[schemas/v1/verify.json](schemas/v1/verify.json)** - Public scan check coordinates and telemetry logs.
*   **[schemas/v1/webhooks.json](schemas/v1/webhooks.json)** - Webhook registration parameters.
