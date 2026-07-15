# Folder Index: API Contract [API-INDEX]

This directory houses the OpenAPI contracts, JSON validation schemas, and webhook endpoint specifications for CapMint services.

## 1. Canonical Documents

| Document | Purpose | Canonical Owner | Related Documents | Stable Section Identifiers |
|---|---|---|---|---|
| **[API_BLUEPRINT.md](API_BLUEPRINT.md)** | Consolidated API routes, standard envelopes, webhook signature verifications, and retry policies. | Integration Team | None | `[API-001]` to `[API-006]` |

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

---

## 4. Section Identifier Mappings

### API_BLUEPRINT Section Identifiers
- `[API-001]` : [1. Executive Summary](API_BLUEPRINT.md#1-executive-summary-api-001)
- `[API-002]` : [2. API Endpoint Catalog](API_BLUEPRINT.md#2-api-endpoint-catalog-api-002)
- `[API-003]` : [3. Global Schema Conventions](API_BLUEPRINT.md#3-global-schema-conventions-api-003)
- `[API-004]` : [4. HTTP Status Code Mapping Matrix](API_BLUEPRINT.md#4-http-status-code-mapping-matrix-api-004)
- `[API-005]` : [5. Webhooks & Client Contracts](API_BLUEPRINT.md#5-webhooks--client-contracts-api-005)
- `[API-006]` : [6. Checkpoint Review Logs](API_BLUEPRINT.md#6-checkpoint-review-logs-api-006)
