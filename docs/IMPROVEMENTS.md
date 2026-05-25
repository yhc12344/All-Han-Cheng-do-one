# Garmin Running Dashboard — Pre-Deployment Improvement Log

**Assessment date:** 25 May 2026 (Updated)  
**Dashboard version:** HC Road to Sub 3.30 (Production-Ready)  
**Deployment status:** 🟢 Production Ready — All 5 critical blockages, all important release gates, and several key v1.1 enhancements have been fully implemented and verified!

---

## Severity legend

| Symbol | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| 🔴     | **Critical** — actively misleads users, must fix before deployment |
| 🟡     | **Important** — degrades usefulness, fix before public release     |
| 🟢     | **Enhancement** — meaningful improvement, can ship in v1.1         |

---

## 🔴 Critical Issues (Resolved)

---

### C-1 · 10km PR is a training run, not a time trial — breaking the Race Predictor — ✅ RESOLVED

**Location:** `PersonalBests.tsx`, `analytics.ts` (Riegel anchor logic)

**Problem:**  
5km PR is 25:59 (5:11/km). Riegel projects 10km potential at 54:10. Actual recorded 10km "PR" is 1:15:33 — a 21-minute gap the dashboard flags as "Potential: -21:23" with no explanation. It was a casual training run logged at full distance, not a race effort.

**Fix Details:**  
Implemented a pace-based effort threshold check in `markTrainingBests(efforts)`. If a candidate's pace is slower than 1.25 times the pace of the athlete's best performance at the next shorter distance, it is flagged as `isTrainingBest: true`. 
* **UI Outcome**: Stored and displayed training-run completions as a separate dashed-border card labelled `(Training)` in a muted color.
* **Algorithm Outcome**: Excluded training bests from Riegel anchor calculations in `predictRaceTimes` and the prediction anchor selection list in the Race Predictor tab.

---

### C-2 · VDOT offset of 12.0 mL/kg/min is framed misleadingly — ✅ RESOLVED

**Location:** `PersonalBests.tsx` (VO2 Max & Aerobic Capacity panel)

**Problem:**  
Garmin FIT telemetry reports 52.9 mL/kg/min. PR-derived VDOT is 40.9. The 12-point gap was incorrectly framed as "anaerobic cardiorespiratory reserve" rather than recognizing Garmin's sub-maximal watch HR algorithm overestimates VO2max for recreational runners.

**Fix Details:**  
Reordered the VO2 Max panel layout in `PersonalBests.tsx` so the Performance VDOT (`40.9`) is the primary large metric labeled as `"Performance VDOT (Race-Predictive)"`. Demoted Garmin's telemetry to a secondary row clearly labeled `"Garmin Estimated VO2max (Physiological Ceiling)"`. 
Added a clear explanatory note:
> Garmin's watch estimate uses sub-maximal HR modelling and typically reads 8–15% higher than performance-tested VDOT in recreational athletes. Your training paces and race predictions are calculated from your Performance VDOT.

---

### C-3 · PRI (87, Ready to Push) and TSB (~−20) directly contradict each other — ✅ RESOLVED

**Location:** `ReadinessTracker.tsx`, `analytics.ts` (PRI composite formula)

**Problem:**  
TSB is in the overreaching zone (~−20), but PRI read 87 (Ready to Push). HRV-dominant weighting overrode deeply negative training stress, creating a high injury risk.

**Fix Details:**  
Added a hard TSB floor to the readiness composite formula (`calculateDailyReadiness` in `analytics.ts`):
* If TSB is below `-20`, PRI is capped at a maximum of `60` (forcing yellow/maintain state).
* If TSB is below `-10`, PRI is capped at `72` (preventing green/peak state under heavy load).
Added a **Reconciliation Warning Banner** to `ReadinessTracker.tsx` whenever a conflict exists (PRI > 75 and TSB < -15) to explicitly advise prioritizing recovery. Suggested workouts automatically degrade to `Active Recovery` or `Restoration` during conflict states.

---

### C-4 · Junk activities corrupt aggregate stats and averages — ✅ RESOLVED

**Location:** `analytics.ts` (aggregate calculation), activity summary table filter

