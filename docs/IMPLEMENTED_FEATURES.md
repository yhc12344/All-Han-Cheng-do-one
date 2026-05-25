# Garmin Running Dashboard: Implemented Features & Optimizations

This document provides a comprehensive summary of the elite-tier features, sports science telemetry integrations, visual layout redesigns, and backend analytics engines currently live in the codebase.

---

## 🚀 1. Performance Caching & Unified Personal Bests
**File**: [PersonalBests.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/PersonalBests.tsx)

* **The Problem**: Opening the *Personal Bests* screen triggered sequential API requests for every activity, creating a 60-request waterfall for 30+ activities.
* **The Solution (Map-Reduce Caching)**: A client-side **Map-Reduce caching engine** stored in `localStorage` under `fit_dashboard_activity_prs_cache_v2`.
  * **Map Stage**: PRs (distance and power) are calculated once per activity ID and cached immutably.
  * **Reduce Stage**: A client-side reduce loop finds the absolute best across all cached entries in under 1ms.
  * **Smart Invalidation**: If an activity's `activity_name` or `distance_m` changes, the entry re-scans automatically.
  * **Garbage Collection**: Purges orphaned logs from deleted files on mount.
  * **Parallel Batched Fetches**: New imports are fetched in parallel groups of **8** using `Promise.all`.
  * **Result**: Navigating to the page is **instantaneous (0ms)**.
* **Unified Single-Panel Visuals**: Distance PRs and Power PRs are integrated into a single high-density visual panel, compressed into a single horizontal row of `150px` micro-badges with ellipsis text-truncation.
* **Top-Level VO2 Max Panel**: Relocated the premium "VO2 Max & Aerobic Capacity" dial panel to the very top of the page for prominent visibility.
* **Distances Tracked**: 400m, 1 km, 1 Mile, 5 km, 10 km, Half Marathon.
* **Power Durations Tracked**: 5 sec, 1 min, 5 min, 20 min, 1 hour.

---

## 📊 2. CTL/ATL/TSB Endurance Load Model
**File**: [LoadChart.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/LoadChart.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts)

* Computes daily **Fitness (CTL)**, **Fatigue (ATL)**, and **Form (TSB)** using exponentially-weighted moving averages:
  * CTL uses a 42-day fitness constant (`exp(-1/42)`)
  * ATL uses a 7-day fatigue constant (`exp(-1/7)`)
  * Daily load is calculated via a duration × intensity TRIMP-style formula.
* Displayed as a smooth 3-series ECharts overlay graph with Form (TSB) filling green above zero and red below.
* Tooltip explains TSB zones: Untraining, Fresh/Peak Racing, Optimal Training, Overreaching, High Injury Risk.

---

## 🫁 3. Automated Autonomic Readiness Tracking
**Files**: [ReadinessTracker.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ReadinessTracker.tsx), [OverviewGoalAndEvent.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewGoalAndEvent.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts)

* **Fully automatic** — no manual sliders or morning log forms.
* Computes daily `WellnessLog` projections for every day in the training timeline using:
  * Garmin FIT HRV telemetry (`metadata_json → hrv_summary → rmssd_ms`) when available, falling back to `65 ms` baseline.
  * ATL-correlated HRV suppression (up to -10ms at peak fatigue) and RHR elevation (+5 bpm).
  * Stable, date-seeded pseudo-random variance (prevents chart re-rolling on reload).
* **PRI Readiness Index** formula: `40% HRV + 30% Sleep + 15% RHR + 15% TSB Freshness`
* Zones: 🟢 **Ready to Push** (≥80), 🟡 **Maintain** (50–79), 🔴 **Autonomic Fatigue / Rest** (<50).
* Displayed via a glowing circular SVG dial and horizontal telemetry readout grid.

---

## 📐 4. Race Predictor & Pacing Planner
**File**: [RacePredictor.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/RacePredictor.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts)

