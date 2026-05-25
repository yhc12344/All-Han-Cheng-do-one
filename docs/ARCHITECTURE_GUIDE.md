# Architecture & Implementation Guide

This guide explains the technical design patterns, performance optimizations, and mathematical models driving the **Garmin Running Dashboard** frontend. Use this as a reference when maintaining or expanding the application.

---

## 📁 Project Structure

```
src/
├── components/         # React UI components
│   ├── Dashboard.tsx            # Root shell: tab routing, global state, activity list
│   ├── OverviewGoalAndEvent.tsx # Overview tab: stats, countdown, heatmap, contribution grid
│   ├── OverviewLocationMap.tsx  # MapLibre GL density heatmap of explored locations
│   ├── ActivityContributionHeatmap.tsx # 365-day GitHub-style contribution grid
│   ├── OverviewActivityTable.tsx # Filterable activity list table
│   ├── OverviewWeeklyTrend.tsx  # Weekly mileage bar chart
│   ├── ActivityInsights.tsx     # Per-activity deep-dive (charts, map, HR zones)
│   ├── ActivityChart.tsx        # Time-series ECharts graph (speed, HR, power, etc.)
│   ├── ActivityMap.tsx          # Per-activity MapLibre route trace
│   ├── BiomechanicalCharts.tsx  # Stride length & aerobic decoupling matrix
│   ├── CompareCharts.tsx        # Side-by-side activity comparison
│   ├── ReadinessTracker.tsx     # Autonomic readiness dial + telemetry grid
│   ├── LoadChart.tsx            # CTL / ATL / TSB endurance load graph
│   ├── PersonalBests.tsx        # PR distance & power efforts (cached)
│   ├── RacePredictor.tsx        # Riegel race predictor + pacing planner
│   ├── PowerCurve.tsx           # Rolling max power curve chart
│   ├── TrainingScheduler.tsx    # Weekly calendar + planned workouts
│   └── SettingsPanel.tsx        # User preferences (zones, units, theme)
├── lib/
│   ├── analytics.ts    # All sports science computations (see below)
│   ├── api.ts          # Tauri command bridge (getActivities, getRecords, etc.)
│   ├── hrZones.ts      # Configurable HR zone builder & resolver
│   ├── exportUtils.ts  # CSV / JSON / GPX / KML export engine
│   ├── units.ts        # km/mi distance conversion utilities
│   ├── chartScroll.ts  # ECharts wheel scroll passthrough fix
│   ├── chartSmoothing.ts # Data smoothing helpers
│   └── i18n.ts         # Locale/language utilities
└── types.ts            # Shared TypeScript interfaces (Activity, RecordPoint, etc.)
```

---

## ⚡ 1. Map-Reduce Caching Engine (Personal Bests)

**File**: [PersonalBests.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/PersonalBests.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts)

### The Core Problem

FIT files contain thousands of trackpoints. Finding a PR for 5K or 20-minute power requires scanning all trackpoints in a sliding window. For 30+ activities, this creates a database waterfall that halts the UI.

### The Architecture

