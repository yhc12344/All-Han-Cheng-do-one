import { useState, useEffect, useMemo } from "react";
import type { Activity } from "../types";
import { distanceDivisor, distanceLabel } from "../lib/units";
import { calculateTrainingLoad, calculateDailyReadiness, isValidActivity, calculateRiegelExponent } from "../lib/analytics";

interface RaceEvent {
  name: string;
  dateStr: string; // YYYY-MM-DDTHH:mm
}

export function OverviewGoalAndEvent({
  activities,
  distanceUnit
}: {
  activities: Activity[];
  distanceUnit: "km" | "mi";
}) {
  const divisor = distanceDivisor(distanceUnit);
  const suffix = distanceLabel(distanceUnit);

  // Compile load calculations
  const loadTimeline = useMemo(() => {
    return calculateTrainingLoad(activities);
  }, [activities]);

  // Generate automatic log for each day
  const autoLogs = useMemo(() => {
    if (!loadTimeline.length) return [];
    
    return loadTimeline.map(pt => {
      const dateStr = pt.dateStr;
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

      const fatigue = pt.fatigue;
      const fatigueFactor = Math.min(1.0, fatigue / 80);

      const baseHrv = fitHrv ?? 65;
      const baseRhr = 52;
      const baseSleep = 7.5;
      const baseQuality = 80;

      const charSum = dateStr.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const pseudoRandom = (Math.sin(charSum) + 1) / 2;

      const hrvVariation = (pseudoRandom * 10 - 5);
      const hrvFatigueDrop = fatigueFactor * 10;
      const autoHrv = Math.round(baseHrv - hrvFatigueDrop + hrvVariation);

      const rhrVariation = (pseudoRandom * 6 - 3);
      const rhrFatigueRise = fatigueFactor * 5;
      const autoRhr = Math.round(baseRhr + rhrFatigueRise + rhrVariation);

      const sleepVariation = (pseudoRandom * 1.6 - 0.8);
      const autoSleep = Math.round((baseSleep + sleepVariation) * 10) / 10;

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

  // Today's specific readiness status
  const activeDate = useMemo(() => {
    if (loadTimeline.length > 0) {
      return loadTimeline[loadTimeline.length - 1].dateStr;
    }
    return new Date().toISOString().slice(0, 10);
  }, [loadTimeline]);

  const activeResult = useMemo(() => {
    if (!readinessTimeline.length) return null;
    return readinessTimeline.find(r => r.dateStr === activeDate) || readinessTimeline[readinessTimeline.length - 1];
  }, [readinessTimeline, activeDate]);

  const todayLog = useMemo(() => {
    return autoLogs.find(l => l.dateStr === activeDate);
  }, [autoLogs, activeDate]);

  const readinessScore = activeResult ? activeResult.readinessScore : 80;
  const todayHrv = todayLog ? todayLog.hrvMs : 65;
  const todayRhr = todayLog ? todayLog.restingHrBpm : 52;
  const todaySleep = todayLog ? todayLog.sleepHours : 7.5;
  const todayQuality = todayLog ? todayLog.sleepQualityPct : 80;

  const readinessLabel = activeResult ? activeResult.zoneLabel : "Ready to Push";
  const readinessColor = readinessScore >= 80 ? "#10b981" : readinessScore < 50 ? "#ef4444" : "#f59e0b";

  // Calculate training stats for the last 7 days
  const recentStats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const recent = activities.filter((a) => {
      const ts = Date.parse(a.start_ts_utc);
      return !isNaN(ts) && ts >= sevenDaysAgo;
    });

    const totalDistanceM = recent.reduce((sum, a) => sum + a.distance_m, 0);
    const totalDurationS = recent.reduce((sum, a) => sum + a.duration_s, 0);
    const count = recent.length;

    // Determine primary sport
    const sports = recent.map((a) => a.sport?.toLowerCase() || "other");
    const sportCounts = sports.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let primarySport = "workout";
    let maxCount = 0;
    Object.entries(sportCounts).forEach(([sport, sCount]) => {
      if (sCount > maxCount) {
        maxCount = sCount;
        primarySport = sport;
      }
    });

    return {
      distanceScaled: totalDistanceM / divisor,
      durationHours: totalDurationS / 3600,
      sessionCount: count,
      primarySport
    };
  }, [activities, divisor]);

  const avgWeeklyKm = useMemo(() => {
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

  const predictedMarathonTimeAndPace = useMemo(() => {
    const validRuns = activities.filter(a => 
      (a.sport?.toLowerCase() === "running" || a.sport?.toLowerCase() === "run") &&
      isValidActivity(a)
    );
    if (!validRuns.length) {
      return { timeS: 14872, paceSec: 352 }; // default 4:08:00
    }

    let best5kDurationS = Infinity;
    let best10kDurationS = Infinity;

    for (const a of validRuns) {
      if (a.distance_m >= 4800 && a.distance_m <= 5400) {
        if (a.duration_s < best5kDurationS) {
          best5kDurationS = a.duration_s;
        }
      }
      if (a.distance_m >= 9600 && a.distance_m <= 10500) {
        const pace = a.duration_s / (a.distance_m / 1000);
        const refPace = best5kDurationS !== Infinity ? (best5kDurationS / 5) : 312; // 5:12/km default
        if (pace <= refPace * 1.25) {
          if (a.duration_s < best10kDurationS) {
            best10kDurationS = a.duration_s;
          }
        }
      }
    }

    let anchorDist = 5000;
    let anchorTimeS = best5kDurationS;

    if (best10kDurationS !== Infinity && (best5kDurationS === Infinity || best10kDurationS / 2 < best5kDurationS)) {
      anchorDist = 10000;
      anchorTimeS = best10kDurationS;
    }

    if (anchorTimeS === Infinity) {
      let bestSpeed = 0;
      let bestRun = null;
      for (const a of validRuns) {
        const speed = a.distance_m / a.duration_s;
        if (speed > bestSpeed) {
          bestSpeed = speed;
          bestRun = a;
        }
      }
      if (bestRun) {
        anchorDist = bestRun.distance_m;
        anchorTimeS = bestRun.duration_s;
      } else {
        return { timeS: 14872, paceSec: 352 }; // default
      }
    }

    const exponent = calculateRiegelExponent(avgWeeklyKm);
    const predictedS = anchorTimeS * Math.pow(42195 / anchorDist, exponent);
    return {
      timeS: Math.round(predictedS),
      paceSec: predictedS / 42.195
    };
  }, [activities, avgWeeklyKm]);

  const gapStats = useMemo(() => {
    const targetPaceSec = 298; // 4:58/km
    const targetTimeS = 12600; // 3:30:00
    
    const predTimeS = predictedMarathonTimeAndPace.timeS;
    const predPaceSec = predictedMarathonTimeAndPace.paceSec;
    
    const timeGapS = predTimeS - targetTimeS;
    
    const formatDiff = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) return `+${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      return `+${m}:${s.toString().padStart(2, "0")}`;
    };
    
    let gapColor = "#10b981";
    let gapLabel = "On Track";
    if (timeGapS > 1200) { // > 20 min
      gapColor = "#ef4444";
      gapLabel = "Significant — base building required";
    } else if (timeGapS > 600) { // 10-20 min
      gapColor = "#f59e0b";
      gapLabel = "Moderate — consistent base needed";
    } else if (timeGapS > 0) {
      gapColor = "#60a5fa";
      gapLabel = "Minor — peak phase focus";
    } else {
      gapColor = "#10b981";
      gapLabel = "Target Achieved!";
    }
    
    const formatPaceVal = (sec: number) => {
      const min = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${min}:${s.toString().padStart(2, "0")}`;
    };

    return {
      targetPaceStr: "4:58/km",
      targetTimeStr: "3:30:00",
      predPaceStr: `${formatPaceVal(predPaceSec)}/km`,
      predTimeStr: (() => {
        const h = Math.floor(predTimeS / 3600);
        const m = Math.floor((predTimeS % 3600) / 60);
        const s = Math.floor(predTimeS % 60);
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      })(),
      gapStr: formatDiff(timeGapS),
      gapColor,
      gapLabel
    };
  }, [predictedMarathonTimeAndPace]);

  const currentForm = useMemo(() => {
    if (!loadTimeline.length) return 0;
    return loadTimeline[loadTimeline.length - 1].form;
  }, [loadTimeline]);

  // Formulate Suggested Workout & Singapore Heat Adaptation Plan based on volume gates (C-5)
  const recommendation = useMemo(() => {
    // 1. Extreme fatigue fallback: low readiness or deep overreaching
    const isConflict = readinessScore > 75 && currentForm < -15;
    if (readinessScore < 50 || currentForm < -25 || isConflict) {
      return {
        title: "🧘 Parasympathetic Restoration",
        type: "Active Recovery",
        duration: "20-30 mins",
        details: isConflict
          ? "Readiness conflict detected today (elevated readiness score but deeply negative training stress). Prioritize recovery to avoid injuries."
          : "Waking readiness is severely depressed or training fatigue is extremely high. Stick to a very light active recovery block.",
        singaporePlan: "🦁 SG Adaptation: Execute in shaded, cool areas like the Bukit Timah canopy or a cooled pool. Replenish with 500ml high-sodium electrolyte water.",
        assessment: "Systemic recovery is required. High intensity or long durations today would carry a high musculoskeletal injury risk.",
        showWarning: false
      };
    }

    // 2. Base volume gates (Precedence over regular volume rules)
    if (avgWeeklyKm < 40) {
      return {
        title: "🏃 steady Zone 2 Base Builder",
        type: "Aerobic Capacity Building",
        duration: "30-50 mins",
        details: "Conversational Z2 running to safely build aerobic capacity. Keep breathing relaxed so you can talk in full sentences.",
        singaporePlan: "🦁 SG Climate: Flat, steady route like the Rail Corridor or East Coast Park coast. Carry 600ml water. Natural shaded canopies will block direct solar radiation.",
        assessment: `Building base (${avgWeeklyKm.toFixed(1)} km/wk avg) — easy aerobic focus until 40km/wk sustained.`,
        showWarning: true
      };
    }

    // 3. Regular recommendation with 40-50km volume gate
    if (avgWeeklyKm < 50) {
      // Tempo is only unlocked if readinessScore >= 75 and TSB > -10
      if (readinessScore >= 75 && currentForm > -10) {
        return {
          title: "⚡ Zone 3/4 Aerobic Threshold Spark",
          type: "Sweet Spot / Tempo Intervals",
          duration: "45-55 mins",
          details: "10 min easy warm-up, then 2 x 10 mins at Zone 3/4 effort (comfortably hard, nasal breathing is restricted) with 3 min shaded recovery walks/jogs, 10 min cool-down.",
          singaporePlan: "🦁 SG Heat Alert: High intensity increases core temperature rapidly in SG's 82% humidity. Execute at breezy coastal areas like East Coast Park or Marina Bay loop before 7:15 AM or after 7:30 PM.",
          assessment: `Base volume (${avgWeeklyKm.toFixed(1)} km/wk avg) is established above 40km/wk. Your readiness and TSB support this moderate tempo session.`,
          showWarning: false
        };
      } else {
        return {
          title: "🏃 steady Zone 2 Base Builder",
          type: "Aerobic Capacity Building",
          duration: "45-60 mins",
          details: "Conversational Zone 2 run. High fatigue or low readiness restricts today's session to easy base building.",
          singaporePlan: "🦁 SG Climate: Shaded corridor to prevent core temperature spikes under moderate heat.",
          assessment: `Base volume: ${avgWeeklyKm.toFixed(1)} km/wk avg. A sweet spot session was bypassed due to fatigue/readiness signals.`,
          showWarning: false
        };
      }
    }

    // 4. Over 50km volume gate - can unlock intervals if readinessScore >= 80 and TSB > -5
    if (readinessScore >= 80 && currentForm > -5) {
      return {
        title: "🚀 Lactic / VO2max Speed Intervals",
        type: "VO2max Interval Development",
        duration: "50-60 mins",
        details: "15 min warm-up, 5 x 800m at 5k pace with 3 min walking recovery, 10 min cool-down.",
        singaporePlan: "🦁 SG Heat Alert: Execute only under early morning shade or late evening breeze. Carry water and sip during recovery intervals.",
        assessment: `Elite base volume (${avgWeeklyKm.toFixed(1)} km/wk avg) and optimal readiness support VO2max intervals.`,
        showWarning: false
      };
    }

    // Default to steady base run
    return {
      title: "🏃 steady Zone 2 Base Builder",
      type: "Aerobic Capacity Building",
      duration: "50-70 mins",
      details: "Steady conversational run at Zone 2. Keep breathing conversational to build cellular endurance.",
      singaporePlan: "🦁 SG Climate: Flat, steady route like the Rail Corridor or East Coast Park coast. Carry 600ml water.",
      assessment: "Sufficient base volume established. Today is perfect for steady aerobic capacity building.",
      showWarning: false
    };
  }, [recentStats, avgWeeklyKm, readinessScore, currentForm]);

  const intensityProfile = useMemo(() => {
    const type = recommendation.type;
    const title = recommendation.title;
    
    if (type.includes("Recovery") || type.includes("Restoration") || title.includes("Restoration")) {
      return {
        z1: 90,
        z2: 10,
        z3: 0,
        z4: 0,
        z5: 0,
        description: "90% Recovery / 10% Base focus"
      };
    } else if (type.includes("Aerobic") || title.includes("Base Builder") || title.includes("Zone 2")) {
      return {
        z1: 15,
        z2: 80,
        z3: 5,
        z4: 0,
        z5: 0,
        description: "80% Zone 2 Aerobic Base focus"
      };
    } else if (type.includes("Sweet Spot") || type.includes("Tempo") || title.includes("Tempo") || title.includes("Threshold Spark")) {
      return {
        z1: 15,
        z2: 30,
        z3: 40,
        z4: 15,
        z5: 0,
        description: "Sweet Spot / Tempo focus: Z3 (40%), Z2 (30%)"
      };
    } else if (type.includes("VO2max") || type.includes("Interval") || title.includes("Speed Intervals") || title.includes("Lactic")) {
      return {
        z1: 20,
        z2: 25,
        z3: 15,
        z4: 30,
        z5: 10,
        description: "High-intensity VO2max / Lactic intervals"
      };
    }
    
    return {
      z1: 20,
      z2: 70,
      z3: 10,
      z4: 0,
      z5: 0,
      description: "70% Base / 20% Recovery focus"
    };
  }, [recommendation]);

  const upcomingWeekSuggestedPlan = useMemo(() => {
    const plan = [
      { day: "Mon", badge: "REST", color: "var(--text-muted)", bg: "rgba(255,255,255,0.01)", title: "🛌 Rest & Sleep", desc: "Priority sleep recovery." },
      { day: "Tue", badge: "SPEED", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", title: "⚡ Threshold Runs", desc: "Lactic intervals [Daniels, 1979]." },
      { day: "Wed", badge: "REST", color: "var(--text-muted)", bg: "rgba(255,255,255,0.01)", title: "🛌 Rest & Core", desc: "Squats/plyos for running economy." },
      { day: "Thu", badge: "BASE", color: "#10b981", bg: "rgba(16, 185, 129, 0.08)", title: "🏃 Z2 Base Jog", desc: "Capillary density progression." },
      { day: "Fri", badge: "REST", color: "var(--text-muted)", bg: "rgba(255,255,255,0.01)", title: "🛌 Rest & Stretch", desc: "Autonomic vagal rejuvenation." },
      { day: "Sat", badge: "LONG RUN", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)", title: "🏆 Long Base Run", desc: "Aerobic volume building [Riegel, 1981]." },
      { day: "Sun", badge: "RECOVERY", color: "#a855f7", bg: "rgba(168, 85, 247, 0.08)", title: "🧘 Restoration", desc: "HR < 115 restoration [Coyle, 2001]." }
    ];

    // Case 1: Autonomic Readiness Score is low (< 60) OR Fatigue is extreme (TSB < -25)
    // Dynamic Adaptation: Downgrade Tuesday's Threshold speed session to an active recovery session.
    if (readinessScore < 60 || currentForm < -25) {
      plan[1] = {
        day: "Tue",
        badge: "RECOVERY ADAPTED",
        color: "#a855f7",
        bg: "rgba(168, 85, 247, 0.12)",
        title: "🧘 Active Recovery Jog",
        desc: "Readiness score is low! Downgrading tempo to Zone 1 to protect autonomic state."
      };
    }

    // Case 2: Overreaching training stress (TSB < -15) OR high volume last week
    // Dynamic Adaptation: Downgrade Thursday's Base Run to an easy recovery block.
    if (currentForm < -15 || recentStats.durationHours >= 5.0) {
      plan[3] = {
        day: "Thu",
        badge: "FATIGUE REDUCED",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
        title: "🏃 Conversational Base",
        desc: "High weekly fatigue detected. Reducing duration target by 30% to prevent overreaching."
      };
    }

    // Case 3: Autonomic Readiness Score is extremely low (< 50)
    // Dynamic Adaptation: Swap the Saturday Long Run with a light restoration block.
    if (readinessScore < 50) {
      plan[5] = {
        day: "Sat",
        badge: "INJURY GUARD",
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.12)",
        title: "🧘 Restoration Walk",
        desc: "Waking HRV is severely depressed! Swap long run with a gentle walk to avoid injury."
      };
    }

    // Case 4: Base volume is insufficient (avgWeeklyKm < 40) OR there is a readiness/TSB conflict banner state
    const isBaseVolumeGateActive = avgWeeklyKm < 40;
    const isTsbConflict = readinessScore > 75 && currentForm < -15;

    if (isBaseVolumeGateActive || isTsbConflict) {
      plan[1] = {
        day: "Tue",
        badge: isBaseVolumeGateActive ? "VOLUME GATE" : "RECOVERY ADAPTED",
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
        title: "🏃 Easy Z2 Run",
        desc: isBaseVolumeGateActive
          ? `Building base (${avgWeeklyKm.toFixed(1)} km/wk avg) — easy aerobic focus until 40km/wk sustained.`
          : "Readiness conflict detected today. Downgrading tempo to easy Zone 2 to protect recovery."
      };
    }

    return plan;
  }, [readinessScore, currentForm, recentStats, avgWeeklyKm]);

  // Race Event state (persisted)
  const [event, setEvent] = useState<RaceEvent>(() => {
    const raw = localStorage.getItem("fit_dashboard_overview_event");
    if (raw) {
      try { return JSON.parse(raw); } catch {}
    }
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 90);
    defaultDate.setHours(9, 0, 0, 0);
    return {
      name: "Championship Marathon & Race",
      dateStr: defaultDate.toISOString().slice(0, 16)
    };
  });

  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [tempEventName, setTempEventName] = useState(event.name);
  const [tempEventDate, setTempEventDate] = useState(event.dateStr);

  useEffect(() => {
    localStorage.setItem("fit_dashboard_overview_event", JSON.stringify(event));
  }, [event]);

  // Real-time countdown timer state
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isOver: false
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const targetTime = new Date(event.dateStr).getTime();
      const difference = targetTime - Date.now();

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isOver: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [event.dateStr]);

  const handleSaveEvent = () => {
    setEvent({
      name: tempEventName.trim() || "Upcoming Event",
      dateStr: tempEventDate || new Date().toISOString().slice(0, 16)
    });
    setIsEditingEvent(false);
  };

  // Load target settings and planned workouts from localStorage for dynamic Overview Rings
  const schedulerData = useMemo(() => {
    const rawPlanned = localStorage.getItem("fit_sched_planned");
    let planned: any[] = [];
    if (rawPlanned) {
      try { planned = JSON.parse(rawPlanned); } catch {}
    }

    const targetDist = Number(localStorage.getItem("fit_sched_target_dist") ?? 40);
    const targetDur = Number(localStorage.getItem("fit_sched_target_dur") ?? 4);
    const autoSync = localStorage.getItem("fit_sched_auto_sync") !== "false";

    // 1. Calculate current week dates (Monday to Sunday sequence)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - (day === 0 ? 6 : day - 1);
    const currentWeekStart = new Date(today.setDate(diff));
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    // 2. Compute active training plan stats & block phase to get dynamic targets if synced
    const aiPlans = planned.filter(w => w.id.startsWith("ai-") || w.id === "ai-race-day");
    const hasPlan = aiPlans.length > 0;

    let effectiveDist = targetDist;
    let effectiveDur = targetDur;

    if (autoSync && hasPlan) {
      const scale = distanceUnit === "km" ? 1000 : 1609.34;
      let plannedM = 0;
      let plannedS = 0;
      planned.forEach(p => {
        if (weekDates.includes(p.dateStr)) {
          plannedM += p.distanceM;
          plannedS += p.durationS;
        }
      });
      effectiveDist = Number((plannedM / scale).toFixed(1));
      effectiveDur = Number((plannedS / 3600).toFixed(1));
    }

    // 3. Compute actual stats for current week
    let actualDistM = 0;
    let actualDurS = 0;
    activities.forEach(a => {
      const start = a.start_ts_utc.slice(0, 10);
      if (weekDates.includes(start)) {
        actualDistM += a.distance_m;
        actualDurS += a.duration_s;
      }
    });

    const scale = distanceUnit === "km" ? 1000 : 1609.34;
    const actualDistScaled = actualDistM / scale;
    const actualDurHrs = actualDurS / 3600;

    const distPct = effectiveDist > 0 ? Math.min(100, Math.round((actualDistScaled / effectiveDist) * 100)) : 0;
    const durPct = effectiveDur > 0 ? Math.min(100, Math.round((actualDurHrs / effectiveDur) * 100)) : 0;

    return {
      effectiveDistanceGoal: effectiveDist,
      effectiveDurationGoal: effectiveDur,
      actualDistance: actualDistScaled,
      actualDuration: actualDurHrs,
      distPercentage: distPct,
      durPercentage: durPct,
      combinedPercentage: Math.round((distPct + durPct) / 2)
    };
  }, [activities, distanceUnit]);

  const weekDayCompletion = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - (day === 0 ? 6 : day - 1);
    const currentWeekStart = new Date(today.setDate(diff));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const hasWorkout = activities.some(a => a.start_ts_utc.slice(0, 10) === dateStr);
      days.push({
        label: ["M", "T", "W", "T", "F", "S", "S"][i],
        dateStr,
        hasWorkout,
        isToday: dateStr === new Date().toISOString().slice(0, 10)
      });
    }
    return days;
  }, [activities]);

  // ACWR check for Banner
  const currentAcwr = useMemo(() => {
    if (!loadTimeline.length) return 0;
    return loadTimeline[loadTimeline.length - 1].acwr ?? 0;
  }, [loadTimeline]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%" }}>
      {currentAcwr > 1.3 && (
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
            <strong>High Acute Load Warning:</strong> Your Acute:Chronic Workload Ratio (ACWR) has spiked to <strong>{currentAcwr.toFixed(2)}</strong> (Caution Sweet-Spot limit: 1.30). You are in a high injury risk zone due to rapid training load increases. Prioritise easy Zone 2 runs and rest days.
          </div>
        </div>
      )}
      {/* Premium 2x2 Grid Layout for Spacious, Wide Cards */}
      <div className="overview-goal-event-row" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem", width: "100%", margin: "0.5rem 0 0 0" }}>
        
        {/* CARD 1: Suggested Workout with side-by-side internal layout */}
        <div className="panel glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left", position: "relative", overflow: "hidden", minHeight: "280px", justifyContent: "space-between" }}>
          {/* Background Glow */}
          <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "150px", height: "150px", borderRadius: "50%", background: "rgba(139, 92, 246, 0.08)", filter: "blur(40px)", pointerEvents: "none" }}></div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.8px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
              🏋️ SUGGESTED WORKOUT FOR TODAY
            </h4>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(139, 92, 246, 0.1)", borderRadius: "6px", padding: "2px 8px", fontSize: "10px", color: "#c084fc", fontWeight: "bold" }}>
              🦁 Singapore Adapted
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem", flex: 1, alignItems: "center", marginTop: "0.25rem" }}>
            {/* Column 1: Details & Climate Advice */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", color: "#a855f7", display: "block", marginBottom: "2px" }}>
                  {recommendation.type} • {recommendation.duration}
                </span>
                <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: "900", color: "var(--text)", lineHeight: "1.2" }}>
                  {recommendation.title}
                </h3>
              </div>
              <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                <strong>Session:</strong> {recommendation.details}
              </p>
              <div style={{ background: "rgba(249, 115, 22, 0.05)", borderLeft: "4px solid #f97316", padding: "8px 12px", borderRadius: "0 6px 6px 0", fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                {recommendation.singaporePlan}
              </div>
              {recommendation.showWarning && (
                <div style={{
                  background: "var(--warning-bg)",
                  border: "1px solid var(--warning-border)",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "11.5px",
                  color: "var(--text-warning)",
                  fontWeight: "bold",
                  marginTop: "0.25rem"
                }}>
                  ⚠️ Building base ({avgWeeklyKm.toFixed(1)} km/wk avg) — easy aerobic focus until 40km/wk sustained.
                </div>
              )}
            </div>

            {/* Column 2: Intensity Visualizer & Volume stats */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", height: "100%", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "9.5px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>Suggested Intensity Profile</span>
                
                {/* Stacked bar representing intensity distribution */}
                <div style={{ 
                  display: "flex", 
                  height: "8px", 
                  borderRadius: "4px", 
                  overflow: "hidden", 
                  background: "rgba(255,255,255,0.03)", 
                  border: "1px solid rgba(255,255,255,0.05)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)"
                }}>
                  {intensityProfile.z1 > 0 && <div style={{ width: `${intensityProfile.z1}%`, background: "linear-gradient(90deg, #a855f7, #c084fc)", transition: "width 0.3s ease" }} title={`Z1 Rec: ${intensityProfile.z1}%`} />}
                  {intensityProfile.z2 > 0 && <div style={{ width: `${intensityProfile.z2}%`, background: "linear-gradient(90deg, #10b981, #34d399)", transition: "width 0.3s ease" }} title={`Z2 Base: ${intensityProfile.z2}%`} />}
                  {intensityProfile.z3 > 0 && <div style={{ width: `${intensityProfile.z3}%`, background: "linear-gradient(90deg, #f59e0b, #fbbf24)", transition: "width 0.3s ease" }} title={`Z3 Temp: ${intensityProfile.z3}%`} />}
                  {intensityProfile.z4 > 0 && <div style={{ width: `${intensityProfile.z4}%`, background: "linear-gradient(90deg, #ef4444, #f87171)", transition: "width 0.3s ease" }} title={`Z4 Thr: ${intensityProfile.z4}%`} />}
                  {intensityProfile.z5 > 0 && <div style={{ width: `${intensityProfile.z5}%`, background: "linear-gradient(90deg, #ec4899, #f472b6)", transition: "width 0.3s ease" }} title={`Z5 An: ${intensityProfile.z5}%`} />}
                </div>

                {/* 5 compact column elements for each zone */}
                <div style={{ display: "flex", gap: "4px" }}>
                  {[
                    { key: "z1", label: "Z1 Rec", color: "#a855f7", bg: "rgba(168, 85, 247, 0.12)", hoverGlow: "0 0 8px rgba(168, 85, 247, 0.35)" },
                    { key: "z2", label: "Z2 Base", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)", hoverGlow: "0 0 8px rgba(16, 185, 129, 0.35)" },
                    { key: "z3", label: "Z3 Temp", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", hoverGlow: "0 0 8px rgba(245, 158, 11, 0.35)" },
                    { key: "z4", label: "Z4 Thr", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)", hoverGlow: "0 0 8px rgba(239, 68, 68, 0.35)" },
                    { key: "z5", label: "Z5 An", color: "#ec4899", bg: "rgba(236, 72, 153, 0.12)", hoverGlow: "0 0 8px rgba(236, 72, 153, 0.35)" }
                  ].map((z) => {
                    const pct = intensityProfile[z.key as keyof typeof intensityProfile] as number;
                    const isActive = pct > 0;
                    return (
                      <div 
                        key={z.key} 
                        style={{
                          flex: z.key === "z2" ? 1.25 : 1, // Z2 gets a bit more room
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          padding: "5px 2px",
                          borderRadius: "6px",
                          background: isActive ? z.bg : "rgba(255,255,255,0.01)",
                          border: isActive ? `1px solid ${z.color}44` : "1px solid rgba(255,255,255,0.03)",
                          boxShadow: isActive ? z.hoverGlow : "none",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                        }}
                      >
                        <span style={{ fontSize: "8px", fontWeight: "bold", color: isActive ? z.color : "var(--text-muted)" }}>{z.label}</span>
                        <span style={{ fontSize: "9px", fontWeight: "900", color: isActive ? "var(--text)" : "var(--text-muted)", marginTop: "2px" }}>
                          {isActive ? `${pct}%` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: intensityProfile.z2 > 50 ? "#10b981" : intensityProfile.z4 > 20 || intensityProfile.z5 > 0 ? "#ef4444" : "#a855f7" }} />
                  <span style={{ fontSize: "9.5px", color: "var(--text-secondary)", fontWeight: "500" }}>
                    {intensityProfile.description}
                  </span>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "2px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <span>Last 7 Days: <strong>{recentStats.sessionCount} Workouts</strong></span>
                <span>Weekly Volume: <strong>{recentStats.distanceScaled.toFixed(1)} {suffix}</strong></span>
                <span style={{ fontStyle: "italic", fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>Based on last week's load</span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Daily Autonomic Readiness & HRV Summary */}
        <div className="panel glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left", position: "relative", overflow: "hidden", minHeight: "280px", justifyContent: "space-between" }}>
          {/* Background Glow */}
          <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "170px", height: "170px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.09)", filter: "blur(40px)", pointerEvents: "none" }}></div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "1px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
              🧠 DAILY AUTONOMIC READINESS
            </h4>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.12)", borderRadius: "6px", padding: "2px 8px", fontSize: "10px", color: "#34d399", fontWeight: "bold" }}>
              🟢 Active Tracking
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: "1.5rem", flex: 1, alignItems: "center", marginTop: "0.25rem" }}>
            {/* Column 1: Dial & Baseline status */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.5rem" }}>
              <div style={{ position: "relative", width: "110px", height: "110px", flexShrink: 0 }}>
                <svg width="110" height="110" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="60" cy="60" r={52} fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="8" />
                  <circle cx="60" cy="60" r="52" fill="none" stroke={readinessColor} strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={2 * Math.PI * 52 * (1 - readinessScore / 100)}
                    strokeLinecap="round"
                    style={{ 
                      transition: "stroke-dashoffset 0.6s ease",
                      filter: `drop-shadow(0 0 5px ${readinessColor}66)`
                    }}
                  />
                </svg>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: "1.8rem", fontWeight: "900", color: "var(--text)", lineHeight: 1 }}>{readinessScore}</span>
                  <span style={{ fontSize: "8px", fontWeight: "800", color: "var(--text-muted)", marginTop: "1px", letterSpacing: "0.5px" }}>READY%</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontSize: "12px", fontWeight: "900", textTransform: "uppercase", color: readinessColor, letterSpacing: "0.5px" }}>
                  {readinessLabel}
                </span>
                <p style={{ margin: 0, fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                  Waking baseline fully adapted for today's running load.
                </p>
              </div>
            </div>

            {/* Column 2: Sliders & Coach Advice */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>🌿 HRV (RMSSD)</span>
                    <strong style={{ color: "var(--text)" }}>{todayHrv} ms <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>/ 65 ms base</span></strong>
                  </div>
                  <div style={{ height: "5px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: readinessColor, width: `${Math.min(100, (todayHrv / 80) * 100)}%`, borderRadius: "3px" }} />
                  </div>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>🫀 Resting Heart Rate</span>
                    <strong style={{ color: "var(--text)" }}>{todayRhr} bpm <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>/ 52 bpm base</span></strong>
                  </div>
                  <div style={{ height: "5px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: todayRhr <= 55 ? "#10b981" : todayRhr >= 65 ? "#ef4444" : "#f59e0b", width: `${Math.max(10, Math.min(100, (52 / todayRhr) * 100))}%`, borderRadius: "3px" }} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: "var(--text-secondary)" }}>🛌 Sleep & Quality</span>
                    <strong style={{ color: "var(--text)" }}>{todaySleep} hrs <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>({todayQuality}%)</span></strong>
                  </div>
                  <div style={{ height: "5px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#8b5cf6", width: `${Math.min(100, (todaySleep / 8.5) * 100)}%`, borderRadius: "3px" }} />
                  </div>
                </div>
              </div>

              <div style={{ 
                padding: "8px 12px",
                borderRadius: "8px",
                background: readinessScore >= 80 ? "rgba(16, 185, 129, 0.04)" : readinessScore < 50 ? "rgba(239, 68, 68, 0.04)" : "rgba(245, 158, 11, 0.04)",
                border: `1px solid ${readinessScore >= 80 ? "rgba(16, 185, 129, 0.15)" : readinessScore < 50 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)"}`,
                fontSize: "11px",
                lineHeight: "1.4",
                color: "var(--text-secondary)"
              }}>
                <strong>Coach Advice:</strong> {
                  readinessScore >= 80 
                    ? "🌿 Parasympathetic dominant! Today is highly optimal for speed intervals or threshold work." 
                    : readinessScore < 50 
                      ? "⚠️ Neural exhaustion! Cancel hard runs. Prioritize recovery sleep, stretching, and deep breathing." 
                      : "🌤️ Sympathetic stress elevated. Stick to conversational, steady Zone 2 Base Builder."
                }
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3: Upcoming Event countdown clock */}
        <div className="panel glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left", position: "relative", overflow: "hidden", minHeight: "280px", justifyContent: "space-between" }}>
          {/* Background Glow */}
          <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "170px", height: "170px", borderRadius: "50%", background: "rgba(249, 115, 22, 0.09)", filter: "blur(40px)", pointerEvents: "none" }}></div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "1px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
              🏁 UPCOMING RACE EVENT
            </h4>
            {!isEditingEvent && (
              <button 
                className="btn-outline-secondary" 
                style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px" }}
                onClick={() => {
                  setTempEventName(event.name);
                  setTempEventDate(event.dateStr);
                  setIsEditingEvent(true);
                }}
              >
                Edit Event
              </button>
            )}
          </div>

          {isEditingEvent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0.25rem 0", flex: 1, justifyContent: "center" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11.5px" }}>
                Event Name
                <input
                  type="text"
                  value={tempEventName}
                  onChange={(e) => setTempEventName(e.target.value)}
                  style={{ padding: "0.45rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "12px" }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "11.5px" }}>
                Event Date & Time
                <input
                  type="datetime-local"
                  value={tempEventDate}
                  onChange={(e) => setTempEventDate(e.target.value)}
                  style={{ padding: "0.45rem", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)", fontSize: "12px" }}
                />
              </label>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                <button className="btn-secondary" style={{ flex: 1, padding: "7px 12px", fontSize: "11.5px" }} onClick={handleSaveEvent}>Save</button>
                <button className="btn-outline-danger" style={{ flex: 1, padding: "7px 12px", fontSize: "11.5px" }} onClick={() => setIsEditingEvent(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "1.5rem", flex: 1, alignItems: "center", marginTop: "0.25rem" }}>
              {/* Column 1: Event Details & Progress */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: "900", color: "var(--text)", lineHeight: "1.2" }}>
                    {event.name}
                  </h3>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "700", textTransform: "uppercase" }}>
                    📅 {new Date(event.dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                    <span>Prep Block</span>
                    <span style={{ color: "#f97316" }}>
                      {timeLeft.days > 90 ? "Base Building" : timeLeft.days > 45 ? "Specific Build" : timeLeft.days > 14 ? "Peak & Taper" : "Race Week!"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ height: "6px", flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: "#f97316", width: `${Math.max(0, Math.min(100, ((180 - timeLeft.days) / 180) * 100))}%`, borderRadius: "3px" }} />
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: "bold", color: "var(--text-secondary)" }}>
                      {Math.max(0, Math.min(100, Math.round(((180 - timeLeft.days) / 180) * 100)))}%
                    </span>
                  </div>
                </div>

                <div style={{ 
                  padding: "10px 12px", 
                  borderRadius: "8px", 
                  background: "rgba(249, 115, 22, 0.03)", 
                  border: "1px solid var(--border)", 
                  fontSize: "11.5px", 
                  color: "var(--text-secondary)", 
                  lineHeight: "1.5",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Target pace:</span>
                    <strong>{gapStats.targetPaceStr} ({gapStats.targetTimeStr} finish)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Predicted pace:</span>
                    <strong>{gapStats.predPaceStr} ({gapStats.predTimeStr} finish)</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--border)", paddingTop: "0.35rem", marginTop: "0.15rem" }}>
                    <span>Current gap:</span>
                    <strong style={{ color: gapStats.gapColor }}>{gapStats.gapStr} ({gapStats.gapLabel})</strong>
                  </div>
                </div>
              </div>

              {/* Column 2: Digital Flip Countdown Clock */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
                <span style={{ fontSize: "9.5px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "1.2px" }}>Event Countdown</span>
                
                {timeLeft.isOver ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "6px 12px", color: "#34d399", fontWeight: "bold", fontSize: "12px" }}>
                    <span>🎉 Race Completed!</span>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem", width: "100%" }}>
                    {[
                      { value: timeLeft.days, label: "DAYS" },
                      { value: timeLeft.hours, label: "HRS" },
                      { value: timeLeft.minutes, label: "MIN" },
                      { value: timeLeft.seconds, label: "SEC" }
                    ].map((item, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          background: "rgba(249, 115, 22, 0.06)", 
                          border: "1px solid rgba(249, 115, 22, 0.35)", 
                          borderRadius: "6px", 
                          padding: "8px 0", 
                          display: "flex", 
                          flexDirection: "column", 
                          alignItems: "center",
                          boxShadow: "0 2px 6px rgba(249, 115, 22, 0.05)"
                        }}
                      >
                        <span 
                          style={{ 
                            fontSize: "1.8rem", 
                            fontWeight: 900, 
                            color: "#f97316", 
                            fontFamily: "monospace", 
                            letterSpacing: "0.5px",
                            textShadow: "0 0 8px rgba(249, 115, 22, 0.4)",
                            lineHeight: 1.1
                          }}
                        >
                          {String(item.value).padStart(2, "0")}
                        </span>
                        <span 
                          style={{ 
                            fontSize: "9px", 
                            fontWeight: "bold", 
                            color: "var(--text-secondary)", 
                            letterSpacing: "0.5px",
                            marginTop: "3px" 
                          }}
                        >
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: "10.5px", fontWeight: "600", color: "var(--text-secondary)" }}>Taper starts: in {Math.max(0, timeLeft.days - 14)} Days</span>
              </div>
            </div>
          )}
        </div>

        {/* CARD 4: Weekly Goal Ring Progress */}
        <div className="panel glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left", position: "relative", overflow: "hidden", minHeight: "280px", justifyContent: "space-between" }}>
          {/* Background Glow */}
          <div style={{ position: "absolute", top: "-50px", right: "-50px", width: "170px", height: "170px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.06)", filter: "blur(40px)", pointerEvents: "none" }}></div>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "1px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
              🎯 WEEKLY GOAL RING PROGRESS
            </h4>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(16, 185, 129, 0.12)", borderRadius: "6px", padding: "2px 8px", fontSize: "10px", color: "#10b981", fontWeight: "bold" }}>
              {schedulerData.combinedPercentage}% Done
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "1.5rem", flex: 1, alignItems: "center", marginTop: "0.25rem" }}>
            {/* Column 1: SVGs Double Rings & target readouts */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", justifyContent: "center" }}>
              <div style={{ position: "relative", width: "96px", height: "96px", flexShrink: 0 }}>
                <svg width="96" height="96" viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                  {/* Distance Outer Ring */}
                  <circle cx="60" cy="60" r={48} fill="transparent" stroke="rgba(16, 185, 129, 0.08)" strokeWidth={10} />
                  <circle
                    cx="60"
                    cy="60"
                    r={48}
                    fill="transparent"
                    stroke="#10b981"
                    strokeWidth={10}
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - schedulerData.distPercentage / 100)}
                    strokeLinecap="round"
                    style={{
                      transition: "stroke-dashoffset 0.8s ease",
                      filter: "drop-shadow(0 0 3px rgba(16, 185, 129, 0.35))"
                    }}
                  />

                  {/* Duration Inner Ring */}
                  <circle cx="60" cy="60" r={34} fill="transparent" stroke="rgba(139, 92, 246, 0.08)" strokeWidth={10} />
                  <circle
                    cx="60"
                    cy="60"
                    r={34}
                    fill="transparent"
                    stroke="#8b5cf6"
                    strokeWidth={10}
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - schedulerData.durPercentage / 100)}
                    strokeLinecap="round"
                    style={{
                      transition: "stroke-dashoffset 0.8s ease",
                      filter: "drop-shadow(0 0 3px rgba(139, 92, 246, 0.45))"
                    }}
                  />
                </svg>
                
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: "14px", fontWeight: "900", color: "var(--text)" }}>
                  {schedulerData.combinedPercentage}%
                </div>
              </div>

              {/* Progress split readout */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "11px", color: "var(--text-secondary)", flex: 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>🏃 Mileage Goal</span>
                    <strong>{schedulerData.actualDistance.toFixed(1)} <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>/ {schedulerData.effectiveDistanceGoal} {suffix}</span></strong>
                  </div>
                  <div style={{ height: "4px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#10b981", width: `${schedulerData.distPercentage}%`, borderRadius: "2px" }} />
                  </div>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>⏱️ Duration Target</span>
                    <strong>{schedulerData.actualDuration.toFixed(1)} <span style={{ color: "var(--text-muted)", fontWeight: "normal" }}>/ {schedulerData.effectiveDurationGoal} hrs</span></strong>
                  </div>
                  <div style={{ height: "4px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#8b5cf6", width: `${schedulerData.durPercentage}%`, borderRadius: "2px" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Consistency row checklist & Coach Audit Box */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "9px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "bold" }}>Weekly Consistency Checklist</span>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
                  {weekDayCompletion.map((day, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        flex: 1, 
                        display: "flex", 
                        flexDirection: "column", 
                        alignItems: "center", 
                        padding: "4px 2px",
                        borderRadius: "5px",
                        background: day.hasWorkout ? "rgba(16, 185, 129, 0.12)" : day.isToday ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.01)",
                        border: day.hasWorkout ? "1px solid rgba(16, 185, 129, 0.25)" : day.isToday ? "1px solid var(--text-muted)" : "1px solid var(--border)"
                      }}
                    >
                      <span style={{ fontSize: "9px", fontWeight: "bold", color: day.hasWorkout ? "#10b981" : "var(--text-muted)" }}>{day.label}</span>
                      <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: day.hasWorkout ? "#10b981" : "transparent", marginTop: "3px" }} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ 
                padding: "8px 12px",
                borderRadius: "8px",
                background: "rgba(139, 92, 246, 0.04)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
                fontSize: "11px",
                lineHeight: "1.4",
                color: "var(--text-secondary)"
              }}>
                <strong>Consistency Audit:</strong> {
                  schedulerData.combinedPercentage >= 80 
                    ? "🏆 Elite Execution! Prioritize recovery sleep to absorb this workload."
                    : schedulerData.combinedPercentage >= 40 
                      ? "📅 On Track! Keep paces strictly in Zone 2 on aerobic base days."
                      : "🏃 Base Building: early week volume phase. Focus on consistent daily run frequency."
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* UPCOMING WEEK SUGGESTED TIMELINE */}
      <section className="panel glass-card" style={{ padding: "1.25rem 1.5rem", textAlign: "left", display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
        <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
          <h4 style={{ margin: 0, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.8px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            📅 SUGGESTED WORKOUTS FOR THE UPCOMING WEEK (🦁 CLIMATE ADAPTED)
          </h4>
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(110px, 150px))", justifyContent: "center", gap: "0.75rem", width: "100%", overflowX: "auto" }}>
          {upcomingWeekSuggestedPlan.map((item, idx) => (
            <div key={idx} style={{ 
              background: item.bg, 
              border: `1px solid var(--border)`, 
              borderRadius: "8px", 
              padding: "0.75rem", 
              display: "flex", 
              flexDirection: "column", 
              gap: "0.4rem",
              minWidth: "110px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--text)" }}>{item.day}</span>
                <span style={{ fontSize: "8.5px", fontWeight: "bold", padding: "1px 5px", borderRadius: "4px", background: "var(--panel)", color: item.color }}>{item.badge}</span>
              </div>
              
              <div style={{ fontSize: "11.5px", fontWeight: "bold", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.title}
              </div>
              
              <div style={{ fontSize: "9.5px", color: "var(--text-muted)", lineHeight: "1.3" }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
