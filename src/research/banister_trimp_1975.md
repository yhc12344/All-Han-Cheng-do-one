# A Systems Model of Training for Athletic Performance

**Author:** Eric W. Banister, T. W. Calvert, M. V. Savage, T. Bach  
**Journal:** Australian Journal of Sports Medicine  
**Year:** 1975  

---

## 🔬 Core Theory
Every training session (impulse) creates two simultaneous, opposing physiological effects:
1.  **Fitness (Chronic Adaptation):** The positive effect of training. It has a relatively slow decay rate (time constant $\tau_1 \approx 45 \text{ days}$).
2.  **Fatigue (Acute Exhaustion):** The negative effect of training. It has a fast decay rate (time constant $\tau_2 \approx 7 \text{ days}$).

An athlete's performance capacity at any given time $t$ is modeled as:
$$\text{Performance}(t) = p_{\text{initial}} + k_1 \cdot \text{Fitness}(t) - k_2 \cdot \text{Fatigue}(t)$$

## 📊 Application to Modern Metrics
This model was adapted by Dr. Andrew Coggan to create the metrics in our dashboard:
*   **Chronic Training Load (CTL / Fitness):** A 42-day exponentially weighted moving average of daily training load (TSS). Represents long-term aerobic engine adaptation.
*   **Acute Training Load (ATL / Fatigue):** A 7-day exponentially weighted moving average of daily training load (TSS). Represents short-term cardiovascular and muscular exhaustion.
*   **Training Stress Balance (TSB / Form):** Calculated as $\text{TSB} = \text{CTL} - \text{ATL}$.

## 🎯 Coaching Guidelines based on TSB (Form):
*   **TSB > +5:** *Freshness Zone.* Fatigue has decayed, leaving fitness fully active. Ideal for peak race performances.
*   **TSB: -10 to +5:** *Optimal Training Zone.* High stimulus with manageable fatigue. Ideal for building volume.
*   **TSB < -20:** *Overreaching/Injury Risk Zone.* Critical fatigue levels. Training must be curtailed; recovery runs or rest days should be scheduled immediately.
