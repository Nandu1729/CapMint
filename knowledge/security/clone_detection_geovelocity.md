# Spatial-Temporal Geovelocity Clone Detection Specification

## 1. Executive Overview
To prevent physical QR code cloning and illicit copying of packaging barcodes, CapMint executes real-time **geovelocity anomaly detection** on every consumer QR scan (`scan_events`).

---

## 2. Geovelocity Calculation Formula

When a barcode is scanned at Location $B$ $(\text{lat}_2, \text{lon}_2)$ at time $t_2$, following a previous scan at Location $A$ $(\text{lat}_1, \text{lon}_1)$ at time $t_1$:

1.  **Haversine Great-Circle Distance ($D$):** Calculates geographical distance in kilometers between two GPS coordinates.
2.  **Time Delta ($\Delta t$):** Calculates elapsed time in hours ($t_2 - t_1$).
3.  **Apparent Velocity ($V$):**
    $$V = \frac{D \text{ (km)}}{\Delta t \text{ (hours)}}$$

---

## 3. Risk Level Classification & Trigger Rules

### 3.1 Velocity Thresholds (`CLONE-01`, `CLONE-02`)
*   **Impossible Travel Speed ($V > 900 \text{ km/h}$):** Scans occurring across locations faster than commercial air travel velocity are flagged as **`CLONE-SUSPECT`** with risk level **`CRITICAL`**.
*   **Normal Human Travel ($V \le 900 \text{ km/h}$):** Nearby or sequential scans within physical travel limits are flagged as **`VERIFIED`** with risk level **`LOW`**.

### 3.2 Automatic Case Investigation (`CLONE-04`)
When a scan is flagged as `CRITICAL` risk:
1.  The `unit_codes.clone_flag` boolean is set to `TRUE`.
2.  An investigation case is automatically created in the `investigations` table with `status = 'OPEN'`.
3.  An entry is appended to the Transparency Ledger for regulatory audit.