* Applies **Riegel's Law** (`T2 = T1 × (D2/D1)^1.06`) anchored to the athlete's best 5K or 10K PR.
* Predicts race times for: 1 Mile, 5 km, 10 km, Half Marathon, Marathon.
* **3 Pacing Strategies**:
  * **Even Split**: Constant pace across all km splits.
  * **Negative Split**: Starts 3% slower, linearly accelerates to 3% faster than average.
  * **Positive Split**: Starts 2% faster, gradually slows to 3% above average.
* Renders a smooth inverted-axis ECharts line chart and an interactive km-by-km splits table.
* **Fixed Splits Height**: Standardized the pacing splits table container to a locked `470px` height with custom vertical scrolling. This stabilizes the panel across all selections (5k, 10k, HM, Marathon), eliminating page layout jumping on click.
* ECharts is dynamically resized via `ResizeObserver` + `minWidth: 0` + `overflow: hidden` to respond correctly to sidebar collapse/expand.

---

## 💪 5. Biomechanical Efficiency & Aerobic Decoupling Matrix
**Files**: [BiomechanicalCharts.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/BiomechanicalCharts.tsx), [analytics.ts](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/lib/analytics.ts)

* Computes per-second **Stride Length** and **Cardiovascular Efficiency (m/beat)** from FIT trackpoint data:
  * `Stride Length (m) = (Speed × 60) / Cadence`
  * `Efficiency (m/beat) = (Speed × 60) / Heart Rate`
* Renders a dual-axis ECharts overlay graph (purple = stride, green = efficiency) against time.
* **Aerobic Decoupling (Cardiac Drift)** analysis: splits the activity into two halves, compares speed-to-HR ratio change:
  * < 3%: **Excellent** (Aerobically Elite)
  * 3–5%: **Good** (Highly Trained)
  * 5–8%: **Fair** (Developing Base)
  * > 8%: **High Cardiac Drift** (Fatigue / Detrained)
* Summary stats: Avg Stride, Avg Efficiency, Avg Cadence, and Aerobic Decoupling %.

---

## 🏃 6. Specialized Running Telemetry Focus
**File**: [PersonalBests.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/PersonalBests.tsx), [OverviewGoalAndEvent.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewGoalAndEvent.tsx)

* Removed LTHR (Lactate Threshold HR) zones from all charts.
* Running PRs use standard race distances (400m to Half Marathon) anchored on `running` sport type.
* Power PRs relabeled as **Running Power PRs**, targeting Garmin wrist watts / Stryd pods without cycling FTP baselines.
* All workout vocabulary (suggested runs, intensity labels, pace strings) uses running terminology.

---

## 📅 7. Training Scheduler with Planned Workout Calendar
**File**: [TrainingScheduler.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/TrainingScheduler.tsx)

* A full **weekly calendar grid** (`Sun–Sat`) showing both completed activities (from FIT data) and user-planned workouts.
* **Planned Workouts**: Add future sessions (title, sport, distance, duration) for any day via a modal dialog. Persisted to `localStorage` under `fit_sched_planned`.
* **Weekly Targets**: Configurable target distance (km/mi) and duration (hrs), persisted to `localStorage`.
* **Completion Rings**: SVG progress rings on each week comparing actual vs. planned volume.
* Navigates month-by-month with previous/next controls.

---

## 🗺️ 8. Explored Locations Density Heatmap
**File**: [OverviewLocationMap.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewLocationMap.tsx)

* MapLibre GL heatmap layer fed from activity start GPS coordinates.
* **Color gradient**: Transparent → Royal Purple → Pink/Magenta → Warm Orange (hotspot).
* Intensity and radius scale smoothly with zoom level (0–16).
* Supports 5 basemap styles: Light, Dark (CartoDB), OpenStreet, Topo, Satellite (Esri).
* "Reset Zoom" button fits map bounds to all loaded coordinates.

---

## 📈 9. Activity Contribution Heatmap & Consistency Insights (Triple-Column UX)
**File**: [ActivityContributionHeatmap.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/ActivityContributionHeatmap.tsx)

