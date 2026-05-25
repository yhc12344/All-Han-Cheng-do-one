import { useState, useMemo, useEffect } from "react";
import type { Activity } from "../types";
import { distanceLabel } from "../lib/units";
import { debounce } from "../lib/debounce";

interface PlannedWorkout {
  id: string;
  dateStr: string; // YYYY-MM-DD
  sport: "run" | "ride" | "swim" | "other";
  title: string;
  distanceM: number;
  durationS: number;
  completed: boolean;
}

export function TrainingScheduler({
  activities,
  theme,
  distanceUnit
}: {
  activities: Activity[];
  theme: "light" | "dark";
  distanceUnit: "km" | "mi";
}) {
  const isDark = theme === "dark";
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Weekly targets state (stored in localStorage or defaulted)
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(() => {
    return Number(localStorage.getItem("fit_sched_target_dist") ?? 40);
  });
  const [targetDurationHours, setTargetDurationHours] = useState<number>(() => {
    return Number(localStorage.getItem("fit_sched_target_dur") ?? 4);
  });

  // Training Plan States
  const [raceName, setRaceName] = useState("BYD Singapore Marathon");
  const [raceDate, setRaceDate] = useState("2026-12-06");
  const [targetTime, setTargetTime] = useState("3:30:00");
  const [runningDays, setRunningDays] = useState<number[]>([2, 4, 6, 0]); // default: Tue, Thu, Sat, Sun

  // Planned workouts list (persisted in localStorage)
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>(() => {
    const raw = localStorage.getItem("fit_sched_planned");
    if (raw) {
      try { return JSON.parse(raw); } catch { return []; }
    }
    // Default planned workouts to populate the schedule initial look
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return [
      { id: "p1", dateStr: today, sport: "run", title: "Aerobic Base Run", distanceM: 8000, durationS: 2700, completed: false },
      { id: "p2", dateStr: tomorrow, sport: "ride", title: "Sweet Spot Intervals", distanceM: 25000, durationS: 3600, completed: false }
    ];
  });

  // Debounced planned workouts saver
  const savePlannedWorkouts = useMemo(() => {
    return debounce((workouts: PlannedWorkout[]) => {
      localStorage.setItem("fit_sched_planned", JSON.stringify(workouts));
    }, 500);
  }, []);

  useEffect(() => {
    savePlannedWorkouts(plannedWorkouts);
  }, [plannedWorkouts, savePlannedWorkouts]);

  const showGeneratePrompt = useMemo(() => {
    return !plannedWorkouts.some(p => p.dateStr >= "2026-05-25");
  }, [plannedWorkouts]);

  // Debounced target parameters saver
  const saveTargetParams = useMemo(() => {
    return debounce((dist: number, dur: number) => {
      localStorage.setItem("fit_sched_target_dist", String(dist));
      localStorage.setItem("fit_sched_target_dur", String(dur));
    }, 500);
  }, []);

  useEffect(() => {
    saveTargetParams(targetDistanceKm, targetDurationHours);
  }, [targetDistanceKm, targetDurationHours, saveTargetParams]);

  // Modal State for adding/scheduling workouts
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSport, setNewSport] = useState<PlannedWorkout["sport"]>("run");
  const [newDist, setNewDist] = useState("");
  const [newDur, setNewDur] = useState("");

  const handleAddWorkout = () => {
    if (!newTitle.trim()) return;
    const itemScale = distanceUnit === "km" ? 1000 : 1609.34;
    const newPlan: PlannedWorkout = {
      id: String(Date.now()),
      dateStr: modalDate,
      sport: newSport,
      title: newTitle.trim(),
      distanceM: Number(newDist) * itemScale || 0,
      durationS: Number(newDur) * 60 || 0,
      completed: false
    };
    setPlannedWorkouts([...plannedWorkouts, newPlan]);
    setIsModalOpen(false);
    setNewTitle("");
    setNewDist("");
    setNewDur("");
  };

  const removePlan = (id: string) => {
    setPlannedWorkouts(plannedWorkouts.filter(w => w.id !== id));
  };

  // Drag and Drop implementation
  const [draggedPlanId, setDraggedPlanId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedPlanId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggedPlanId;
    if (!id) return;

    setPlannedWorkouts(plannedWorkouts.map(w => {
      if (w.id === id) {
        return { ...w, dateStr: targetDateStr };
      }
      return w;
    }));
    setDraggedPlanId(null);
  };

  // Math to compile monthly layout
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthWeeks = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Previous month filler
    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevMonthOffset = firstDayIndex;
    
    const gridDays: Array<{ date: Date; isCurrentMonth: boolean; dateStr: string }> = [];

    // Prior Month filler cells
    for (let i = prevMonthOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      gridDays.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().slice(0, 10)
      });
    }

    // Current Month cells
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      gridDays.push({
        date: d,
        isCurrentMonth: true,
        dateStr: d.toISOString().slice(0, 10)
      });
    }

    // Next Month filler cells
    const remaining = 42 - gridDays.length; // standard 6-row grid calendar
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      gridDays.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().slice(0, 10)
      });
    }

    // Chunk into 6 weeks
    const weeks: Array<typeof gridDays> = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      weeks.push(gridDays.slice(i, i + 7));
    }
    return weeks;
  }, [year, month]);

  // Find current week dates in calendar (Monday to Sunday sequence)
  const currentWeekDates = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - (day === 0 ? 6 : day - 1);
    const currentWeekStart = new Date(today.setDate(diff));
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      weekDates.push(d.toISOString().slice(0, 10));
    }
    return weekDates;
  }, []);

  // Compute active training plan stats & block phase
  const activePlanMeta = useMemo(() => {
    const aiPlans = plannedWorkouts.filter(w => w.id.startsWith("ai-") || w.id === "ai-race-day");
    if (aiPlans.length === 0) return { hasPlan: false, currentWeekIdx: 0, totalWeeks: 0, phase: "Manual Plan" };

    let maxWeekIdx = 0;
    aiPlans.forEach(w => {
      const match = w.id.match(/ai-(?:speed|base|recovery|long)-(\d+)/);
      if (match) {
        const idx = Number(match[1]);
        if (idx > maxWeekIdx) maxWeekIdx = idx;
      }
    });
    const totalWeeks = maxWeekIdx + 1;

    let currentWeekIdx = -1;
    plannedWorkouts.forEach(p => {
      if (currentWeekDates.includes(p.dateStr)) {
        const match = p.id.match(/ai-(?:speed|base|recovery|long)-(\d+)/);
        if (match) {
          currentWeekIdx = Number(match[1]);
        }
      }
    });

    if (currentWeekIdx === -1) {
      const hasRaceDay = plannedWorkouts.some(p => p.id === "ai-race-day" && currentWeekDates.includes(p.dateStr));
      if (hasRaceDay) {
        return { hasPlan: true, currentWeekIdx: totalWeeks - 1, totalWeeks, phase: "🏆 Race Week!" };
      }
      return { hasPlan: false, currentWeekIdx: 0, totalWeeks: 0, phase: "Manual Goal" };
    }

    let phase = "🌿 Base Building Phase";
    if (currentWeekIdx === totalWeeks - 1) {
      phase = "🏆 Race Week!";
    } else if (currentWeekIdx >= totalWeeks - 3) {
      phase = "🛌 Taper Phase";
    } else if (currentWeekIdx >= Math.floor(totalWeeks / 3)) {
      phase = "⚡ Build / Peak Phase";
    }

    return {
      hasPlan: true,
      currentWeekIdx,
      totalWeeks,
      phase: `${phase} (Week ${currentWeekIdx + 1}/${totalWeeks})`
    };
  }, [plannedWorkouts, currentWeekDates]);

  const [autoSyncTargets, setAutoSyncTargets] = useState<boolean>(() => {
    return localStorage.getItem("fit_sched_auto_sync") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("fit_sched_auto_sync", String(autoSyncTargets));
  }, [autoSyncTargets]);

  const effectiveDistanceGoal = useMemo(() => {
    if (autoSyncTargets && activePlanMeta.hasPlan) {
      const scale = distanceUnit === "km" ? 1000 : 1609.34;
      let plannedM = 0;
      plannedWorkouts.forEach(p => {
        if (currentWeekDates.includes(p.dateStr)) {
          plannedM += p.distanceM;
        }
      });
      return Number((plannedM / scale).toFixed(1));
    }
    return targetDistanceKm;
  }, [autoSyncTargets, activePlanMeta, plannedWorkouts, currentWeekDates, distanceUnit, targetDistanceKm]);

  const effectiveDurationGoal = useMemo(() => {
    if (autoSyncTargets && activePlanMeta.hasPlan) {
      let plannedS = 0;
      plannedWorkouts.forEach(p => {
        if (currentWeekDates.includes(p.dateStr)) {
          plannedS += p.durationS;
        }
      });
      return Number((plannedS / 3600).toFixed(1));
    }
    return targetDurationHours;
  }, [autoSyncTargets, activePlanMeta, plannedWorkouts, currentWeekDates, targetDurationHours]);

  // Unit-aware displayed target
  const displayedDistanceGoal = useMemo(() => {
    if (autoSyncTargets && activePlanMeta.hasPlan) {
      return effectiveDistanceGoal;
    }
    if (distanceUnit === "mi") {
      return Number((targetDistanceKm * 0.621371).toFixed(1));
    }
    return targetDistanceKm;
  }, [effectiveDistanceGoal, targetDistanceKm, distanceUnit, autoSyncTargets, activePlanMeta]);

  const handleTargetDistanceChange = (val: number) => {
    if (distanceUnit === "mi") {
      setTargetDistanceKm(Number((val / 0.621371).toFixed(1)));
    } else {
      setTargetDistanceKm(val);
    }
  };

  // 4-week rolling average running volume for suggestions
  const fourWeekAvgKm = useMemo(() => {
    const nowTs = new Date().getTime();
    const fourWeeksAgoTs = nowTs - 28 * 24 * 60 * 60 * 1000;
    const recent = activities.filter(a => {
      const t = new Date(a.start_ts_utc).getTime();
      return t >= fourWeeksAgoTs && t <= nowTs && a.sport?.toLowerCase() === "running";
    });
    const totalM = recent.reduce((sum, a) => sum + (a.distance_m || 0), 0);
    return (totalM / 1000) / 4;
  }, [activities]);

  const suggestedDistanceGoal = useMemo(() => {
    const suggestedKm = fourWeekAvgKm * 1.1; // 10% above rolling average
    if (distanceUnit === "mi") {
      return Math.round(suggestedKm * 0.621371);
    }
    return Math.round(suggestedKm);
  }, [fourWeekAvgKm, distanceUnit]);

  const showSuggested = fourWeekAvgKm > 0.5;

  // Aggregate stats of current week (Monday to Sunday sequence)
  const weekStats = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - (day === 0 ? 6 : day - 1);
    const currentWeekStart = new Date(today.setDate(diff));
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    // Cumulative actual activities
    let actualDistM = 0;
    let actualDurS = 0;
    activities.forEach(a => {
      const start = a.start_ts_utc.slice(0, 10);
      if (weekDates.includes(start)) {
        actualDistM += a.distance_m;
        actualDurS += a.duration_s;
      }
    });

    // Cumulative planned workouts
    let plannedDistM = 0;
    let plannedDurS = 0;
    plannedWorkouts.forEach(p => {
      if (weekDates.includes(p.dateStr)) {
        plannedDistM += p.distanceM;
        plannedDurS += p.durationS;
      }
    });

    const scale = distanceUnit === "km" ? 1000 : 1609.34;
    const actualDistScaled = actualDistM / scale;
    const actualDurHrs = actualDurS / 3600;

    return {
      actualDistance: actualDistScaled,
      actualDuration: actualDurHrs,
      plannedDistance: plannedDistM / scale,
      plannedDuration: plannedDurS / 3600,
      distPercentage: effectiveDistanceGoal > 0 ? Math.min(100, Math.round((actualDistScaled / effectiveDistanceGoal) * 100)) : 0,
      durPercentage: effectiveDurationGoal > 0 ? Math.min(100, Math.round((actualDurHrs / effectiveDurationGoal) * 100)) : 0
    };
  }, [activities, plannedWorkouts, distanceUnit, effectiveDistanceGoal, effectiveDurationGoal]);

  // Aggregate stats of previous week for visual comparison
  const lastWeekStats = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - (day === 0 ? 6 : day - 1) - 7;
    const lastWeekStart = new Date(today.setDate(diff));
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    let actualDistM = 0;
    activities.forEach(a => {
      const start = a.start_ts_utc.slice(0, 10);
      if (weekDates.includes(start)) {
        actualDistM += a.distance_m;
      }
    });

    const scale = distanceUnit === "km" ? 1000 : 1609.34;
    const actualDistScaled = actualDistM / scale;

    let lastWeekTarget = targetDistanceKm;
    if (autoSyncTargets && activePlanMeta.hasPlan) {
      let plannedM = 0;
      plannedWorkouts.forEach(p => {
        if (weekDates.includes(p.dateStr)) {
          plannedM += p.distanceM;
        }
      });
      if (plannedM > 0) {
        lastWeekTarget = Number((plannedM / scale).toFixed(1));
      }
    }

    if (distanceUnit === "mi" && !autoSyncTargets) {
      lastWeekTarget = Number((targetDistanceKm * 0.621371).toFixed(1));
    }

    const percentage = lastWeekTarget > 0 ? Math.min(100, Math.round((actualDistScaled / lastWeekTarget) * 100)) : 0;

    return {
      actualDistance: actualDistScaled,
      targetDistance: lastWeekTarget,
      percentage
    };
  }, [activities, plannedWorkouts, distanceUnit, autoSyncTargets, activePlanMeta, targetDistanceKm]);

  // Motivational Micro-label instead of generic 0%
  const centerRingText = useMemo(() => {
    const totalPercentage = Math.round((weekStats.distPercentage + weekStats.durPercentage) / 2);
    if (totalPercentage > 0) {
      return { value: `${totalPercentage}%`, isRest: false };
    }
    const today = new Date();
    const dayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const currentDayIdx = today.getDay();
    if (!runningDays.includes(currentDayIdx)) {
      return { value: "REST", isRest: true };
    }
    return { value: dayLabels[currentDayIdx], isRest: false };
  }, [weekStats, runningDays]);

  // Visual Apple-Style rings calculations
  const ringRadius = 45;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * ringRadius;

  const distDashOffset = circumference - (weekStats.distPercentage / 100) * circumference;
  const durDashOffset = circumference - (weekStats.durPercentage / 100) * circumference;



  // Determine user's average running speed from history
  const userAvgSpeedMps = useMemo(() => {
    const runningActivities = activities.filter(
      a => a.sport?.toLowerCase() === "running" || a.sport?.toLowerCase() === "run"
    );
    if (runningActivities.length === 0) return null;
    const totalDist = runningActivities.reduce((sum, a) => sum + a.distance_m, 0);
    const totalDur = runningActivities.reduce((sum, a) => sum + a.duration_s, 0);
    return totalDur > 0 ? totalDist / totalDur : null;
  }, [activities]);

  const handleGenerateAIPlan = (silent = false) => {
    if (!raceDate) {
      if (!silent) alert("Please select your target Race Date first!");
      return;
    }

    const today = new Date();
    const race = new Date(raceDate);
    if (race < today) {
      alert("Please select a future Race Date!");
      return;
    }

    const msDiff = race.getTime() - today.getTime();
    const numWeeks = Math.max(4, Math.min(16, Math.ceil(msDiff / (7 * 24 * 60 * 60 * 1000))));

    // Determine target race distance
    let raceDistanceM = 5000;
    let raceLabel = "5 km";
    const nameLower = raceName.toLowerCase();
    if (nameLower.includes("marathon") && !nameLower.includes("half")) {
      raceDistanceM = 42195;
      raceLabel = "Marathon";
    } else if (nameLower.includes("half") || nameLower.includes("21k") || nameLower.includes("21.1")) {
      raceDistanceM = 21097;
      raceLabel = "Half Marathon";
    } else if (nameLower.includes("10k") || nameLower.includes("10 k")) {
      raceDistanceM = 10000;
      raceLabel = "10 km";
    }

    // Default pace is 6:00/km (2.78 m/s) if no running history exists
    const avgSpeed = userAvgSpeedMps ?? 2.78; 

    // Generate weekly training runs starting next Monday
    const newPlanned: PlannedWorkout[] = [];
    const nextMonday = new Date();
    const day = nextMonday.getDay();
    const diff = nextMonday.getDate() + (day === 0 ? 1 : 8 - day);
    nextMonday.setDate(diff);

    // Sort selected runningDays in weekly sequence: Mon (1) to Sun (0)
    const sortedDays = [...runningDays].sort((a, b) => {
      const indexA = a === 0 ? 6 : a - 1;
      const indexB = b === 0 ? 6 : b - 1;
      return indexA - indexB;
    });

    // Determine the long run day: prioritize Saturday (6) if selected, otherwise Sunday (0) if selected, otherwise the last selected day of the week.
    let longRunDay = sortedDays[sortedDays.length - 1];
    if (runningDays.includes(6)) {
      longRunDay = 6;
    } else if (runningDays.includes(0)) {
      longRunDay = 0;
    }

    const remainingDays = sortedDays.filter(d => d !== longRunDay);
    const speedDay = remainingDays.length > 0 ? remainingDays[0] : null;
    const recoveryDay = remainingDays.length >= 2 ? remainingDays[remainingDays.length - 1] : null;
    const baseDays = remainingDays.filter(d => d !== speedDay && d !== recoveryDay);

    for (let w = 0; w < numWeeks; w++) {
      const isRaceWeek = w === numWeeks - 1;
      const weekStart = new Date(nextMonday.getTime() + w * 7 * 24 * 60 * 60 * 1000);
      const isTaper = w >= numWeeks - 2;

      const getDayDateStr = (dayValue: number): string => {
        const diffDays = dayValue === 0 ? 6 : dayValue - 1;
        const targetDate = new Date(weekStart.getTime() + diffDays * 24 * 60 * 60 * 1000);
        return targetDate.toISOString().slice(0, 10);
      };

      // 1. Speed / Interval Day
      if (speedDay !== null) {
        const speedDate = getDayDateStr(speedDay);
        const intervalDist = isTaper ? 4000 : Math.min(10000, 4000 + w * 800);
        newPlanned.push({
          id: `ai-speed-${w}`,
          dateStr: speedDate,
          sport: "run",
          title: isTaper ? "Taper Intervals (Speed)" : `Tempo Run: ${w + 1}x1000m Intervals`,
          distanceM: intervalDist,
          durationS: Math.round(intervalDist / avgSpeed),
          completed: false
        });
      }

      // 2. Base Aerobic Runs
      baseDays.forEach((bdDay, idx) => {
        const baseDate = getDayDateStr(bdDay);
        const baseDist = isTaper ? 5000 : Math.min(12000, 6000 + w * 500);
        newPlanned.push({
          id: `ai-base-${w}-${idx}`,
          dateStr: baseDate,
          sport: "run",
          title: "Aerobic Base Run (Z2)",
          distanceM: baseDist,
          durationS: Math.round(baseDist / avgSpeed),
          completed: false
        });
      });

      // 3. Recovery Day (Parasympathetic Restoration)
      if (recoveryDay !== null) {
        const recoveryDate = getDayDateStr(recoveryDay);
        newPlanned.push({
          id: `ai-recovery-${w}`,
          dateStr: recoveryDate,
          sport: "other",
          title: "🧘 Parasympathetic Restoration",
          distanceM: 0,
          durationS: 1500, // 25 minutes (Active Rest)
          completed: false
        });
      }

      // 4. Long Run Day / Race Day
      const longRunDate = getDayDateStr(longRunDay);
      if (isRaceWeek) {
        newPlanned.push({
          id: `ai-race-day`,
          dateStr: raceDate,
          sport: "run",
          title: `🏆 RACE DAY: ${raceName}!`,
          distanceM: raceDistanceM,
          durationS: Math.round(raceDistanceM / avgSpeed),
          completed: false
        });
      } else {
        let longRunDist = 0;
        const progressToPeak = w / (numWeeks - 3);
        if (w < numWeeks - 3) {
          longRunDist = Math.max(raceDistanceM * 0.35, raceDistanceM * 0.8 * progressToPeak);
        } else {
          const taperWeeks = numWeeks - 1 - w;
          longRunDist = raceDistanceM * (0.35 + taperWeeks * 0.2);
        }
        longRunDist = Math.round(longRunDist);

        newPlanned.push({
          id: `ai-long-${w}`,
          dateStr: longRunDate,
          sport: "run",
          title: `Long Base Run (${Math.round(longRunDist / 1000)}k)`,
          distanceM: longRunDist,
          durationS: Math.round(longRunDist / avgSpeed),
          completed: false
        });
      }
    }

    setPlannedWorkouts(newPlanned);
    if (!silent) {
      alert(`Successfully generated a personalized ${numWeeks}-week Running Training Plan for your target ${raceLabel} on the calendar!`);
    }
  };

  useEffect(() => {
    const hasAIWorkouts = plannedWorkouts.some(p => p.id.startsWith("ai-"));
    if (!hasAIWorkouts) {
      handleGenerateAIPlan(true);
    }
  }, []);

  const handleResetCalendar = () => {
    if (window.confirm("Are you sure you want to clear all planned workouts from your calendar? This cannot be undone.")) {
      setPlannedWorkouts([]);
      localStorage.setItem("fit_sched_planned", "[]");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", width: "100%" }}>
      
      {/* Upper Panel: Training Plan Goal Generator */}
      <section className="panel glass-card" style={{ padding: "1.5rem 2rem", textAlign: "left", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>Training Plan</h3>
        
        <div style={{
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "1.25rem",
          background: "rgba(255, 255, 255, 0.01)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem"
        }}>
          <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "bold" }}>
            RACE GOAL
          </span>

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: "1rem", alignItems: "end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Race Name
              <input
                type="text"
                placeholder="e.g. Singapore Marathon"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                style={{ padding: "0.6rem 0.8rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Race Date
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                style={{ padding: "0.6rem 0.8rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "11px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Target Time
              <input
                type="text"
                placeholder="e.g. 3:45:00"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                style={{ padding: "0.6rem 0.8rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "13px" }}
              />
            </label>
          </div>

          {/* Days of Running Selector */}
          <div className="running-days-selector" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", textAlign: "left", borderTop: "1px solid var(--border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Days of Running
            </span>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              {[
                { value: 1, label: "M" },
                { value: 2, label: "T" },
                { value: 3, label: "W" },
                { value: 4, label: "T" },
                { value: 5, label: "F" },
                { value: 6, label: "S" },
                { value: 0, label: "S" }
              ].map((d) => {
                const isActive = runningDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        if (runningDays.length > 1) {
                          setRunningDays(runningDays.filter(val => val !== d.value));
                        }
                      } else {
                        setRunningDays([...runningDays, d.value]);
                      }
                    }}
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "50%",
                      border: isActive ? "2px solid #a855f7" : "1px solid var(--border)",
                      background: isActive ? "rgba(168, 85, 247, 0.15)" : "rgba(255,255,255,0.02)",
                      color: isActive ? "#c084fc" : "var(--text-muted)",
                      fontWeight: "bold",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 150ms ease",
                      boxShadow: isActive ? "0 0 10px rgba(168, 85, 247, 0.25)" : "none"
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: "0.5rem" }}>
            <button
              onClick={() => handleGenerateAIPlan()}
              style={{
                background: "#5f7e39",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "0.6rem 1.2rem",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                transition: "background 0.2s"
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#4e682f"}
              onMouseOut={(e) => e.currentTarget.style.background = "#5f7e39"}
            >
              ⚡ Generate AI Plan
            </button>
            <button
              onClick={handleResetCalendar}
              style={{
                background: "transparent",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
                borderRadius: "6px",
                padding: "0.6rem 1.2rem",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                marginLeft: "0.75rem",
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              🗑️ Reset Calendar
            </button>
            <span style={{ color: "var(--text-muted)", fontSize: "11px", marginLeft: "1rem" }}>
              {userAvgSpeedMps ? "🎯 Baseline speed loaded from your runs for advanced personalization." : "Add runs first for better personalization"}
            </span>
          </div>
        </div>
      </section>

    <div className="scheduler-layout-container" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "2rem", alignItems: "flex-start" }}>
      
      {/* Left Sidebar: Goal Targets & Circular progress rings */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        
        {/* Targets settings */}
        <section className="panel glass-card" style={{ padding: "1.25rem", textAlign: "left", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.5px" }}>Weekly Goal Targets</h4>
            {activePlanMeta.hasPlan && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", cursor: "pointer", color: "var(--text-secondary)", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={autoSyncTargets}
                  onChange={(e) => setAutoSyncTargets(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Sync Plan
              </label>
            )}
          </div>

          {autoSyncTargets && activePlanMeta.hasPlan && (
            <div style={{ background: "rgba(139, 92, 246, 0.06)", borderLeft: "3px solid #8b5cf6", padding: "6px 10px", borderRadius: "0 6px 6px 0", fontSize: "10.5px", color: "var(--text-secondary)", fontWeight: "500", lineHeight: "1.3" }}>
              Dynamic: {activePlanMeta.phase}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "0.25rem", color: "var(--text-secondary)" }}>
              Distance Goal ({distanceLabel(distanceUnit)})
              <input
                type="number"
                disabled={autoSyncTargets && activePlanMeta.hasPlan}
                value={displayedDistanceGoal}
                onChange={(e) => handleTargetDistanceChange(Math.max(1, Number(e.target.value)))}
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  background: (autoSyncTargets && activePlanMeta.hasPlan) ? "rgba(255,255,255,0.02)" : "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: (autoSyncTargets && activePlanMeta.hasPlan) ? "var(--text-muted)" : "var(--text)",
                  opacity: (autoSyncTargets && activePlanMeta.hasPlan) ? 0.7 : 1
                }}
              />
              {showSuggested && !autoSyncTargets && (
                <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Suggested: {suggestedDistanceGoal} {distanceLabel(distanceUnit)} based on your recent training
                </span>
              )}
            </label>
            <label style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "0.25rem", color: "var(--text-secondary)" }}>
              Duration Goal (Hours)
              <input
                type="number"
                disabled={autoSyncTargets && activePlanMeta.hasPlan}
                value={effectiveDurationGoal}
                onChange={(e) => setTargetDurationHours(Math.max(1, Number(e.target.value)))}
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: "6px",
                  background: (autoSyncTargets && activePlanMeta.hasPlan) ? "rgba(255,255,255,0.02)" : "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: (autoSyncTargets && activePlanMeta.hasPlan) ? "var(--text-muted)" : "var(--text)",
                  opacity: (autoSyncTargets && activePlanMeta.hasPlan) ? 0.7 : 1
                }}
              />
            </label>
          </div>
        </section>

        {/* Circular SVG target rings panel */}
        <section className="panel glass-card" style={{ padding: "1.5rem", textAlign: "center", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center" }}>
          <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.5px", alignSelf: "flex-start" }}>
            Weekly Goal Ring Progress
          </h4>

          {/* SVG canvas for double circular rings */}
          <div style={{ position: "relative", width: "120px", height: "120px" }}>
            <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
              {/* Distance Outer Ring */}
              <circle cx="60" cy="60" r={ringRadius} fill="transparent" stroke="rgba(16, 185, 129, 0.08)" strokeWidth={strokeWidth} />
              <circle
                cx="60"
                cy="60"
                r={ringRadius}
                fill="transparent"
                stroke="#10b981"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={distDashOffset}
                strokeLinecap="round"
                style={{
                  transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                  filter: "drop-shadow(0 0 3px rgba(16, 185, 129, 0.5))"
                }}
              />

              {/* Duration Inner Ring */}
              <circle cx="60" cy="60" r={ringRadius - strokeWidth - 2} fill="transparent" stroke="rgba(139, 92, 246, 0.08)" strokeWidth={strokeWidth} />
              <circle
                cx="60"
                cy="60"
                r={ringRadius - strokeWidth - 2}
                fill="transparent"
                stroke="#8b5cf6"
                strokeWidth={strokeWidth}
                strokeDasharray={2 * Math.PI * (ringRadius - strokeWidth - 2)}
                strokeDashoffset={durDashOffset * ((ringRadius - strokeWidth - 2) / ringRadius)}
                strokeLinecap="round"
                style={{
                  transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                  filter: "drop-shadow(0 0 3px rgba(139, 92, 246, 0.5))"
                }}
              />
            </svg>
            
            {/* Center metric indicator */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: centerRingText.isRest ? "10px" : "14px",
              fontWeight: "bold",
              color: centerRingText.isRest ? "var(--text-muted)" : "var(--text)",
              letterSpacing: centerRingText.isRest ? "0.5px" : "normal"
            }}>
              {centerRingText.value}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", textAlign: "left", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", marginTop: "3px" }} />
              <span>Distance: <strong>{weekStats.actualDistance.toFixed(1)}</strong> / {effectiveDistanceGoal} {distanceLabel(distanceUnit)} ({weekStats.distPercentage}%)</span>
            </div>
            <div style={{ display: "flex", justifyItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#8b5cf6", marginTop: "3px" }} />
              <span>Duration: <strong>{weekStats.actualDuration.toFixed(1)}</strong> / {effectiveDurationGoal} hours ({weekStats.durPercentage}%)</span>
            </div>

            {/* Last week reference */}
            <div style={{ marginTop: "0.4rem", padding: "6px 10px", background: "rgba(255,255,255,0.015)", border: "1px dashed var(--border)", borderRadius: "6px", fontSize: "10.5px", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Last week:</span>
              <strong>{lastWeekStats.actualDistance.toFixed(1)} {distanceLabel(distanceUnit)} ({lastWeekStats.percentage}%)</strong>
            </div>
          </div>
        </section>
      </div>

      {/* Right Content: Month Grid calendar */}
      <section className="panel scheduler-main glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        
        {showGeneratePrompt && (
          <div style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(168, 85, 247, 0.35)",
            borderRadius: "8px",
            padding: "1rem 1.25rem",
            textAlign: "left",
            fontSize: "12.5px",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}>
            <div>
              📅 <strong>Your calendar is empty from May 25 onward.</strong> Hit <strong>"Generate AI Plan"</strong> above to build a personalised 16-week BYD Marathon programme based on your current fitness and training base.
            </div>
          </div>
        )}

        {/* Navigation Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, textTransform: "capitalize", fontSize: "1.25rem" }}>
            {currentDate.toLocaleString("default", { month: "long" })} {year}
          </h3>

          <div className="calendar-nav" style={{ display: "flex", gap: "6px" }}>
            <button className="btn-compact" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>◀ Prev</button>
            <button className="btn-compact" onClick={() => setCurrentDate(new Date())}>Today</button>
            <button className="btn-compact" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>Next ▶</button>
          </div>
        </div>

        {/* 7-column Calendar Header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", fontWeight: "bold", fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", paddingBottom: "4px" }}>
          {[
            { idx: 0, label: "Sun" },
            { idx: 1, label: "Mon" },
            { idx: 2, label: "Tue" },
            { idx: 3, label: "Wed" },
            { idx: 4, label: "Thu" },
            { idx: 5, label: "Fri" },
            { idx: 6, label: "Sat" }
          ].map(day => {
            const isPreferred = runningDays.includes(day.idx);
            return (
              <span
                key={day.idx}
                style={{
                  textAlign: "center",
                  padding: "4px 0",
                  borderRadius: "4px",
                  background: isPreferred ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
                  color: isPreferred ? "var(--accent)" : "var(--text-muted)",
                  border: isPreferred ? "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" : "1px solid transparent",
                  boxShadow: isPreferred ? "0 0 6px color-mix(in srgb, var(--accent) 8%, transparent)" : "none",
                  transition: "all 200ms ease"
                }}
              >
                {day.label}
              </span>
            );
          })}
        </div>

        {/* Grid Blocks */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {monthWeeks.map((week, wIdx) => (
            <div key={wIdx} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px", minHeight: "95px" }}>
              {week.map((cell) => {
                // Find actual activities for this cell day
                const dayActivities = activities.filter(a => a.start_ts_utc.slice(0, 10) === cell.dateStr);
                
                // Find planned workouts for this cell day
                const dayPlanned = plannedWorkouts.filter(p => p.dateStr === cell.dateStr);

                return (
                  <div
                    key={cell.dateStr}
                    style={{
                      padding: "4px 6px",
                      background: cell.isCurrentMonth ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.002)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      opacity: cell.isCurrentMonth ? 1.0 : 0.4,
                      transition: "background 0.2s"
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, cell.dateStr)}
                  >
                    {/* Date label & Add button */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                      <span style={{ fontWeight: cell.dateStr === new Date().toISOString().slice(0, 10) ? "bold" : "normal", color: cell.dateStr === new Date().toISOString().slice(0, 10) ? "var(--accent)" : "inherit" }}>
                        {cell.date.getDate()}
                      </span>
                      <button
                        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0 2px", fontSize: "10px" }}
                        onClick={() => {
                          setModalDate(cell.dateStr);
                          setIsModalOpen(true);
                        }}
                      >
                        ➕
                      </button>
                    </div>

                    {/* Actual workout indicators */}
                    {dayActivities.map(a => (
                      <div
                        key={a.id}
                        style={{
                          padding: "2px 4px",
                          fontSize: "9px",
                          borderRadius: "4px",
                          background: a.sport?.toLowerCase() === "running" ? "rgba(59, 130, 246, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          borderLeft: `2.5px solid ${a.sport?.toLowerCase() === "running" ? "#3b82f6" : "#f59e0b"}`,
                          color: "var(--text)",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                        title={`${a.activity_name} (${(a.distance_m/1000).toFixed(1)}km)`}
                      >
                        ✅ {(a.distance_m/1000).toFixed(1)}k {a.sport}
                      </div>
                    ))}

                    {/* Planned workout blocks */}
                    {dayPlanned.map(p => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, p.id)}
                        style={{
                          padding: "2px 4px",
                          fontSize: "9px",
                          borderRadius: "4px",
                          background: "rgba(168, 85, 247, 0.15)",
                          borderLeft: "2.5px solid #a855f7",
                          border: "1px dashed rgba(168, 85, 2 purple, 0.3)",
                          color: "var(--text)",
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          cursor: "grab"
                        }}
                        title={`${p.title} (Planned)`}
                      >
                        <span onClick={() => removePlan(p.id)} style={{ cursor: "pointer", marginRight: "3px", color: "var(--text-muted)" }}>❌</span>
                        {p.title.startsWith("🧘") || p.title.startsWith("🏆") ? "" : "📋 "}{p.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* Scheduling Interactive Modal */}
      {isModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="glass-card" style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "12px", background: "var(--bg-surface)", width: "320px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h4 style={{ margin: 0, borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>Schedule Workout</h4>
            
            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11px", textAlign: "left" }}>
              Workout Title
              <input
                placeholder="e.g. Tempo Intervals"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11px", textAlign: "left" }}>
              Sport Type
              <select
                value={newSport}
                onChange={(e) => setNewSport(e.target.value as any)}
                style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="run">🏃 Running</option>
                <option value="ride">🚴 Cycling</option>
                <option value="swim">🏊 Swimming</option>
                <option value="other">🏋️ Other</option>
              </select>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11px", textAlign: "left" }}>
                Target Dist ({distanceLabel(distanceUnit)})
                <input
                  type="number"
                  placeholder="e.g. 8"
                  value={newDist}
                  onChange={(e) => setNewDist(e.target.value)}
                  style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11px", textAlign: "left" }}>
                Target Dur (Min)
                <input
                  type="number"
                  placeholder="e.g. 45"
                  value={newDur}
                  onChange={(e) => setNewDur(e.target.value)}
                  style={{ padding: "0.4rem 0.6rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={handleAddWorkout}>💾 Save</button>
              <button className="btn-outline-danger" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
