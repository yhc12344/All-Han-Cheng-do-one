# Sports Science Reference: Dashboard Formulas & Calculations

This document acts as the mathematical and physiological encyclopedia for the **Garmin Running Dashboard**. It outlines the exact equations, scientific baselines, and sports science principles used to calculate your training stress, pacing splits, aerobic capacity, and cardiovascular efficiency.

---

## 📈 1. Training Load Modeling (Coggan & Banister)
The dashboard calculates training load, chronic fitness, acute fatigue, and daily form using an adapted version of **Andrew Coggan’s Training Stress Score (TSS)** and **Eric Banister’s Impulse-Response Model**.

### A. Training Stress Score (TSS)
For workouts with power meter data:
$$\text{TSS} = \frac{t \times \text{NP} \times \text{IF}}{\text{FTP} \times 3600} \times 100$$
Where:
* $t$ = duration of the run in seconds.
* $\text{NP}$ = Normalized Power (accounting for physiological strain variations).
* $\text{IF}$ = Intensity Factor ($\text{NP} / \text{FTP}$).
* $\text{FTP}$ = Functional Threshold Power (running threshold).

For workouts without power (using Heart Rate TRIMP - Training Impulse):
$$\text{TRIMP (TSSEquivalent)} = t \times \text{Intensity Factor (HR based)} \times \text{Sex Weight}$$

### B. Chronic Training Load (CTL - Fitness)
CTL represents your long-term aerobic conditioning. It is calculated using a **42-day exponentially weighted moving average** of your daily TSS:
$$\text{CTL}_{\text{today}} = \text{CTL}_{\text{yesterday}} + \left( \frac{\text{TSS}_{\text{today}} - \text{CTL}_{\text{yesterday}}}{42} \right)$$

### C. Acute Training Load (ATL - Fatigue)
ATL represents the short-term muscular and cardiovascular fatigue from your recent training. It is calculated using a **7-day exponentially weighted moving average** of your daily TSS:
$$\text{ATL}_{\text{today}} = \text{ATL}_{\text{yesterday}} + \left( \frac{\text{TSS}_{\text{today}} - \text{ATL}_{\text{yesterday}}}{7} \right)$$

### D. Training Stress Balance (TSB - Form)
TSB indicates your current physiological freshness. It represents the balance between your fitness (CTL) and your fatigue (ATL):
$$\text{TSB} = \text{CTL}_{\text{yesterday}} - \text{ATL}_{\text{yesterday}}$$
* **$\text{TSB} > +5$**: *Freshness Zone* (Ready to race/push).
* **$\text{TSB}$ between $-10$ and $+5$**: *Optimal Training Zone*.
* **$\text{TSB} < -20$**: *High Fatigue / Overreaching Zone* (Risk of injury/illness).

---

## 🎯 2. Race Projections & Pacing (Riegel's Law)
We project potential race times for 5K, 10K, Half Marathon, and Marathon using **Pete Riegel’s Pacing Formula**, which is widely accepted in sports science for endurance events lasting between 3.5 minutes and 4 hours.

### A. Riegel's law
$$T_2 = T_1 \times \left( \frac{D_2}{D_1} \right)^{1.06}$$
Where:
* $T_1$ = Time of your anchor performance (in seconds).
* $D_1$ = Distance of your anchor performance (in meters).
* $D_2$ = Distance of the target race (in meters).
* $T_2$ = Projected time for the target race.
* **$1.06$** = The endurance decay exponent, representing a standard physiological aerobic fatigue curve.

### B. Linear Split Strategy Simulator
For negative and positive split strategies, the average target pace ($\text{P}_{\text{avg}}$) is distributed linearly across the total number of splits ($N$):
* **Negative Split**: Start 3% slower than average, linearly accelerating to 3% faster than average on the final kilometer:
  $$\text{Split Pace Factor}_i = 1.03 - \left( \frac{i - 1}{N - 1} \right) \times 0.06$$
* **Positive Split**: Start 2% faster than average, linearly slowing to 3% slower than average on the final kilometer:
  $$\text{Split Pace Factor}_i = 0.98 + \left( \frac{i - 1}{N - 1} \right) \times 0.05$$
  $$\text{Split Pace}_i = \text{P}_{\text{avg}} \times \text{Split Pace Factor}_i$$

---

## 🫁 3. Aerobic Capacity: VDOT / VO2 Max (Jack Daniels)
We estimate your VDOT (VO2 Max equivalent representing oxygen utilization efficiency) using **Dr. Jack Daniels’ Running Formula**.

### A. Oxygen Cost of Running ($V_{\text{O}_2}$)
The volume of oxygen consumed at a given running speed ($v$ in meters/minute):
$$V_{\text{O}_2} = -4.60 + 0.182258 \cdot v + 0.000104 \cdot v^2$$

### B. Percentage of Aerobic Capacity ($\%_{\text{Max}}$)
The percentage of VO2 Max sustainable for a duration ($t$ in minutes):
$$\%_{\text{Max}} = 0.8 + 0.1894393 \cdot e^{-0.012778 \cdot t} + 0.2989558 \cdot e^{-0.1932605 \cdot t}$$

### C. VDOT Calculation
$$\text{VDOT} = \frac{V_{\text{O}_2}}{\%_{\text{Max}}}$$
This formula is computed dynamically against all your running personal record distances to find your peak VDOT, representing your current cardiorespiratory potential.

