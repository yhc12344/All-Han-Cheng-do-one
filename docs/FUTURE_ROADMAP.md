# Future Roadmap & Planned Enhancements

This document outlines the architectural blueprints, database schema changes, and data pipelines required to implement the next wave of advanced features in the **Garmin Running Dashboard**.

---

## 🏃 1. Running Dynamics & Form Biomechanics (Ground Contact Time & Oscillation)

Garmin chest straps (HRM-Pro) and running pods record biomechanical telemetry at every second. These fields are present in the FIT file but not yet parsed into the database.

### A. Update the Rust Database Schema (`src-tauri`)
Add three new columns to the trackpoints table:

```sql
stance_time_ms         INTEGER  -- Ground contact time in milliseconds
stance_time_balance    REAL     -- Foot symmetry % (e.g., 49.5 = 49.5% Left)
vertical_oscillation_cm REAL    -- Bounce amplitude in centimeters
```

### B. Update the FIT File Parser (Rust)
In the Tauri FIT reader's record message parsing loop:
* Read `stance_time` field (milliseconds, may need ÷ 10 scale factor per FIT profile).
* Read `stance_time_percent` or `stance_time_balance` (multiply by 0.01 if stored as integer percent × 100).
* Read `vertical_oscillation` (stored in mm in the FIT file → divide by 10 for cm).

### C. Expose via Tauri Command & Types
Update `RecordPoint` in `src/types.ts`:
```typescript
export type RecordPoint = {
  // ... existing fields ...
  stance_time_ms?: number;
  stance_time_balance?: number;
  vertical_oscillation_cm?: number;
};
```

### D. New React Component: `RunningDynamics.tsx`
* **GCT Balance Bar**: Split horizontal progress bar showing Left/Right foot symmetry.
  * Green = ±2% of 50/50; Yellow = ±2–5%; Red = >5% imbalance.
* **Oscillation vs. Cadence Scatter Plot**: ECharts scatter showing how higher cadence reduces vertical bounce — the key biomechanical coaching insight.

---

## 💤 2. All-Day Wellness & Objective Readiness Sync

Currently, daily wellness projections are estimated from training load. To replace estimates with real measured data:

### A. Parse Garmin Wellness FIT Files (`src-tauri`)
Garmin wellness watches write daily monitoring data to `GARMIN/MONITORING_BB/` or `GARMIN/MONITORING/`. These contain:
* **Sleep Hours**: `sleep_duration` field (in seconds → ÷ 3600).
* **Resting Heart Rate**: `resting_heart_rate` from the daily HR monitoring message.
* **Stress Score**: `stress_score` (0–100 scale from HRV + activity patterns).

### B. Sync via `scripts/sync_garmin.ps1`
Expand the existing PowerShell sync script to:
1. Download daily wellness JSON packets from the Garmin Connect API.
2. POST them to the Tauri backend for SQLite storage.

### C. Map into `ReadinessTracker.tsx`
Once true wellness records are in the DB, query and overlay them on the readiness timeline. When real HRV/RHR/sleep data exists for a date, use it directly instead of the projection model.

---

## 📡 3. Live GPS Track Upload & Real-Time Sync

### A. Garmin Connect Auto-Sync
Extend `scripts/sync_garmin.ps1` to poll Garmin Connect for new activities after every workout (via OAuth2 token stored in the system keychain), download FIT files, and trigger a Tauri `import_activity` command automatically.

### B. Live Run Tracking (WebSocket)
For users who want in-progress run stats:
* Use the Garmin Connect IQ SDK to push real-time trackpoints over BLE.
* Add a WebSocket server in Tauri (`tauri-plugin-websocket`) to receive these packets.
* Display a live "Now Running" overlay on the Overview tab.

---

## 📊 4. Advanced Training Block Periodization Planner

Building on the existing `TrainingScheduler.tsx`:

### A. Macro-Cycle Planning
* Add "Training Block" concept: Base → Build → Peak → Taper, each configurable in weeks.
* Auto-schedule workouts to hit weekly mileage ramps (e.g., +10% per week with a down-week every 4th week).

### B. Workout Templates
* Pre-built running workout library: Easy Run, Tempo, Track Intervals (400m × 8), Long Run, Recovery.
* One-click insertion into any calendar day.

### C. TSB Peak Targeting
* Given a race date, back-calculate the optimal taper start date so TSB hits +5 to +25 on race day.
* Display a projected CTL/ATL/TSB forward curve overlaid on the load chart.

---

## 🌡️ 5. Environmental Performance Correction

### A. WBGT Heat Stress Model
Parse `temperature_c` from FIT trackpoints (already stored). Apply the Wet-Bulb Globe Temperature approximation and adjust expected pace:
* +6% time per 5°C above 20°C threshold.
* Display a "Temperature-Adjusted Performance" badge on activities run in heat.

### B. Altitude Adjustment
Use the existing `altitude_m` field to compute average altitude above 1000m and apply a VO2max derate factor (~1% per 100m above sea level) to race predictions.

---

## 🎉 6. Resolved Roadmap Milestones

### A. Grade Adjusted Pace (GAP) on Activity Charts
* **Implemented**: Deployed in `ActivityChart.tsx` and `src/lib/analytics.ts`. Normalizes uphill/downhill sections into flat-ground equivalent paces using Minetti's energy-cost model.
* **Outcome**: A beautiful grade-adjusted pace curve overlays heart rate and speed timelines to show true cardiovascular effort on rolling terrains.

### B. Synced Multi-Chart Hover Tooltips
* **Implemented**: Deployed in `ActivityChart.tsx` and `CompareCharts.tsx`. A programmatic coordinates hover-sync system links cursors and data reads in lockstep across independent ECharts panels, completely bypassing native grouping conflicts.

---

## 🛡️ Verification Plan for Future Work

All new features should be validated by:
1. Running `npx tsc --noEmit` — zero TypeScript errors.
2. Checking that `localStorage` keys used by any new feature are namespaced with `fit_` prefix.
3. Verifying that any new Rust schema changes include SQLite migration scripts (no DROP TABLE).
4. Testing that new ECharts components respond to sidebar resize via `ResizeObserver` pattern.
