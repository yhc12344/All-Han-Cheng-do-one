# Garmin Running Dashboard — Pre-Deployment Improvement Log

**Assessment date:** 24 May 2026  
**Dashboard version:** HC Road to Sub 3.30  
**Deployment status:** ⛔ Not ready — 5 critical issues must be resolved first

---

## Severity legend

| Symbol | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| 🔴     | **Critical** — actively misleads users, must fix before deployment |
| 🟡     | **Important** — degrades usefulness, fix before public release     |
| 🟢     | **Enhancement** — meaningful improvement, can ship in v1.1         |

---

## 🔴 Critical Issues (Block Deployment)

---

### C-1 · 10km PR is a training run, not a time trial — breaking the Race Predictor

**Location:** `PersonalBests.tsx`, `analytics.ts` (Riegel anchor logic)

**Problem:**  
5km PR is 25:59 (5:11/km). Riegel projects 10km potential at 54:10. Actual recorded 10km "PR" is 1:15:33 — a 21-minute gap the dashboard flags as "Potential: -21:23" with no explanation. The 10km was run at 7:33/km average, a pace 45% slower than the 5km effort. It was a casual training run logged at full distance, not a race effort. Any user reading this screen either thinks they are dramatically undertrained for 10km specifically, or loses trust in the predictor entirely.

**Root cause:**  
PR detection has no minimum effort gate. Any activity that covers the distance qualifies, regardless of relative pace.

**Fix:**

```typescript
// In analytics.ts — add effort threshold before accepting a PR candidate
const EFFORT_THRESHOLD = 0.75; // pace must be within 25% of athlete's best pace at shorter distance

function isRaceEffort(
  candidatePaceSecPerKm: number,
  bestReferencePace: number,
): boolean {
  return candidatePaceSecPerKm <= bestReferencePace * (1 / EFFORT_THRESHOLD);
}
```

Alternatively, compute a pace percentile across all runs of similar distance and reject any candidate in the bottom 40th percentile of effort.

**Acceptance criteria:**

- Race Predictor shows no "PR is faster" badge unless the PR was run within 25% of the athlete's best effort at the next shorter distance.
- Training-run completions are stored separately as "Training Bests", shown with a different badge colour and explicitly excluded from Riegel anchor calculations.

---

### C-2 · VDOT offset of 12.0 mL/kg/min is framed misleadingly

**Location:** `PersonalBests.tsx` (VO2 Max & Aerobic Capacity panel)

**Problem:**  
Garmin FIT telemetry reports 52.9 mL/kg/min (Superior/Elite). PR-derived VDOT is 40.9. The gap is described as the athlete's "anaerobic cardiorespiratory reserve." This framing is inaccurate in the context of marathon training. Garmin's sub-maximal HR algorithm routinely overestimates VO2max by 8–15% for recreational runners. A user reading 52.9 may attempt race pacing appropriate for a genuine VO2max of 52.9, resulting in a significant blow-up.

**The correct hierarchy:**

- PR-derived VDOT (40.9) governs actual race performance and training paces. This is the actionable number.
- Garmin telemetry (52.9) is an estimate of physiological ceiling under ideal conditions, not a predictor of current race performance.

**Fix:**

Reorder the panel so VDOT (40.9) is the primary displayed metric with the label "Performance VDOT (Race-Predictive)". Demote Garmin's figure to a secondary row labelled "Garmin Estimated VO2max (Physiological Ceiling)". Replace the current offset description with:

> Garmin's watch estimate uses sub-maximal HR modelling and typically reads 8–15% higher than performance-tested VDOT in recreational athletes. Your training paces and race predictions are calculated from your Performance VDOT.

**Acceptance criteria:**

- Primary large number on the VO2 Max panel shows PR-derived VDOT.
- Garmin figure shown in a secondary row, clearly labelled as an estimate.
- No framing that implies the offset represents untapped potential unless TSB and readiness both confirm peak condition.

---

### C-3 · PRI (87, Ready to Push) and TSB (~−20) directly contradict each other

**Location:** `ReadinessTracker.tsx`, `analytics.ts` (PRI composite formula)

**Problem:**  
TSB is in the overreaching zone (approx. −20 to −25). PRI simultaneously reads 87 — "Parasympathetic dominant, optimal for speed intervals or threshold work." Both are displayed on the same screen with no reconciliation. The PRI formula weights HRV at 40% and TSB freshness at only 15%, meaning a projected-high HRV can override a deeply negative TSB. This is physiologically wrong: at TSB < −20, HRV suppression should be substantial enough to pull PRI below 65 regardless of other inputs.

