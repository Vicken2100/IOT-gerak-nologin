import { LogTriggerSource, TriggerSource, UsageLog } from '../types/lamp';

export interface HourBin {
  hour: number; // 0..23
  label: string; // "00:00"
  rangeLabel: string; // "00:00 - 01:00"
  totalSeconds: number;
  manualSeconds: number;
  motionSeconds: number;
  timerSeconds: number;
  triggerCount: number;
  wh: number;
  sharePct: number;
  dominantTrigger: LogTriggerSource | null;
}

export interface DayPeriodStat {
  id: 'dawn' | 'morning' | 'afternoon' | 'night';
  label: string;
  range: string;
  totalSeconds: number;
  sharePct: number;
  wh: number;
}

export interface PeakWindow3H {
  startHour: number;
  endHour: number;
  label: string;
  totalSeconds: number;
  sharePct: number;
}

export interface PeakHourProfileResult {
  bins: HourBin[];
  totalSeconds: number;
  totalWh: number;
  totalSessionsAnalyzed: number;
  peakHour: HourBin | null;
  quietestHour: HourBin | null;
  peakWindow3H: PeakWindow3H | null;
  periods: DayPeriodStat[];
  dominantPeriod: DayPeriodStat | null;
}

export interface LiveSessionInput {
  active: boolean;
  startedAtMs: number;
  nowMs: number;
  triggerSource: TriggerSource;
  watts: number;
}

