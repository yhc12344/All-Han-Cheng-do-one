import { useState, useMemo } from "react";
import type { Activity } from "../types";
import { useTranslation } from "../lib/i18n";
import { isValidActivity } from "../lib/analytics";

type Props = {
  activities: Activity[];
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function ActivityContributionHeatmap({ activities }: Props) {
  const { t } = useTranslation();

  const { weeks, counts, dateActivitiesMap, maxCount, startDate, endDate, longestStreak, currentStreak, dateMap } = useMemo(() => {
    const today = startOfDay(new Date());
    
    // Determine target year based on activities (default to 2026 to match mock data)
    let targetYear = 2026;
    if (activities.length > 0) {
      const timestamps = activities
        .filter(isValidActivity)
        .map(a => Date.parse(a.start_ts_utc))
        .filter(t => !isNaN(t));
      if (timestamps.length > 0) {
        targetYear = new Date(Math.min(...timestamps)).getFullYear();
      }
    }
    
    const rangeStart = new Date(targetYear, 0, 1); // Jan 1st
    const rangeEnd = new Date(targetYear, 11, 31); // Dec 31st

    const countMap = new Map<string, number>();
    const actMap = new Map<string, Activity[]>();
    const dateMap = new Map<string, Date>();
    for (const a of activities) {
      if (!isValidActivity(a)) continue;
      const dt = new Date(a.start_ts_utc);
      if (Number.isNaN(dt.getTime())) continue;
      const key = toDateKey(startOfDay(dt));
      countMap.set(key, (countMap.get(key) ?? 0) + 1);

      const list = actMap.get(key) ?? [];
      list.push(a);
      actMap.set(key, list);
    }

    const startDayOfWeek = rangeStart.getDay();
    const startDaysToSubtract = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    const gridStart = addDays(rangeStart, -startDaysToSubtract);

    const endDayOfWeek = rangeEnd.getDay();
    const endDaysToAdd = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
    const gridEnd = addDays(rangeEnd, endDaysToAdd);

    const days: Date[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      const dateObj = new Date(d);
      days.push(dateObj);
      dateMap.set(toDateKey(dateObj), dateObj);
    }

    const weekChunks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weekChunks.push(days.slice(i, i + 7));
    }

    let peak = 0;
    for (const value of countMap.values()) {
      if (value > peak) peak = value;
    }

    // Compute Streaks chronologically
    let longestStreak = 0;
    let streakAccumulator = 0;
    
    const dateStrings: string[] = [];
    for (let i = 0; i < 365; i++) {
      const d = addDays(today, -i);
      dateStrings.push(toDateKey(d));
    }
    dateStrings.reverse(); // Now chronologically ordered from 364 days ago to today

    for (const key of dateStrings) {
      const hasWorkout = countMap.has(key) && countMap.get(key)! > 0;
      if (hasWorkout) {
        streakAccumulator++;
        if (streakAccumulator > longestStreak) {
          longestStreak = streakAccumulator;
        }
      } else {
        streakAccumulator = 0;
      }
    }

    // Current active streak
    let tempCurrent = 0;
    const todayKey = toDateKey(today);
    const hasToday = countMap.has(todayKey) && countMap.get(todayKey)! > 0;
    const yesterdayKey = toDateKey(addDays(today, -1));
    const hasYesterday = countMap.has(yesterdayKey) && countMap.get(yesterdayKey)! > 0;
    
    if (hasToday || hasYesterday) {
      let active = true;
      let d = hasToday ? today : addDays(today, -1);
      while (active) {
        const key = toDateKey(d);
        if (countMap.has(key) && countMap.get(key)! > 0) {
          tempCurrent++;
          d = addDays(d, -1);
        } else {
          active = false;
        }
      }
    }
    const currentStreak = tempCurrent;

    return {
      weeks: weekChunks,
      counts: countMap,
      dateActivitiesMap: actMap,
      maxCount: peak,
      startDate: rangeStart,
      endDate: today,
      longestStreak,
      currentStreak,
      dateMap
    };
  }, [activities]);

  const activeDaysRatio = useMemo(() => {
    return (counts.size / 365) * 100;
  }, [counts]);

  const consistencyRating = useMemo(() => {
    if (activeDaysRatio >= 40) return { label: "Elite (5★)", color: "#10b981", stars: "⭐⭐⭐⭐⭐" };
    if (activeDaysRatio >= 25) return { label: "Athletic (4★)", color: "#34d399", stars: "⭐⭐⭐⭐" };
    if (activeDaysRatio >= 15) return { label: "Dedicated (3★)", color: "#60a5fa", stars: "⭐⭐⭐" };
    if (activeDaysRatio >= 8) return { label: "Active (2★)", color: "#f59e0b", stars: "⭐⭐" };
    return { label: "Active Base (1★)", color: "var(--text-muted)", stars: "⭐" };
  }, [activeDaysRatio]);

  const windowConsistencyStats = useMemo(() => {
    if (!activities.length) return { ratio: 0, rating: { label: "No Data", color: "var(--text-muted)", stars: "⭐" }, daysCount: 0, startDateLabel: "" };
    
    // Find the first activity date
    const startTimestamps = activities.map(a => Date.parse(a.start_ts_utc)).filter(t => !isNaN(t));
    if (!startTimestamps.length) return { ratio: 0, rating: { label: "No Data", color: "var(--text-muted)", stars: "⭐" }, daysCount: 0, startDateLabel: "" };
    
    const minTimestamp = Math.min(...startTimestamps);
    const firstDate = startOfDay(new Date(minTimestamp));
    const todayDate = startOfDay(new Date());
    
    // Count total days in training window
    const diffMs = todayDate.getTime() - firstDate.getTime();
    const daysCount = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)) + 1); // include today
    
    // Count unique active days within this training window
    const firstDateKey = toDateKey(firstDate);
    const todayDateKey = toDateKey(todayDate);
    let activeDaysCount = 0;
    for (const key of counts.keys()) {
      if (key >= firstDateKey && key <= todayDateKey) {
        activeDaysCount++;
      }
    }
    
    const ratio = (activeDaysCount / daysCount) * 100;
    
    // Tiers
    let rating = { label: "Active Base (1★)", color: "var(--text-muted)", stars: "⭐" };
    if (ratio >= 80) rating = { label: "Elite (5★)", color: "#10b981", stars: "⭐⭐⭐⭐⭐" };
    else if (ratio >= 60) rating = { label: "Athletic (4★)", color: "#34d399", stars: "⭐⭐⭐⭐" };
    else if (ratio >= 40) rating = { label: "Dedicated (3★)", color: "#60a5fa", stars: "⭐⭐⭐" };
    else if (ratio >= 20) rating = { label: "Active (2★)", color: "#f59e0b", stars: "⭐⭐" };
    
    return {
      ratio,
      rating,
      daysCount,
      activeDaysCount,
      startDateLabel: firstDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    };
  }, [activities, counts]);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [colorTheme, setColorTheme] = useState<"purple" | "orange" | "green" | "cyan">("purple");

  const today = useMemo(() => startOfDay(new Date()), []);
  const activeDate = hoveredDate || selectedDate || today;
  const activeKey = toDateKey(activeDate);
  const activeActs = dateActivitiesMap.get(activeKey) ?? [];

  const handleGridMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest("[data-date]");
    if (cell) {
      const dateStr = cell.getAttribute("data-date");
      if (dateStr) {
        const d = dateMap.get(dateStr);
        if (d) {
          setHoveredDate(d);
          return;
        }
      }
    }
    setHoveredDate(null);
  };

  const handleGridMouseLeave = () => {
    setHoveredDate(null);
  };

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest("[data-date]");
    if (cell) {
      const dateStr = cell.getAttribute("data-date");
      if (dateStr) {
        const d = dateMap.get(dateStr);
        if (d) {
          if (selectedDate && toDateKey(selectedDate) === dateStr) {
            setSelectedDate(null);
          } else {
            setSelectedDate(d);
          }
        }
      }
    }
  };

  const themes = {
    purple: {
      base: "#a855f7",
      glow: "rgba(168, 85, 247, 0.4)",
      steps: ["rgba(168, 85, 247, 0.25)", "rgba(168, 85, 247, 0.50)", "rgba(168, 85, 247, 0.75)", "#a855f7"]
    },
    orange: {
      base: "#f97316",
      glow: "rgba(249, 117, 22, 0.4)",
      steps: ["rgba(249, 117, 22, 0.25)", "rgba(249, 117, 22, 0.50)", "rgba(249, 117, 22, 0.75)", "#f97316"]
    },
    green: {
      base: "#10b981",
      glow: "rgba(16, 185, 129, 0.4)",
      steps: ["rgba(16, 185, 129, 0.25)", "rgba(16, 185, 129, 0.50)", "rgba(16, 185, 129, 0.75)", "#10b981"]
    },
    cyan: {
      base: "#06b6d4",
      glow: "rgba(6, 182, 212, 0.4)",
      steps: ["rgba(6, 182, 212, 0.25)", "rgba(6, 182, 212, 0.50)", "rgba(6, 182, 212, 0.75)", "#06b6d4"]
    }
  };

  const cellColor = (count: number): string => {
    if (count <= 0) return "rgba(148, 163, 184, 0.12)";
    const ratio = maxCount > 0 ? count / maxCount : 0;
    const activeSteps = themes[colorTheme].steps;
    if (ratio < 0.25) return activeSteps[0];
    if (ratio < 0.5) return activeSteps[1];
    if (ratio < 0.75) return activeSteps[2];
    return activeSteps[3];
  };

  const rangeLabel = `${startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} - ${endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="panel overview-activity-contribution-panel" style={{ minHeight: "330px", display: "flex", flexDirection: "column", padding: "1.25rem 1.5rem" }}>
      <div className="overview-heatmap-head" style={{ marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "bold" }}>{t("heatmap.activityContributions")}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Theme Selector Dots */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "20px", padding: "3px 8px" }}>
            {(["purple", "orange", "green", "cyan"] as const).map((tName) => {
              const activeTheme = themes[tName];
              const isActive = colorTheme === tName;
              return (
                <button
                  key={tName}
                  onClick={() => setColorTheme(tName)}
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: activeTheme.base,
                    border: isActive ? "2px solid #fff" : "none",
                    boxShadow: isActive ? `0 0 6px ${activeTheme.base}` : "none",
                    cursor: "pointer",
                    padding: 0,
                    transition: "all 150ms ease"
                  }}
                  title={`Switch to ${tName} theme`}
                />
              );
            })}
          </div>
          <span className="small" style={{ color: "var(--text-muted)", fontSize: "11px" }}>{rangeLabel}</span>
        </div>
      </div>
      
      <div className="heatmap-split-container" style={{ display: "flex", gap: "1rem", width: "100%", flex: 1, minHeight: 0, alignItems: "stretch", flexWrap: "wrap" }}>
        
        {/* Left Side: Heatmap Grid */}
        <div className="overview-heatmap-wrap" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", overflowX: "auto" }}>
          <div className="overview-heatmap-grid" style={{ minWidth: "945px" }}>
            <div className="overview-heatmap-months">
              {weeks.map((week, i) => {
                const d = week[0];
                const showMonth = d.getDate() <= 7;
                const isTodayWeek = week.some(wDate => toDateKey(wDate) === toDateKey(today));
                return (
                  <div 
                    key={i} 
                    className="overview-heatmap-month"
                    style={{
                      color: isTodayWeek ? themes[colorTheme].base : undefined,
                      fontWeight: isTodayWeek ? "bold" : undefined,
                      position: "relative"
                    }}
                  >
                    {showMonth ? d.toLocaleDateString("en-US", { month: "short" }) : ""}
                    {isTodayWeek && (
                      <div 
                        style={{
                          position: "absolute",
                          bottom: "-6px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: "0",
                          height: "0",
                          borderLeft: "3.5px solid transparent",
                          borderRight: "3.5px solid transparent",
                          borderTop: `4.5px solid ${themes[colorTheme].base}`,
                          zIndex: 15
                        }}
                        title="Current Week"
                      />
                    )}
                  </div>
                );
              })}
            </div>
 
            <div className="overview-heatmap-body">
              <div className="overview-heatmap-daylabels">
                <span>{t("heatmap.mon")}</span>
                <span>{t("heatmap.tue")}</span>
                <span>{t("heatmap.wed")}</span>
                <span>{t("heatmap.thu")}</span>
                <span>{t("heatmap.fri")}</span>
                <span>{t("heatmap.sat")}</span>
                <span>{t("heatmap.sun")}</span>
              </div>
              <div 
                className="overview-heatmap-weeks"
                onMouseOver={handleGridMouseOver}
                onMouseLeave={handleGridMouseLeave}
                onClick={handleGridClick}
              >
                {weeks.map((week, wi) => {
                  const isTodayWeek = week.some(wDate => toDateKey(wDate) === toDateKey(today));
                  return (
                    <div 
                      key={wi} 
                      className="overview-heatmap-week"
                      style={{ position: "relative" }}
                    >
                      {isTodayWeek && (
                        <div 
                          className="current-week-indicator"
                          style={{
                            position: "absolute",
                            top: "-3px",
                            bottom: "-3px",
                            left: "-3px",
                            right: "-3px",
                            border: `1.5px solid ${themes[colorTheme].base}`,
                            borderRadius: "3px",
                            pointerEvents: "none",
                            boxShadow: `0 0 6px ${themes[colorTheme].glow}`,
                            background: `rgba(${colorTheme === 'purple' ? '168,85,247' : colorTheme === 'orange' ? '249,115,22' : colorTheme === 'green' ? '16,185,129' : '6,182,212'}, 0.03)`,
                            zIndex: 10
                          }}
                          title="Current Week"
                        />
                      )}
                      {week.map((d) => {
                        const key = toDateKey(d);
                        const count = counts.get(key) ?? 0;
                        const isHovered = hoveredDate !== null && key === toDateKey(hoveredDate);
                        const isSelected = selectedDate !== null && key === toDateKey(selectedDate);
                        const isActive = isHovered || isSelected;
                        return (
                          <div
                            key={key}
                            data-date={key}
                            className="overview-heatmap-cell"
                            style={{ 
                              backgroundColor: cellColor(count), 
                              cursor: "pointer",
                              transform: isHovered ? "scale(1.2)" : "scale(1)",
                              boxShadow: isSelected 
                                ? `0 0 8px ${themes[colorTheme].base}, inset 0 0 0 1px ${themes[colorTheme].base}` 
                                : isHovered 
                                  ? `0 0 6px ${themes[colorTheme].glow}` 
                                  : "none",
                              border: isSelected 
                                ? `1px solid ${themes[colorTheme].base}` 
                                : isHovered 
                                  ? `1px solid ${themes[colorTheme].steps[2]}` 
                                  : "none",
                              transition: "transform 100ms ease, box-shadow 100ms ease"
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          <div className="overview-heatmap-legend small" style={{ marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
            <span>{t("heatmap.less")}</span>
            <div className="overview-heatmap-cell" style={{ backgroundColor: "rgba(148, 163, 184, 0.12)" }} />
            <div className="overview-heatmap-cell" style={{ backgroundColor: themes[colorTheme].steps[0] }} />
            <div className="overview-heatmap-cell" style={{ backgroundColor: themes[colorTheme].steps[1] }} />
            <div className="overview-heatmap-cell" style={{ backgroundColor: themes[colorTheme].steps[2] }} />
            <div className="overview-heatmap-cell" style={{ backgroundColor: themes[colorTheme].steps[3] }} />
            <span>{t("heatmap.more")}</span>
          </div>
        </div>
        {/* Middle Column: Consistency & Streak Stats */}
        <div className="overview-heatmap-stats" style={{
          width: "220px",
          flexShrink: 0,
          padding: "0.75rem 0.85rem",
          background: "rgba(255, 255, 255, 0.015)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          boxSizing: "border-box"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              ✨ Consistency
            </span>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.2rem" }}>
              {/* Year-round Consistency */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }} title="Fixed 365-day lookback consistency">Year-round</span>
                  <span style={{ fontSize: "11px", fontWeight: "bold", color: consistencyRating.color }}>
                    {activeDaysRatio.toFixed(1)}% {consistencyRating.stars}
                  </span>
                </div>
                <span style={{ fontSize: "8.5px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "left" }}>
                  {consistencyRating.label}
                </span>
              </div>
              
              <div style={{ height: "1px", background: "var(--border)" }} />
              
              {/* Since-start Consistency */}
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }} title={`Calculated since your first activity in ${windowConsistencyStats.startDateLabel}`}>Since start</span>
                  <span style={{ fontSize: "11px", fontWeight: "bold", color: windowConsistencyStats.rating.color }}>
                    {windowConsistencyStats.ratio.toFixed(1)}% {windowConsistencyStats.rating.stars}
                  </span>
                </div>
                <span style={{ fontSize: "8.5px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "left" }}>
                  {windowConsistencyStats.rating.label} (Since {windowConsistencyStats.startDateLabel})
                </span>
              </div>

              <div style={{ height: "1px", background: "var(--border)" }} />
              
              {/* Current Streak */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Current Streak</span>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "#f97316", display: "flex", alignItems: "center", gap: "3px" }}>
                  🔥 {currentStreak}d
                </span>
              </div>
              
              <div style={{ height: "1px", background: "var(--border)" }} />

              {/* Longest Streak */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "9px", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Longest Streak</span>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text-warning)", display: "flex", alignItems: "center", gap: "3px" }}>
                  🏆 {longestStreak}d
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ height: "1px", background: "var(--border)", marginBottom: "0.2rem" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "10px", color: "var(--text-secondary)" }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.3px" }}>Active Days</span>
              <span style={{ fontWeight: "bold", color: "var(--text)" }}>{counts.size} / 365 ({activeDaysRatio.toFixed(1)}%)</span>
            </div>
            <div style={{ width: "100%", height: "5px", background: "rgba(255, 255, 255, 0.05)", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${Math.min(activeDaysRatio, 100)}%`, height: "100%", background: "var(--accent)", borderRadius: "3px" }} />
            </div>
            <div style={{ fontSize: "9px", color: "var(--text-muted)", fontStyle: "italic", textAlign: "left", marginTop: "4px", borderTop: "1px dashed var(--border)", paddingTop: "4px" }}>
              ℹ️ Year-round rating improves as you maintain training over more months.
            </div>
          </div>
        </div>

        {/* Right Side: Dedicated Activity Details Panel */}
        <div className="overview-heatmap-details" style={{
          width: "280px",
          flexShrink: 0,
          padding: "1rem",
          background: "rgba(168, 85, 247, 0.02)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          height: "100%",
          boxSizing: "border-box",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "4px" }}>
                {hoveredDate ? (
                  <>🔍 Hovering</>
                ) : selectedDate ? (
                  <>📌 Pinned</>
                ) : (
                  <>📅 Today</>
                )}
              </span>
              
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {selectedDate && !hoveredDate && (
                  <button 
                    onClick={() => setSelectedDate(null)}
                    style={{ 
                      background: "none", 
                      border: "none", 
                      color: "var(--text-muted)", 
                      fontSize: "9px", 
                      cursor: "pointer", 
                      padding: 0,
                      textDecoration: "underline",
                      fontFamily: "inherit"
                    }}
                    title="Clear selection"
                  >
                    Clear
                  </button>
                )}
                <span style={{ fontSize: "9.5px", color: "var(--text-secondary)" }}>
                  {activeActs.length} {activeActs.length === 1 ? "activity" : "activities"}
                </span>
              </div>
            </div>
            
            <h4 style={{ margin: 0, fontSize: "12px", fontWeight: "800", color: "var(--text)" }}>
              📅 {activeDate.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </h4>
            
            <div style={{ height: "1px", background: "var(--border)", margin: "0.15rem 0" }} />
            
            {activeActs.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "var(--text-muted)", fontSize: "11px", padding: "1rem 0" }}>
                💤 No activities recorded.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", flex: 1, paddingRight: "2px" }}>
                {activeActs.map((act) => {
                  const name = act.activity_name || act.file_name || act.sport || "Activity";
                  const sportIcon = act.sport?.toLowerCase() === "running" ? "🏃" : act.sport?.toLowerCase() === "cycling" ? "🚴" : "🏋️";
                  
                  const distance = act.distance_m ? `${(act.distance_m / 1000).toFixed(2)} km` : "";
                  const mins = Math.round(act.duration_s / 60);
                  const duration = mins > 0 ? `${mins} mins` : `${act.duration_s}s`;
                  
                  // Calculate average pace/speed if available
                  let avgPaceStr = "";
                  if (act.sport?.toLowerCase() === "running" && act.distance_m > 0 && act.duration_s > 0) {
                    const km = act.distance_m / 1000;
                    const paceMin = Math.floor((act.duration_s / 60) / km);
                    const paceSec = Math.round(((act.duration_s / 60) / km - paceMin) * 60);
                    avgPaceStr = `${paceMin}:${paceSec.toString().padStart(2, "0")} /km`;
                  }
                  
                  return (
                    <div key={act.id} style={{ display: "flex", flexDirection: "column", gap: "0.2rem", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", padding: "0.4rem 0.5rem", borderRadius: "6px" }}>
                      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                        <span style={{ fontSize: "11px" }}>{sportIcon}</span>
                        <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={name}>
                          {name}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", fontSize: "9.5px", color: "var(--text-secondary)", paddingLeft: "1rem" }}>
                        {distance && <span>📍 {distance}</span>}
                        {duration && <span>⏱️ {duration}</span>}
                        {avgPaceStr && <span>⚡ {avgPaceStr}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div style={{ fontSize: "9px", color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: "0.35rem", display: "flex", alignItems: "center", gap: "4px" }}>
            <span>💡</span> Hover to inspect, click to pin a day!
          </div>
        </div>

      </div>
    </div>
  );
}
