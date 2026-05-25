# Garmin Running Dashboard — Post-Deployment Improvement Backlog

**Assessment date:** 25 May 2026  
**Baseline:** All 5 critical issues + 4 important issues resolved. Core features verified production-ready.  
**Purpose:** Objective analysis of what remains missing, misleading, or underdeveloped after v1.0 deployment.

---

## Priority tiers

| Symbol | Meaning |
|--------|---------|
| 🔴 | **High impact** — significant analytics gap or accuracy problem |
| 🟡 | **Medium impact** — meaningful improvement to usability or correctness |
| 🟢 | **Low impact / hardware-gated** — nice to have, lower urgency |

---

## 🔴 High Impact

---

### H-1 · ACWR is a better injury predictor than TSB — ✅ RESOLVED

**What it is:**  
The Acute:Chronic Workload Ratio (Gabbett, 2016) is the single most validated injury risk metric in endurance sports literature. It compares the last 7 days of training load to the rolling 28-day average:

$$\text{ACWR} = \frac{\text{ATL (7-day load)}}{\text{CTL (28-day load)}}$$

Risk zones:
- ACWR < 0.8: **Undertraining** — detraining risk
- 0.8–1.3: **Sweet spot** — optimal load management
- 1.3–1.5: **Caution** — elevated injury risk
- > 1.5: **Danger zone** — significantly elevated injury risk (musculoskeletal)

**Why this matters for HC specifically:**  
TSB is currently the only injury/fatigue signal shown. But TSB measures fitness minus fatigue in absolute stress points, which is low when CTL is low. ACWR measures *relative* load spikes — it catches the scenario where a runner doubles their weekly mileage (high injury risk) even when their absolute TSB is not alarming. This is exactly HC's pattern: clustering of runs in April–May after months of inactivity.

**Fix Details:**  
*   **Dynamic Calculations**: Implemented fully automatic ACWR calculation inside `analytics.ts` utilizing `ATL` and `CTL` exponentially-weighted moving averages.
*   **Dual Workload Dials**: Leveraged side-by-side premium circular SVG dials inside `ReadinessTracker.tsx` to visualize Gabbett's sweet-spot zones dynamically.
*   **High Fatigue Warning Banner**: Standardized high acute load triggers a prominent yellow/crimson alert banner at the top of the Overview dashboard if the ACWR exceeds the `1.30` Sweet-spot limit.

---

### H-2 · The Riegel marathon prediction (4:09) is probably 15–20 minutes optimistic — ✅ RESOLVED

**The problem:**  
Riegel's exponent of 1.06 was calibrated on competitive runners with strong aerobic bases. For recreational runners with weekly volumes under 40km, the actual fatigue exponent is closer to 1.10–1.12. Applied to HC's 5km PR of 25:59, standard formula predicts 4:09, which is optimistic and dangerous for pacing.

**Fix Details:**  
*   **Mileage-Adjusted Dynamic Exponent**: Dynamically calculates Peter Riegel's fatigue exponent based on the athlete's 4-week average weekly distance, replacing optimistic predictions with honest projections:
    *   $\ge 70\text{ km/wk} \implies 1.06$ (Competitive)
    *   $\ge 50\text{ km/wk} \implies 1.07$ (Trained)
    *   $\ge 35\text{ km/wk} \implies 1.08$ (Recreational)
    *   $\ge 20\text{ km/wk} \implies 1.10$ (Developing)
    *   $< 20\text{ km/wk} \implies 1.12$ (Base-building focus)
*   **UI Callouts**: The dynamic exponent and its context are displayed directly within the Race Predictor panel.

---

### H-3 · No 80/20 training zone compliance tracking

**The problem:**  
The sports science consensus (Seiler, Polarized Training) is that 80% of training volume should be in Zone 1–2 (easy/conversational) and 20% in Zone 4–5 (threshold/interval). HC's Johor runs at 5:41/km with HR 162–163 bpm are Zone 3–4, not Zone 2. This is the "moderate intensity trap" — too hard to be truly easy, too easy to drive adaptation. The dashboard shows HR zone time per activity but has no cross-activity compliance metric.

