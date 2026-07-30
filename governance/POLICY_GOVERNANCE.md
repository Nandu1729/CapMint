# Policy Governance

This document governs the system-wide validation rules, mathematical policy equations, and external data verification constraints that protect the platform against fraud and over-issuance.

---

## 1. AgriStack Land Plot Policy

Producers cannot request yield budgets for arbitrary plots. All land claims must undergo georeferenced coordinate validation:

1.  **Identity Verification:** The plot owner's registered ID must match the AgriStack registry record.
2.  **Overlap Prevention:** Coordinate polygons submitted for plot registration must not intersect or overlap with previously verified plots in the registry database.
3.  **Hectare Matching:** The database records plot size in hectares directly from AgriStack records; operator-entered estimates are prohibited.

---

## 2. Yield Quota Cap Formula

The maximum approved crop capacity (in kilograms) for any quota budget is mathematically bounded by the theoretical yield capacity of the associated land plot:

$$\text{ApprovedQuota}_{\text{max}} = \sum \left( \text{PlotArea}_{\text{hectares}} \times \text{CropYieldConstant} \right)$$

*   **`CropYieldConstant`:** A conservative, crop-specific output factor (e.g. 2,500 kg/hectare for Organic Mustard Honey) defined and frozen by the certification body.
*   **Enforcement:** Budget proposals requesting capacity exceeding $\text{ApprovedQuota}_{\text{max}}$ are blocked at the Fastify validation gate.

---

## 3. Serial Number Integrity Policy

All serialized identifiers must satisfy the following validation rules before being registered:

*   **GS1 Digital Link Format:** Must be formatted as a valid GS1 Digital Link URL containing a 14-digit GTIN and a secure serial code.
*   **GTIN-14 Validation:** The GTIN segment must pass the GS1 check digit validation algorithm.
*   **CSPRNG Entropy:** Serial strings must have at least 72 bits of entropy (using alphanumeric secure characters) to prevent guessing and dictionary attacks.