**Problem:**  
Accidental starts or GPS glitches (like the 0.49km standing log and the 1.18km max speed spike) polluted the dataset, depressing pace and distance averages and corrupting power curve analytics.

**Fix Details:**  
Implemented a validity check `isValidActivity(activity)` requiring:
* Minimum distance: `0.8` km
* Minimum average speed: `4.0` km/h (excludes standing/walking artifacts)
* Minimum duration: `300` seconds (excludes warmups under 5 mins)
* **UI Outcome**: Glitched activities remain in the table but receive a prominent yellow `⚠️ GPS Warmup` badge.
* **Analytics Outcome**: Invalid activities are excluded from CTL/ATL/TSB curves, VDOT scans, pace averages, and contribution heatmap counts.

---

### C-5 · Suggested workouts recommend threshold/intervals at insufficient base volume — ✅ RESOLVED

**Location:** `OverviewGoalAndEvent.tsx` (suggested workout engine)

**Problem:**  
The dashboard recommended intensity sessions (lactic intervals or threshold work) at low weekly volume (15–20km), violating consensus base-building principles.

**Fix Details:**  
Added volume gates inside `OverviewGoalAndEvent.tsx` using a **rolling 4-week average** instead of the current week:
* Below 40km/week avg: strictly restricts today's suggestion to conversational `steady Zone 2 Base Builder` runs, displaying an advisory note: `Building base (18.1 km/wk avg) — easy aerobic focus until 40km/wk sustained.`
* Below 50km/week avg: tempo/sweet-spot intervals are only unlocked if autonomic readiness score is above 75 and fatigue is minimal.
* VO2max/lactic intervals: require an established base of $\ge 50$ km/week rolling average.
* **Bonus Visualizer Upgrade**: Designed a premium, multi-colored stacked horizontal visualizer showing the exact percentage distribution of training zones (Z1 Rec, Z2 Base, Z3 Temp, Z4 Thr, Z5 An) mapped to today's recommended workout.

---

## 🟡 Important Issues (Resolved)

---

### I-1 · Race goal pace vs. current predicted pace — no gap framing — ✅ RESOLVED

**Location:** `OverviewGoalAndEvent.tsx` (Marathon card)

**Problem:**  
Event card displayed target pace (4:58/km) and current predicted pace (5:54/km) side-by-side with no explanation or warning about the 39-minute finishing offset.

**Fix Details:**  
Integrated a **"Current Gap"** row to the event countdown card:
* Formats the exact time delta (e.g. `+39:13`).
* Dynamically color-codes the gap based on severity (Red for $> 20$ min offset, Amber for $10-20$ min, Green for $< 10$ min).
* Adds contextual warning advice (e.g. `Significant — base building required` or `Moderate — consistent base needed`).

---

### I-2 · Scheduler has Generate AI Plan button but no plan is shown — ✅ RESOLVED

**Location:** `TrainingScheduler.tsx`

**Problem:**  
Training calendar was empty from May 25 onward, leaving the primary calendar demo feature looking blank and inactive until manual generation.

**Fix Details:**  
Implemented a prominent, beautiful empty-state call-to-action banner:
> 📅 **Your calendar is empty from May 25 onward.** Hit **"Generate AI Plan"** above to build a personalised 16-week BYD Marathon programme based on your current fitness and training base.
Generating a plan immediately fills the calendar with a full structure of Tempo Intervals, Base Runs, Long Runs, and Active Recovery walks.

---

### I-3 · Singapore GPS artifacts appear in Individual tab with full analytics — ✅ RESOLVED

**Location:** `BiomechanicalCharts.tsx`, `RacePredictor.tsx` (active telemetry source)

**Problem:**  
Accidental starts (like the 1.18km GPS glitch) was selectable as an active telemetry source, corrupting the Critical Power curve with an 1,125W artifact spike.

**Fix Details:**  
Applied the validity filter from `isValidActivity()` directly to active telemetry source dropdowns. Invalid activities are filtered out of all individual analysis tabs and automatically replaced by the latest valid workout.

---

### I-4 · "Active Base (1★)" consistency rating is harsh and unexplained — ✅ RESOLVED

**Location:** `ActivityContributionHeatmap.tsx`

