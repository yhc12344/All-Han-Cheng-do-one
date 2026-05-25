import { useState, useMemo, useRef, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import type { Activity } from "../types";
import { useChartResize } from "../lib/useChartResize";
import { type BestDistanceEffort, predictRaceTimes, generatePacingSplits, calculateRiegelExponent, isValidActivity } from "../lib/analytics";
import { distanceLabel } from "../lib/units";
import { usePinnedWidgetsStore } from "../stores/pinnedWidgetsStore";

export function RacePredictor({
  runningBests,
  activities,
  distanceUnit,
  theme,
  pinnedWidgets: propsPinnedWidgets,
  togglePinWidget: propsTogglePinWidget
}: {
  runningBests: BestDistanceEffort[];
  activities: Activity[];
  distanceUnit: "km" | "mi";
  theme: "light" | "dark";
  pinnedWidgets?: string[];
  togglePinWidget?: (id: string) => void;
}) {
  const storePinnedWidgets = usePinnedWidgetsStore((s) => s.pinnedWidgets);
  const storeTogglePinWidget = usePinnedWidgetsStore((s) => s.togglePinWidget);
  
  const pinnedWidgets = propsPinnedWidgets ?? storePinnedWidgets;
  const togglePinWidget = propsTogglePinWidget ?? storeTogglePinWidget;
  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const [targetDistanceM, setTargetDistanceM] = useState<number>(5000);
  const [pacingStrategy, setPacingStrategy] = useState<"even" | "negative" | "positive">("negative");
  const [selectedAnchorMeters, setSelectedAnchorMeters] = useState<number | null>(null);

  // Resize listener using centralized observer hook
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const resizableChart = useMemo(() => ({
    resize: () => {
      const chartInstance = chartRef.current?.getEchartsInstance();
      if (chartInstance && !chartInstance.isDisposed()) {
        chartInstance.resize();
      }
    }
  }), []);

  useChartResize(containerRef, resizableChart);

  // Calculate rolling 4-week average weekly distance
  const avgWeeklyKm = useMemo(() => {
    if (!activities) return 0;
    const runningActivities = activities.filter(a => 
      (a.sport?.toLowerCase() === "running" || a.sport?.toLowerCase() === "run") &&
      isValidActivity(a)
    );
    if (!runningActivities.length) return 0;
    
    const latestTime = Math.max(...runningActivities.map(a => Date.parse(a.start_ts_utc)));
    const fourWeeksAgo = latestTime - 28 * 24 * 60 * 60 * 1000;
    
    const runsIn4Weeks = runningActivities.filter(a => Date.parse(a.start_ts_utc) >= fourWeeksAgo);
    const totalDistM = runsIn4Weeks.reduce((sum, a) => sum + a.distance_m, 0);
    return (totalDistM / 1000) / 4; // average weekly volume in km
  }, [activities]);

  const exponent = useMemo(() => {
    return calculateRiegelExponent(avgWeeklyKm);
  }, [avgWeeklyKm]);

  const pr400m = useMemo(() => {
    return runningBests.find(b => Math.abs(b.distanceMeters - 400) < 50);
  }, [runningBests]);

  const speedReserve = useMemo(() => {
    if (!pr400m) return null;
    const pr400mPaceSec = pr400m.bestDurationS / (pr400m.distanceMeters / 1000); // sec/km
    const targetMarathonPaceSec = 298; // 4:58/km
    const reserve = targetMarathonPaceSec - pr400mPaceSec;
    return {
      reserve,
      prPace: pr400mPaceSec,
      targetPace: targetMarathonPaceSec
    };
  }, [pr400m]);

  // Choose the best effort close to 5K/10K as default anchor, or longest PR
  const defaultAnchor = useMemo(() => {
    if (!runningBests || runningBests.length === 0) return null;
    return runningBests.find(b => b.distanceMeters === 5000) 
      || runningBests.find(b => b.distanceMeters === 10000) 
      || runningBests[runningBests.length - 1];
  }, [runningBests]);

  const activeAnchor = useMemo(() => {
    if (!runningBests || runningBests.length === 0) return null;
    if (selectedAnchorMeters !== null) {
      const found = runningBests.find(b => Math.abs(b.distanceMeters - selectedAnchorMeters) < 10);
      if (found) return found;
    }
    return defaultAnchor;
  }, [runningBests, selectedAnchorMeters, defaultAnchor]);

  // Generate Riegel predictions
  const predictions = useMemo(() => {
    const standardRaces = [
      { meters: 1609.34, label: "1 Mile" },
      { meters: 5000, label: "5 km" },
      { meters: 10000, label: "10 km" },
      { meters: 21097.5, label: "Half Marathon" },
      { meters: 42195, label: "Marathon" }
    ];

    if (!activeAnchor) {
      const base5k = 1500; // 25:00 default
      return standardRaces.map(race => {
        const riegelSec = base5k * Math.pow(race.meters / 5000, exponent);
        return {
          distanceMeters: race.meters,
          label: race.label,
          predictedDurationS: Math.round(riegelSec),
          predictedPaceSecPerKm: riegelSec / (race.meters / 1000)
        };
      });
    }

    return standardRaces.map(race => {
      // Riegel: T2 = T1 * (D2 / D1)^exponent
      const predictedDurationS = activeAnchor.bestDurationS * Math.pow(race.meters / activeAnchor.distanceMeters, exponent);
      return {
        distanceMeters: race.meters,
        label: race.label,
        predictedDurationS: Math.round(predictedDurationS),
        predictedPaceSecPerKm: predictedDurationS / (race.meters / 1000)
      };
    });
  }, [activeAnchor, exponent]);

  const activePrediction = useMemo(() => {
    return predictions.find(p => Math.abs(p.distanceMeters - targetDistanceM) < 10) 
      || predictions[1] // default 5k
      || { distanceMeters: 5000, label: "5 km", predictedDurationS: 1500, predictedPaceSecPerKm: 300 };
  }, [predictions, targetDistanceM]);

  // Generate pacing splits
  const splits = useMemo(() => {
    return generatePacingSplits(
      activePrediction.distanceMeters,
      activePrediction.predictedDurationS,
      pacingStrategy
    );
  }, [activePrediction, pacingStrategy]);

  const actualPrs = useMemo(() => {
    const out: Record<number, BestDistanceEffort | null> = {};
    const distances = [1609.34, 5000, 10000, 21097.5, 42195];
    for (const d of distances) {
      const found = runningBests.find(b => Math.abs(b.distanceMeters - d) < 100);
      out[d] = found || null;
    }
    return out;
  }, [runningBests]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatPace = (secPerKm: number) => {
    const unitScale = distanceUnit === "km" ? 1.0 : 1.60934;
    const paceScaled = secPerKm * unitScale;
    const min = Math.floor(paceScaled / 60);
    const sec = Math.floor(paceScaled % 60);
    return `${min}:${sec.toString().padStart(2, "0")} /${distanceLabel(distanceUnit)}`;
  };

  const chartOption = useMemo(() => {
    const xData = splits.map(s => `Km ${s.splitNumber}`);
    
    // Scale splits to pace in seconds per current unit (km or mile)
    const unitScale = distanceUnit === "km" ? 1.0 : 1.60934;
    const paceData = splits.map(s => {
      const paceInUnit = s.splitPaceSecPerKm * unitScale;
      return Math.round((paceInUnit / 60) * 100) / 100; // decimal minutes
    });

    const maxPace = Math.max(...paceData);
    const minPace = Math.min(...paceData);
    const diff = maxPace - minPace;
    const padding = Math.max(diff * 0.25, 0.08); // min 5 seconds padding
    
    const yMin = Math.max(0, minPace - padding);
    const yMax = yMin + Math.max(diff + padding * 2, 0.15); // ensure some range

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0,0,0,0.08)",
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (params: any[]) => {
          if (!params || !params.length) return "";
          const kmIdx = params[0].dataIndex;
          const split = splits[kmIdx];
          const min = Math.floor(split.splitPaceSecPerKm * unitScale / 60);
          const sec = Math.floor(split.splitPaceSecPerKm * unitScale % 60);
          return `<div style="font-weight:600;margin-bottom:4px;">Split ${split.splitNumber}</div>
                  <div>Pace: <strong>${min}:${sec.toString().padStart(2, "0")} min/${distanceLabel(distanceUnit)}</strong></div>
                  <div>Cumulative: <strong>${formatTime(split.cumulativeDurationS)}</strong></div>`;
        }
      },
      grid: { left: 45, right: 25, top: 35, bottom: 25 },
      xAxis: {
        type: "category",
        data: xData,
        axisLabel: { color: axisColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridLine } }
      },
      yAxis: {
        type: "value",
        name: `Pace (min/${distanceLabel(distanceUnit)})`,
        nameTextStyle: { color: axisColor, fontSize: 10 },
        inverse: true, // inverse pace because lower pace (smaller number) is faster!
        min: parseFloat(yMin.toFixed(2)),
        max: parseFloat(yMax.toFixed(2)),
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          formatter: (v: number) => {
            const min = Math.floor(v);
            const sec = Math.round((v - min) * 60);
            return `${min}:${sec.toString().padStart(2, "0")}`;
          }
        },
        splitLine: { lineStyle: { color: gridLine } }
      },
      series: [
        {
          name: "Split Pace",
          type: "line",
          smooth: true,
          data: paceData,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: {
            width: 3.5,
            color: "#3b82f6"
          },
          itemStyle: {
            color: "#3b82f6",
            borderWidth: 2,
            borderColor: isDark ? "#0f172a" : "#fff"
          },
          label: {
            // Hide data labels if there are more than 5 splits (e.g. 10K, half marathon, marathon) to prevent visual squishing
            show: splits.length <= 5,
            position: "top",
            color: isDark ? "#cbd5e1" : "#334155",
            fontSize: 10,
            formatter: (params: any) => {
              const val = params.value;
              const min = Math.floor(val);
              const sec = Math.round((val - min) * 60);
              return `${min}:${sec.toString().padStart(2, "0")}`;
            }
          }
        }
      ]
    };
  }, [splits, distanceUnit, isDark, axisColor, gridLine, tooltipBg, tooltipText]);

  return (
    <section className="panel race-predictor-panel glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem" }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", textAlign: "left" }}>
          <span style={{ fontSize: "2rem" }}>🎯</span>
          <div>
            <h3 style={{ margin: 0 }}>Race Predictor & Pacing Planner</h3>
            <p className="small">Riegel sports science projections and interval splits calculated from your performance history.</p>
          </div>
        </div>
        {togglePinWidget && (
          <button
            onClick={() => togglePinWidget("race-predictor")}
            className="widget-pin-btn"
            style={{
              background: pinnedWidgets?.includes("race-predictor") ? "rgba(124, 58, 237, 0.12)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${pinnedWidgets?.includes("race-predictor") ? "rgba(124, 58, 237, 0.3)" : "var(--border)"}`,
              color: pinnedWidgets?.includes("race-predictor") ? "#c084fc" : "var(--text-muted)",
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
            title={pinnedWidgets?.includes("race-predictor") ? "Remove from Overview page" : "Pin/detach to Overview page"}
          >
            {pinnedWidgets?.includes("race-predictor") ? "📌 Pinned" : "➕ Pin to Overview"}
          </button>
        )}
      </div>

      {/* Riegel Anchor Performance Selector Alert Box */}
      {activeAnchor && (
        <div style={{
          background: "rgba(100, 140, 220, 0.03)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "1rem 1.25rem",
          textAlign: "left",
          fontSize: "12px",
          color: "var(--text-secondary)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
          <div>
            ℹ️ <strong>Volume-Adjusted Riegel Model</strong>: We project your race potential using a single <strong>anchor performance</strong> as the baseline. 
            To remain physiologically honest under your current weekly volume, we use a volume-gated fatigue exponent: <strong>{exponent.toFixed(2)}</strong> ({avgWeeklyKm >= 50 ? "Aerobically Conditioned" : avgWeeklyKm >= 35 ? "Recreational Base" : avgWeeklyKm >= 20 ? "Developing Base" : "Base-Building focus"}). 
            Select a different anchor below to see how your projected times shift!
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10.5px", fontWeight: "bold", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Prediction Anchor:
            </span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {runningBests
                .filter(b => !b.isTrainingBest)
                .filter(b => [1609.34, 5000, 10000, 21097.5].some(d => Math.abs(b.distanceMeters - d) < 100)).map(b => {
                const isSelected = activeAnchor.distanceMeters === b.distanceMeters;
                return (
                  <button
                    key={b.distanceMeters}
                    className={`btn-compact ${isSelected ? "active" : ""}`}
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      border: isSelected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(100, 140, 220, 0.12)" : "rgba(255,255,255,0.01)",
                      color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                      borderRadius: "20px",
                      cursor: "pointer",
                      fontWeight: isSelected ? "bold" : "normal"
                    }}
                    onClick={() => setSelectedAnchorMeters(b.distanceMeters)}
                  >
                    🏃 {b.label} ({formatTime(b.bestDurationS)})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="predictor-grid" style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "stretch", width: "100%" }}>
        {/* Left: Predictions Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: "1.2 1 300px", minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "0.95rem", textAlign: "left" }}>Predicted Potential vs. Actual PRs</span>
          
          <div className="predictions-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {predictions.map(pred => {
              const isActive = Math.abs(pred.distanceMeters - targetDistanceM) < 10;
              const actualPr = actualPrs[pred.distanceMeters];
              const isAnchor = activeAnchor && Math.abs(pred.distanceMeters - activeAnchor.distanceMeters) < 10;
              
              // Calculate target offset if actual exists
              let offsetLabel = "";
              let offsetColor = "var(--text-muted)";
              if (actualPr) {
                if (actualPr.isTrainingBest) {
                  offsetLabel = "🏃 Training Run";
                  offsetColor = "var(--text-muted)";
                } else {
                  const diff = actualPr.bestDurationS - pred.predictedDurationS;
                  if (isAnchor) {
                    offsetLabel = "⚓ Anchor Effort";
                    offsetColor = "var(--accent)";
                  } else if (diff > 0) {
                    offsetLabel = `🔥 Potential: -${formatTime(diff)}`;
                    offsetColor = "#10b981";
                  } else if (diff < 0) {
                    offsetLabel = `🏆 PR is faster!`;
                    offsetColor = "var(--text-warning)";
                  } else {
                    offsetLabel = "🎯 Matches PR";
                    offsetColor = "var(--text-muted)";
                  }
                }
              } else {
                offsetLabel = "✨ Projected Target";
                offsetColor = "rgba(100, 140, 220, 0.7)";
              }

              return (
                <div
                  key={pred.distanceMeters}
                  className={`prediction-item glass-card ${isActive ? "active" : ""}`}
                  style={{
                    padding: "0.85rem 1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    border: isActive ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "8px",
                    background: isActive ? "rgba(100, 140, 220, 0.05)" : "rgba(255,255,255,0.01)",
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onClick={() => setTargetDistanceM(pred.distanceMeters)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "1rem" }}>{pred.label}</div>
                    <span style={{ fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "4px", background: "rgba(255,255,255,0.03)", border: `1px solid ${offsetColor}`, color: offsetColor }}>
                      {offsetLabel}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
                        PREDICTED POTENTIAL
                      </span>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent)" }}>
                        {formatTime(pred.predictedDurationS)}
                      </div>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        Pace: {formatPace(pred.predictedPaceSecPerKm)}
                      </span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
                        ACTUAL PR
                      </span>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: actualPr ? "var(--text)" : "var(--text-muted)" }}>
                        {actualPr ? formatTime(actualPr.bestDurationS) : "—"}
                      </div>
                      <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>
                        {actualPr ? `${actualPr.dateStr}` : "Not run yet"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {speedReserve && (
            <div className="glass-card" style={{ 
              padding: "1.25rem", 
              border: "1px solid var(--border)", 
              borderRadius: "10px", 
              background: "rgba(168, 85, 247, 0.02)", 
              textAlign: "left",
              marginTop: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem"
            }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                ⚡ Performance Profile & Speed Reserve
              </span>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Neuromuscular Headroom:</span>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#a855f7", marginTop: "2px" }}>
                    {Math.round(speedReserve.reserve)} s/km
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>400m PR Pace: <strong>{formatPace(speedReserve.prPace)}</strong></span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Marathon Goal Pace: <strong>{formatPace(speedReserve.targetPace)}</strong></span>
                </div>
              </div>
              <div style={{ 
                padding: "8px 12px", 
                background: "rgba(168, 85, 247, 0.04)", 
                borderLeft: "3.5px solid #a855f7", 
                borderRadius: "0 6px 6px 0", 
                fontSize: "11.5px", 
                lineHeight: "1.4", 
                color: "var(--text-secondary)" 
              }}>
                <strong>Aerobic-Limited:</strong> Your leg speed and neuromuscular capacity are not the bottleneck for your sub 3:30 goal; aerobic base volume is. Focus strictly on building easy, high-consistency aerobic volume (Zone 2).
              </div>
            </div>
          )}
        </div>

        {/* Right: Pacing Splits Simulator */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flex: "1.8 1 400px", minWidth: 0, alignSelf: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Split Strategy Simulator: <strong>{activePrediction.label}</strong></span>
            
            <div className="strategy-toggle" style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", padding: "2px", borderRadius: "6px" }}>
              <button
                className={`btn-compact ${pacingStrategy === "even" ? "active" : ""}`}
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => setPacingStrategy("even")}
              >
                Even
              </button>
              <button
                className={`btn-compact ${pacingStrategy === "negative" ? "active" : ""}`}
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => setPacingStrategy("negative")}
                title="Start conservative and accelerate gradually"
              >
                Negative
              </button>
              <button
                className={`btn-compact ${pacingStrategy === "positive" ? "active" : ""}`}
                style={{ fontSize: "11px", padding: "4px 8px" }}
                onClick={() => setPacingStrategy("positive")}
                title="Start aggressive and hold off fatigue"
              >
                Positive
              </button>
            </div>
          </div>

          {/* ECharts split chart */}
          <div ref={containerRef} style={{ height: "190px", position: "relative", width: "100%", minWidth: 0, overflow: "hidden" }}>
            <ReactECharts ref={chartRef} option={chartOption} notMerge={true} style={{ height: "100%", width: "100%" }} />
          </div>

          {/* Numeric splits table summary */}
          <div className="splits-table-box" style={{ overflowY: "auto", height: "470px", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: isDark ? "#1e293b" : "#f1f5f9", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>Split</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Distance</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Target Pace</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Cumulative Time</th>
                </tr>
              </thead>
              <tbody>
                {splits.map(s => (
                  <tr key={s.splitNumber} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "11px 12px", textAlign: "left", fontWeight: "bold" }}>{s.splitNumber}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>{s.distanceKm.toFixed(1)} km</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", fontWeight: 600, color: "var(--accent)" }}>{formatPace(s.splitPaceSecPerKm)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right", color: "var(--text-secondary)" }}>{formatTime(s.cumulativeDurationS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
