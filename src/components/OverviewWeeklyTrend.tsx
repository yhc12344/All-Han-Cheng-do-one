import { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { Activity } from "../types";
import { useTranslation } from "../lib/i18n";

type Props = {
  activities: Activity[];
  distanceUnit: "km" | "mi";
  theme: "light" | "dark";
};

type WeekBucket = {
  label: string;
  distance: number;
  durationHours: number;
};

function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function OverviewWeeklyTrend({ activities, distanceUnit, theme }: Props) {
  const prevActivitiesLengthRef = useRef(activities.length);
  let notMerge = false;
  if (prevActivitiesLengthRef.current !== activities.length) {
    notMerge = true;
    prevActivitiesLengthRef.current = activities.length;
  }

  const isDark = theme === "dark";
  const { t } = useTranslation();
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const buckets = useMemo<WeekBucket[]>(() => {
    const divisor = distanceUnit === "km" ? 1000 : 1609.344;
    const map = new Map<string, { start: Date; distance: number; durationHours: number }>();

    for (const activity of activities) {
      const ts = new Date(activity.start_ts_utc);
      if (Number.isNaN(ts.getTime())) continue;
      const wk = weekStart(ts);
      const key = wk.toISOString();
      const existing = map.get(key) ?? { start: wk, distance: 0, durationHours: 0 };
      existing.distance += activity.distance_m / divisor;
      existing.durationHours += activity.duration_s / 3600;
      map.set(key, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(-24)
      .map((w) => ({
        label: w.start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        distance: Number(w.distance.toFixed(2)),
        durationHours: Number(w.durationHours.toFixed(2)),
      }));
  }, [activities, distanceUnit]);

  // Dynamic coaching insights based on the weekly trend buckets
  const insights = useMemo(() => {
    if (buckets.length < 2) return null;
    
    const lastWeek = buckets[buckets.length - 1];
    const prevWeek = buckets[buckets.length - 2];
    
    const distChange = lastWeek.distance - prevWeek.distance;
    const pctChange = prevWeek.distance > 0 ? (distChange / prevWeek.distance) * 100 : 0;
    
    // Average pace = duration / distance * 60 (min/km or min/mi)
    const lastPace = lastWeek.distance > 0 ? (lastWeek.durationHours / lastWeek.distance) * 60 : 0;
    const prevPace = prevWeek.distance > 0 ? (prevWeek.durationHours / prevWeek.distance) * 60 : 0;
    
    const isRestWeek = lastWeek.distance < prevWeek.distance * 0.7 && lastWeek.distance < 12;
    const isVolumeSpike = pctChange > 30 && distChange > 5;
    
    let statusColor = "var(--text-muted)";
    let statusLabel = "Balanced Trajectory";
    let advice = "Your training volume is building smoothly. Maintain your current consistency and keep easy runs relaxed.";
    let icon = "📈";
    
    if (isVolumeSpike) {
      statusColor = "#ef4444"; // Warning Red
      statusLabel = "Volume Spike Warning";
      advice = `Your mileage jumped by ${pctChange.toFixed(0)}% (+${distChange.toFixed(1)}${distanceUnit}) this week. Spikes above 30% increase injury risks. Consider absorbing this workload by capping next week.`;
      icon = "⚠️";
    } else if (isRestWeek) {
      statusColor = "#38bdf8"; // Light Blue
      statusLabel = "Recovery/Rest Week";
      advice = "Excellent recovery dip. Dropping volume temporarily flushes metabolic fatigue. Build back gradually under 10-15% next week.";
      icon = "🧘";
    } else if (pctChange < -15) {
      statusColor = "#f59e0b"; // Amber
      statusLabel = "Declining Volume";
      advice = "Weekly volume decreased. If this is a planned taper or step-back week, it is highly beneficial. Otherwise, restore consistency next week.";
      icon = "📉";
    } else if (pctChange > 0) {
      statusColor = "#10b981"; // Emerald
      statusLabel = "Progressive Overload";
      advice = `Safe progressive volume build (+${pctChange.toFixed(0)}%). This is the physiological sweet spot for tendon remodeling and aerobic capacity.`;
      icon = "🍀";
    }
    
    const formatPace = (minsPerUnit: number) => {
      if (minsPerUnit <= 0) return "--:--";
      const mins = Math.floor(minsPerUnit);
      const secs = Math.round((minsPerUnit - mins) * 60);
      return `${mins}:${secs.toString().padStart(2, "0")} /${distanceUnit}`;
    };
    
    // Check if pacing is in the intensity trap (running too fast on high volume / low volume)
    const isIntensityTrap = lastWeek.distance > 0 && prevWeek.distance > 0 && lastPace < prevPace - 0.5 && lastWeek.distance < prevWeek.distance;
    
    return {
      pctChange,
      distChange,
      lastPaceStr: formatPace(lastPace),
      prevPaceStr: formatPace(prevPace),
      statusColor,
      statusLabel,
      advice,
      icon,
      isIntensityTrap,
      lastVolume: lastWeek.distance,
      prevVolume: prevWeek.distance,
      lastLabel: lastWeek.label,
      prevLabel: prevWeek.label
    };
  }, [buckets, distanceUnit]);

  const option = {
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontSize: 12 },
    },
    legend: {
      data: [t("trend.distance"), t("trend.duration")],
      textStyle: { color: axisColor, fontSize: 12 },
      top: 0,
    },
    grid: { left: 40, right: 35, top: 42, bottom: 46 },
    xAxis: {
      type: "category",
      data: buckets.map((b) => b.label),
      axisLabel: { color: axisColor, fontSize: 11, rotate: 30 },
      axisLine: { lineStyle: { color: gridLine } },
    },
    yAxis: [
      {
        type: "value",
        name: distanceUnit,
        axisLabel: { color: axisColor, fontSize: 11 },
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridLine } },
      },
      {
        type: "value",
        name: "h",
        axisLabel: { color: axisColor, fontSize: 11 },
        nameTextStyle: { color: axisColor, fontSize: 11 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: t("trend.distance"),
        type: "bar",
        barMaxWidth: 18,
        itemStyle: { color: "#06b6d4", borderRadius: [4, 4, 0, 0] },
        data: buckets.map((b) => b.distance),
      },
      {
        name: t("trend.duration"),
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5, color: "#f59e0b" },
        data: buckets.map((b) => b.durationHours),
      },
    ],
  };

  return (
    <div className="panel overview-weekly-trend-panel" style={{ display: "flex", flexDirection: "column", padding: "1.25rem 1.5rem" }}>
      <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.1rem", fontWeight: "bold", textAlign: "left" }}>
        {t("trend.weeklyTrainingTrend")}
      </h3>
      
      <div className="weekly-trend-split-container" style={{ display: "flex", gap: "1.5rem", width: "100%", alignItems: "stretch", flexWrap: "wrap" }}>
        
        {/* Left Side: Chart */}
        <div className="overview-weekly-trend-chart" style={{ flex: 1.8, minWidth: "300px", minHeight: "260px" }}>
          <ReactECharts option={option} notMerge={notMerge} style={{ height: "100%", width: "100%" }} />
        </div>
        
        {/* Right Side: Sports Science Insight Storyteller */}
        {insights && (
          <div className="weekly-trend-storyteller glass-card" style={{
            flex: 1.2,
            minWidth: "250px",
            padding: "1.1rem 1.25rem",
            background: "rgba(255, 255, 255, 0.015)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
            height: "100%"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                🔬 Weekly Workload Diagnostic
              </span>
              
              <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0.2rem 0" }}>
                <span style={{ fontSize: "16px" }}>{insights.icon}</span>
                <span style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: insights.statusColor,
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.3px"
                }}>
                  {insights.statusLabel}
                </span>
              </div>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "0.2rem 0" }}>
                {/* Volume Difference Row */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Volume Delta:</span>
                  <span style={{ fontWeight: "bold", color: insights.distChange >= 0 ? "#10b981" : "#f97316" }}>
                    {insights.distChange >= 0 ? "+" : ""}{insights.distChange.toFixed(1)} {distanceUnit} ({insights.pctChange >= 0 ? "+" : ""}{insights.pctChange.toFixed(0)}%)
                  </span>
                </div>
                
                {/* Pacing Comparison Row */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Last Week Pace:</span>
                  <span style={{ fontWeight: "bold", color: "var(--text)" }}>{insights.lastPaceStr}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Prev Week Pace:</span>
                  <span style={{ fontWeight: "bold", color: "var(--text)" }}>{insights.prevPaceStr}</span>
                </div>
              </div>
              
              <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />
              
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.45", textAlign: "left" }}>
                {insights.advice}
              </p>
            </div>
            
            <div style={{ marginTop: "1rem" }}>
              {insights.isIntensityTrap && (
                <div style={{
                  background: "rgba(245, 158, 11, 0.05)",
                  border: "1px dashed rgba(245, 158, 11, 0.25)",
                  borderRadius: "6px",
                  padding: "0.45rem 0.6rem",
                  fontSize: "10px",
                  color: "#f59e0b",
                  lineHeight: "1.35",
                  textAlign: "left",
                  marginBottom: "0.5rem"
                }}>
                  ⚠️ <strong>Moderate Intensity Trap</strong>: You cut volume but ran faster. Ensure recovery runs are kept strictly easy!
                </div>
              )}
              <div style={{ fontSize: "9px", color: "var(--text-muted)", borderTop: "1px dashed var(--border)", paddingTop: "0.4rem", textAlign: "left" }}>
                ℹ️ Models adapt relative load comparing {insights.lastLabel} to {insights.prevLabel} cycles.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
