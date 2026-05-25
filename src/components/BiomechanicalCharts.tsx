import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { RecordPoint } from "../types";
import { computeBiomechanicalPoints, calculateAerobicDecoupling } from "../lib/analytics";
import { distanceLabel } from "../lib/units";

export function BiomechanicalCharts({
  records,
  theme,
  isRunning = true,
  distanceUnit
}: {
  records: RecordPoint[];
  theme: "light" | "dark";
  isRunning?: boolean;
  distanceUnit: "km" | "mi";
}) {
  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const bioPoints = useMemo(() => {
    return computeBiomechanicalPoints(records, isRunning);
  }, [records, isRunning]);

  const decoupling = useMemo(() => {
    return calculateAerobicDecoupling(records);
  }, [records]);

  // Aggregate averages for summary stats
  const stats = useMemo(() => {
    let speedSum = 0, cadenceSum = 0, strideSum = 0, hrSum = 0, effSum = 0;
    let speedCount = 0, cadenceCount = 0, strideCount = 0, hrCount = 0, effCount = 0;

    bioPoints.forEach(p => {
      if (p.speedMps > 0.5) {
        speedSum += p.speedMps; speedCount++;
      }
      if (p.cadenceSpm > 0) {
        cadenceSum += p.cadenceSpm; cadenceCount++;
      }
      if (p.strideLengthM && p.strideLengthM > 0) {
        strideSum += p.strideLengthM; strideCount++;
      }
      if (p.heartRateBpm && p.heartRateBpm > 0) {
        hrSum += p.heartRateBpm; hrCount++;
      }
      if (p.efficiencyMperBeat && p.efficiencyMperBeat > 0) {
        effSum += p.efficiencyMperBeat; effCount++;
      }
    });

    return {
      avgSpeed: speedCount > 0 ? speedSum / speedCount : 0,
      avgCadence: cadenceCount > 0 ? cadenceSum / cadenceCount : 0,
      avgStrideLength: strideCount > 0 ? strideSum / strideCount : 0,
      avgHr: hrCount > 0 ? hrSum / hrCount : 0,
      avgEfficiency: effCount > 0 ? effSum / effCount : 0
    };
  }, [bioPoints]);

  // ECharts visualization options
  const chartOption = useMemo(() => {
    if (!bioPoints.length) return {};

    const timeAxes = bioPoints.map((_, i) => {
      const min = Math.floor(i / 60);
      const sec = i % 60;
      return `${min}:${sec.toString().padStart(2, "0")}`;
    });

    const strideData = bioPoints.map(p => p.strideLengthM);
    const efficiencyData = bioPoints.map(p => p.efficiencyMperBeat);

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (params: any[]) => {
          if (!params || !params.length) return "";
          let html = `<div style="font-weight:600;margin-bottom:4px;">Time: ${params[0].name}</div>`;
          params.forEach(p => {
            const val = p.value != null ? Number(p.value).toFixed(2) : "-";
            const suffix = p.seriesName.includes("Stride") ? " m" : " m/beat";
            html += `<div>${p.marker} ${p.seriesName}: <strong>${val}</strong>${suffix}</div>`;
          });
          return html;
        }
      },
      legend: {
        textStyle: { color: axisColor, fontSize: 12 },
        top: 0,
        data: isRunning 
          ? ["Stride Length", "Cardiovascular Efficiency"]
          : ["Cardiovascular Efficiency"]
      },
      grid: { left: 45, right: 45, top: 40, bottom: 25 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: timeAxes,
        axisLabel: { color: axisColor, fontSize: 11, showMaxLabel: true },
        axisLine: { lineStyle: { color: gridLine } }
      },
      yAxis: [
        {
          type: "value",
          name: "Stride (m)",
          show: isRunning,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 11 },
          splitLine: { show: false },
          min: (value: any) => Math.max(0, Math.floor((value.min - 0.2) * 10) / 10),
          max: (value: any) => Math.ceil((value.max + 0.2) * 10) / 10
        },
        {
          type: "value",
          name: "Efficiency (m/beat)",
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 11 },
          splitLine: { lineStyle: { color: gridLine } },
          min: (value: any) => Math.max(0, Math.floor((value.min - 0.1) * 10) / 10),
          max: (value: any) => Math.ceil((value.max + 0.1) * 10) / 10
        }
      ],
      series: [
        ...(isRunning ? [{
          name: "Stride Length",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: "#a855f7" },
          data: strideData
        }] : []),
        {
          name: "Cardiovascular Efficiency",
          type: "line",
          smooth: true,
          showSymbol: false,
          yAxisIndex: 1,
          lineStyle: { width: 2.5, color: "#10b981" },
          data: efficiencyData
        }
      ]
    };
  }, [bioPoints, isRunning, axisColor, gridLine, tooltipBg, tooltipBorder, tooltipText]);

  if (records.length < 30) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "2rem" }}>
        <p className="small">Biomechanical telemetry requires a continuous activity recording with heart rate and speed sensors.</p>
      </div>
    );
  }

  const getDecouplingRating = (pct: number) => {
    if (pct < 3) return { label: "Excellent (Aerobically Elite)", color: "#10b981" };
    if (pct < 5.1) return { label: "Good (Highly Trained)", color: "#3b82f6" };
    if (pct < 8.1) return { label: "Fair (Developing Base)", color: "#f59e0b" };
    return { label: "High Cardiac Drift (Fatigue / Detrained)", color: "#ef4444" };
  };

  const rating = decoupling.decouplingPercentage !== null 
    ? getDecouplingRating(decoupling.decouplingPercentage)
    : null;

  return (
    <div className="biomechanics-matrix-container panel glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem" }}>
      <div className="card-header" style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
        <span style={{ fontSize: "2rem" }}>📊</span>
        <div style={{ textAlign: "left" }}>
          <h3 style={{ margin: 0 }}>Efficiency & Biomechanical Form Matrix</h3>
          <p className="small">Locates stride efficiency markers and models aerobic fatigue through cardiovascular decoupling ratios.</p>
        </div>
      </div>

      {/* Stats summary banner */}
      <div className="bio-summary-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
        {isRunning && (
          <div className="stat-card" style={{ padding: "0.75rem 1rem", background: "rgba(100,140,220,0.03)", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Avg Stride Length</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#a855f7" }}>{stats.avgStrideLength.toFixed(2)} <small style={{ fontSize: "12px", fontWeight: "normal" }}>m</small></span>
          </div>
        )}
        <div className="stat-card" style={{ padding: "0.75rem 1rem", background: "rgba(100,140,220,0.03)", border: "1px solid var(--border)", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Cardiovascular Efficiency</span>
          <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#10b981" }}>{stats.avgEfficiency.toFixed(2)} <small style={{ fontSize: "12px", fontWeight: "normal" }}>m/beat</small></span>
        </div>
        <div className="stat-card" style={{ padding: "0.75rem 1rem", background: "rgba(100,140,220,0.03)", border: "1px solid var(--border)", borderRadius: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Average Cadence</span>
          <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)" }}>{Math.round(stats.avgCadence)} <small style={{ fontSize: "12px", fontWeight: "normal" }}>spm</small></span>
        </div>
        {decoupling.decouplingPercentage !== null && (
          <div className="stat-card" style={{ padding: "0.75rem 1rem", background: "rgba(100,140,220,0.03)", border: "1px solid var(--border)", borderRadius: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Aerobic Decoupling (Drift)</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 800, color: rating?.color || "var(--accent)" }}>
              {decoupling.decouplingPercentage > 0 ? "+" : ""}{decoupling.decouplingPercentage}%
            </span>
          </div>
        )}
      </div>

      <div className="bio-charts-layout" style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
        {/* Dynamic Telemetry Graph */}
        <div style={{ height: "230px" }}>
          <ReactECharts option={chartOption} style={{ height: "100%" }} />
        </div>

        {/* Aerobic Cardiac Drift Explanation */}
        <div className="decoupling-card glass-card" style={{ padding: "1.25rem", background: "rgba(100,140,220,0.02)", border: "1px solid var(--border)", borderRadius: "12px", textAlign: "left" }}>
          <span style={{ fontWeight: 700, fontSize: "13px", display: "block", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Aerobic Decoupling Analysis</span>
          {decoupling.decouplingPercentage !== null && rating ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ borderLeft: `3px solid ${rating.color}`, paddingLeft: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: "bold", color: rating.color, display: "block" }}>{rating.label}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Cardiac decoupling indicates cardiovascular base conditioning.</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                <span>1st Half EF: <strong>{decoupling.firstHalfRatio}</strong></span>
                <span>2nd Half EF: <strong>{decoupling.secondHalfRatio}</strong></span>
              </div>

              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                {decoupling.decouplingPercentage <= 5 
                  ? "Outstanding cardiovascular endurance. Your heart rate remains decoupled from fatigue, showing excellent capillary density and fat oxidation capacity."
                  : "Aerobic decoupling detected. As muscle glycogen depletes and body temperature rises, your heart beats faster to sustain the same pace/power."}
              </p>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
              Analyzing aerobic decoupling requires a minimum of 2 minutes of continuous heart rate telemetry and pacing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