Individual activity PRs are **immutable** (once recorded, a run's best intervals never change). This enables a highly efficient **Map-Reduce** model:

```
           [ activities ] (passed from props)
                  │
         ┌────────┴────────┐
     [Cached]         [Uncached] (New FIT files)
         │                 │
         │       Batch parallel fetch (api.getRecords in groups of 8)
         │                 │
         │          Map Stage: findBestDistanceEfforts / findBestPowerEfforts
         │                 │
         └────────┬────────┘
                  ▼
      Merged Cached & New PRs in localStorage
                  │
                  ▼
      Reduce Stage (Pure client-side loop)
      - Distances: Min(Duration) per distance
      - Powers: Max(Average Watts) per duration
                  │
                  ▼
      React State updates (< 1ms)
```

### Key Implementation Details

- **Cache Key**: `fit_dashboard_activity_prs_cache_v2`
- **Cache Entry Shape**: `{ id, activity_name, distance_m, dists, powers }`
- **Invalidation Trigger**: Change in `activity_name` or `distance_m` triggers automatic re-scan of that specific entry only.
- **Garbage Collection**: On mount, scans for cached IDs not in the active `activities` prop and removes them.
- **Concurrency**: Batches new imports in groups of **8** via `Promise.all`.
- **Unified Single-Panel Visuals**: Distance and Power records are presented in a combined high-density CSS grid (`repeat(auto-fit, minmax(150px, 1fr))`) compressing 10 metrics into a single row of horizontal micro-badges on desktop, styled with ellipsis name-truncation to prevent visual breaking.
- **Top-Level VO2 Max**: The "VO2 Max & Aerobic Capacity" dial panel is rendered at the absolute top of the Personal Bests view, above the unified PR cards and the Race Predictor, for prominent first-glance visibility.
- **Distance Targets**: 400m, 1 km, 1 Mile, 5 km, 10 km, Half Marathon.
- **Power Duration Targets**: 5 sec, 1 min, 5 min, 20 min, 1 hour.

---

## 📊 2. CTL/ATL/TSB Endurance Load Model

**File**: [LoadChart.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/LoadChart.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts) → `calculateTrainingLoad()`

### Algorithm

1. **Daily Load**: Calculated per activity using a TRIMP-style formula:

   ```
   load = (duration_s / 3600) × 100 × hrScale
   ```

   Where `hrScale = 1.0` if HR metadata is present, `0.8` otherwise.

2. **Exponential Smoothing**:

   ```typescript
   const ctlDecay = Math.exp(-1 / 42); // 42-day fitness constant (CTL)
   const atlDecay = Math.exp(-1 / 7); // 7-day fatigue constant (ATL)

   ctl = ctl * ctlDecay + dayLoad * (1 - ctlDecay);
   atl = atl * atlDecay + dayLoad * (1 - atlDecay);
   form = ctl - atl; // TSB
   ```

3. **TSB Interpretation**:

   | TSB Range  | Zone                |
   | ---------- | ------------------- |
   | > +25      | Untraining          |
   | +5 to +25  | Fresh / Peak Racing |
   | -10 to +5  | Optimal Training    |
   | -30 to -10 | Overreaching        |
   | < -30      | High Injury Risk    |

---

## 🫁 3. Automated Physiological Projection Engine (Readiness)

**Files**: [ReadinessTracker.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ReadinessTracker.tsx), [OverviewGoalAndEvent.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewGoalAndEvent.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts) → `calculateDailyReadiness()`

### Automatic Wellness Log Generation

For each day in the training timeline, a `WellnessLog` entry is generated using ATL-correlated projections and a date-character-code hash for stable daily variance:

```typescript
const charSum = dateStr.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
const pseudoRandom = (Math.sin(charSum) + 1) / 2; // Stable 0–1 per date

const fatigueFactor = Math.min(1.0, atl / 80);

HRV    = baseHrv    - (fatigueFactor × 10) ± variance(5ms)
RHR    = 52         + (fatigueFactor × 5)  ± variance(3bpm)
Sleep  = 7.5 hours                         ± variance(0.8h)
Quality= 80%        - (fatigueFactor × 8)  ± variance(8%)
```

Base HRV is extracted from Garmin FIT hardware (`metadata_json → hrv_summary → rmssd_ms`) when available, falling back to `65ms`.

### PRI Readiness Index Formula

```
PRI = 40%(HRV Score) + 30%(Sleep Score) + 15%(RHR Score) + 15%(TSB Freshness)
```

- **HRV Score**: Compares today's HRV against a rolling 7-day baseline ± 1.0–1.5 standard deviations.
- **Sleep Score**: `(sleep_hours/8.0 × 50) + (quality_pct/100 × 50)`
- **RHR Score**: `max(0, 100 − (rhr_elevation × 10))`
- **Freshness Score**: `max(0, 100 − |negative_tsb| × 3.0)` when TSB < 0.

| PRI   | Zone                          |
| ----- | ----------------------------- |
| ≥ 80  | 🟢 Ready to Push              |
| 50–79 | 🟡 Maintain / Active Recovery |
| < 50  | 🔴 Autonomic Fatigue / Rest   |

---

## 🎯 4. Race Predictor & Pacing Planner

**File**: [RacePredictor.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/RacePredictor.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts) → `predictRaceTimes()`, `generatePacingSplits()`

### Riegel's Endurance Formula

```
T2 = T1 × (D2 / D1)^1.06
```

Anchors on the best effort at 5K → 10K → longest PR, and extrapolates to 1 Mile, 5K, 10K, Half Marathon, and Marathon.

### Pacing Strategies

| Strategy | Description                                       |
| -------- | ------------------------------------------------- |
| Even     | Constant pace across all km splits                |
| Negative | Starts 3% slower, linear ramp to 3% faster        |
| Positive | Starts 2% faster, linear degradation to 3% slower |

### ECharts Flexbox Resizing Fix

ECharts hardcodes absolute pixel widths on initial render. To enable sidebar-collapse resizing:

```jsx
<div
  ref={containerRef}
  style={{ height: "190px", minWidth: 0, overflow: "hidden" }}
>
  <ReactECharts
    ref={chartRef}
    option={option}
    notMerge={true}
    style={{ height: "100%", width: "100%" }}
  />
</div>
```

A `ResizeObserver` inside `useEffect` watches the wrapper ref and calls `chartInstance.resize()` on dimension changes.

### Pacing Splits Container Stabilization

To prevent vertical jumping of the dashboard layout when toggling between pacing targets (5K, 10K, Half Marathon, Marathon), the pacing splits table container in `RacePredictor.tsx` is constrained to a strict, uniform height of `"470px"`. Smooth scrolling is enabled with `overflowY: "auto"` for splits that exceed this height.

---

## 💪 5. Biomechanical Efficiency & Aerobic Decoupling

**Files**: [BiomechanicalCharts.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/BiomechanicalCharts.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts) → `computeBiomechanicalPoints()`, `calculateAerobicDecoupling()`

### Per-Second Biomechanical Metrics

```typescript
// Running cadence correction (raw cadence from Garmin is half-steps)
if (isRunning && rawCadence > 0 && rawCadence < 120) {
  cadenceSpm = rawCadence * 2;
}

stride_length (m)   = (speed_m_s × 60) / cadence_spm    // when cadence > 40
efficiency (m/beat) = (speed_m_s × 60) / heart_rate_bpm // when speed > 0.5 m/s
```

### Aerobic Decoupling (Cardiac Drift)

Splits the activity into two halves, compares `speed-to-HR` (or `power-to-HR`) efficiency ratios:

```
decoupling% = ((firstHalfRatio - secondHalfRatio) / firstHalfRatio) × 100
```

Requires ≥ 120 valid data points (speed > 0.5 m/s AND HR > 40 bpm) to calculate.

---

## 🗺️ 6. MapLibre GL Heatmap

**File**: [OverviewLocationMap.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewLocationMap.tsx)

- GeoJSON `FeatureCollection` is built from all activity start GPS coordinates.
- A single `heatmap` layer (`HEAT_LAYER_ID`) uses MapLibre's built-in heatmap renderer:
  - `heatmap-intensity` and `heatmap-radius` increase with zoom level (interpolated 0→16).
  - `heatmap-color` ramps: transparent → royal purple → pink → warm orange at hotspots.
- 5 basemap styles switchable at runtime (Light, Dark, OpenStreet, Topo, Satellite).
- "Reset Zoom" fits map bounds to all loaded coordinates via `map.fitBounds()`.
- All cluster/point/popup layers have been removed — pure density heatmap only.

---

## 📅 7. Training Scheduler with localStorage Persistence

**File**: [TrainingScheduler.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/TrainingScheduler.tsx)

| localStorage Key        | Content                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `fit_sched_planned`     | `PlannedWorkout[]` JSON — future/past manual workout entries |
| `fit_sched_target_dist` | Weekly target distance in km                                 |
| `fit_sched_target_dur`  | Weekly target duration in hours                              |

All three keys are written in `useEffect` on state change and loaded as `useState` initializer functions.

---

## 📤 8. Multi-Format Activity Export

**File**: [exportUtils.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/exportUtils.ts)

| Format | Function      | Description                                                 |
| ------ | ------------- | ----------------------------------------------------------- |
| CSV    | `buildCsv()`  | Trackpoint data with activity metadata row                  |
| JSON   | `buildJson()` | Structured JSON with `_exportInfo` header                   |
| GPX    | `buildGpx()`  | Standard GPX `<trkpt>` with extensions (HR, cadence, power) |
| KML    | `buildKml()`  | Google Earth compatible `<LineString>` path                 |

**Bulk Export**: Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) (`showDirectoryPicker`) when available; falls back to sequential browser downloads with a 150ms throttle delay.

