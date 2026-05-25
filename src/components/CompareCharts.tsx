import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import type { Activity, RecordPoint } from "../types";
import { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { enableChartWheelPageScroll } from "../lib/chartScroll";
import { convertDistanceMeters, convertElevationMeters, convertSpeedMps, elevationLabel, speedLabel, type DistanceUnit } from "../lib/units";
import { useTranslation } from "../lib/i18n";

type Props = {
  compareIds: number[];
  activities: Activity[];
  theme: "light" | "dark";
  distanceUnit: DistanceUnit;
  isSidebarCollapsed?: boolean;
  onOpenSidebar?: () => void;
};

// Format MM:SS or HH:MM:SS
const formatRelTime = (ms: number) => {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatLegendDateTime = (rawUtc: string) => {
  const trimmed = rawUtc.trim();
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return rawUtc;
  
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${month}, ${hh}:${mm}`;
};

export function CompareCharts({ compareIds, activities, theme, distanceUnit, isSidebarCollapsed, onOpenSidebar }: Props) {
  const [loading, setLoading] = useState(false);
  const [dataSets, setDataSets] = useState<{ name: string; records: RecordPoint[] }[]>([]);
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);
  const { t } = useTranslation();

  const chartInstancesRef = useRef<any[]>([]);
  const isDispatchingRef = useRef(false);

  useEffect(() => {
    chartInstancesRef.current = [];
  }, [compareIds]);

  useEffect(() => {
    let cancelled = false;
    async function fetchCompareData() {
      if (compareIds.length === 0) {
        setDataSets([]);
        return;
      }
      setLoading(true);
      try {
        const results = await Promise.all(
          compareIds.map(async (id) => {
            const act = activities.find(a => a.id === id);
            const dateLabel = act?.start_ts_utc ? formatLegendDateTime(act.start_ts_utc) : `#${id}`;
            const distVal = act?.distance_m 
              ? convertDistanceMeters(act.distance_m, distanceUnit).toFixed(1) + (distanceUnit === "mi" ? "mi" : "km")
              : "";
            const name = distVal ? `${dateLabel} (${distVal})` : dateLabel;
            const records = await api.getRecords(id, 45_000).catch(() => []);
            return { name, records };
          })
        );
        if (!cancelled) setDataSets(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchCompareData();
    return () => { cancelled = true; };
  }, [compareIds, activities]);

  if (compareIds.length === 0) {
    return (
      <div className="empty-state" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "center", justifyContent: "center", padding: "4rem 2rem", textAlign: "center" }}>
        <span style={{ fontSize: "15px", color: "var(--text-secondary)", maxWidth: "480px", lineHeight: "1.5" }}>
          {t("compare.selectActivities")}
        </span>
        {isSidebarCollapsed && onOpenSidebar && (
          <button 
            className="btn-accent" 
            onClick={onOpenSidebar}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              padding: "0.6rem 1.25rem", 
              borderRadius: "8px", 
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 4px 12px var(--accent-glow)",
              transition: "transform 150ms ease"
            }}
          >
            📂 {t("sidebar.expandSidebar")}
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="small" style={{ padding: "2rem 0", textAlign: "center" }}>{t("compare.loading")}</div>;
  }

  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const buildSeries = (key: keyof RecordPoint) => {
    return dataSets.map((ds) => {
      const t0 = ds.records[0]?.timestamp_ms ?? 0;
      return {
        name: ds.name,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
        data: ds.records.map((r) => {
          const raw = r[key] ?? null;
          if (raw == null) return [r.timestamp_ms - t0, null];
          if (key === "speed_m_s") return [r.timestamp_ms - t0, convertSpeedMps(raw as number, distanceUnit)];
          if (key === "altitude_m") return [r.timestamp_ms - t0, convertElevationMeters(raw as number, distanceUnit)];
          return [r.timestamp_ms - t0, raw];
        }),
      };
    });
  };

  const createOption = (title: string, yAxisName: string, key: keyof RecordPoint) => ({
    title: {
      text: `${title} (${yAxisName})`,
      textStyle: { color: tooltipText, fontSize: 14, fontWeight: "600" },
      left: 16,
      top: 10,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontSize: 12 },
      axisPointer: {
        type: "line",
        lineStyle: {
          color: isDark ? "rgba(148, 163, 184, 0.45)" : "rgba(71, 85, 105, 0.35)",
          type: "dashed",
          width: 1
        }
      },
      formatter: (params: any) => {
        if (!params.length) return "";
        const relTime = formatRelTime(params[0].value[0]);
        let html = `<div><strong>${relTime}</strong></div>`;
        for (const s of params) {
          if (s.value[1] !== null) {
            html += `<div>${s.marker} ${s.seriesName}: <strong>${s.value[1]}</strong></div>`;
          }
        }
        return html;
      }
    },
    legend: {
      data: dataSets.map(ds => ds.name),
      textStyle: { color: axisColor, fontSize: 11 },
      right: 16,
      top: 10,
      type: "scroll", // Premium scrolling support for multiple comparative runs
      width: "65%",   // Restricts horizontal layout so it never overlaps the left title
    },
    grid: { left: 48, right: 16, top: 42, bottom: 46 },
    xAxis: {
      type: "value",
      axisLabel: { 
        color: axisColor, 
        fontSize: 11,
        formatter: (val: number) => formatRelTime(val)
      },
      axisLine: { lineStyle: { color: gridLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: axisColor, fontSize: 11 },
      splitLine: { lineStyle: { color: gridLine } },
    },
    dataZoom: [
      {
        type: "inside",
        zoomOnMouseWheel: "ctrl",
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
        start: zoomRange?.start ?? 0,
        end: zoomRange?.end ?? 100,
      },
    ],
    series: buildSeries(key),
  });

  const registerChart = (instance: any, index: number) => {
    enableChartWheelPageScroll(instance);
    chartInstancesRef.current[index] = instance;

    // Prevent duplicate event handlers
    instance.off("updateAxisPointer");
    instance.off("globalout");

    // Multi-chart hover/tooltip synchronization logic
    instance.on("updateAxisPointer", (params: any) => {
      if (isDispatchingRef.current) return;
      if (!params || !params.axesInfo || params.axesInfo.length === 0) return;
      const xVal = params.axesInfo[0].value;
      if (xVal === undefined || xVal === null) return;

      isDispatchingRef.current = true;
      try {
        chartInstancesRef.current.forEach((otherChart) => {
          if (!otherChart || otherChart === instance) return;
          if (typeof otherChart.isDisposed === "function" && otherChart.isDisposed()) return;

          try {
            const option = otherChart.getOption();
            if (!option || !option.series || !option.series.length) return;

            const firstSeries = option.series[0];
            if (!firstSeries || !firstSeries.data || !firstSeries.data.length) return;

            const data = firstSeries.data;
            let closestIndex = 0;
            let minDiff = Infinity;
            for (let i = 0; i < data.length; i++) {
              const pt = data[i];
              const ptX = Array.isArray(pt) ? pt[0] : (pt?.value ? pt.value[0] : null);
              if (ptX !== null && ptX !== undefined) {
                const diff = Math.abs(ptX - xVal);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIndex = i;
                }
              }
            }

            otherChart.dispatchAction({
              type: "showTip",
              seriesIndex: 0,
              dataIndex: closestIndex,
            });
          } catch (e) {
            // Suppress background sync errors on charts being disposed/re-rendered
          }
        });
      } catch (err) {
        console.error("Error synchronizing Compare charts hover:", err);
      } finally {
        isDispatchingRef.current = false;
      }
    });

    instance.on("globalout", () => {
      if (isDispatchingRef.current) return;
      isDispatchingRef.current = true;
      try {
        chartInstancesRef.current.forEach((otherChart) => {
          if (!otherChart) return;
          if (typeof otherChart.isDisposed === "function" && otherChart.isDisposed()) return;
          try {
            otherChart.dispatchAction({
              type: "hideTip",
            });
          } catch (e) {}
        });
      } catch (err) {
        console.error("Error hiding Compare charts tooltips:", err);
      } finally {
        isDispatchingRef.current = false;
      }
    });
  };

  const zoomEvents = {
    datazoom: (evt: any) => {
      const batch = evt?.batch?.[0];
      const start = typeof batch?.start === "number" ? batch.start : (typeof evt?.start === "number" ? evt.start : null);
      const end = typeof batch?.end === "number" ? batch.end : (typeof evt?.end === "number" ? evt.end : null);
      if (start !== null && end !== null) {
        setZoomRange({ start, end });
      }
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-secondary" onClick={() => setZoomRange(null)}>
          {t("compare.resetZoom")}
        </button>
      </div>
      <div className="panel"><ReactECharts option={createOption(t("compare.heartRate"), "bpm", "heart_rate")} onEvents={zoomEvents} onChartReady={(inst) => registerChart(inst, 0)} notMerge style={{ height: 320, width: "100%" }} /></div>
      <div className="panel"><ReactECharts option={createOption(t("compare.speed"), speedLabel(distanceUnit), "speed_m_s")} onEvents={zoomEvents} onChartReady={(inst) => registerChart(inst, 1)} notMerge style={{ height: 320, width: "100%" }} /></div>
      <div className="panel"><ReactECharts option={createOption(t("compare.power"), "W", "power")} onEvents={zoomEvents} onChartReady={(inst) => registerChart(inst, 2)} notMerge style={{ height: 320, width: "100%" }} /></div>
      <div className="panel"><ReactECharts option={createOption(t("compare.altitude"), elevationLabel(distanceUnit), "altitude_m")} onEvents={zoomEvents} onChartReady={(inst) => registerChart(inst, 3)} notMerge style={{ height: 320, width: "100%" }} /></div>
    </div>
  );
}
