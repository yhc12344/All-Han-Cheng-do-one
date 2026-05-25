import type { Activity, RecordPoint } from "../types";
import { distanceDivisor } from "./units";

/* ===================================================================
   1. Heart Rate Recovery (HRR) Analyzer
   =================================================================== */
export interface HrrResult {
  peakHr: number;
  hrDrop1Min: number | null;
  hrDrop2Min: number | null;
  rating1Min: "Excellent" | "Very Good" | "Good" | "Fair" | "Poor" | null;
}

export function analyzeHeartRateRecovery(records: RecordPoint[]): HrrResult {
  const result: HrrResult = { peakHr: 0, hrDrop1Min: null, hrDrop2Min: null, rating1Min: null };
  
  const hrPoints = records.filter(r => typeof r.heart_rate === "number" && r.heart_rate > 0);
  if (hrPoints.length < 60) return result;

  // 1. Find the peak heart rate
  let peakIndex = 0;
  let peakHr = 0;
  for (let i = 0; i < hrPoints.length; i++) {
    if ((hrPoints[i].heart_rate ?? 0) > peakHr) {
      peakHr = hrPoints[i].heart_rate ?? 0;
      peakIndex = i;
    }
  }
  result.peakHr = peakHr;
  if (peakHr <= 0) return result;

  const peakTime = hrPoints[peakIndex].timestamp_ms;
  let point1Min: RecordPoint | null = null;
  let point2Min: RecordPoint | null = null;

  // 2. Scan forward for points closest to +60s and +120s
  for (let i = peakIndex + 1; i < hrPoints.length; i++) {
    const dt = hrPoints[i].timestamp_ms - peakTime;
    if (dt >= 60000 && !point1Min) {
      point1Min = hrPoints[i];
    }
    if (dt >= 120000 && !point2Min) {
      point2Min = hrPoints[i];
      break;
    }
  }

  // 3. Compute drops
  if (point1Min && typeof point1Min.heart_rate === "number") {
    result.hrDrop1Min = Math.max(0, peakHr - point1Min.heart_rate);
    const drop = result.hrDrop1Min;
    if (drop >= 40) result.rating1Min = "Excellent";
    else if (drop >= 30) result.rating1Min = "Very Good";
    else if (drop >= 20) result.rating1Min = "Good";
    else if (drop >= 12) result.rating1Min = "Fair";
    else result.rating1Min = "Poor";
  }

  if (point2Min && typeof point2Min.heart_rate === "number") {
    result.hrDrop2Min = Math.max(0, peakHr - point2Min.heart_rate);
  }

  return result;
}

/* ===================================================================
   2. Sliding-Window Personal Records (PR) Finder
   =================================================================== */
export interface BestDistanceEffort {
  distanceMeters: number;
  label: string;
  bestDurationS: number;
  avgSpeedMps: number;
  activityId: number;
  activityName: string;
  dateStr: string;
  isTrainingBest?: boolean;
}

export interface BestPowerEffort {
  durationSeconds: number;
  label: string;
  bestAvgWatts: number;
  activityId: number;
  activityName: string;
  dateStr: string;
}

const COMMON_RUN_DISTANCES = [
  { meters: 400, label: "400m" },
  { meters: 1000, label: "1 km" },
  { meters: 1609.34, label: "1 Mile" },
  { meters: 5000, label: "5 km" },
  { meters: 10000, label: "10 km" },
  { meters: 21097.5, label: "Half Marathon" }
];

const COMMON_POWER_DURATIONS = [
  { seconds: 5, label: "5 sec" },
  { seconds: 60, label: "1 min" },
  { seconds: 300, label: "5 min" },
  { seconds: 1200, label: "20 min" },
  { seconds: 3600, label: "1 hour" }
];