---

## ❤️ 9. Heart Rate Zones Engine

**File**: [hrZones.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/hrZones.ts)

- `buildHeartRateZones(zoneUpperBoundsBpm?)`: Accepts a custom array of BPM zone boundaries from the user's Settings. Falls back to default 5-zone model (≤75, 76–95, 96–120, 121–150, >150 bpm).
- `resolveHeartRateZoneIndex(hr, zones)`: Returns the zone index for any given HR value (used in per-second zone time-in-zone calculations).

---

## 📈 10. Cross-Chart Timeline Hover Synchronization & Layout Alignment

**Files**: [CompareCharts.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/CompareCharts.tsx), [ActivityChart.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ActivityChart.tsx), [ActivityInsights.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ActivityInsights.tsx)

### The Core Problem

ECharts' native `.connect()` grouping crashes the application if grouped charts do not share identical series formats, dimension configurations, or coordinate axis offsets (such as double Y-axis vs single Y-axis). Additionally, connecting value-based timeline axes across runs with varying lengths does not synchronize HTML tooltip content popups.

### Programmatic Sync Solution

To bypass native bugs and prevent stack overflows:
1. Removed `echarts.connect` references entirely.
2. Implemented a custom programmatic coordinate cursor and tooltip dispatch system.
3. Registered refs to all chart instances. On mouse hover/move, we listen to ECharts `updateAxisPointer` actions, query the closest data index or relative time timestamp, and dynamically dispatch `showTip` calls to all other chart instances. Re-entrant guard flags block circular execution routing.
4. On mouse leave, dispatches `hideTip` to hide tooltip bubbles simultaneously.

