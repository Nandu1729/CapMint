# CapMint Cryptographic Specification

## 1. Executive Summary
CapMint implements end-to-end cryptographic proof mechanisms to guarantee data origin authenticity, tamper evidence, and non-repudiation across crop capacity allocations, lot certifications, and log entries.

---

## 2. Cryptographic Algorithms

### 2.1 Digital Signatures (Ed25519)
*   **Algorithm:** Edwards-curve Digital Signature Algorithm (Ed25519 / EdDSA over Curve25519).
*   **Key Size:** 256-bit private keys, 256-bit public keys (formatted as PEM or Base64).
*   **Usage:** Certifying authorities digitally sign capacity budgets (`signature_bundle`) and lot approval events.
*   **Properties:** High verification speed, immune to side-channel attacks, compact signature size (64 bytes).

### 2.2 Hash Functions (SHA-256)
*   **Algorithm:** Secure Hash Algorithm 256-bit (SHA-256).
*   **Output:** 64-character hexadecimal string.
*   **Usage:**
    1.  **NABL Laboratory Reports:** Computing SHA-256 digest of PDF test reports (`report_hash`) to detect unauthorized document alterations.
    2.  **Transparency Ledger:** Linking blocks via parent-child hash pointers (`previous_hash` ➡️ `current_hash`).

---

## 3. Cryptographic Chain Log Hashing

Each entry in the Transparency Ledger computes its block hash using SHA-256 over canonical JSON payloads:

```text
current_hash = SHA256( previous_hash + entity_type + entity_id + event_type + payload_hash + timestamp )
```

### Genesis Block Exception
*   **Genesis Anchor Identifier:** `GENESIS_BLOCK_ANCHOR`
*   **Genesis Hash:** `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (SHA-256 of empty string `""`).
*   **Genesis Parent:** `'00000000-0000-0000-0000-000000000000'`

---

## 4. JWT Authentication
*   **Algorithm:** HMAC-SHA256 (`HS256`).
*   **Expiration:** Short-lived access tokens with role claims (`ADMIN`, `MEMBER`) and organization IDs.
*   **Security:** Cryptographically signed tokens block tampering attempts (`SEC-03`).