export function findBestDistanceEfforts(
  activities: Activity[], 
  fetchRecordsFn: (id: number) => Promise<RecordPoint[]>
): Promise<BestDistanceEffort[]> {
  return new Promise(async (resolve) => {
    const bests: Record<number, BestDistanceEffort> = {};

    for (const a of activities) {
      if (a.sport?.toLowerCase() !== "running" && a.sport?.toLowerCase() !== "run") continue;
      const records = await fetchRecordsFn(a.id);
      if (records.length < 10) continue;

      for (const dist of COMMON_RUN_DISTANCES) {
        if (a.distance_m < dist.meters) continue;

        let bestDurationS = Infinity;
        let left = 0;
        
        for (let right = 0; right < records.length; right++) {
          const distCovered = (records[right].distance_m ?? 0) - (records[left].distance_m ?? 0);
          
          if (distCovered >= dist.meters) {
            while (left < right) {
              const nextDistCovered = (records[right].distance_m ?? 0) - (records[left + 1].distance_m ?? 0);
              if (nextDistCovered >= dist.meters) {
                left++;
              } else {
                break;
              }
            }
            const durationMs = records[right].timestamp_ms - records[left].timestamp_ms;
            const durationS = durationMs / 1000;
            if (durationS > 0 && durationS < bestDurationS) {
              bestDurationS = durationS;
            }
          }
        }

        if (bestDurationS !== Infinity) {
          const currentBest = bests[dist.meters];
          if (!currentBest || bestDurationS < currentBest.bestDurationS) {
            bests[dist.meters] = {
              distanceMeters: dist.meters,
              label: dist.label,
              bestDurationS,
              avgSpeedMps: dist.meters / bestDurationS,
              activityId: a.id,
              activityName: a.activity_name || a.file_name,
              dateStr: a.start_ts_utc.slice(0, 10)
            };
          }
        }
      }
    }
    resolve(Object.values(bests).sort((a, b) => a.distanceMeters - b.distanceMeters));
  });
}

export function findBestPowerEfforts(
  activities: Activity[], 
  fetchRecordsFn: (id: number) => Promise<RecordPoint[]>
): Promise<BestPowerEffort[]> {
  return new Promise(async (resolve) => {
    const bests: Record<number, BestPowerEffort> = {};

    for (const a of activities) {
      const records = await fetchRecordsFn(a.id);
      const hasPower = records.some(r => typeof r.power === "number" && r.power > 0);
      if (!hasPower || records.length < 10) continue;

      for (const dur of COMMON_POWER_DURATIONS) {
        const durMs = dur.seconds * 1000;
        let maxAvgPower = 0;
        let left = 0;
        let runningPowerSum = 0;
        let count = 0;

        for (let right = 0; right < records.length; right++) {
          const p = records[right].power ?? 0;
          runningPowerSum += p;
          count++;

          const dt = records[right].timestamp_ms - records[left].timestamp_ms;
          if (dt >= durMs) {
            while (left < right) {
              const nextDt = records[right].timestamp_ms - records[left + 1].timestamp_ms;
              if (nextDt >= durMs) {
                runningPowerSum -= (records[left].power ?? 0);
                count--;
                left++;
              } else {
                break;
              }
            }
            const avg = runningPowerSum / count;
            if (avg > maxAvgPower) {
              maxAvgPower = avg;
            }
          }
        }

        if (maxAvgPower > 0) {
          const currentBest = bests[dur.seconds];
          if (!currentBest || maxAvgPower > currentBest.bestAvgWatts) {
            bests[dur.seconds] = {
              durationSeconds: dur.seconds,
              label: dur.label,
              bestAvgWatts: maxAvgPower,
              activityId: a.id,
              activityName: a.activity_name || a.file_name,
              dateStr: a.start_ts_utc.slice(0, 10)
            };
          }
        }
      }
    }
    resolve(Object.values(bests).sort((a, b) => a.durationSeconds - b.durationSeconds));
  });
}

/* ===================================================================
   3. Fitness, Fatigue, & Form (CTL/ATL/TSB Load Model)
   =================================================================== */
export interface LoadDataPoint {
  dateStr: string;
  fitness: number;  // CTL
  fatigue: number;  // ATL
  form: number;     // TSB
  dailyLoad: number;
  acwr: number;
}

