import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { Activity } from "../types";
import { calculateTrainingLoad } from "../lib/analytics";
import { enableChartWheelPageScroll } from "../lib/chartScroll";

export function LoadChart({ 
  activities, 
  theme,
  pinnedWidgets,
  togglePinWidget
}: { 
  activities: Activity[]; 
  theme: "light" | "dark";
  pinnedWidgets?: string[];
  togglePinWidget?: (id: string) => void;
}) {
  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const loadTimeline = useMemo(() => {
    return calculateTrainingLoad(activities);
  }, [activities]);

  const chartOption = useMemo(() => {
    if (!loadTimeline.length) return {};

    const dates = loadTimeline.map(d => d.dateStr);
    const fitnessData = loadTimeline.map(d => d.fitness);
    const fatigueData = loadTimeline.map(d => d.fatigue);
    const formData = loadTimeline.map(d => d.form);

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
            let suffix = " pts";
            
            // Add zone explanation for Form (TSB)
            if (p.seriesName === "Form (TSB)") {
              const form = Number(p.value);
              let zone = "";
              if (form > 25) zone = " (Untraining)";
              else if (form >= 5) zone = " (Fresh / Peak Racing)";
              else if (form >= -10) zone = " (Optimal Training)";
              else if (form >= -30) zone = " (Overreaching)";
              else zone = " (High Injury Risk!)";
              val = `${val}${zone}`;
              suffix = "";
            }
            html += `<div>${p.marker} ${label}: <strong>${val}</strong>${suffix}</div>`;
          });
          return html;
        }
      },
      legend: {
        textStyle: { color: axisColor, fontSize: 12 },
        top: 0,
        data: ["Fitness (CTL)", "Fatigue (ATL)", "Form (TSB)"]
      },
      grid: { left: 40, right: 16, top: 40, bottom: 25 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: dates,
        axisLabel: { color: axisColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridLine } },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        name: "Stress Points",
        nameTextStyle: { color: axisColor, fontSize: 11 },
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridLine } }
      },
      series: [
        {
          name: "Fitness (CTL)",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: "#3b82f6" },
          data: fitnessData
        },
        {
          name: "Fatigue (ATL)",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: "#ef4444" },
          data: fatigueData
        },
        {
          name: "Form (TSB)",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#10b981" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(16, 185, 129, 0.22)" }, // green
                { offset: 0.5, color: "rgba(148, 163, 184, 0.08)" }, // gray
                { offset: 1, color: "rgba(239, 68, 68, 0.22)" }    // red
              ]
            }
          },
          data: formData
        }
      ]
    };
  }, [loadTimeline, isDark, axisColor, gridLine, tooltipBg, tooltipBorder, tooltipText]);

  const latestPoint = useMemo(() => {
    if (!loadTimeline.length) return null;
    return loadTimeline[loadTimeline.length - 1];
  }, [loadTimeline]);

  const coachAdvice = useMemo(() => {
    if (!latestPoint) return null;
    const { fitness, fatigue, form } = latestPoint;
    
    let zoneKey: "overreaching" | "optimal" | "fresh" | "untraining" = "optimal";
    let zoneLabel = "Optimal Training";
    let zoneIcon = "🟢";
    let text = "";

    if (form < -10) {
      zoneKey = "overreaching";
      if (form < -30) {
        zoneLabel = "High Injury Risk!";
        zoneIcon = "🚨";
        text = "Your fatigue (ATL) drastically exceeds your fitness (CTL). Musculoskeletal strain is extremely high. Immediately halt quality speedwork and take 2-3 consecutive rest/Zone 2 recovery days.";
      } else {
        zoneLabel = "Productive Overreaching";
        zoneIcon = "🟡";
        text = "You are actively stretching training capacity. Prioritize deep recovery (8h+ sleep, high protein intake) and avoid successive high-intensity workouts.";
      }
    } else if (form >= -10 && form < 5) {
      zoneKey = "optimal";
      zoneLabel = "Optimal Training";
      zoneIcon = "🟢";
      text = "Excellent balance. You are adding training volume at a sustainable rate, giving your connective tissues and mitochondria time to adapt safely.";
    } else if (form >= 5 && form <= 25) {
      zoneKey = "fresh";
      zoneLabel = "Fresh / Peak Racing";
      zoneIcon = "🔵";
      text = "Your fatigue has cleared while your fitness remains fully intact. You are in your optimal performance window. Perfect to execute a race or fast time trial!";
    } else {
      zoneKey = "untraining";
      zoneLabel = "Untraining / Detraining";
      zoneIcon = "⚪";
      text = "You are fully recovered, but your long-term aerobic fitness (CTL) is starting to decay. Time to resume training and load the engine.";
    }

    return {
      zoneKey,
      zoneLabel,
      zoneIcon,
      text,
      fitness: fitness.toFixed(1),
      fatigue: fatigue.toFixed(1),
      form: form.toFixed(1)
    };
  }, [latestPoint]);

  if (!activities.length) {
    return (
      <div className="empty-state" style={{ minHeight: 200 }}>
        <span>Import activities to calculate physical load metrics.</span>
      </div>
    );
  }

  const isPinned = pinnedWidgets?.includes("load-chart");

  return (
    <article className="panel training-load-panel animate-fade-in" style={{ height: "420px", display: "flex", flexDirection: "column" }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div style={{ textAlign: "left" }}>
          <h3 style={{ margin: 0 }}>Endurance Load Model (Fitness vs. Fatigue)</h3>
          <p className="small">
            Tracks long-term adaptation (CTL) vs short-term stress (ATL). Keep Form (TSB) between +5 and +25 for peak racing readiness.
          </p>
        </div>
        {togglePinWidget && (
          <button
            onClick={() => togglePinWidget("load-chart")}
            className="widget-pin-btn"
            style={{
              background: isPinned ? "rgba(124, 58, 237, 0.12)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${isPinned ? "rgba(124, 58, 237, 0.3)" : "var(--border)"}`,
              color: isPinned ? "#c084fc" : "var(--text-muted)",
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
            title={isPinned ? "Remove from Overview page" : "Pin/detach to Overview page"}
          >
            {isPinned ? "📌 Pinned" : "➕ Pin to Overview"}
          </button>
        )}
      </div>
      
      <div className="load-split-container">
        <div style={{ flex: 1, height: "100%", minHeight: 0 }}>
          <ReactECharts 
            option={chartOption} 
            onChartReady={enableChartWheelPageScroll}
            notMerge 
            style={{ height: "100%", width: "100%" }} 
          />
        </div>

        {coachAdvice && (
          <div className="training-coach-panel glass-card">
            <div className="coach-title-section">
              <h4 className="coach-heading">
                <span>📊</span> AI Training Coach
              </h4>
              <p className="coach-subtitle">
                Endurance load model interpreter
              </p>
            </div>

            {/* Current State Zone Card */}
            <div className={`coach-zone-card ${coachAdvice.zoneKey}`}>
              <span className="coach-bullet-title" style={{ fontSize: "9px" }}>Current Training State</span>
              <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
                <span>{coachAdvice.zoneIcon}</span>
                <span>{coachAdvice.zoneLabel}</span>
              </div>
              <div className="coach-metric-row" style={{ marginTop: "6px" }}>
                <span className="coach-metric-label">Form (TSB)</span>
                <span className="coach-metric-value" style={{ color: coachAdvice.zoneKey === 'overreaching' ? 'var(--text-warning)' : coachAdvice.zoneKey === 'optimal' ? '#10b981' : coachAdvice.zoneKey === 'fresh' ? '#3b82f6' : 'var(--text-muted)' }}>
                  {coachAdvice.form} pts
                </span>
              </div>
            </div>

            {/* Detailed Metrics Breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              <span className="coach-bullet-title">Metrics Breakdown</span>
              
              <div className="coach-metric-row">
                <span className="coach-metric-label">
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
                  Fitness (CTL)
                </span>
                <span className="coach-metric-value">{coachAdvice.fitness} pts</span>
              </div>
              
              <div className="coach-metric-row">
                <span className="coach-metric-label">
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444" }} />
                  Fatigue (ATL)
                </span>
                <span className="coach-metric-value">{coachAdvice.fatigue} pts</span>
              </div>
            </div>

            {/* Coach Analysis Insights */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <span className="coach-bullet-title">What this tells you:</span>
              <p className="coach-bullet-desc">
                {coachAdvice.text}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
