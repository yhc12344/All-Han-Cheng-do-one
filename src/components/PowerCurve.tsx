import React, { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import type { RecordPoint } from "../types";
import { compilePowerCurve } from "../lib/analytics";
import { enableChartWheelPageScroll } from "../lib/chartScroll";

export function PowerCurve({ 
  records, 
  theme 
}: { 
  records: RecordPoint[]; 
  theme: "light" | "dark" 
}) {
  const prevRecordsLengthRef = useRef(records.length);
  let notMerge = false;
  if (prevRecordsLengthRef.current !== records.length) {
    notMerge = true;
    prevRecordsLengthRef.current = records.length;
  }

  const isDark = theme === "dark";
  const axisColor = isDark ? "#8899b8" : "#64748b";
  const gridLine = isDark ? "rgba(100, 140, 220, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const tooltipBg = isDark ? "rgba(14, 22, 45, 0.95)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "rgba(100, 140, 220, 0.2)" : "rgba(0, 0, 0, 0.08)";
  const tooltipText = isDark ? "#e2e8f4" : "#0f172a";

  const curveData = useMemo(() => {
    return compilePowerCurve(records);
  }, [records]);

  const chartOption = useMemo(() => {
    if (!curveData.length) return {};

    const labels = curveData.map(p => {
      const s = p.durationSeconds;
      if (s >= 3600) return `${Math.floor(s / 3600)}h`;
      if (s >= 60) return `${Math.floor(s / 60)}m`;
      return `${s}s`;
    });
    const watts = curveData.map(p => p.watts);

    // Assume default user FTP of 250W for reference
    const ftp = 250;

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontSize: 12 },
        formatter: (params: any[]) => {
          if (!params || !params.length) return "";
          const duration = params[0].name;
          const power = Number(params[0].value);
          const ratio = ((power / ftp) * 100).toFixed(0);
          return `<div style="font-weight:600;margin-bottom:4px;">Duration: ${duration}</div>
                  <div>Power: <strong>${power} W</strong></div>
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${ratio}% of FTP (${ftp}W)</div>`;
        }
      },
      grid: { left: 40, right: 16, top: 40, bottom: 25 },
      xAxis: {
        type: "category",
        boundaryGap: true,
        data: labels,
        axisLabel: { color: axisColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridLine } },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        name: "Watts",
        nameTextStyle: { color: axisColor, fontSize: 11 },
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: gridLine } }
      },
      series: [
        {
          name: "Peak Power",
          type: "line",
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          itemStyle: { color: "#f59e0b" },
          lineStyle: { width: 3, color: "#f59e0b" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(245, 158, 11, 0.22)" },
                { offset: 1, color: "rgba(245, 158, 11, 0.0)" }
              ]
            }
          },
          markLine: {
            symbol: ["none", "none"],
            lineStyle: { color: "#ef4444", type: "dashed", width: 1 },
            label: { position: "end", formatter: `FTP (${ftp}W)`, color: axisColor, fontSize: 10 },
            data: [{ yAxis: ftp }]
          },
          data: watts
        }
      ]
    };
  }, [curveData, isDark, axisColor, gridLine, tooltipBg, tooltipBorder, tooltipText]);

  const hasPower = useMemo(() => {
    return records.some(r => typeof r.power === "number" && r.power > 0);
  }, [records]);

  if (!hasPower) {
    return (
      <div className="empty-state" style={{ minHeight: 200 }}>
        <span>This cycling activity does not contain power meter data.</span>
      </div>
    );
  }

  return (
    <article className="panel power-curve-panel animate-fade-in" style={{ height: "350px", display: "flex", flexDirection: "column" }}>
      <div className="card-header" style={{ marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>Critical Power Curve (Activity Watts)</h3>
        <p className="small">
          Plots your absolute best mean average power output across different durations for this ride.
        </p>
      </div>
      <div style={{ flex: 1, width: "100%", minHeight: 0 }}>
        <ReactECharts 
          option={chartOption} 
          onChartReady={enableChartWheelPageScroll}
          notMerge={notMerge} 
          style={{ height: "100%", width: "100%" }} 
        />
      </div>
    </article>
  );
}