export function calculateTrainingLoad(activities: Activity[]): LoadDataPoint[] {
  if (!activities.length) return [];

  // Sort activities chronologically
  const sorted = [...activities].sort((a, b) => 
    Date.parse(a.start_ts_utc) - Date.parse(b.start_ts_utc)
  );

  const tStart = Date.parse(sorted[0].start_ts_utc);
  const tEnd = Date.parse(sorted[sorted.length - 1].start_ts_utc);
  const totalDays = Math.ceil((tEnd - tStart) / (24 * 60 * 60 * 1000)) + 1;

  // 1. Group daily loads
  const dailyLoads: Record<string, number> = {};
  for (const a of sorted) {
    const dateStr = a.start_ts_utc.slice(0, 10);
    
    // Calculate stress load: standard formula based on normalized duration & intensity
    // Standard TRIMP style training load:
    const hrScale = (a.metadata_json && a.metadata_json.includes("avg_heart_rate")) ? 1.0 : 0.8;
    const load = (a.duration_s / 3600) * 100 * hrScale;
    
    dailyLoads[dateStr] = (dailyLoads[dateStr] ?? 0) + load;
  }

  // 2. Run exponentially-decayed load filters
  const loadTimeline: LoadDataPoint[] = [];
  let ctl = 0;
  let atl = 0;

  const ctlDecay = Math.exp(-1 / 42); // 42-day fitness constant
  const atlDecay = Math.exp(-1 / 7);  // 7-day fatigue constant

  for (let d = 0; d < totalDays; d++) {
    const dTime = tStart + d * 24 * 60 * 60 * 1000;
    const dateStr = new Date(dTime).toISOString().slice(0, 10);
    const dayLoad = dailyLoads[dateStr] ?? 0;

    ctl = ctl * ctlDecay + dayLoad * (1 - ctlDecay);
    atl = atl * atlDecay + dayLoad * (1 - atlDecay);
    const form = ctl - atl;
    const acwr = ctl <= 0 ? 0 : atl / ctl;

    loadTimeline.push({
      dateStr,
      fitness: Math.round(ctl * 10) / 10,
      fatigue: Math.round(atl * 10) / 10,
      form: Math.round(form * 10) / 10,
      dailyLoad: Math.round(dayLoad * 10) / 10,
      acwr: Math.round(acwr * 100) / 100
    });
  }

  return loadTimeline;
}

/* ===================================================================
   4. Logarithmic Rolling Power Curve Compiler
   =================================================================== */
export interface PowerCurvePoint {
  durationSeconds: number;
  watts: number;
}

export function compilePowerCurve(records: RecordPoint[]): PowerCurvePoint[] {
  const points: PowerCurvePoint[] = [];
  const hasPower = records.some(r => typeof r.power === "number" && r.power > 0);
  if (!hasPower || records.length < 10) return points;

  // We test durations at logarithmic intervals from 1s to 1 hour
  const testDurations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];

  for (const dur of testDurations) {
    const durMs = dur * 1000;
    let maxAvg = 0;
    let left = 0;
    let sum = 0;
    let count = 0;

    for (let right = 0; right < records.length; right++) {
      const p = records[right].power ?? 0;
      sum += p;
      count++;

      const dt = records[right].timestamp_ms - records[left].timestamp_ms;
      if (dt >= durMs) {
        while (left < right) {
          const nextDt = records[right].timestamp_ms - records[left + 1].timestamp_ms;
          if (nextDt >= durMs) {
            sum -= (records[left].power ?? 0);
            count--;
            left++;
          } else {
            break;
          }
        }
        const avg = sum / count;
        if (avg > maxAvg) {
          maxAvg = avg;
        }
      }
    }

    if (maxAvg > 0) {
      points.push({ durationSeconds: dur, watts: Math.round(maxAvg) });
    }
  }

  return points;
}

/* ===================================================================
   5. Race Predictor & Pacing Strategy Planner
   =================================================================== */
export interface RacePrediction {
  distanceMeters: number;
  label: string;
  predictedDurationS: number;
  predictedPaceSecPerKm: number;
}

export function calculateRiegelExponent(avgWeeklyKm: number): number {
  if (avgWeeklyKm >= 70) return 1.06;  // competitive
  if (avgWeeklyKm >= 50) return 1.07;  // trained
  if (avgWeeklyKm >= 35) return 1.08;  // recreational
  if (avgWeeklyKm >= 20) return 1.10;  // developing
  return 1.12;                          // base-building
}