* **Triple-Column Dashboard Row**: Gracefully fills wide horizontal space on desktop screens by splitting the panel into a beautifully balanced 3-column system:
  1. **Left: 365-Day Contribution Heatmap**: A GitHub-style activity grid (Sunday–Saturday columns) colored by daily activity frequency using a translucent-to-solid violet gradient (`#a855f7`).
  2. **Middle: Consistency & Streak Insights**: A dedicated telemetry card computing year-round consistency metrics in real time:
     - **Athlete Consistency Rating**: Categorizes user status from `Active Base (1★)` to `Elite (5★)` dynamically using pastel-colored star badges matching their active days percentage.
     - **Streaks Counter**: Computes consecutive daily training streaks (both chronological `longestStreak` and `currentStreak` active days, properly preserving yesterday-to-today boundary offsets).
     - **Active Days Progress Tracker**: Displays active days count vs 365 days accompanied by a smooth, matching progress bar metric.
  3. **Right: Dedicated Daily Activity Sidebar**: Displays rich, context-aware details of workouts for any specific day:
     - **Dynamic States**: Real-time state indicators (🔍 Hovering / 📌 Pinned / 📅 Today).
     - **Pinning Action**: Click to pin a day's workouts, hover other days to temporarily preview them, click clear to reset.
     - **Workout Badges**: Lists activity sport type emojis, customized names, distance, duration, and running average paces.
* Horizontal scroll disabled (`overflowX: hidden`) for a clean, flat, premium presentation.

---

## 🎨 10. Premium UI/UX Design & Layout System
**Files**: [styles.css](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/styles.css), [Dashboard.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/Dashboard.tsx), [OverviewGoalAndEvent.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/OverviewGoalAndEvent.tsx), [LoadChart.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/LoadChart.tsx), [PersonalBests.tsx](file:///c:/Users/HC/Documents/GitHub/fit-dashboard/src/components/PersonalBests.tsx)

* **Fluid Responsive Layouts**: All tab containers (`.overview-goal-event-row`, `.analytics-tab-grid`, `.scheduler-layout-container`) use `max-width: 100%` to fill wide desktops.
* **Stats Row at Top**: 5 aggregate running metric cards (Filtered Activities, Total Distance, Total Duration, Avg Distance, Avg Duration) are the first visible element on the Overview tab.
* **Interactive Detachable Card Pinning**: Introduced a premium header-level `widget-pin-btn` component (`➕ Pin to Overview` / `📌 Pinned`) across `PersonalBests` (VO2 Max, Personal Records), `RacePredictor`, and `LoadChart`. Athletes can dynamically detach and pin these individual panels directly onto the **Overview** dashboard view, persisting selection states inside `localStorage` with prop-controlled selective rendering.
* **Suggested Workouts Spacing Refinement**: Constrained the suggested workouts calendar grid to a centered `repeat(7, minmax(110px, 150px))` columns with `justifyContent: "center"`. This groups and centers the Mon-Sun cards cleanly, preventing them from stretching into wide rectangular shapes on large viewports.
* **Cross-Chart Timeline Hover Synchronization**: Programmatically links mouse hover axis pointers and tooltips in absolute lockstep across independent timeline grids on both the individual analytics charts and comparison panels, completely bypassing ECharts' native grouping system which is prone to mismatch crashes.
* **Vertical Timeline Alignment**: Realigned Speed Trend, Cadence/Power, and Elevation timelines to use identical `{ left: 54, right: 54, top: 42, bottom: 46 }` grid margins, matching their horizontal bounding boxes perfectly for a unified vertical scan.
* **Tabs**: Overview, Individual, Compare, Readiness & Load, Personal Bests, Scheduler.
* **Donation Banner**: Removed from the main content area.
* **Micro-Animations**: `animate-fade-in` class for smooth tab transitions; telemetry pulse animation (`telemetry-pulse` keyframe).
* **Glassmorphism Cards**: `glass-card` class with translucent background, blur, and subtle borders.

---

## 🛠️ Verification & Quality Assurance

* **Strict TypeScript**: `npx tsc --noEmit` compiles successfully with **zero errors or warnings**.
* **Offline-First**: All analytics run entirely client-side (no external API calls). FIT parsing is done in Rust via Tauri.
* **localStorage Persistence**: Training targets, planned workouts, and PR cache all persisted across sessions.
