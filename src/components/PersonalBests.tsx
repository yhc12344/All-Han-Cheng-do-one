import React, { useState, useEffect } from "react";
import type { Activity } from "../types";
import { findBestDistanceEfforts, findBestPowerEfforts, type BestDistanceEffort, type BestPowerEffort, markTrainingBests } from "../lib/analytics";
import { api } from "../lib/api";
import { distanceLabel } from "../lib/units";
import { RacePredictor } from "./RacePredictor";
import { useMemo } from "react";
import { usePinnedWidgetsStore } from "../stores/pinnedWidgetsStore";

// Jack Daniels' VDOT (VO2 Max) formula estimation from running performance
function estimateVdot(distanceM: number, durationS: number): number {
  if (distanceM <= 0 || durationS <= 0) return 0;
  const tMin = durationS / 60;
  const vMMin = distanceM / tMin;
  
  const vo2 = -4.60 + 0.182258 * vMMin + 0.000104 * Math.pow(vMMin, 2);
  const percentMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
  
  return vo2 / percentMax;
}

export function PersonalBests({ 
  activities, 
  distanceUnit,
  theme,
  pinnedWidgets: propsPinnedWidgets,
  togglePinWidget: propsTogglePinWidget,
  onlyPinned = false
}: { 
  activities: Activity[]; 
  distanceUnit: "km" | "mi";
  theme: "light" | "dark";
  pinnedWidgets?: string[];
  togglePinWidget?: (id: string) => void;
  onlyPinned?: boolean;
}) {
  const storePinnedWidgets = usePinnedWidgetsStore((s) => s.pinnedWidgets);
  const storeTogglePinWidget = usePinnedWidgetsStore((s) => s.togglePinWidget);
  
  const pinnedWidgets = propsPinnedWidgets ?? storePinnedWidgets;
  const togglePinWidget = propsTogglePinWidget ?? storeTogglePinWidget;
  const [runningBests, setRunningBests] = useState<BestDistanceEffort[]>([]);
  const [runningPowerBests, setRunningPowerBests] = useState<BestPowerEffort[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");

  const suffix = distanceLabel(distanceUnit);

  const garminVo2Max = useMemo(() => {
    let maxVo2 = 0;
    for (const a of activities) {
      if (!a.metadata_json) continue;
      try {
        const meta = JSON.parse(a.metadata_json);
        if (meta && meta.activity_metrics && typeof meta.activity_metrics.vo2_max === "number" && meta.activity_metrics.vo2_max > 0) {
          if (meta.activity_metrics.vo2_max > maxVo2) {
            maxVo2 = meta.activity_metrics.vo2_max;
          }
        }
      } catch {}
    }
    return Math.round(maxVo2 * 10) / 10;
  }, [activities]);

  const estimatedVdot = useMemo(() => {
    let maxVdot = 0;
    for (const pr of runningBests) {
      if (pr.bestDurationS > 0 && pr.distanceMeters >= 1500) {
        const vdot = estimateVdot(pr.distanceMeters, pr.bestDurationS);
        if (vdot > maxVdot) {
          maxVdot = vdot;
        }
      }
    }
    return Math.round(maxVdot * 10) / 10;
  }, [runningBests]);

  const jdTrainingPaces = useMemo(() => {
    const vdot = estimatedVdot > 0 ? estimatedVdot : 40.9;
    
    const getSpeed = (vo2: number) => {
      const a = 0.000104;
      const b = 0.182258;
      const c = -(4.60 + vo2);
      return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    };

    const pEasLow = getSpeed(vdot * 0.65);
    const pEasHigh = getSpeed(vdot * 0.60);
    const pMar = getSpeed(vdot * 0.716);
    const pThr = getSpeed(vdot * 0.826);
    const pInt = getSpeed(vdot * 0.938);
    const pRep = getSpeed(vdot * 1.051);

    const paceSec = (speedMMin: number) => {
      if (speedMMin <= 0) return 0;
      return (1000 / speedMMin) * 60;
    };

    return {
      vdot,
      easyLow: paceSec(pEasLow),
      easyHigh: paceSec(pEasHigh),
      marathon: paceSec(pMar),
      threshold: paceSec(pThr),
      interval: paceSec(pInt),
      repetition: paceSec(pRep)
    };
  }, [estimatedVdot]);

  const activeVo2 = garminVo2Max > 0 ? garminVo2Max : estimatedVdot;

  // Determine age-standard fitness level description (assuming active age range of 20-39)
  const fitnessLevel = useMemo(() => {
    const val = estimatedVdot > 0 ? estimatedVdot : garminVo2Max;
    if (val <= 0) return { label: "No Data", color: "var(--text-muted)", percent: 0 };
    if (val >= 52.5) return { label: "Superior (Elite)", color: "#10b981", percent: 95 };
    if (val >= 46.5) return { label: "Excellent (Athletic)", color: "#34d399", percent: 80 };
    if (val >= 41.5) return { label: "Good (Active)", color: "#60a5fa", percent: 60 };
    if (val >= 35.5) return { label: "Fair (Healthy)", color: "#f59e0b", percent: 40 };
    return { label: "Poor (Deconditioned)", color: "#ef4444", percent: 15 };
  }, [estimatedVdot, garminVo2Max]);

  useEffect(() => {
    let active = true;
    const calculateBests = async () => {
      setLoading(true);
      
      const cacheKey = "fit_dashboard_activity_prs_cache_v2";
      let cache: Record<number, {
        id: number;
        activity_name: string;
        distance_m: number;
        dists: BestDistanceEffort[];
        powers: BestPowerEffort[];
      }> = {};

      try {
        const cachedStr = localStorage.getItem(cacheKey);
        if (cachedStr) {
          cache = JSON.parse(cachedStr);
        }
      } catch (e) {
        console.error("Failed to parse PR cache", e);
      }

      // Garbage collection: clean up old cache entries for deleted activities
      const activeIds = new Set(activities.map(a => a.id));
      let cacheChanged = false;
      for (const cachedId of Object.keys(cache)) {
        const idNum = Number(cachedId);
        if (!activeIds.has(idNum)) {
          delete cache[idNum];
          cacheChanged = true;
        }
      }
      if (cacheChanged) {
        localStorage.setItem(cacheKey, JSON.stringify(cache));
      }

      // We only scan running activities for personal best achievements
      const runningActivities = activities.filter(
        a => a.sport?.toLowerCase() === "running" || a.sport?.toLowerCase() === "run"
      );

      // Find uncached activities
      const uncachedActivities = runningActivities.filter(a => {
        const cached = cache[a.id];
        return !(cached && cached.activity_name === a.activity_name && cached.distance_m === a.distance_m);
      });

      if (uncachedActivities.length > 0) {
        setProgressText(`Scanning ${uncachedActivities.length} new activity files for Personal Records...`);
        
        // Batch API queries (groups of 8) to prevent slamming Tauri/API under excessive loads
        const BATCH_SIZE = 8;
        for (let i = 0; i < uncachedActivities.length; i += BATCH_SIZE) {
          if (!active) return;
          
          const batch = uncachedActivities.slice(i, i + BATCH_SIZE);
          setProgressText(`Scanning new activities (${i + 1} to ${Math.min(i + BATCH_SIZE, uncachedActivities.length)} of ${uncachedActivities.length})...`);
          
          await Promise.all(batch.map(async (a) => {
            try {
              const records = await api.getRecords(a.id);
              const dists = await findBestDistanceEfforts([a], async () => records);
              const powers = await findBestPowerEfforts([a], async () => records);
              cache[a.id] = {
                id: a.id,
                activity_name: a.activity_name,
                distance_m: a.distance_m,
                dists,
                powers
              };
            } catch (err) {
              console.error(`Failed to scan activity ${a.id} for PRs`, err);
            }
          }));
        }

        if (active) {
          localStorage.setItem(cacheKey, JSON.stringify(cache));
        }
      }

      if (!active) return;

      // REDUCE: Compile the absolute bests across all active running activities
      const allDists: Record<number, BestDistanceEffort> = {};
      const allPowers: Record<number, BestPowerEffort> = {};

      for (const a of runningActivities) {
        const cached = cache[a.id];
        if (!cached) continue;

        if (cached.dists) {
          for (const pr of cached.dists) {
            const existing = allDists[pr.distanceMeters];
            if (!existing || pr.bestDurationS < existing.bestDurationS) {
              allDists[pr.distanceMeters] = pr;
            }
          }
        }

        if (cached.powers) {
          for (const pr of cached.powers) {
            const existing = allPowers[pr.durationSeconds];
            if (!existing || pr.bestAvgWatts > existing.bestAvgWatts) {
              allPowers[pr.durationSeconds] = pr;
            }
          }
        }
      }

      const finalDists = Object.values(allDists).sort((x, y) => x.distanceMeters - y.distanceMeters);
      const markedDists = markTrainingBests(finalDists);
      const finalPowers = Object.values(allPowers).sort((x, y) => x.durationSeconds - y.durationSeconds);

      setRunningBests(markedDists);
      setRunningPowerBests(finalPowers);
      setLoading(false);
    };

    void calculateBests();

    return () => {
      active = false;
    };
  }, [activities]);

  const formatDurationText = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatPaceText = (mps: number) => {
    if (mps <= 0) return "-";
    // Speed in m/s. Convert to min/km or min/mi.
    // 1 m/s = 3.6 km/h or 2.23694 mph.
    const unitScale = distanceUnit === "km" ? 1000 : 1609.34;
    const secondsPerUnit = unitScale / mps;
    const min = Math.floor(secondsPerUnit / 60);
    const sec = Math.floor(secondsPerUnit % 60);
    return `${min}:${sec.toString().padStart(2, "0")} /${suffix}`;
  };

  const showVo2Max = !onlyPinned || pinnedWidgets?.includes("vo2max");
  const showPRs = !onlyPinned || pinnedWidgets?.includes("personal-records");
  const showPredictor = !onlyPinned || pinnedWidgets?.includes("race-predictor");

  if (onlyPinned && !showVo2Max && !showPRs && !showPredictor) {
    return null;
  }

  return (
    <div className="personal-bests-container animate-fade-in" style={{ padding: "1rem 0" }}>
      {loading ? (
        // Premium loading screen
        <div className="panel" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div className="btn-spinner" style={{ width: "32px", height: "32px", marginBottom: "1.5rem" }} />
          <h3>Compiling Your Personal Bests</h3>
          <p className="small">{progressText}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* VO2 Max & Aerobic Capacity Panel */}
          {showVo2Max && (
          <section className="panel vo2-max-panel font-bests-panel" style={{ border: "1px solid var(--border)", borderRadius: "12px", background: "var(--bg-surface)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", position: "relative", overflow: "hidden" }}>
            {/* Ambient Background Accent Glow */}
            <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "150px", height: "150px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.06)", filter: "blur(40px)", pointerEvents: "none" }}></div>

            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
                <span style={{ fontSize: "2rem" }}>🫁</span>
                <div>
                  <h3 style={{ margin: 0 }}>VO2 Max & Aerobic Capacity</h3>
                  <p className="small">Your maximum volume of oxygen utilization (mL/kg/min) parsed from Garmin or estimated from best efforts.</p>
                </div>
              </div>
              {togglePinWidget && (
                <button
                  onClick={() => togglePinWidget("vo2max")}
                  className="widget-pin-btn"
                  style={{
                    background: pinnedWidgets?.includes("vo2max") ? "rgba(124, 58, 237, 0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${pinnedWidgets?.includes("vo2max") ? "rgba(124, 58, 237, 0.3)" : "var(--border)"}`,
                    color: pinnedWidgets?.includes("vo2max") ? "#c084fc" : "var(--text-muted)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    flexShrink: 0
                  }}
                  title={pinnedWidgets?.includes("vo2max") ? "Remove from Overview page" : "Pin/detach to Overview page"}
                >
                  {pinnedWidgets?.includes("vo2max") ? "📌 Pinned" : "➕ Pin to Overview"}
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "2rem", alignItems: "center", flexWrap: "wrap", textAlign: "left" }}>
              
              {/* Circular / Dial Rating visualizer */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.5rem 1rem", position: "relative" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>
                  PERFORMANCE VDOT (RACE-PREDICTIVE)
                </span>
                
                <div style={{ display: "flex", alignItems: "baseline", gap: "2px", margin: "0.5rem 0" }}>
                  <span style={{ fontSize: "3rem", fontWeight: 900, color: fitnessLevel.color, textShadow: `0 0 12px ${fitnessLevel.color}40`, lineHeight: 1 }}>
                    {estimatedVdot > 0 ? estimatedVdot.toFixed(1) : (garminVo2Max > 0 ? garminVo2Max.toFixed(1) : "--")}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "bold" }}>
                    mL/kg/min
                  </span>
                </div>
                
                <span style={{ fontSize: "13px", fontWeight: "bold", color: fitnessLevel.color }}>
                  {fitnessLevel.label}
                </span>

                {/* Micro Progress Bar */}
                <div style={{ width: "80%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", marginTop: "1rem", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fitnessLevel.percent}%`, background: fitnessLevel.color, borderRadius: "4px", boxShadow: `0 0 8px ${fitnessLevel.color}` }} />
                </div>
              </div>

              {/* Statistical & Scientific details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "14px" }}>Telemetry & VDOT Comparison</h4>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(100, 140, 220, 0.1)", border: "1px solid rgba(100, 140, 220, 0.25)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", color: "#60a5fa", width: "fit-content" }}>
                      <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }}></span>
                      <span>Performance VDOT (Race-Predictive): <strong>{estimatedVdot > 0 ? estimatedVdot.toFixed(1) : "--"}</strong></span>
                    </div>

                    {garminVo2Max > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px", fontSize: "12px", color: "var(--text-secondary)", width: "fit-content" }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)" }}></span>
                        <span>Garmin Estimated VO2max (Physiological Ceiling): <strong>{garminVo2Max.toFixed(1)}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.75rem", color: "var(--text-secondary)" }}>
                    Garmin's watch estimate uses sub-maximal HR modelling and typically reads 8–15% higher than performance-tested VDOT in recreational athletes. Your training paces and race predictions are calculated from your Performance VDOT.
                  </div>
                  {garminVo2Max > 0 && estimatedVdot > 0 && (
                    <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "0.5rem", fontStyle: "italic" }}>
                      Note: Your performance VDOT is <strong>{estimatedVdot.toFixed(1)}</strong>, yielding a <strong>{(garminVo2Max - estimatedVdot).toFixed(1)} mL/kg/min</strong> offset from your watch's physiological estimate.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* VDOT-Derived Training Paces Section */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "1.25rem", marginTop: "0.5rem", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px" }}>
                  🎯 VDOT-Derived Training Paces (Jack Daniels Formula)
                </span>
                <span style={{ fontSize: "10.5px", color: "var(--text-secondary)" }}>
                  Performance VDOT: <strong>{jdTrainingPaces.vdot.toFixed(1)}</strong>
                </span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", width: "100%" }}>
                {[
                  { label: "Easy (E)", range: true, valLow: jdTrainingPaces.easyLow, valHigh: jdTrainingPaces.easyHigh, purpose: "Aerobic base, active recovery", color: "#10b981", bg: "rgba(16, 185, 129, 0.08)", border: "rgba(16, 185, 129, 0.2)" },
                  { label: "Marathon (M)", val: jdTrainingPaces.marathon, purpose: "Race pace simulation", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", border: "rgba(59, 130, 246, 0.2)" },
                  { label: "Threshold (T)", val: jdTrainingPaces.threshold, purpose: "Lactate clearance tempo", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.2)" },
                  { label: "Interval (I)", val: jdTrainingPaces.interval, purpose: "VO2max hard repeats", color: "#ef4444", bg: "rgba(239, 68, 68, 0.08)", border: "rgba(239, 68, 68, 0.2)" },
                  { label: "Repetition (R)", val: jdTrainingPaces.repetition, purpose: "Economy & speed strides", color: "#ec4899", bg: "rgba(236, 72, 153, 0.08)", border: "rgba(236, 72, 153, 0.2)" }
                ].map((p, idx) => {
                  const formatPaceVal = (secPerKm: number) => {
                    const unitScale = distanceUnit === "km" ? 1.0 : 1.60934;
                    const paceScaled = secPerKm * unitScale;
                    const min = Math.floor(paceScaled / 60);
                    const sec = Math.floor(paceScaled % 60);
                    return `${min}:${sec.toString().padStart(2, "0")} /${suffix}`;
                  };

                  const paceStr = p.range 
                    ? (() => {
                        const unitScale = distanceUnit === "km" ? 1.0 : 1.60934;
                        const paceScaledLow = p.valLow * unitScale;
                        const paceScaledHigh = p.valHigh * unitScale;
                        
                        const minL = Math.floor(paceScaledLow / 60);
                        const secL = Math.floor(paceScaledLow % 60);
                        
                        const minH = Math.floor(paceScaledHigh / 60);
                        const secH = Math.floor(paceScaledHigh % 60);
                        
                        return `${minL}:${secL.toString().padStart(2, "0")}–${minH}:${secH.toString().padStart(2, "0")} /${suffix}`;
                      })()
                    : formatPaceVal(p.val ?? 0);

                  return (
                    <div key={idx} style={{
                      background: p.bg,
                      border: `1px solid ${p.border}`,
                      borderRadius: "8px",
                      padding: "0.6rem 0.75rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      textAlign: "left"
                    }}>
                      <span style={{ fontSize: "10.5px", fontWeight: "bold", color: p.color }}>{p.label}</span>
                      <strong style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--text)" }}>{paceStr}</strong>
                      <span style={{ fontSize: "9px", color: "var(--text-secondary)", lineHeight: "1.3" }}>{p.purpose}</span>
                    </div>
                  );
                })}
              </div>
            </div>

          </section>
          )}
          
          {/* Combined Personal Records & Power Bests Panel */}
          {showPRs && (
          <section className="panel font-bests-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", textAlign: "left" }}>
                <span style={{ fontSize: "2rem" }}>🏆</span>
                <div>
                  <h3 style={{ margin: 0 }}>Personal Records & Power Bests</h3>
                  <p className="small">Your absolute fastest speed segments and maximum wattage outputs scanned across all running efforts.</p>
                </div>
              </div>
              {togglePinWidget && (
                <button
                  onClick={() => togglePinWidget("personal-records")}
                  className="widget-pin-btn"
                  style={{
                    background: pinnedWidgets?.includes("personal-records") ? "rgba(124, 58, 237, 0.12)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${pinnedWidgets?.includes("personal-records") ? "rgba(124, 58, 237, 0.3)" : "var(--border)"}`,
                    color: pinnedWidgets?.includes("personal-records") ? "#c084fc" : "var(--text-muted)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    flexShrink: 0
                  }}
                  title={pinnedWidgets?.includes("personal-records") ? "Remove from Overview page" : "Pin/detach to Overview page"}
                >
                  {pinnedWidgets?.includes("personal-records") ? "📌 Pinned" : "➕ Pin to Overview"}
                </button>
              )}
            </div>

            {/* Distance Personal Bests Sub-Section */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem", textAlign: "left" }}>
                <span style={{ fontSize: "1.2rem" }}>🏃</span>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>Distance Personal Records</h4>
              </div>

              {runningBests.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 100 }}>
                  <span>No running personal records found yet. Keep training!</span>
                </div>
              ) : (
                <div className="pr-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                  {runningBests.map((pr, index) => {
                    const isTr = pr.isTrainingBest;
                    // Give different colored badges for medals
                    const badgeColor = isTr ? "var(--text-muted)" : (index === 0 ? "#fbbf24" : index === 1 ? "#94a3b8" : index === 2 ? "#d97706" : "var(--accent)");
                    return (
                      <div key={pr.distanceMeters} className="pr-card" style={{ 
                        background: isTr ? "rgba(255, 255, 255, 0.01)" : "var(--bg-surface)", 
                        border: isTr ? "1px dashed var(--border)" : "1px solid var(--border)", 
                        borderRadius: "8px", 
                        padding: "0.75rem", 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: "0.35rem", 
                        position: "relative" 
                      }}>
                        <div className="pr-badge-glow" style={{ position: "absolute", top: "10px", right: "10px", width: "8px", height: "8px", borderRadius: "50%", background: badgeColor, boxShadow: isTr ? "none" : `0 0 8px 2px ${badgeColor}` }} />
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: isTr ? "var(--text-muted)" : "var(--text)" }}>
                          {pr.label} {isTr && <span style={{ fontSize: "8.5px", fontWeight: "normal", color: "var(--text-muted)", marginLeft: "4px" }}>(Training)</span>}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "0.15rem", flexWrap: "wrap", gap: "2px" }}>
                          <span style={{ fontSize: "1.25rem", fontWeight: 800, color: isTr ? "var(--text-secondary)" : "var(--accent)" }}>{formatDurationText(pr.bestDurationS)}</span>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>{formatPaceText(pr.avgSpeedMps)}</span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.35rem", borderTop: "1px solid var(--border)", paddingTop: "0.35rem", textAlign: "left" }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Workout: <strong>{pr.activityName}</strong></div>
                          <div>Date: <strong>{pr.dateStr}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Subtle Divider Line */}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: "0.5rem" }} />

            {/* Power Bests Sub-Section */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem", textAlign: "left" }}>
                <span style={{ fontSize: "1.2rem" }}>⚡</span>
                <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>Power Personal Records</h4>
              </div>

              {runningPowerBests.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 100 }}>
                  <span>No running power personal records found yet. Run with a compatible running power watch or sensor!</span>
                </div>
              ) : (
                <div className="pr-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                  {runningPowerBests.map((pr, index) => {
                    const badgeColor = index === 0 ? "#fbbf24" : index === 1 ? "#94a3b8" : index === 2 ? "#d97706" : "var(--accent)";
                    return (
                      <div key={pr.durationSeconds} className="pr-card" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.35rem", position: "relative" }}>
                        <div className="pr-badge-glow" style={{ position: "absolute", top: "10px", right: "10px", width: "8px", height: "8px", borderRadius: "50%", background: badgeColor, boxShadow: `0 0 8px 2px ${badgeColor}` }} />
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{pr.label}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "0.15rem" }}>
                          <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f59e0b" }}>{Math.round(pr.bestAvgWatts)} W</span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.35rem", borderTop: "1px solid var(--border)", paddingTop: "0.35rem", textAlign: "left" }}>
                          <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Workout: <strong>{pr.activityName}</strong></div>
                          <div>Date: <strong>{pr.dateStr}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
          )}

          {/* Race Predictor Widget */}
          {showPredictor && (
            <RacePredictor 
              runningBests={runningBests} 
              activities={activities}
              distanceUnit={distanceUnit} 
              theme={theme} 
              pinnedWidgets={pinnedWidgets} 
              togglePinWidget={togglePinWidget} 
            />
          )}
        </div>
      )}
    </div>
  );
}
