# AgriStack Land Registry & CPQ Integration Specification

## 1. Executive Summary
CapMint integrates with the **AgriStack** digital agriculture ecosystem to verify farmer identity, land parcel geo-boundaries, and crop yield estimates before authorizing barcode minting capacity.

---

## 2. Geo-Boundary & Plot Registry

### 2.1 Plot & Hive Cluster Data Model (`plots_or_hive_clusters`)
*   `agristack_reference`: Unique land parcel identifier provided by state land registries (e.g. `UP-KAS-2026-9912`).
*   `geo_boundary`: GeoJSON polygon encoding spatial GPS coordinates of the farm or apiary site.
*   `crop_type`: Designated crop category (e.g. `Organic White Honey`, `Basmati Rice`, `Darjeeling Tea`).

---

## 3. Capacity Price Quote (CPQ) & Budget Drawdown Rules

To prevent **over-minting** (minting more QR codes than a farm can physically produce), CapMint enforces mathematical capacity constraints (`CPQ-09` to `CPQ-14`).

### 3.1 Mathematical Drawdown Logic
$$\text{Remaining Balance} = \text{Approved Quantity} - \text{Consumed Quantity}$$

1.  **Zero / Negative Drawdown (`CPQ-10`, `CPQ-11`):** Requests for 0 or negative quantities return `400 Validation Error`.
2.  **Exact Balance Drawdown (`CPQ-12`):** Drawing down the exact remaining balance sets `status = EXHAUSTED` and `remaining_quantity = 0.00`.
3.  **Exhausted Budget Drawdown (`CPQ-13`):** Any attempt to draw down after `status = EXHAUSTED` or requesting an amount $> \text{remaining\_quantity}$ returns `400 / 422 Business Rule Error`.
4.  **Concurrent Drawdown Safety (`CPQ-14`):** PostgreSQL transactional locks (`SELECT ... FOR UPDATE`) ensure concurrent drawdown requests cannot double-spend capacity.