### Grid Bounding-Box Alignment

Secondary Y-axis labels (e.g. `Watts` on the Cadence/Power chart) naturally shrink the active drawing canvas. To align the synchronized vertical pointer line perfectly:
- Adjusted all timeline charts in `ActivityInsights.tsx` (Speed Trend, Cadence & Power, Elevation) to share identical margin rules:
  ```json
  grid: { left: 54, right: 54, top: 42, bottom: 46 }
  ```
- Swapped HR Histogram with Cadence/Power, and Effort Heatmap with Elevation to stack timelines in a single vertical column. The synchronized cursor tracks straight down the entire timeline set in one clean scan.

---

## 📅 11. Uniform Suggested Workouts Grid

**File**: [OverviewGoalAndEvent.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewGoalAndEvent.tsx)

To avoid extremely wide, stretched cards on massive desktop resolutions, the Mon-Sun Suggested Workouts calendar row utilizes a centered grid pattern:
- **Grid Layout**: `repeat(7, minmax(110px, 150px))` limits maximum card width to 150px.
- **Horizontal Alignment**: `justifyContent: "center"` centers the calendar neatly inside the panel.
- **Responsive Scroll**: `overflowX: "auto"` enables clean horizontal scrolling on narrow viewports.

---

## 📌 12. Interactive Detachable Card Pinning

**Files**: [Dashboard.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/Dashboard.tsx), [LoadChart.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/LoadChart.tsx), [PersonalBests.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/PersonalBests.tsx), [RacePredictor.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/RacePredictor.tsx)

### Core Architecture

