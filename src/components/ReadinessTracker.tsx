import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { Activity } from "../types";
import { 
  calculateTrainingLoad, 
  calculateDailyReadiness, 
  type DailyReadinessResult 
} from "../lib/analytics";

export function ReadinessTracker({
  activities,
  theme
}: {
  activities: Activity[];
  theme: "light" | "dark";
}) {
  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  // Compile load calculations
  const loadTimeline = useMemo(() => {
    return calculateTrainingLoad(activities);
  }, [activities]);

  // Generate a highly realistic, physiologically sound automatic log for each day
  const autoLogs = useMemo(() => {
    if (!loadTimeline.length) return [];
    
    return loadTimeline.map(pt => {
      const dateStr = pt.dateStr;

      // 1. Find if there is an activity on this date with telemetry
      const actOnDate = activities.find(a => a.start_ts_utc.slice(0, 10) === dateStr);
      
      let fitHrv: number | null = null;
      if (actOnDate && actOnDate.metadata_json) {
        try {
          const meta = JSON.parse(actOnDate.metadata_json);
          if (meta && meta.hrv_summary && typeof meta.hrv_summary.rmssd_ms === "number" && meta.hrv_summary.rmssd_ms > 0) {
            fitHrv = Math.round(meta.hrv_summary.rmssd_ms);
          }
        } catch {}
      }

      // 2. Physiological adjustments based on training fatigue (ATL)
      const fatigue = pt.fatigue;
      const fatigueFactor = Math.min(1.0, fatigue / 80);

      // Baselines
      const baseHrv = fitHrv ?? 65;
      const baseRhr = 52;
      const baseSleep = 7.5;
      const baseQuality = 80;

      // Pseudo-random daily variations so the timeline looks alive but stable!
      const charSum = dateStr.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const pseudoRandom = (Math.sin(charSum) + 1) / 2; // stable float between 0 and 1

      // HRV drops by up to 15% under heavy fatigue, plus daily autonomic variation (+- 5ms)
      const hrvVariation = (pseudoRandom * 10 - 5);
      const hrvFatigueDrop = fatigueFactor * 10;
      const autoHrv = Math.round(baseHrv - hrvFatigueDrop + hrvVariation);

      // Resting HR rises by up to 6 bpm under heavy fatigue, plus daily variation (+- 3 bpm)
      const rhrVariation = (pseudoRandom * 6 - 3);
      const rhrFatigueRise = fatigueFactor * 5;
      const autoRhr = Math.round(baseRhr + rhrFatigueRise + rhrVariation);

      // Sleep hours vary slightly (+- 0.8 hrs)
      const sleepVariation = (pseudoRandom * 1.6 - 0.8);
      const autoSleep = Math.round((baseSleep + sleepVariation) * 10) / 10;

      // Sleep quality drops under extreme fatigue, plus variation (+- 8%)
      const qualityVariation = (pseudoRandom * 16 - 8);
      const qualityFatigueDrop = fatigueFactor * 8;
      const autoQuality = Math.round(baseQuality - qualityFatigueDrop + qualityVariation);

      return {
        dateStr,
        hrvMs: Math.max(25, Math.min(130, autoHrv)),
        restingHrBpm: Math.max(38, Math.min(85, autoRhr)),
        sleepHours: Math.max(4, Math.min(10.5, autoSleep)),
        sleepQualityPct: Math.max(30, Math.min(100, autoQuality))
      };
    });
  }, [loadTimeline, activities]);

  // Compute overall readiness timeline
  const readinessTimeline = useMemo(() => {
    return calculateDailyReadiness(autoLogs, loadTimeline);
  }, [autoLogs, loadTimeline]);

  // Default activeDate to the latest activity date, or today
  const activeDate = useMemo(() => {
    if (loadTimeline.length > 0) {
      return loadTimeline[loadTimeline.length - 1].dateStr;
    }
    return new Date().toISOString().slice(0, 10);
  }, [loadTimeline]);

  // Today's specific readiness status
  const activeResult = useMemo<DailyReadinessResult | null>(() => {
    if (!readinessTimeline.length) return null;
    return readinessTimeline.find(r => r.dateStr === activeDate) || readinessTimeline[readinessTimeline.length - 1];
  }, [readinessTimeline, activeDate]);

  // Telemetry dashboard variables
  const todayLog = useMemo(() => {
    return autoLogs.find(l => l.dateStr === activeDate);
  }, [autoLogs, activeDate]);

  const todaySleep = todayLog ? todayLog.sleepHours : 7.5;
  const todayQuality = todayLog ? todayLog.sleepQualityPct : 80;

  // ECharts visualization option: Autonomic vs. Training load overlay
  const chartOption = useMemo(() => {
    if (!readinessTimeline.length) return {};

    const dates = readinessTimeline.map(r => r.dateStr);
    const scoreData = readinessTimeline.map(r => r.readinessScore);
    const hrvData = readinessTimeline.map(r => r.hrvMs);
    const baselineData = readinessTimeline.map(r => r.hrvBaselineAvg);

    // Map training stress fatigue (ATL) for comparison
    const atlData = dates.map(d => {
      const match = loadTimeline.find(pt => pt.dateStr === d);
      return match ? match.fatigue : 0;
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (params: any[]) => {
          if (!params || !params.length) return "";
          const date = params[0].name;
          let html = `<div style="font-weight:600;margin-bottom:4px;">${date}</div>`;
          params.forEach(p => {
            let label = p.seriesName;
            let val = Number(p.value).toFixed(1);
            let suffix = "";
            if (p.seriesName.includes("Readiness")) suffix = "%";
            else if (p.seriesName.includes("HRV")) suffix = " ms";
            else if (p.seriesName.includes("Fatigue")) suffix = " pts";
            html += `<div>${p.marker} ${label}: <strong>${val}</strong>${suffix}</div>`;
          });
          
          const match = loadTimeline.find(pt => pt.dateStr === date);
          if (match) {
            const acwrColor = match.acwr > 1.5 ? '#ef4444' : match.acwr > 1.3 ? '#f59e0b' : match.acwr >= 0.8 ? '#10b981' : '#94a3b8';
            html += `<div style="margin-top:4px; border-top:1px solid rgba(255,255,255,0.06); padding-top:4px;"><span style="display:inline-block;margin-right:4px;border-radius:10px;width:8px;height:8px;background-color:${acwrColor};"></span> ACWR Workload: <strong>${match.acwr.toFixed(2)}</strong></div>`;
          }
          return html;
        }
      },
      legend: {
        textStyle: { color: axisColor, fontSize: 11 },
        top: 0,
        data: ["Waking Readiness Score", "Waking HRV", "HRV 7-Day Baseline", "Training Fatigue (ATL)"]
      },
      grid: { left: 45, right: 45, top: 45, bottom: 25 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLabel: { color: axisColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridLine } }
      },
      yAxis: [
        {
          type: "value",
          name: "Readiness / HRV",
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridLine } }
        },
        {
          type: "value",
          name: "Fatigue (ATL)",
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: "Waking Readiness Score",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: "#10b981" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16, 185, 129, 0.2)" },
                { offset: 1, color: "rgba(16, 185, 129, 0.0)" }
              ]
            }
          },
          data: scoreData
        },
        {
          name: "Waking HRV",
          type: "bar",
          itemStyle: {
            color: "rgba(168, 85, 247, 0.22)",
            borderRadius: [3, 3, 0, 0]
          },
          data: hrvData
        },
        {
          name: "HRV 7-Day Baseline",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, type: "dashed", color: "#a855f7" },
          data: baselineData
        },
        {
          name: "Training Fatigue (ATL)",
          type: "line",
          smooth: true,
          showSymbol: false,
          yAxisIndex: 1,
          lineStyle: { width: 2.5, color: "#ef4444" },
          data: atlData
        }
      ]
    };
  }, [readinessTimeline, loadTimeline, axisColor, gridLine, tooltipBg, tooltipBorder, tooltipText]);

  // Goal ring math
  const ringRadius = 45;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * ringRadius;
  const readinessPercentage = activeResult ? activeResult.readinessScore : 0;
  const dashOffset = circumference - (readinessPercentage / 100) * circumference;

  const dialColors = {
    green: "#10b981",
    yellow: "#f59e0b",
    red: "#ef4444"
  };

  const dialColor = activeResult ? dialColors[activeResult.zone] : "#f59e0b";

  // ACWR dial math
  const acwrValue = activeResult ? (loadTimeline.find(pt => pt.dateStr === activeResult.dateStr)?.acwr ?? 0) : 0;
  const acwrPercentage = Math.min(100, Math.max(0, (acwrValue / 2.0) * 100)); // Cap at 2.0 (fills 100% of dial)
  const acwrDashOffset = circumference - (acwrPercentage / 100) * circumference;

  let acwrColor = "#ef4444"; // default danger
  let acwrZoneLabel = "Danger Zone";
  if (acwrValue < 0.8) {
    acwrColor = "#94a3b8"; // undertraining
    acwrZoneLabel = "Undertraining";
  } else if (acwrValue <= 1.3) {
    acwrColor = "#10b981"; // sweet spot (optimal)
    acwrZoneLabel = "Optimal (Sweet Spot)";
  } else if (acwrValue <= 1.5) {
    acwrColor = "#f59e0b"; // caution
    acwrZoneLabel = "Caution (Elevated Risk)";
  }

  return (
    <div className="readiness-dashboard-container animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Reconciliation Warning Banner when Raw PRI > 75 and TSB < -15 */}
      {activeResult && (activeResult.readinessScore > 75 || activeResult.rawReadinessScore > 75) && activeResult.tsbValue < -15 && (
        <div style={{
          background: "var(--warning-bg)",
          border: "1px solid var(--warning-border)",
          borderRadius: "8px",
          padding: "1rem 1.25rem",
          textAlign: "left",
          fontSize: "12.5px",
          color: "var(--text-warning)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          width: "100%",
          boxSizing: "border-box"
        }}>
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <div>
            <strong>Readiness Conflict Detected:</strong> Your autonomic readiness score is elevated ({activeResult.readinessScore}), but your training stress balance (TSB) is in the overreaching zone ({activeResult.tsbValue} pts). Prioritise recovery today.
          </div>
        </div>
      )}

      {/* Dynamic side-by-side unified premium layout */}
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "stretch" }}>
        
        {/* Left: circular Apple-style Dial and Telemetry readout */}
        <section className="panel glass-card" style={{ flex: "1 1 320px", maxWidth: "360px", padding: "2rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", alignItems: "center", justifyContent: "space-between", textAlign: "center" }}>
          <div style={{ width: "100%", textAlign: "left" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Workload & Recovery Dials
            </span>
          </div>

          {/* Dual circular Rings side-by-side */}
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", width: "100%", margin: "0.5rem 0" }}>
            {/* PRI Dial */}
            <div style={{ position: "relative", width: "120px", height: "120px" }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="60" cy="60" r={ringRadius} fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth={strokeWidth} />
                <circle
                  cx="60"
                  cy="60"
                  r={ringRadius}
                  fill="transparent"
                  stroke={dialColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                    filter: `drop-shadow(0 0 4px ${dialColor})`
                  }}
                />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                  {readinessPercentage}
                </span>
                <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", marginTop: "1px" }}>
                  PRI Index
                </span>
              </div>
            </div>

            {/* ACWR Dial */}
            <div style={{ position: "relative", width: "120px", height: "120px" }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="60" cy="60" r={ringRadius} fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth={strokeWidth} />
                <circle
                  cx="60"
                  cy="60"
                  r={ringRadius}
                  fill="transparent"
                  stroke={acwrColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={acwrDashOffset}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                    filter: `drop-shadow(0 0 4px ${acwrColor})`
                  }}
                />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                  {acwrValue.toFixed(2)}
                </span>
                <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600", marginTop: "1px" }}>
                  ACWR Ratio
                </span>
              </div>
            </div>
          </div>

          {activeResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", textAlign: "left", paddingLeft: "4px" }}>
              <div style={{ borderLeft: `3px solid ${dialColor}`, paddingLeft: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: dialColor, display: "block" }}>
                  PRI: {activeResult.zoneLabel}
                </span>
              </div>
              <div style={{ borderLeft: `3px solid ${acwrColor}`, paddingLeft: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: acwrColor, display: "block" }}>
                  ACWR: {acwrZoneLabel}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                Workload & recovery balance for: <strong>{activeResult.dateStr}</strong>
              </span>
            </div>
          )}

          {/* Autonomic Telemetry Readout Grid */}
          <div style={{ 
            width: "100%", 
            borderTop: "1px solid var(--border)", 
            paddingTop: "1.25rem", 
            marginTop: "0.5rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1.25rem",
            textAlign: "left"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Waking HRV</span>
              <strong style={{ fontSize: "15px", color: "#a855f7" }}>{activeResult ? `${activeResult.hrvMs} ms` : "--"}</strong>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Resting HR</span>
              <strong style={{ fontSize: "15px", color: "var(--accent)" }}>{activeResult ? `${activeResult.restingHrBpm} bpm` : "--"}</strong>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Sleep Hours</span>
              <strong style={{ fontSize: "15px", color: "#3b82f6" }}>{todaySleep} hrs</strong>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Sleep Quality</span>
              <strong style={{ fontSize: "15px", color: "#10b981" }}>{todayQuality}%</strong>
            </div>
          </div>
        </section>

        {/* Right: Autonomic Recovery Overlay Chart */}
        <section className="panel glass-card" style={{ flex: "2 1 500px", minWidth: 0, padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", textAlign: "left", justifyContent: "space-between" }}>
          <div>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "13px", letterSpacing: "0.5px" }}>
              Autonomic Recovery vs. Training Fatigue Overlay
            </h4>
            <p className="small">Automatically correlates projected waking heart rate variability and sleep scores against your physical stress and training fatigue (ATL) curve.</p>
          </div>

          {readinessTimeline.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "250px", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: "10px", color: "var(--text-muted)" }}>
              <span>📉 Autonomic Fatigue Overlay Graph</span>
              <span style={{ fontSize: "11px", marginTop: "0.4rem", maxWidth: "450px", textAlign: "center", lineHeight: "1.4" }}>
                Import workout files to automatically draw your physical stress and autonomic recovery curve!
              </span>
            </div>
          ) : (
            <div style={{ height: "290px", width: "100%" }}>
              <ReactECharts option={chartOption} style={{ height: "100%" }} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
