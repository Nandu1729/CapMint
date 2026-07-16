# Security Governance

This document establishes the security guidelines, cryptographic key management rules, session validations, and VPC network boundary controls for CapMint.

---

## 1. Cryptographic Key Management (HSM)

All system-level signing keys are stored inside a Cloud Key Management Service (KMS) backed by FIPS 140-2 Level 3 Hardware Security Modules (HSMs).

*   **Key Rotation:** KMS system integrity keys undergo automatic rotation annually.
*   **Certifier Keys:** Certification bodies generate their private keys. Public keys are registered in the database, while private keys remain under the certifier's exclusive custody.
*   **Key Revocation:** If a key is compromised, its public key status in the registry is updated to `REVOKED`, immediately blocking all budgets signed with it.

---

## 2. Session & Token Governance

*   **JSON Web Tokens (JWT):** Short-lived tokens are issued at login (maximum expiry window: 1 hour).
*   **Session Storage:** Active session keys are cached in Redis.
*   **Session Revocation:** If an operator logs out or is disabled, their session key is immediately deleted from Redis, causing all subsequent API requests with that JWT to fail.
*   **Failed Login Locks:** A user account is locked for 15 minutes after 5 consecutive failed login attempts to prevent brute-force attacks.

---

## 3. Network Isolation Boundaries

*   **VPC Private Subnets:** All persistent storage layers (PostgreSQL primary/replica and Redis) run inside private subnets, inaccessible from the public internet.
*   **Gateway Proxying:** All incoming API calls pass through Nginx edge routing gates where SSL/TLS 1.3 encryption is terminated, and request payloads are sanitized.
*   **M2M Certificates:** Third-party laboratory APIs connect to CapMint using mutually authenticated TLS (mTLS) with pinned client certificates.