To allow athletes to customize their main **Overview** dashboard and detach/pin high-fidelity charts or card grids directly onto their primary viewing workspace:
1. **Global React State**: `Dashboard.tsx` declares the `pinnedWidgets` state and the `togglePinWidget(id)` handler, reading/writing selection entries under the `localStorage` key `fit_pinned_overview_widgets`.
2. **Prop Drilling System**: Passes `pinnedWidgets` and `togglePinWidget` as optional controlled props to `LoadChart`, `PersonalBests`, and `RacePredictor`.
3. **Corner Pin Buttons**: Subtly renders a custom `.widget-pin-btn` component (`➕ Pin to Overview` or `📌 Pinned` highlighted state) inside each card's flex header block. Clicking the button immediately updates state and triggers local re-renders.
4. **Selective Pinned Rendering**: The Overview tab renders `<PersonalBests onlyPinned={true} ... />` if any of its nested widgets are pinned. By configuring the `onlyPinned` flag inside `PersonalBests.tsx`, we dynamically show or hide the VO2 Max Dial, combined Personal Records, or Race Predictor chart without duplicate calculations, using the identical Map-Reduce cached data natively. If none are pinned, it returns `null` safely.

---

## 📈 13. 365-Day Activity Contribution & Consistency Insights (Triple-Column System)

**File**: [ActivityContributionHeatmap.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ActivityContributionHeatmap.tsx)

### Triple-Column Layout & Horizontal Space Fill
On wide screens, the Activity Contributions card panel utilizes a strict three-column horizontal flexbox container (`heatmap-split-container`) to avoid large gaps and improve data density:
1. **Left (flex: 1)**: Renders the SVG/HTML 365-day grid. The calendar columns map to the respective Sunday-to-Saturday weeks.
2. **Middle (220px)**: The **Consistency Insights** widget. This contains the calculated athlete level, daily workout streaks, and year-to-date active days tracking.
3. **Right (280px)**: The **Daily Activity Details** panel showing exact workouts for the selected day.

### Real-Time Streak & Consistency Computation
To avoid slow database sweeps, streaks and consistency levels are calculated efficiently within a single `useMemo` block whenever the `activities` array updates:
- **Daily Active Day Indexing**: First, activities are indexed in a hash map (`counts: Map<string, number>`) using local `YYYY-MM-DD` string keys.
- **Chronological Streak Sweep**:
  We sweep backwards from today up to 365 days, ordering the keys chronologically:
  1. **Longest Streak (`longestStreak`)**: Sweeps the entire 365-day ordered list of keys, incrementing a local accumulator for consecutive non-zero activity days and taking the running maximum.
  2. **Current Active Streak (`currentStreak`)**: Checks `today` and `yesterday` keys. If active, it sweeps backwards day-by-day until a resting day is encountered, ensuring the current active streak is accurately preserved without rolling over on active rest day boundaries.
- **Athlete Consistency Rating**:
  Computes the year's active days ratio:
  $$\text{activeDaysRatio} = \frac{\text{Map.size}}{365} \times 100$$
  This ratio maps to a multi-tiered athletic status matching a specific pastel color signature and star count:
  - $\ge 40\%$: **Elite (5★)** (`#10b981`, Emerald)
  - $\ge 25\%$: **Athletic (4★)** (`#34d399`, Mint)
  - $\ge 15\%$: **Dedicated (3★)** (`#60a5fa`, Sky Blue)
  - $\ge 8\%$: **Active (2★)** (`#f59e0b`, Amber)
  - $< 8\%$: **Active Base (1★)** (`var(--text-muted)`)

---

## 🛠️ 14. Verification & Quality Assurance

- **Strict TypeScript**: `npx tsc --noEmit` compiles with **zero errors or warnings**.
- **Offline-First**: All analytics are computed client-side. No external API calls. FIT parsing happens in Rust via Tauri.
- **localStorage**: PR cache, training schedules, and user targets survive full page reloads.
- **Stable Variance**: Physiological projection variance is seeded per calendar date, preventing chart value re-rolling between renders.
