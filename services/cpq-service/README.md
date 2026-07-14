# CapMint — CPQ Service (@capmint/cpq-service)

## 1. Overview
The `@capmint/cpq-service` microservice owns the crop budget allocations, remaining capacities, and transactional drawdown check policies for the CapMint platform.

It exposes REST endpoints under `/api/v1/budgets` to draft, activate, and draw down allocations.

---

## 2. API Schema Definitions

### 2.1 Propose / Draft Budget
*   **Method**: `POST`
*   **Path**: `/api/v1/budgets`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Roles allowed**: `PRODUCER`, `ADMIN`
*   **Payload**:
    ```json
    {
      "producer_id": "uuid",
      "certifier_id": "uuid",
      "source_unit_type": "WEIGHT_KG",
      "approved_quantity": 10000.00,
      "yield_assumptions": {
        "crop": "Premium Organic Honey",
        "plot_id": "uuid"
      },
      "signature_bundle": "base64-signed-hash",
      "effective_start_date": "2026-07-11T00:00:00Z",
      "effective_end_date": "2027-07-11T00:00:00Z"
    }
    ```
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "budget": {
          "id": "uuid-generated",
          "producer_id": "uuid",
          "status": "DRAFT"
        }
      }
    }
    ```

### 2.2 Activate Budget
*   **Method**: `POST`
*   **Path**: `/api/v1/budgets/:id/activate`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Roles allowed**: `CERTIFIER`, `ADMIN`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "budget": {
          "id": "uuid",
          "status": "ACTIVE"
        }
      }
    }
    ```

### 2.3 Drawdown Budget
*   **Method**: `POST`
*   **Path**: `/api/v1/budgets/:id/drawdown`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Roles allowed**: `PACK_HOUSE`, `ADMIN`
*   **Payload**:
    ```json
    {
      "amount": 150.00
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "budget": {
          "id": "uuid",
          "approvedQuantity": 10000.00,
          "consumedQuantity": 150.00,
          "remainingQuantity": 9850.00,
          "status": "ACTIVE"
        }
      }
    }
    ```

---

## 3. Cryptographic and Transactional Invariants
*   **Row-Level Locking**: Draws down allocations inside a database transaction block using `SELECT ... FOR UPDATE` to block parallel double-mint race conditions.
*   **State Machine Transitions**: A budget automatically shifts from `ACTIVE` to `EXHAUSTED` when `remaining_quantity` drops to `0`.

---
*End of README.md*