**Fix:**

Add a hard TSB floor to the PRI calculation:

```typescript
function calculatePRI(
  hrv: number,
  sleep: number,
  rhr: number,
  tsb: number,
): number {
  const rawPRI = 0.4 * hrv + 0.3 * sleep + 0.15 * rhr + 0.15 * tsb;

  // Hard floor: deep fatigue overrides positive readiness signals
  if (tsb < -20) return Math.min(rawPRI, 60);
  if (tsb < -10) return Math.min(rawPRI, 72);

  return rawPRI;
}
```

Also add a reconciliation warning banner when PRI > 75 and TSB < −15:

> ⚠️ Readiness conflict detected: Your readiness score is elevated, but training stress balance is in the overreaching zone. Prioritise recovery today.

**Acceptance criteria:**

- PRI cannot exceed 60 when TSB < −20.
- Reconciliation banner renders whenever PRI and TSB conflict by more than the defined threshold.
- Suggested workout for today degrades to Easy or Rest automatically when the conflict banner is active (see C-5).

---

### C-4 · Junk activities corrupt aggregate stats and averages

**Location:** `analytics.ts` (aggregate calculation), activity summary table filter

**Problem:**  
At least two activities are polluting the dataset:

- `May 19, 22:12` — 0.49km at 32:56/km, 144 avg HR. GPS left on while standing still.
- `May 22, 18:59` — 1.18km with 28.8 km/h max speed, 49 rpm cadence, 11 laps. GPS artifact or accidental start.

These inflate the activity count to 34, suppress average pace, and depress average distance/activity metrics displayed in the top stats row.

**Fix:**

Add a minimum activity validity filter applied before any aggregate calculation:

```typescript
const VALID_ACTIVITY_THRESHOLDS = {
  minDistanceKm: 0.8,
  minAvgSpeedKmh: 4.0, // slower = walking/standing
  minDurationSeconds: 300, // under 5 min = warmup or accident
};

function isValidActivity(activity: Activity): boolean {
  return (
    activity.distance_m / 1000 >= VALID_ACTIVITY_THRESHOLDS.minDistanceKm &&
    activity.avg_speed_kmh >= VALID_ACTIVITY_THRESHOLDS.minAvgSpeedKmh &&
    activity.duration_s >= VALID_ACTIVITY_THRESHOLDS.minDurationSeconds
  );
}
```

Invalid activities should remain visible in the activity list but receive a `⚠ GPS Warmup` badge and be excluded from: top stats row, CTL/ATL/TSB calculation, PR scanning, pace averages, and contribution heatmap counts.

**Acceptance criteria:**

- Filtered activity count drops from 34 to ~31 (approx 3 activities filtered).
- Average distance/activity and average pace metrics update accordingly.
- Filtered activities still visible in the table with a badge — not silently deleted.

---

### C-5 · Suggested workouts recommend threshold/intervals at insufficient base volume

**Location:** `OverviewGoalAndEvent.tsx` (suggested workout engine)

**Problem:**  
Tuesday's suggestion is Threshold Runs / Lactic Intervals. Current weekly volume is approximately 15–20km. Sports science consensus (Daniels, Pfitzinger, Seiler) holds that:

- Threshold work should not be introduced before consistent 40km/week for 4+ weeks.
- Interval/VO2max work should not be introduced before consistent 50km/week.

The suggestion engine currently keys off PRI/readiness score alone. A user with a high readiness score but low training base who follows the threshold suggestion will accumulate musculoskeletal stress their connective tissue cannot absorb, even if their cardiovascular system feels ready.

**Fix:**

Add volume gates to the workout type selector:

```typescript
function getSuggestedWorkoutType(
  readinessScore: number,
  avgWeeklyKm: number,
  tsb: number,
): WorkoutType {
  // Volume gates take precedence over readiness
  if (avgWeeklyKm < 40) {
    return readinessScore >= 70 ? "easy_with_strides" : "easy";
  }
  if (avgWeeklyKm < 50) {
    return readinessScore >= 75 && tsb > -10 ? "tempo" : "easy";
  }
  // Only suggest intervals when base is established
  if (avgWeeklyKm >= 50 && readinessScore >= 80 && tsb > -5) {
    return "intervals";
  }
  return "easy";
}
```

The `avgWeeklyKm` input should be the rolling 4-week average, not the current week, to prevent a single big week from unlocking quality sessions prematurely.

**Acceptance criteria:**