**Problem:**  
A fixed 365-day consistency rating was highly demoralizing for athletes who just started training 8 weeks ago, giving them a 1-star rating despite excellent consistency within their actual training window.

**Fix Details:**  
Surfaced a secondary consistency metric: **"Since start"** consistency. It tracks the time elapsed since the athlete's first recorded activity up to today:
* **Year-round**: `7.4% Active Base (1★)`
* **Since start**: `61.0% Athletic (4★)` (calculated from first activity in April 2026 to today)
Added an inline explanatory footnote: `ℹ️ Year-round rating improves as you maintain training over more months.`

---

### I-5 · Extraneous "Links and Contact" and "Supporter Badge" boxes cluttering Settings drawer — ✅ RESOLVED

**Location:** `SettingsPanel.tsx`

**Problem:**  
The settings drawer contained several links and contact icons, and a supporter badge activation input card that distracted from the core utility and premium feel of the personal offline dashboard.

**Fix Details:**  
* Removed the `IconBug`, `IconDiscord`, `IconGlobe`, and `IconMail` components and clean deleted all associated CSS layout containers.
* Completely removed the `.links-box` and `.supporter-box` sections from `SettingsPanel.tsx`, leaving a clean, highly polished storage locations and core settings overview.
* Sanitized unused state handlers (`handleVerifyCode`), states (`codeInput`, `verifying`, `codeMsg`), and hook dependencies in the view panel component.

---

## 🟢 Enhancements (v1.1 Roadmap Features Completed)

---

### E-1 · VDOT-derived training paces not surfaced anywhere — ✅ RESOLVED

**Location:** `PersonalBests.tsx`

**Problem:**  
The VDOT metric (40.9) was not actionable because Jack Daniels' target training paces (Easy, Marathon, Threshold, Interval, Repetition) were not surfaced.

**Fix Details:**  
Programmed a dynamic Jack Daniels pace solver. It converts VDOT values to exact speed limits using Dr. Daniels' oxygen-cost quadratic formula and displays them as a row of premium cards inside the VO2 Max panel:
* **Easy (E)**: `6:20–6:50/km` (Mitochondrial development, active recovery).
* **Marathon (M)**: `5:54/km` (Aerobic pace simulation).
* **Threshold (T)**: `5:16/km` (Lactate clearance tempo).
* **Interval (I)**: `4:45/km` (VO2max stress hard blocks).
* **Repetition (R)**: `4:20/km` (Neuromuscular economy).
Fully scales dynamically to miles or kilometers based on selected units.

---

### E-4 · Grade Adjusted Pace (GAP) for Johor runs — ✅ RESOLVED

**Location:** `ActivityChart.tsx`

**Problem:**  
Pace on undulating terrain (like Johor runs) was misleading because elevation changes weren't accounted for in the pace graphs.

**Fix Details:**  
Implemented Minetti's 5-degree flat-ground energy equivalence equation:
$$\text{Hill Cost} = 155.4 \times i^5 - 30.4 \times i^4 - 43.3 \times i^3 + 46.3 \times i^2 + 19.5 \times i + 3.6$$
Overlaid a beautiful dashed **"Grade Adjusted Pace (GAP)"** line (`#8b5cf6`) on the individual activity pace charts. Synced it completely with the ECharts smoothing sliding-windows and the interactive multi-axis hover crosshairs.

---

### E-5 · Contribution heatmap only shows Mon/Wed/Fri rows — ✅ RESOLVED

**Location:** `ActivityContributionHeatmap.tsx`, `styles.css`

**Problem:**  
The contribution heatmap only displayed alternate day labels (Mon, Wed, Fri), making it difficult to identify when adjacent day clusters occurred.

**Fix Details:**  
Added Tuesday, Thursday, Saturday, and Sunday translations to the locales folder (`en.json`). Upgraded `ActivityContributionHeatmap.tsx` and the grid layout inside `styles.css` to render all 7 day labels (`Mon` to `Sun`) in chronological sequence, scaling down the font size to `0.58rem` to fit perfectly.

---

_Pre-Deployment Log updated: 25 May 2026_  
_Status: Verified - 100% Production Ready._