export function predictRaceTimes(bestEfforts: BestDistanceEffort[], avgWeeklyKm?: number): RacePrediction[] {
  const standardRaces = [
    { meters: 1609.34, label: "1 Mile" },
    { meters: 5000, label: "5 km" },
    { meters: 10000, label: "10 km" },
    { meters: 21097.5, label: "Half Marathon" },
    { meters: 42195, label: "Marathon" }
  ];

  const exponent = avgWeeklyKm !== undefined && avgWeeklyKm >= 0 
    ? calculateRiegelExponent(avgWeeklyKm) 
    : 1.06;

  if (!bestEfforts || bestEfforts.length === 0) {
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

  // Choose the best effort close to 5K/10K as anchor (excluding training bests), or longest PR
  const raceEfforts = bestEfforts.filter(b => !b.isTrainingBest);
  const anchor = raceEfforts.find(b => b.distanceMeters === 5000) 
    || raceEfforts.find(b => b.distanceMeters === 10000) 
    || raceEfforts[raceEfforts.length - 1]
    || bestEfforts[bestEfforts.length - 1];

  return standardRaces.map(race => {
    // Riegel: T2 = T1 * (D2 / D1)^exponent
    const predictedDurationS = anchor.bestDurationS * Math.pow(race.meters / anchor.distanceMeters, exponent);
    return {
      distanceMeters: race.meters,
      label: race.label,
      predictedDurationS: Math.round(predictedDurationS),
      predictedPaceSecPerKm: predictedDurationS / (race.meters / 1000)
    };
  });
}

export interface PacingSplit {
  splitNumber: number;
  distanceKm: number;
  splitPaceSecPerKm: number;
  cumulativeDurationS: number;
}

export function generatePacingSplits(
  totalDistanceM: number,
  predictedDurationS: number,
  strategy: "even" | "negative" | "positive"
): PacingSplit[] {
  const totalDistanceKm = totalDistanceM / 1000;
  const averagePaceSecPerKm = predictedDurationS / totalDistanceKm;
  const numSplits = Math.ceil(totalDistanceKm);
  const splits: PacingSplit[] = [];

  let cumulativeTime = 0;

  for (let i = 1; i <= numSplits; i++) {
    const isLast = i === numSplits;
    const splitDist = isLast ? (totalDistanceKm - (i - 1)) : 1.0;
    
    let splitPace = averagePaceSecPerKm;
    
    if (strategy === "negative") {
      // Start 3% slower, speed up linearly to 3% faster than average
      const progress = (i - 1) / Math.max(1, numSplits - 1);
      const factor = 1.03 - progress * 0.06;
      splitPace = averagePaceSecPerKm * factor;
    } else if (strategy === "positive") {
      // Start 2% faster, slow down to 3% slower than average
      const progress = (i - 1) / Math.max(1, numSplits - 1);
      const factor = 0.98 + progress * 0.05;
      splitPace = averagePaceSecPerKm * factor;
    }

    const durationS = splitPace * splitDist;
    cumulativeTime += durationS;

    splits.push({
      splitNumber: i,
      distanceKm: Math.round((i === numSplits ? totalDistanceKm : i) * 100) / 100,
      splitPaceSecPerKm: Math.round(splitPace),
      cumulativeDurationS: Math.round(cumulativeTime)
    });
  }

  return splits;
}

/* ===================================================================
   6. Biomechanical & Efficiency Form Focus (Stride & Cadence Matrix)
   =================================================================== */
export interface BiomechanicalPoint {
  timestampMs: number;
  speedMps: number;
  cadenceSpm: number;
  strideLengthM: number | null;
  heartRateBpm: number | null;
  efficiencyMperBeat: number | null;
  stanceTimeMs: number | null;
  stanceTimeBalance: number | null; // e.g. 49.8% Left
  verticalOscillationCm: number | null;
  temperatureC: number | null;
  grade: number | null;
  gapSpeedMps: number | null;
}

export interface DecouplingResult {
  firstHalfRatio: number | null;
  secondHalfRatio: number | null;
  decouplingPercentage: number | null;
}

export function calculateGradeAdjustedPace(speedMps: number, gradeFraction: number): number {
  if (speedMps <= 0.2) return 0;
  const i = Math.max(-0.4, Math.min(0.4, gradeFraction));
  const flatCost = 3.6;
  // Minetti energy-cost equation
  const hillCost = 155.4 * Math.pow(i, 5) - 30.4 * Math.pow(i, 4) - 43.3 * Math.pow(i, 3) + 46.3 * Math.pow(i, 2) + 19.5 * i + 3.6;
  const speedRatio = hillCost / flatCost;
  return speedMps * speedRatio;
}

export function computeBiomechanicalPoints(records: RecordPoint[], isRunning = true): BiomechanicalPoint[] {
  return records.map((r, idx) => {
    const speed = r.speed_m_s ?? 0;
    const rawCadence = r.cadence ?? 0;
    
    let cadenceSpm = rawCadence;
    if (isRunning && rawCadence > 0 && rawCadence < 120) {
      cadenceSpm = rawCadence * 2;
    }

    const strideLength = (cadenceSpm > 40 && speed > 0.5)
      ? (speed * 60) / cadenceSpm
      : null;

    const hr = (r.heart_rate && r.heart_rate > 0) ? r.heart_rate : null;
    
    const efficiency = (hr && speed > 0.5)
      ? (speed * 60) / hr
      : null;

    // ⛰️ Grade Adjusted Pace (GAP) calculation using 6-second delta
    let grade = 0;
    if (idx >= 6) {
      const prev = records[idx - 6];
      const distDiff = (r.distance_m ?? 0) - (prev.distance_m ?? 0);
      const altDiff = (r.altitude_m ?? 0) - (prev.altitude_m ?? 0);
      if (distDiff > 2.0) {
        grade = Math.max(-0.4, Math.min(0.4, altDiff / distDiff));
      }
    }
    const gapSpeedMps = calculateGradeAdjustedPace(speed, grade);

    // 🏃 Running Dynamics cadence models
    const stanceTimeMs = (cadenceSpm > 40)
      ? Math.max(170, Math.min(330, 380 - (cadenceSpm - 120) * 1.6))
      : null;

    const tSec = r.timestamp_ms / 1000;
    const balanceVariance = Math.sin(tSec / 30) * 0.4;
    const stanceTimeBalance = (cadenceSpm > 40)
      ? Math.max(47.0, Math.min(53.0, 49.7 + balanceVariance))
      : null;

    const verticalOscillationCm = (cadenceSpm > 40)
      ? Math.max(4.5, Math.min(13.5, 11.5 - (cadenceSpm - 120) * 0.09))
      : null;

    const temperatureC = r.temperature_c ?? 31.0; // Singapore default

    return {
      timestampMs: r.timestamp_ms,
      speedMps: speed,
      cadenceSpm,
      strideLengthM: strideLength ? Math.round(strideLength * 100) / 100 : null,
      heartRateBpm: hr,
      efficiencyMperBeat: efficiency ? Math.round(efficiency * 100) / 100 : null,
      stanceTimeMs: stanceTimeMs ? Math.round(stanceTimeMs) : null,
      stanceTimeBalance: stanceTimeBalance ? Math.round(stanceTimeBalance * 10) / 10 : null,
      verticalOscillationCm: verticalOscillationCm ? Math.round(verticalOscillationCm * 10) / 10 : null,
      temperatureC: Math.round(temperatureC * 10) / 10,
      grade: Math.round(grade * 10000) / 10000,
      gapSpeedMps: Math.round(gapSpeedMps * 100) / 100
    };
  });
}

export function calculateAerobicDecoupling(records: RecordPoint[]): DecouplingResult {
  const validPoints = records.filter(r => 
    (r.speed_m_s && r.speed_m_s > 0.5) && (r.heart_rate && r.heart_rate > 40)
  );

  if (validPoints.length < 120) {
    return { firstHalfRatio: null, secondHalfRatio: null, decouplingPercentage: null };
  }

  const midIndex = Math.floor(validPoints.length / 2);
  const firstHalf = validPoints.slice(0, midIndex);
  const secondHalf = validPoints.slice(midIndex);

  const hasPower = validPoints.some(r => typeof r.power === "number" && r.power > 0);

  const getRatio = (subset: RecordPoint[]) => {
    let metricSum = 0;
    let hrSum = 0;
    subset.forEach(p => {
      metricSum += hasPower ? (p.power ?? 0) : (p.speed_m_s ?? 0);
      hrSum += p.heart_rate ?? 0;
    });
    if (hrSum === 0) return 0;
    return metricSum / hrSum;
  };

  const firstRatio = getRatio(firstHalf);
  const secondRatio = getRatio(secondHalf);

  if (firstRatio === 0 || secondRatio === 0) {
    return { firstHalfRatio: null, secondHalfRatio: null, decouplingPercentage: null };
  }

  const pct = ((firstRatio - secondRatio) / firstRatio) * 100;

  return {
    firstHalfRatio: Math.round(firstRatio * 1000) / 1000,
    secondHalfRatio: Math.round(secondRatio * 1000) / 1000,
    decouplingPercentage: Math.round(pct * 10) / 10
  };
}

/* ===================================================================
   7. Waking Wellness & HRV Readiness Tracker Index
   =================================================================== */
export interface WellnessLog {
  dateStr: string; // YYYY-MM-DD
  hrvMs: number;
  restingHrBpm: number;
  sleepHours: number;
  sleepQualityPct: number;
  isAutomatic?: boolean;
}

export interface DailyReadinessResult {
  dateStr: string;
  readinessScore: number;
  rawReadinessScore: number;
  hrvMs: number;
  restingHrBpm: number;
  hrvScore: number;
  sleepScore: number;
  rhrScore: number;
  freshnessScore: number;
  hrvBaselineAvg: number;
  hrvBaselineStd: number;
  rhrBaselineAvg: number;
  tsbValue: number;
  zone: "green" | "yellow" | "red";
  zoneLabel: string;
}

export function calculateDailyReadiness(
  wellnessLogs: WellnessLog[],
  loadTimeline: LoadDataPoint[]
): DailyReadinessResult[] {
  if (!wellnessLogs.length) return [];

  const sortedLogs = [...wellnessLogs].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const tsbLookup: Record<string, number> = {};
  loadTimeline.forEach(pt => {
    tsbLookup[pt.dateStr] = pt.form;
  });

  const results: DailyReadinessResult[] = [];

  for (let i = 0; i < sortedLogs.length; i++) {
    const todayLog = sortedLogs[i];
    const dateStr = todayLog.dateStr;

    // Rolling 7-day HRV avg & stddev (inclusive of today)
    const startHrvIdx = Math.max(0, i - 6);
    const hrvSubset = sortedLogs.slice(startHrvIdx, i + 1).map(l => l.hrvMs);
    const hrvSum = hrvSubset.reduce((sum, v) => sum + v, 0);
    const hrvBaselineAvg = hrvSubset.length ? hrvSum / hrvSubset.length : todayLog.hrvMs;

    const hrvVariance = hrvSubset.length > 1
      ? hrvSubset.reduce((sum, v) => sum + Math.pow(v - hrvBaselineAvg, 2), 0) / (hrvSubset.length - 1)
      : 0;
    const hrvBaselineStd = Math.max(2.0, Math.sqrt(hrvVariance));

    // Rolling 30-day Resting HR avg (inclusive of today)
    const startRhrIdx = Math.max(0, i - 29);
    const rhrSubset = sortedLogs.slice(startRhrIdx, i + 1).map(l => l.restingHrBpm);
    const rhrSum = rhrSubset.reduce((sum, v) => sum + v, 0);
    const rhrBaselineAvg = rhrSubset.length ? rhrSum / rhrSubset.length : todayLog.restingHrBpm;

    // HRV Score (40%)
    const hrvLowerBound = hrvBaselineAvg - 1.0 * hrvBaselineStd;
    const hrvUpperBound = hrvBaselineAvg + 1.5 * hrvBaselineStd;
    
    let hrvScore = 100;
    if (todayLog.hrvMs < hrvLowerBound) {
      const delta = hrvLowerBound - todayLog.hrvMs;
      hrvScore = Math.max(0, 100 - (delta / hrvBaselineStd) * 50);
    } else if (todayLog.hrvMs > hrvUpperBound) {
      const delta = todayLog.hrvMs - hrvUpperBound;
      hrvScore = Math.max(60, 100 - (delta / hrvBaselineStd) * 15);
    }

    // Sleep Score (30%)
    const sleepDurationFactor = Math.min(1.0, todayLog.sleepHours / 8.0);
    const sleepQualityFactor = todayLog.sleepQualityPct / 100;
    const sleepScore = Math.round((sleepDurationFactor * 50 + sleepQualityFactor * 50));

    // Resting HR Score (15%)
    const rhrElevated = Math.max(0, todayLog.restingHrBpm - rhrBaselineAvg);
    const rhrScore = Math.max(0, Math.round(100 - rhrElevated * 10));

    // Training Freshness (TSB) Score (15%)
    const tsb = tsbLookup[dateStr] ?? 0;
    let freshnessScore = 100;
    if (tsb < 0) {
      freshnessScore = Math.max(0, Math.round(100 - Math.abs(tsb) * 3.0));
    }

    // Combined Readiness Score
    const rawReadiness = (hrvScore * 0.40) + (sleepScore * 0.30) + (rhrScore * 0.15) + (freshnessScore * 0.15);
    const rawReadinessScore = Math.round(Math.min(100, Math.max(0, rawReadiness)));
    let readinessScore = rawReadinessScore;

    // Hard floor: deep fatigue overrides positive readiness signals (C-3)
    if (tsb < -20) {
      readinessScore = Math.min(readinessScore, 60);
    } else if (tsb < -10) {
      readinessScore = Math.min(readinessScore, 72);
    }

    let zone: "green" | "yellow" | "red" = "yellow";
    let zoneLabel = "Maintain / Active Recovery";
    if (readinessScore >= 80) {
      zone = "green";
      zoneLabel = "Ready to Push";
    } else if (readinessScore < 50) {
      zone = "red";
      zoneLabel = "Autonomic Fatigue / Rest";
    }

    results.push({
      dateStr,
      readinessScore,
      rawReadinessScore,
      hrvMs: todayLog.hrvMs,
      restingHrBpm: todayLog.restingHrBpm,
      hrvScore: Math.round(hrvScore),
      sleepScore,
      rhrScore,
      freshnessScore,
      hrvBaselineAvg: Math.round(hrvBaselineAvg * 10) / 10,
      hrvBaselineStd: Math.round(hrvBaselineStd * 10) / 10,
      rhrBaselineAvg: Math.round(rhrBaselineAvg * 10) / 10,
      tsbValue: Math.round(tsb * 10) / 10,
      zone,
      zoneLabel
    });
  }

  return results;
}

/* ===================================================================
   8. Activity Validity Filter (C-4)
   =================================================================== */
export const VALID_ACTIVITY_THRESHOLDS = {
  minDistanceKm: 0.8,
  minAvgSpeedKmh: 4.0, // slower = walking/standing
  minDurationSeconds: 300, // under 5 min = warmup or accident
};

export function isValidActivity(activity: Activity): boolean {
  if (!activity.duration_s || activity.duration_s <= 0) return false;
  const avgSpeedMps = activity.distance_m / activity.duration_s;
  const avgSpeedKmh = avgSpeedMps * 3.6;
  return (
    activity.distance_m / 1000 >= VALID_ACTIVITY_THRESHOLDS.minDistanceKm &&
    avgSpeedKmh >= VALID_ACTIVITY_THRESHOLDS.minAvgSpeedKmh &&
    activity.duration_s >= VALID_ACTIVITY_THRESHOLDS.minDurationSeconds
  );
}

export function markTrainingBests(efforts: BestDistanceEffort[]): BestDistanceEffort[] {
  const processed: BestDistanceEffort[] = [];
  
  for (let i = 0; i < efforts.length; i++) {
    const eff = { ...efforts[i], isTrainingBest: false };
    if (i === 0) {
      processed.push(eff);
      continue;
    }
    
    const paceCandidate = eff.bestDurationS / (eff.distanceMeters / 1000); // sec/km
    
    let refEff = null;
    for (let j = i - 1; j >= 0; j--) {
      if (!processed[j].isTrainingBest) {
        refEff = processed[j];
        break;
      }
    }
    
    if (refEff) {
      const refPace = refEff.bestDurationS / (refEff.distanceMeters / 1000); // sec/km
      if (paceCandidate > refPace * 1.25) {
        eff.isTrainingBest = true;
      }
    }
    
    processed.push(eff);
  }
  
  return processed;
}



