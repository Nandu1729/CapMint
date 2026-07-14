# CapMint — Authentication Service (@capmint/auth-service)

## 1. Overview
The `@capmint/auth-service` microservice owns the user credentials store, session management, and RBAC context validation for the CapMint platform.

It exposes REST endpoints under `/api/v1/auth` to register profiles, authenticate clients, and resolve JWT signatures.

---

## 2. API Schema Definitions

### 2.1 Register User
*   **Method**: `POST`
*   **Path**: `/api/v1/auth/register`
*   **Payload**:
    ```json
    {
      "username": "operator_fpo_01",
      "password": "secure_password",
      "role": "PRODUCER",
      "associated_entity_id": "optional-uuid"
    }
    ```
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "user": {
          "id": "uuid-generated",
          "username": "operator_fpo_01",
          "role": "PRODUCER",
          "associatedEntityId": "uuid-passed"
        }
      }
    }
    ```

### 2.2 Login User
*   **Method**: `POST`
*   **Path**: `/api/v1/auth/login`
*   **Payload**:
    ```json
    {
      "username": "operator_fpo_01",
      "password": "secure_password"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "token": "eyJhbGciOiJIUzI1NiIsIn...",
        "user": {
          "id": "uuid",
          "username": "operator_fpo_01",
          "role": "PRODUCER"
        }
      }
    }
    ```

## 3. Role-Based Authorization Checks
The service registers two decorator functions on the Fastify instance to authenticate and restrict access to specific user roles:
-   `server.authenticate`: Validates the bearer token in the `Authorization` header.
-   `server.authorize(['ROLE_1', 'ROLE_2'])`: Verifies that the user role matches the specified allowances.

### 3.1 Restricted Endpoints Examples
*   `GET /api/v1/auth/admin-only`: restricted to users with `ADMIN` role.
*   `GET /api/v1/auth/producer-only`: restricted to users with `PRODUCER` role.

---

## 4. Cryptographic Invariants
*   **Password Hashing**: Bcrypt with a salt work factor of 10.
*   **JWT Algorithm**: Signed using standard HMAC-SHA256, carrying user roles to allow down-stream gateway RBAC authorization enforcement.

---
*End of README.md*
