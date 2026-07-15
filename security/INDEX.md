# Folder Index: Security Configuration [SECURITY-INDEX]

This directory acts as the index pointer for all security blueprints, threat models, cryptographic algorithms, and role specifications.

## 1. Canonical Security Documentation

All security-related requirements, designs, and guidelines reside in the following canonical files:

*   **[Canonical Security Blueprint](../architecture/security/SECURITY_ARCHITECTURE.md)** (`[SEC-001]` to `[SEC-025]`)
    *   *Purpose*: Houses threat models (over-issuance, double scan cloning), Ed25519 cryptography, and KMS setups.
    *   *Canonical Owner*: Security Officer.
*   **[Repository Security Non-Negotiables](../BRAIN/NON_NEGOTIABLES.md#security-rules-nn-008)** (`[NN-008]`)
    *   *Purpose*: Defines the supreme security rules (fail-closed boundaries, credentials handling).
    *   *Canonical Owner*: CapMint Core OS.