- No threshold or interval suggestions generated when 4-week avg volume < 40km/week.
- Suggestion card shows a brief volume context note: "Building base (18km/wk avg) — easy aerobic focus until 40km/wk sustained."
- Tuesday's card changes from "Threshold Runs" to an appropriate easy session for the current volume level.

---

## 🟡 Important Issues (Fix Before Public Release)

---

### I-1 · Race goal pace vs. current predicted pace — no gap framing

**Location:** `OverviewGoalAndEvent.tsx` (BYD Marathon card)

**Problem:**  
The event card shows target splits of 4:58/km. Current predicted marathon pace from Race Predictor is 5:54/km. This is a 56-second/km gap displayed with no context. A user following the dashboard would not understand they are currently 39 minutes away from their goal.

**Fix:**  
Add a "Current Gap" row to the event card:

```
Target pace:     4:58/km  (3:30:00 finish)
Predicted pace:  5:54/km  (4:09:13 finish)
Current gap:     −39:13   ⚠ Significant — base building required
```

Colour the gap red if > 20 min, amber if 10–20 min, green if < 10 min.

---

### I-2 · Scheduler has Generate AI Plan button but no plan is shown

**Location:** `TrainingScheduler.tsx`

**Problem:**  
The Training Plan section shows the race goal form and a "Generate AI Plan" button but the calendar below it contains only manually-logged activities with no generated plan visible. For deployment, the primary feature of the Scheduler tab must be demonstrable. A blank calendar with a button that has never been pressed is not a compelling demo state.

**Fix:**  
Either pre-generate a plan using current data before deployment, or add a visible empty state that prompts action:

> Your calendar is empty from May 25 onward. Hit "Generate AI Plan" to build a personalised 16-week BYD Marathon programme based on your current fitness.

---

### I-3 · May 19 (0.49km) and May 22 (1.18km) activities appear in Individual tab with full analytics

**Location:** `BiomechanicalCharts.tsx`, `RacePredictor.tsx` (active telemetry source)

**Problem:**  
The active telemetry source in Readiness & Load is currently set to `Singapore — Running (2026-05-22)` — the 1.18km GPS artifact. The critical power curve for this activity (showing 1,125W at 5 seconds) is being used as a reference for the Critical Power panel. An 1,125W spike from a GPS glitch will corrupt any power-based analytics derived from it.

**Fix:**  
Apply the same validity filter from C-4 to the active telemetry source selector. Invalid activities should not appear as selectable telemetry sources in the Readiness & Load tab.

---

### I-4 · "Active Base (1★)" consistency rating is harsh and unexplained

**Location:** `ActivityContributionHeatmap.tsx`

**Problem:**  
7.4% active days over 365 days displays as "Active Base (1★)" with no explanation of why or what the next tier requires. For a user who started training 8 weeks ago (as the heatmap clearly shows), this rating is technically correct but contextually demoralising and misleading — the athlete has been highly consistent _within their actual training window_.

**Fix:**  
Add a secondary metric: "Consistency within training window" — computed from first recorded activity to today, not from a fixed 365-day lookback. Show both:

```
Year-round:  7.4%  Active Base (1★)
Since start: 61%   Athletic (4★)  ← computed from Apr 2026 to today
```

Also add a tooltip or footnote: "Year-round rating improves as you maintain training over more months."

---

## 🟢 Enhancements (v1.1 Roadmap)

---

### E-1 · VDOT-derived training paces not surfaced anywhere

Your PR VDOT of 40.9 maps to these Jack Daniels training paces:

| Zone           | Purpose                | Target pace  |
| -------------- | ---------------------- | ------------ |
| E (Easy)       | Aerobic base, recovery | 6:20–6:50/km |
| M (Marathon)   | Race pace              | 5:54/km      |
| T (Threshold)  | Lactate clearance      | 5:16/km      |
| I (Interval)   | VO2max stress          | 4:45/km      |
| R (Repetition) | Economy, speed         | 4:20/km      |

None of these are currently shown. The suggested workouts say "easy pace" or "threshold" with no specific target. Add a "My Training Paces" card to Personal Bests derived from the PR VDOT, updated automatically when a PR improves.

---

### E-2 · TSB forward projection curve missing from Load Chart

The Load Chart shows historical CTL/ATL/TSB. For race preparation, the most valuable view is the _projected forward curve_ — given a taper starting date, what will TSB be on race day? Add a dashed forward projection line to the Load Chart showing:

- Projected CTL/ATL if current training load continues.
- Projected TSB on race date (Dec 6, 2026).
- Optimal taper start date to hit TSB +10 to +20 on race day.

