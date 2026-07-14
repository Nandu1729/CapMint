# CapMint — Integration Service (@capmint/integration-service)

## 1. Overview
The `@capmint/integration-service` microservice owns the external integrations and queries to government digital registries (TraceNet NPOP database and AgriStack digital land records).

It exposes REST endpoints under `/api/v1/integrations` to validate operator credentials and sync farmer parcel configurations.

---

## 2. API Schema Definitions

### 2.1 TraceNet Certificate Validation
*   **Method**: `GET`
*   **Path**: `/api/v1/integrations/tracenet/certificates/:licenseId`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "registry": "TraceNet APEDA Organic Registry",
        "certificate": {
          "license_id": "NPOP-IN-90812",
          "operator_name": "FPO Organic Honey Co.",
          "status": "VALID",
          "max_yield_quota_kg": 10000.00
        }
      }
    }
    ```

### 2.2 AgriStack Farmer Land Search
*   **Method**: `GET`
*   **Path**: `/api/v1/integrations/agristack/farmers/:id`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "registry": "AgriStack (India Digital Ecosystem for Agriculture)",
        "farmer": {
          "farmer_id": "FARMER-901",
          "name": "Ramesh Kumar",
          "plots": [
            {
              "plot_id": "PLOT-01",
              "crop_type": "Organic Mustard / Honey Hive Cluster",
              "geo_boundary": {
                "type": "Polygon",
                "coordinates": [...]
              }
            }
          ]
        }
      }
    }
    ```

---
*End of README.md*