function getLocalHourStartMs(epochMs: number): number {
  const d = new Date(epochMs);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function runTimeOfDayBinning(
  logs: UsageLog[],
  liveSession?: LiveSessionInput
): PeakHourProfileResult {
  const rawBins = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    rangeLabel: `${String(hour).padStart(2, '0')}:00 - ${String((hour + 1) % 24).padStart(2, '0')}:00`,
    totalSeconds: 0,
    manualSeconds: 0,
    motionSeconds: 0,
    timerSeconds: 0,
    triggerCount: 0,
    wh: 0,
  }));

  interface IntervalItem {
    startMs: number;
    endMs: number;
    trigger: LogTriggerSource;
    watts: number;
  }

  const intervals: IntervalItem[] = logs
    .filter((l) => l.endedAtMs > l.startedAtMs)
    .map((l) => ({
      startMs: l.startedAtMs,
      endMs: l.endedAtMs,
      trigger: l.triggerSource,
      watts: l.watts,
    }));

  if (
    liveSession &&
    liveSession.active &&
    liveSession.startedAtMs > 0 &&
    liveSession.nowMs > liveSession.startedAtMs
  ) {
    intervals.push({
      startMs: liveSession.startedAtMs,
      endMs: liveSession.nowMs,
      trigger: liveSession.triggerSource === 'system' ? 'manual' : liveSession.triggerSource,
      watts: liveSession.watts,
    });
  }

  // Project each [startMs, endMs] interval across exact local hour boundaries
  for (const item of intervals) {
    let cursor = item.startMs;
    let isFirstSlice = true;

    // Guard against corrupted extremely long intervals (> 30 days)
    const maxEnd = Math.min(item.endMs, item.startMs + 30 * 86400 * 1000);

    while (cursor < maxEnd) {
      const hourStart = getLocalHourStartMs(cursor);
      const nextHourStart = hourStart + 3600 * 1000;
      const sliceEnd = Math.min(maxEnd, nextHourStart);
      const sliceSec = Math.max(0, (sliceEnd - cursor) / 1000);

      const hourIdx = new Date(cursor).getHours();
      const bin = rawBins[hourIdx];

      bin.totalSeconds += sliceSec;
      bin.wh += (sliceSec / 3600) * item.watts;

      if (item.trigger === 'manual') bin.manualSeconds += sliceSec;
      if (item.trigger === 'motion') bin.motionSeconds += sliceSec;
      if (item.trigger === 'timer') bin.timerSeconds += sliceSec;

      if (isFirstSlice) {
        bin.triggerCount += 1;
        isFirstSlice = false;
      }

      cursor = sliceEnd;
    }
  }

  const totalSeconds = rawBins.reduce((sum, b) => sum + b.totalSeconds, 0);
  const totalWh = rawBins.reduce((sum, b) => sum + b.wh, 0);

  const bins: HourBin[] = rawBins.map((b) => {
    let dominantTrigger: LogTriggerSource | null = null;
    if (b.totalSeconds > 0) {
      if (b.motionSeconds >= b.manualSeconds && b.motionSeconds >= b.timerSeconds) {
        dominantTrigger = 'motion';
      } else if (b.timerSeconds >= b.manualSeconds && b.timerSeconds >= b.motionSeconds) {
        dominantTrigger = 'timer';
      } else {
        dominantTrigger = 'manual';
      }
    }

    return {
      ...b,
      totalSeconds: Math.round(b.totalSeconds),
      manualSeconds: Math.round(b.manualSeconds),
      motionSeconds: Math.round(b.motionSeconds),
      timerSeconds: Math.round(b.timerSeconds),
      sharePct: totalSeconds > 0 ? (b.totalSeconds / totalSeconds) * 100 : 0,
      dominantTrigger,
    };
  });

  // Identify Peak Hour and Quietest Hour
  let peakHour: HourBin | null = null;
  let quietestHour: HourBin | null = null;

  if (totalSeconds > 0) {
    peakHour = bins.reduce((best, curr) =>
      curr.totalSeconds > best.totalSeconds ? curr : best
    );
    quietestHour = bins.reduce((lowest, curr) =>
      curr.totalSeconds < lowest.totalSeconds ? curr : lowest
    );
  }

  // Sliding 3-hour circular window to find the busiest contiguous 3-hour block
  let peakWindow3H: PeakWindow3H | null = null;
  if (totalSeconds > 0) {
    let bestSum = -1;
    let bestStart = 0;
    for (let h = 0; h < 24; h++) {
      const windowSec =
        bins[h].totalSeconds +
        bins[(h + 1) % 24].totalSeconds +
        bins[(h + 2) % 24].totalSeconds;
      if (windowSec > bestSum) {
        bestSum = windowSec;
        bestStart = h;
      }
    }
    const endHour = (bestStart + 3) % 24;
    peakWindow3H = {
      startHour: bestStart,
      endHour,
      label: `${String(bestStart).padStart(2, '0')}:00 – ${String(endHour).padStart(2, '0')}:00`,
      totalSeconds: bestSum,
      sharePct: (bestSum / totalSeconds) * 100,
    };
  }

  // 4-part 6-hour period distribution
  const periodDefs: Array<{
    id: DayPeriodStat['id'];
    label: string;
    range: string;
    hours: number[];
  }> = [
    { id: 'dawn', label: 'Dini Hari', range: '00:00 – 05:59', hours: [0, 1, 2, 3, 4, 5] },
    { id: 'morning', label: 'Pagi', range: '06:00 – 11:59', hours: [6, 7, 8, 9, 10, 11] },
    { id: 'afternoon', label: 'Siang / Sore', range: '12:00 – 17:59', hours: [12, 13, 14, 15, 16, 17] },
    { id: 'night', label: 'Malam', range: '18:00 – 23:59', hours: [18, 19, 20, 21, 22, 23] },
  ];

  const periods: DayPeriodStat[] = periodDefs.map((def) => {
    const sec = def.hours.reduce((acc, h) => acc + bins[h].totalSeconds, 0);
    const wh = def.hours.reduce((acc, h) => acc + bins[h].wh, 0);
    return {
      id: def.id,
      label: def.label,
      range: def.range,
      totalSeconds: sec,
      sharePct: totalSeconds > 0 ? (sec / totalSeconds) * 100 : 0,
      wh,
    };
  });

  const dominantPeriod =
    totalSeconds > 0
      ? periods.reduce((best, curr) => (curr.totalSeconds > best.totalSeconds ? curr : best))
      : null;

  return {
    bins,
    totalSeconds: Math.round(totalSeconds),
    totalWh,
    totalSessionsAnalyzed: intervals.length,
    peakHour,
    quietestHour,
    peakWindow3H,
    periods,
    dominantPeriod,
  };
}