### D. Garmin FIT Telemetry Offset Analysis
When both Garmin FIT direct VO2 Max telemetry (Message 140) and Jack Daniels' PR VDOT estimation are available, the dashboard calculates the **physiological gap**:
$$\text{VDOT Offset} = \text{VO2 Max}_{\text{Garmin}} - \text{VDOT}_{\text{PRs}}$$

*   **Garmin VO2 Max**: Represents the sub-maximal heart rate physiological ceiling projection. Because Garmin watches rely on sub-maximal HR-to-pace modeling, they typically overestimate actual racing potential by 8–15% in recreational athletes.
*   **PR VDOT**: Jack Daniels' performance-based VDOT acts as the actual, actionable cardiorespiratory metric from which training paces and race strategies should be built.
*   **VDOT Offset**: Highlights the difference between your theoretical cardiovascular limit (Garmin) and your realized mechanical/aerobic performance (PR VDOT), encouraging consistent base development to bridge this physiological gap.

---

## 🫀 4. Cardiovascular & Aerobic Efficiency

### A. Aerobic Decoupling (Cardiovascular Drift)
Aerobic Decoupling measures the drift in your heart rate relative to your pace or power output during a steady endurance run, indicating your aerobic base efficiency.

1. The workout points are divided into two equal duration halves.
2. For each half, we calculate the **Efficiency Factor (EF)**:
   $$\text{EF} = \frac{\text{Average Speed (m/min) or Power (W)}}{\text{Average Heart Rate (bpm)}}$$
3. The decoupling percentage (cardiovascular drift) is calculated as:
   $$\text{Decoupling} \% = \left( \frac{\text{EF}_{\text{first half}} - \text{EF}_{\text{second half}}}{\text{EF}_{\text{first half}}} \right) \times 100$$
   * **$\text{Decoupling} < 5\%$**: High aerobic fitness; cardiovascular drift is stable.
   * **$\text{Decoupling} > 5\%$**: Indicative of cardiac fatigue, dehydration, or an underdeveloped aerobic foundation.

### B. Heart Rate Recovery (HRR)
HRR measures how quickly your heart rate drops in the first 1–2 minutes immediately following maximum cardiorespiratory exertion (peak HR), indicating autonomic nervous system balance.
$$\text{HRR}_{\text{1-min}} = \text{Heart Rate}_{\text{peak}} - \text{Heart Rate}_{\text{peak} + 60\text{s}}$$
* **$\ge 40$ bpm**: *Excellent* vagal tone reactivating parasympathetic recovery.
* **$30 - 39$ bpm**: *Very Good*.
* **$20 - 29$ bpm**: *Good*.
* **$< 12$ bpm**: *Poor* autonomic recovery (increased fatigue indicator).

---

## 📐 5. Biomechanical Efficiency Formulas

### A. Stride Length
Calculated from GPS running speed and foot cadence:
$$\text{Stride Length (meters)} = \frac{\text{Speed (m/s)} \times 60}{\text{Cadence (spm)}}$$
*spm = steps per minute (raw watch cadence multiplied by 2 to represent both feet).*

### B. Cardiac Efficiency (Meters per Beat)
The distance your body travels per individual cardiac heartbeat:
$$\text{Cardiac Efficiency (m/beat)} = \frac{\text{Speed (m/s)} \times 60}{\text{Heart Rate (bpm)}}$$
*A rising meters-per-beat score over a training block is the **ultimate proof of an expanding stroke volume** (more blood pumped per heartbeat) and superior mechanical economy!*

---

## 🏆 6. Athlete Consistency & Training Streak Metrics

To quantify training habit formulation and long-term consistency, the dashboard models athletes' consecutive workout streaks and active density index.

### A. Chronological Streak Accumulation
A workout day key $D_i$ is marked as active ($A(D_i) = 1$) if the activity count on that day is $\ge 1$, and rest ($A(D_i) = 0$) otherwise.

The **Longest Streak** is the maximum contiguous subsequence of active days over a 365-day tracking timeline:
$$\text{Longest Streak} = \max_{1 \le j \le k \le 365} \left\{ k - j + 1 \;\middle|\; \prod_{i=j}^{k} A(D_i) = 1 \right\}$$

The **Current Streak** measures continuous active training days up to today ($D_0$) or yesterday ($D_{-1}$):
$$\text{Current Streak} = \sum_{i = -r}^{0} A(D_i)$$
Where:
- $r = 0$ if $A(D_0) = 1$ (workout recorded today).
- $r = -1$ if $A(D_0) = 0$ and $A(D_{-1}) = 1$ (workout recorded yesterday, preserving streak on active rest boundaries).
- The sequence terminates as soon as $A(D_i) = 0$.

### B. Year-Round Consistency Ratio & Rating
The **Active Days Ratio** represents the percentage of days in the last year with at least one recorded activity:
$$\text{Active Days Ratio} = \frac{\sum_{i=-364}^{0} A(D_i)}{365} \times 100$$

The athlete is awarded a **Consistency Tier (Star Rating)** based on their active percentage, signaling training maturity:
$$\text{Consistency Tier} = \begin{cases} 
      \text{Elite (5★)} & \text{Ratio} \ge 40\% \\
      \text{Athletic (4★)} & 25\% \le \text{Ratio} < 40\% \\
      \text{Dedicated (3★)} & 15\% \le \text{Ratio} < 25\% \\
      \text{Active (2★)} & 8\% \le \text{Ratio} < 15\% \\
      \text{Active Base (1★)} & \text{Ratio} < 8\%
   \end{cases}$$