---

### E-3 · Heat adjustment on Singapore runs is computed but not shown on individual activities

The suggested workout card shows "Singapore Adapted" and references heat stress. The individual activity view shows temperature (32.0°C on May 22). But no activity in the table has a heat-adjusted pace shown. Implementing the WBGT correction from the roadmap and displaying "Heat-adjusted equivalent: X:XX/km" on each Singapore activity would meaningfully change how efforts are interpreted — a 5:41/km run at 32°C is equivalent to approximately 5:05–5:10/km in cool conditions.

---

### E-4 · Grade Adjusted Pace (GAP) for Johor runs

The Johor Bahru runs (Kampung Pasir Gudang Baru) are likely on slightly undulating terrain compared to Singapore. The altitude field is already stored in trackpoints. Implementing the Minetti GAP formula from the roadmap (already fully written in `FUTURE_ROADMAP.md`) and adding a GAP overlay to the Individual activity chart would be a meaningful addition, particularly since several of the better efforts were run in Johor.

---

### E-5 · Contribution heatmap only shows Mon/Wed/Fri rows

**Location:** `ActivityContributionHeatmap.tsx`

The contribution heatmap displays alternating day labels (Mon, Wed, Fri) as axis guides. This is standard GitHub-style practice but makes it difficult to identify which specific day of the week a cluster occurred on. Consider adding a subtle hover-activated day indicator, or show all 7 day labels at a smaller font size.

---

## Running Performance — Objective Assessment

> This section is separate from the dashboard. It reflects what the data actually shows about current fitness and the path to the stated goal.

**Goal:** Sub 3:30 BYD Marathon, December 6, 2026 (195 days away)

### Current fitness snapshot

| Metric                        | Current         | Required for 3:30 | Gap                  |
| ----------------------------- | --------------- | ----------------- | -------------------- |
| Weekly volume (4-wk avg)      | ~18km           | 55–65km           | **−40km/wk**         |
| 5km PR                        | 25:59 (5:11/km) | ~22:00 (4:24/km)  | −3:59                |
| Performance VDOT              | 40.9            | ~48               | −7.1                 |
| Longest long run              | ~10.5km         | 32–35km           | −22km                |
| Consistency (training window) | ~61%            | 80%+              | −20%                 |
| Easy run pace (current)       | 5:41–5:51/km    | 6:20–6:50/km      | Running **too fast** |

### What the data is actually saying

**You have the raw speed.** A 400m PR of 1:39 (4:07/km) and 1-mile of 6:59 (4:20/km) demonstrate sufficient neuromuscular capacity for a sub-3:30 marathon. Speed is not the limiter.

**Aerobic base is the limiter.** The collapse from 5:11/km at 5km to 7:33/km at 10km is a textbook aerobic capacity drop-off. Your cardiovascular system runs out of oxidative capacity and switches to glycolytic metabolism. More Zone 2 volume is the only fix.

**You are running your easy days too fast.** The Johor runs at 5:41/km with HR 162–163 bpm are Zone 4 efforts — they feel manageable but accumulate fatigue without building aerobic base. At VDOT 40.9, your easy pace ceiling is 6:50/km. Slow down by 60–90 seconds/km on every non-quality session.

**TSB is negative at low absolute fitness.** CTL is approximately 15–20 stress points. ATL is pulling TSB to −20. This means the training load is high _relative to your adaptation level_, not high in absolute terms. The solution is not to train less — it's to train more consistently at low intensity so CTL rises faster than ATL.

### Recommended 8-week priority list (before introducing any quality sessions)

1. **Weeks 1–8:** Easy running only. HR strictly below 145 bpm. No threshold, no intervals.
2. **Volume progression:** 20 → 23 → 26 → 20 (cutback) → 30 → 33 → 36 → 30km/week.
3. **Long run Sundays:** 12 → 14 → 16 → 12 → 18 → 20 → 22 → 18km.
4. **Run frequency:** 5 days/week minimum. Short easy runs (5–8km) on weekdays count.
5. **After week 8:** Re-assess 5km time trial. If sub-24:30, introduce one tempo session/week.

Following this, a sub-3:30 finish in December is realistic. Attempting to shortcut the base phase by adding quality sessions now will result in either injury or a fitness plateau before the peak training block.

---

_Document generated: 24 May 2026_  
_Data sources: Garmin FIT dashboard screenshots, IMPLEMENTED_FEATURES.md, SPORTS_SCIENCE_FORMULAS.md_