**What to add:**  
A rolling 4-week zone distribution bar in the Readiness & Load tab showing:

```
Zone 1–2 (Easy):     ████████████████░░░░  72%  (target: ≥80%)  ⚠️ Below target
Zone 3   (Moderate): ████░░░░░░░░░░░░░░░░  18%  (target: ≤5%)   ⚠️ Too much moderate
Zone 4–5 (Quality):  ██░░░░░░░░░░░░░░░░░░  10%  (target: ~15%)
```

This single chart is one of the highest-value coaching insights possible. It would immediately confirm what the data shows: HC is spending too much time in Zone 3, not enough in Zone 2.

**Implementation:**  
HR zone time is already computed per activity (the donut chart exists in Individual tab). Aggregate it across all activities in the rolling 4-week window and render the compliance bar.

---

### H-4 · Training monotony and training strain are not tracked

**What it is (Foster's model):**  
Training monotony measures how much day-to-day variation exists in training load. High monotony (doing the same load every day) is associated with non-functional overreaching even at moderate absolute loads:

$$\text{Monotony} = \frac{\overline{\text{Daily Load}}}{\sigma_{\text{Daily Load}}}$$

Training Strain combines volume and monotony:

$$\text{Strain} = \text{Weekly Load} \times \text{Monotony}$$

High strain + high monotony is the burnout signature. This is distinct from TSB (which only measures fatigue magnitude, not load distribution quality).

**Risk zones (Foster):**
- Monotony > 2.0: Dangerous (insufficient variation)
- Monotony 1.5–2.0: Caution
- Monotony < 1.5: Good variation

HC's pattern of clustering runs (several in one week, then gaps) produces volatile monotony — alternating between dangerously high (0 rest days in a cluster) and zero (complete rest weeks). Both extremes are suboptimal.

**Implementation:** Add to `analytics.ts` alongside CTL/ATL. Display on Readiness & Load tab as a supplementary card.

---

### H-5 · The TSB forward projection curve (E-2) is not confirmed implemented

**The gap:**  
The Load Chart shows historical CTL/ATL/TSB. For marathon preparation, the critical question is: *what will TSB be on December 6?* This is not answerable from the current chart.

**What to add:**

Given the race date and current training trajectory, project forward:

1. **If current load continues**: project CTL/ATL/TSB 30–90 days forward using the same EWMA formula.
2. **Optimal taper start**: back-calculate from race date — TSB needs to be +10 to +25 on race day. Given current CTL (~15), ATL needs to drop significantly. The taper start should be approximately 3 weeks before Dec 6 (around Nov 15).
3. **CTL target**: to run 3:30, a CTL of approximately 55–65 is needed. Current CTL of ~15 means 6 months of consistent building.

Render as dashed lines extending the existing Load Chart into the future, with a vertical marker at the taper start date and race date.

```typescript
function projectForward(
  currentCTL: number, currentATL: number,
  plannedDailyTSS: number, daysAhead: number
): { ctl: number[], atl: number[], tsb: number[] }
```

---

## 🟡 Medium Impact

---

### M-1 · No race-specific workout surfacing for Singapore Marathon conditions

**The gap:**  
BYD Singapore Marathon (Dec 6) is a specific race with specific demands:
- Flat course (negligible elevation)
- High heat and humidity (likely 26–30°C at 5am start, rising)
- Night before carb load timing matters
- Hydration strategy (drink every 2km, not every 5km)

None of this is surfaced in the suggested workouts or the race event card. The current plan suggests generic periodization. Race-specific preparation for Singapore conditions means:

- **Heat acclimatization runs**: 3–4 weeks of deliberate easy running in midday heat to induce plasma volume expansion.
- **Marathon pace runs**: Not tempo runs. Specifically 8–16km at goal marathon pace (4:58/km), which is a distinct workout type not in the current library.
- **Back-to-back long run weekends**: Two long runs on consecutive days (Sat 18km + Sun 12km) during the peak phase, specific to marathon preparation.
- **Carb target shown (70g/hr) but never reinforced**: The event card displays this but no workout suggestion ever mentions practicing fueling strategy during long runs.

**Fix:** Add `marathon_pace`, `heat_acclimatization`, and `back_to_back_long` to the workout type library in `OverviewGoalAndEvent.tsx`. Surface them in the appropriate training block phase.

---

### M-2 · Speed reserve metric is missing — HC's is actually strong — ✅ RESOLVED

**What it is:**  
Speed reserve = gap between maximal sprint speed and goal race pace. It predicts how much "headroom" an athlete has and whether the limiter is aerobic capacity or neuromuscular power.

For HC:
- 400m PR pace: 4:07/km (speed ceiling)
- Goal marathon pace: 4:58/km
- **Speed reserve: 51 seconds/km**

This is a strong speed reserve for a recreational marathoner. It means the limiter is aerobic base, not leg speed or neuromuscular power — which confirms the entire training prescription (build base, don't add more speed work). This is genuinely useful coaching information that the dashboard already has all the data to compute but doesn't surface.

**Fix Details:**  
*   **Dynamic Computations**: Automatically computes speed reserve headroom in `seconds/km` comparing absolute anaerobic sprint pace (400m PR) to the target marathon pace.
*   **Coaching Advisory UI**: Renders a custom performance profile card within `RacePredictor.tsx` highlighting whether the athlete is **Aerobic-limited** or **Speed-limited**, directly guiding training focus.

---

### M-3 · Long run aerobic decoupling trend is the best single indicator of base development — not tracked over time

**The gap:**  
Aerobic decoupling is computed per activity. But the *trend* of decoupling over consecutive long runs is the most sensitive indicator of aerobic base development:

- Decoupling decreasing week over week → base is building, adaptation occurring
- Decoupling flat or increasing → base is stalled, possibly overreaching

HC's decoupling on the 10.5km Johor run should be compared to the 8.8km run two weeks prior and the 5km runs. A simple line chart of "long run decoupling % over time" would be one of the most actionable charts in the entire dashboard.

**Implementation:**  
Filter activities by longest run per week, compute decoupling, plot as a trend line on the Readiness & Load tab.

---

### M-4 · `localStorage` PR cache will hit storage limits at scale

**The problem:**  
The PR cache (`fit_dashboard_activity_prs_cache_v2`) grows proportionally with activity count. `localStorage` is capped at 5–10MB depending on browser. At 34 activities the cache is fine. At 200+ activities (about 1 year of consistent training), a per-activity cache of trackpoint PRs — especially with power data at 1-second resolution — will approach or exceed this limit, causing silent cache failures.

**Fix:**  
Migrate the PR cache from `localStorage` to `IndexedDB`. The API is more verbose but handles unlimited storage and binary data:

```typescript
// Instead of:
localStorage.setItem('fit_dashboard_activity_prs_cache_v2', JSON.stringify(cache));

// Use IndexedDB via a wrapper (idb library or manual implementation):
await db.put('pr-cache', cache, activityId);
```

This is a backend-invisible change (Tauri is not involved) but requires rewriting the cache read/write logic in `PersonalBests.tsx`.

---

### M-5 · No error boundaries — corrupt FIT data crashes the entire tab

**The problem:**  
There are no React error boundaries mentioned anywhere in the codebase. A FIT file with corrupt trackpoint data (which happens — GPS dropouts, sensor disconnections, firmware bugs) will throw a runtime error in `BiomechanicalCharts.tsx` or `ActivityChart.tsx` that propagates up and renders the entire Individual tab blank with a React error screen.

**Fix:**  
Wrap each major chart component in an error boundary:

```tsx
<ErrorBoundary fallback={<ChartErrorCard message="Could not render biomechanics — activity may have incomplete sensor data." />}>
  <BiomechanicalCharts records={records} />
</ErrorBoundary>
```

This is a resilience fix, not a feature — but it's the difference between a professional tool and a prototype.

---

### M-6 · Sync script (`sync_garmin.ps1`) is Windows-only

**The problem:**  
The PowerShell sync script only runs on Windows. If HC switches to Mac or Linux, or if this dashboard is deployed for other users, the sync pipeline breaks entirely. PowerShell Core exists cross-platform but isn't universally installed.

**Fix:**  
Rewrite the sync script in Python (universally available) or Node.js (already a dependency via Tauri/npm). Python is preferable since Garmin API interaction involves HTTP + JSON — both trivial in `requests` + `json`:

```python
# sync_garmin.py
import requests, json, os
from pathlib import Path

def sync_activities(token: str, output_dir: Path):
    headers = {'Authorization': f'Bearer {token}'}
    activities = requests.get('https://connectapi.garmin.com/activity-service/activity/search', headers=headers).json()
    for activity in activities:
        fit_bytes = requests.get(f'https://connectapi.garmin.com/download-service/files/activity/{activity["activityId"]}', headers=headers).content
        (output_dir / f'{activity["activityId"]}.fit').write_bytes(fit_bytes)
```

---

### M-7 · No mobile or tablet responsive layout

**The problem:**  
The docs describe `max-width: 100%` fluid layouts for wide desktops. There is no mention of mobile breakpoints, touch-friendly interactions, or responsive grid collapse. Given this is a Tauri desktop app this may be intentional — but if deployment includes a web version or future mobile port, the ECharts absolute-width issue (already documented in `ARCHITECTURE_GUIDE.md`) will make the entire dashboard unusable on narrow screens.

**If web deployment is planned:**  
Add CSS breakpoints at 768px (tablet) and 480px (mobile) that collapse the 3-column layouts to single-column, replace the ECharts timeline stacks with summary cards on mobile, and make the activity sidebar a bottom drawer instead of a right panel.

---

### M-8 · No calendar export — training plan lives only in the app

**The problem:**  
The AI-generated training plan exists only inside `TrainingScheduler.tsx`. If HC wants to see today's workout on a phone, share the plan with a coach, or get calendar reminders, there's no way to do it.

**Fix:**  
Add an export button that generates an `.ics` (iCalendar) file from the planned workouts. Every calendar app on every platform reads `.ics`:

```typescript
function generateICS(plannedWorkouts: PlannedWorkout[]): string {
  const events = plannedWorkouts.map(w => `
BEGIN:VEVENT
DTSTART:${formatICSDate(w.date)}
SUMMARY:🏃 ${w.title}
DESCRIPTION:${w.distance_km}km · ${w.duration_hr}hr target
END:VEVENT`).join('\n');
  
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events}\nEND:VCALENDAR`;
}
```

---

## 🟢 Lower Priority / Hardware-Gated

---

### L-1 · Running dynamics (GCT, oscillation) — needs HRM-Pro or Stryd

Already in `FUTURE_ROADMAP.md`. The Rust parser and DB schema changes are well-defined. The only blocker is whether HC owns an HRM-Pro chest strap or Stryd running pod. Without the hardware, the fields will always be null. Implement the DB schema changes now (SQLite migration, not DROP TABLE) so the infrastructure is ready when the hardware arrives.

---

### L-2 · Wellness FIT sync — needs Garmin Connect OAuth setup

Already in `FUTURE_ROADMAP.md`. The highest-value part of this is replacing the projected HRV (which is modelled from ATL, not measured) with actual RMSSD from the watch's overnight HRV reading. This would make the PRI index genuinely reliable rather than a sophisticated estimate. Requires OAuth2 token management and the Garmin Connect API wellness endpoint — non-trivial but well-documented.

---

### L-3 · WBGT heat correction on individual activities (E-3)

Temperature is already stored in trackpoints (`temperature_c` field visible in the Individual tab — 32.0°C on May 22). The formula from `FUTURE_ROADMAP.md` is ready. This is a 2-hour implementation:

```typescript
function heatAdjustedPace(paceMinkm: number, tempC: number): number {
  if (tempC <= 20) return paceMinkm;
  const heatPenaltyFactor = 1 + ((tempC - 20) / 5) * 0.06;
  return paceMinkm / heatPenaltyFactor; // equivalent cool-weather pace
}
```

Display as a badge on each activity run above 25°C: `Heat-adjusted equivalent: 5:08/km`.

---

### L-4 · Internal doc inconsistency — `SPORTS_SCIENCE_FORMULAS.md` contradicts UI fix

**Minor but worth noting:**  
Section 3D of `SPORTS_SCIENCE_FORMULAS.md` still describes VDOT offset as "anaerobic cardiorespiratory reserve" — the framing that was corrected in the UI as part of C-2. The internal doc now contradicts the deployed behaviour. Update Section 3D to match the corrected framing (Garmin overestimates for recreational runners, PR VDOT is the actionable metric).

---

## Running performance — what the data still says

These observations have not changed despite the dashboard improvements. The dashboard is now accurate; the training just needs to catch up.

### The Riegel optimism problem in practice

The corrected Riegel exponent (H-2 above) puts HC's honest marathon projection at approximately **4:25–4:35**, not 4:09. The 3:30 goal requires reaching a point where even the conservative exponent projects sub-3:30 — which means a 5km PR of approximately 22:30 or better. That's a 3:30 improvement on current PR, achievable in 6 months with correct training.

### The two highest-leverage training changes right now

**1. Slow down by 60–90 seconds per km on every non-quality run.**  
Every Johor run at 5:41/km with HR 162–163 is Zone 3–4 work being logged as easy. True Zone 2 for HC at VDOT 40.9 is 6:20–6:50/km. This feels embarrassingly slow. It is physiologically correct. Six weeks of genuine Zone 2 will produce measurable aerobic decoupling improvement (from likely >8% toward <5%).

**2. Add a 5th running day at any distance.**  
Current pattern: 3–4 days per week in clusters. Adding a fifth day — even just 5km easy — increases weekly volume by 25% and CTL by a proportional amount without meaningfully increasing injury risk (because the additional run is easy). Frequency drives aerobic adaptation more efficiently than extending existing runs.

### What a realistic December looks like

| Scenario | Weekly volume by Aug | 5km PR by Oct | Marathon prediction |
|----------|---------------------|---------------|---------------------|
| Current trajectory | 25km | 24:30 | 4:10–4:20 |
| Zone 2 discipline | 40km | 23:30 | 3:55–4:05 |
| Zone 2 + 5th day | 55km | 22:30 | 3:35–3:45 |

Sub-3:30 requires the third scenario and requires it to start now, not in August.

---

## Summary — ordered by implementation priority

| # | Item | Effort | Impact |
|---|------|--------|--------|
| H-1 | ACWR injury predictor | Low | High |
| H-2 | Adjusted Riegel exponent | Low | High |
| H-3 | 80/20 zone compliance bar | Medium | High |
| H-4 | Training monotony & strain | Medium | High |
| H-5 | TSB forward projection curve | Medium | High |
| M-2 | Speed reserve metric | Low | Medium |
| M-3 | Long run decoupling trend | Low | Medium |
| M-1 | Race-specific workout types | Medium | Medium |
| M-5 | Error boundaries | Low | Medium |
| M-8 | .ics calendar export | Low | Medium |
| M-4 | IndexedDB PR cache migration | High | Medium |
| M-6 | Cross-platform sync script | Medium | Medium |
| M-7 | Mobile responsive layout | High | Low–Medium |
| L-3 | Heat-adjusted pace badge | Low | Low |
| L-4 | Internal doc inconsistency fix | Low | Low |
| L-1 | Running dynamics (HRM-Pro) | High | Hardware-gated |
| L-2 | Wellness FIT sync | High | Hardware-gated |

---

*Document generated: 25 May 2026*  
*Based on: IMPLEMENTED_FEATURES.md v1.0, IMPROVEMENTS.md (all issues resolved), SPORTS_SCIENCE_FORMULAS.md, FUTURE_ROADMAP.md, dashboard screenshots*
