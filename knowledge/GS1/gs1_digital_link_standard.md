# GS1 Digital Link & Identifier Specification

## 1. Executive Overview
CapMint enforces unit-level serialization aligned with the **GS1 Digital Link Standard**. GS1 Digital Link connects physical product packaging to online verification endpoints using web URIs, replacing traditional 1D barcodes with web-resolvable 2D QR codes.

---

## 2. Core Identifiers

### 2.1 GTIN-14 (Global Trade Item Number)
*   **Format:** 14-digit numeric string (e.g., `08901234567890`).
*   **Structure:** Includes Indicator Digit + Company Prefix + Item Reference + Check Digit.
*   **Purpose:** Uniquely identifies the trade item/crop product variant across global supply chains.

### 2.2 Serial Number (CP-003.1)
*   **Format:** 8–64 character alphanumeric string (e.g., `SN847291`).
*   **Uniqueness:** Unique within a given GTIN lot batch and across all concurrent minting drawdowns.
*   **Randomness:** Cryptographically generated to prevent serial guessing attacks.

---

## 3. Web-Resolvable URI Format

GS1 Digital Link URIs follow the standard structure:
```text
https://verify.capmint.org/01/{GTIN}/21/{SERIAL}
```
*   `/01/`: GS1 Application Identifier (AI) for GTIN.
*   `/21/`: GS1 Application Identifier (AI) for Serial Number.

### Resolution Behavior
1.  **Resolver Service Proxy:** Incoming GET requests to `/01/{gtin}/21/{serial}` are proxied to the Resolver Microservice (Port `8084`).
2.  **Public Identifier Lookup:** The resolver maps the GTIN+Serial pair to its internal UUID (`public_identifier`).
3.  **Redirection:** Consumer clients are redirected to the verification detail page `/api/v1/verify/v/{public_identifier}`.

---

## 4. Summary Matrix

| Element | GS1 AI | Format | Example |
| :--- | :--- | :--- | :--- |
| **GTIN-14** | `01` | 14 Numeric Digits | `08901234567890` |
| **Serial Number** | `21` | Alphanumeric (8-64 chars) | `SN847291` |
| **Public Identifier** | N/A | RFC 4122 UUID v4 | `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d` |
| **Digital Link URI** | N/A | Absolute HTTPS URL | `https://verify.capmint.org/01/08901234567890/21/SN847291` |
