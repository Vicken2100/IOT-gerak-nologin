import { Activity, Clock, Flame, MoonStar, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { runTimeOfDayBinning } from '../lib/peakHourProfiler';
import {
  formatDurationCompact,
  formatDurationHuman,
  getLocalDateKey,
  LogTriggerSource,
  TriggerSource,
  UsageLog,
} from '../types/lamp';

interface PeakHourProfileViewProps {
  logs: UsageLog[];
  loading: boolean;
  lampOn: boolean;
  activeSessionStartedAtMs: number;
  lastTriggerSource: TriggerSource;
  lampWatts: number;
  onGoToSimulator: () => void;
}

type DateScope = 'all' | '7d' | 'today';

export function PeakHourProfileView({
  logs,
  loading,
  lampOn,
  activeSessionStartedAtMs,
  lastTriggerSource,
  lampWatts,
  onGoToSimulator,
}: PeakHourProfileViewProps) {
  const [dateScope, setDateScope] = useState<DateScope>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | LogTriggerSource>('all');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [showOnlyActiveHours, setShowOnlyActiveHours] = useState(false);

  const todayKey = getLocalDateKey();
  const nowMs = Date.now();

  const scopedLogs = useMemo(() => {
    const sevenDaysAgoMs = nowMs - 7 * 86400 * 1000;
    return logs.filter((log) => {
      if (triggerFilter !== 'all' && log.triggerSource !== triggerFilter) return false;
      if (dateScope === 'today' && log.dateKey !== todayKey) return false;
      if (dateScope === '7d' && log.endedAtMs < sevenDaysAgoMs) return false;
      return true;
    });
  }, [logs, dateScope, triggerFilter, todayKey, nowMs]);

  const includeLiveSession =
    lampOn &&
    activeSessionStartedAtMs > 0 &&
    (triggerFilter === 'all' ||
      (lastTriggerSource === 'system' ? 'manual' : lastTriggerSource) === triggerFilter);

  const profile = useMemo(() => {
    return runTimeOfDayBinning(
      scopedLogs,
      includeLiveSession
        ? {
            active: true,
            startedAtMs: activeSessionStartedAtMs,
            nowMs,
            triggerSource: lastTriggerSource,
            watts: lampWatts,
          }
        : undefined
    );
  }, [scopedLogs, includeLiveSession, activeSessionStartedAtMs, nowMs, lastTriggerSource, lampWatts]);

  const maxHourSec = Math.max(10, ...profile.bins.map((b) => b.totalSeconds));
  const inspectedBin =
    selectedHour !== null
      ? profile.bins[selectedHour]
      : profile.peakHour ?? profile.bins[0];

  const visibleTableBins = showOnlyActiveHours
    ? profile.bins.filter((b) => b.totalSeconds > 0)
    : profile.bins;

  const formatTriggerName = (t: LogTriggerSource | null) => {
    if (t === 'motion') return 'Sensor Gerak';
    if (t === 'timer') return 'Timer';
    if (t === 'manual') return 'Manual';
    return '-';
  };

  return (
    <section className="space-y-6" aria-label="Hasil Algoritma Pemetaan 24 Jam">
      {/* Header + Scope Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Pemetaan 24 Jam (Time-of-Day Binning & Peak-Hour Profiling)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Algoritma memproyeksikan setiap interval log nyala–mati ke 24 slot jam untuk menemukan jam puncak dan pola waktu pemakaian.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Scope Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'Semua Hari' },
                { id: '7d', label: '7 Hari' },
                { id: 'today', label: 'Hari Ini' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDateScope(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  dateScope === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Trigger Source Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'Semua Pemicu' },
                { id: 'manual', label: 'Manual' },
                { id: 'motion', label: 'PIR' },
                { id: 'timer', label: 'Timer' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTriggerFilter(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  triggerFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="h-8 w-1/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-52 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      ) : profile.totalSeconds === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 px-5 text-center space-y-3">
          <p className="font-display text-base font-semibold text-slate-900">
            Belum ada data nyala–mati untuk dipetakan oleh algoritma 24 jam
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Jalankan minimal satu siklus lampu menyala lalu mati (melalui tombol dashboard, sensor gerak PIR, atau timer) agar algoritma dapat menghitung jam puncak dan distribusi waktu.
          </p>
          <button
            type="button"
            onClick={onGoToSimulator}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Buka Simulator & Uji Coba
          </button>
        </div>
      ) : (
        <>
          {/* 4-Column Algorithmic Output Strip */}
          <div className="rounded-xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                Jam Puncak (Peak Hour)
              </p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {profile.peakHour ? profile.peakHour.label : '--:--'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {profile.peakHour
                  ? `${formatDurationHuman(profile.peakHour.totalSeconds)} · ${profile.peakHour.sharePct.toFixed(1)}% total`
                  : 'Tidak ada data'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-600" />
                Jendela Tersibuk (3 Jam)
              </p>
              <p className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1.5">
                {profile.peakWindow3H ? profile.peakWindow3H.label : '--:--'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {profile.peakWindow3H
                  ? `${formatDurationHuman(profile.peakWindow3H.totalSeconds)} (${profile.peakWindow3H.sharePct.toFixed(1)}%)`
                  : '-'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <MoonStar className="w-3.5 h-3.5 text-cyan-700" />
                Jam Paling Sepi
              </p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {profile.quietestHour ? profile.quietestHour.label : '--:--'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {profile.quietestHour
                  ? `${formatDurationHuman(profile.quietestHour.totalSeconds)} tercatat`
                  : '-'}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-emerald-700" />
                Zona Waktu Dominan
              </p>
              <p className="font-display text-xl font-bold text-slate-900 mt-1.5">
                {profile.dominantPeriod ? profile.dominantPeriod.label : '-'}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {profile.dominantPeriod
                  ? `${profile.dominantPeriod.range} · ${profile.dominantPeriod.sharePct.toFixed(1)}%`
                  : '-'}
              </p>
            </div>
          </div>

          {/* 24-Hour Bar Histogram + Selected Hour Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Distribusi Intensitas Nyala per Jam (00:00 – 23:00)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klik salah satu batang jam untuk melihat rincian pemicu dan energinya
                  </p>
                </div>

                <div className="flex items-center gap-3.5 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                    Manual
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-cyan-600" />
                    PIR
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-700" />
                    Timer
                  </span>
                </div>
              </div>

              <div className="h-60 flex items-end gap-1 pt-5 pb-2 border-b border-slate-200 overflow-x-auto">
                {profile.bins.map((bin) => {
                  const totalPct = (bin.totalSeconds / maxHourSec) * 100;
                  const denom = Math.max(1, bin.totalSeconds);
                  const manualPct = (bin.manualSeconds / denom) * 100;
                  const motionPct = (bin.motionSeconds / denom) * 100;
                  const timerPct = (bin.timerSeconds / denom) * 100;
                  const isPeak = profile.peakHour?.hour === bin.hour && bin.totalSeconds > 0;
                  const isSelected = inspectedBin?.hour === bin.hour;

                  return (
                    <button
                      key={bin.hour}
                      type="button"
                      onClick={() => setSelectedHour(bin.hour)}
                      title={`${bin.rangeLabel}: ${formatDurationHuman(bin.totalSeconds)}`}
                      className={`flex-1 min-w-[20px] h-full flex flex-col items-center justify-end rounded-t-md px-0.5 pt-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50/90 ring-1 ring-amber-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {isPeak && (
                        <span className="text-[9px] font-mono font-bold text-amber-700 mb-1">
                          MAX
                        </span>
                      )}
                      <div className="w-full h-40 bg-slate-100 rounded-t-sm flex flex-col justify-end overflow-hidden border border-slate-200/70">
                        {bin.totalSeconds > 0 && (
                          <div
                            className="w-full flex flex-col justify-end transition-all duration-300"
                            style={{ height: `${Math.max(4, totalPct)}%` }}
                          >
                            {timerPct > 0 && (
                              <div className="w-full bg-slate-700" style={{ height: `${timerPct}%` }} />
                            )}
                            {motionPct > 0 && (
                              <div className="w-full bg-cyan-600" style={{ height: `${motionPct}%` }} />
                            )}
                            {manualPct > 0 && (
                              <div className="w-full bg-amber-500" style={{ height: `${manualPct}%` }} />
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className={`mt-1.5 text-[10px] font-mono tabular-nums ${
                          isSelected || isPeak
                            ? 'font-bold text-slate-900'
                            : 'text-slate-500'
                        }`}
                      >
                        {String(bin.hour).padStart(2, '0')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Inspected Hour + 4-Period Breakdown */}
            <div className="lg:col-span-4 space-y-5">
              {/* Selected Hour Inspector */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Detail Slot Jam Terpilih</p>
                    <h3 className="font-mono text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                      {inspectedBin.rangeLabel}
                    </h3>
                  </div>
                  <Activity className="w-4 h-4 text-amber-600" />
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Durasi Nyala</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {formatDurationCompact(inspectedBin.totalSeconds)} ({inspectedBin.sharePct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Frekuensi Dipicu</span>
                    <span className="font-mono font-medium text-slate-900 tabular-nums">
                      {inspectedBin.triggerCount} kali
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Manual Dashboard</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {formatDurationCompact(inspectedBin.manualSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sensor Gerak PIR</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {formatDurationCompact(inspectedBin.motionSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timer Otomatis</span>
                    <span className="font-mono text-slate-800 tabular-nums">
                      {formatDurationCompact(inspectedBin.timerSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-500">Estimasi Energi</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {inspectedBin.wh.toFixed(2)} Wh
                    </span>
                  </div>
                </div>
              </div>

              {/* 4-Period Distribution */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3.5">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Ringkasan 4 Zona Waktu
                </h3>

                <div className="space-y-3">
                  {profile.periods.map((p) => (
                    <div key={p.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800">
                          {p.label}{' '}
                          <span className="text-slate-400 font-mono text-[11px]">({p.range})</span>
                        </span>
                        <span className="font-mono text-slate-700 tabular-nums">
                          {formatDurationCompact(p.totalSeconds)} · {p.sharePct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, p.sharePct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 24-Hour Tabular Matrix */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Tabel Hasil Binning 24 Jam
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menganalisis {profile.totalSessionsAnalyzed} sesi pemakaian ({formatDurationHuman(profile.totalSeconds)} total)
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowOnlyActiveHours((v) => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                {showOnlyActiveHours ? 'Tampilkan Semua 24 Jam' : 'Hanya Jam yang Aktif'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-5 font-medium">Slot Jam</th>
                    <th className="py-2.5 px-4 font-medium text-right">Frekuensi</th>
                    <th className="py-2.5 px-4 font-medium text-right">Manual</th>
                    <th className="py-2.5 px-4 font-medium text-right">PIR</th>
                    <th className="py-2.5 px-4 font-medium text-right">Timer</th>
                    <th className="py-2.5 px-4 font-medium">Pemicu Utama</th>
                    <th className="py-2.5 px-4 font-medium text-right">Total Durasi</th>
                    <th className="py-2.5 px-5 font-medium text-right">Porsi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTableBins.map((bin) => {
                    const isPeak = profile.peakHour?.hour === bin.hour && bin.totalSeconds > 0;
                    const isSelected = inspectedBin?.hour === bin.hour;

                    return (
                      <tr
                        key={bin.hour}
                        onClick={() => setSelectedHour(bin.hour)}
                        className={`h-9 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-50/80'
                            : isPeak
                              ? 'bg-amber-50/40 hover:bg-amber-50/70'
                              : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-5 font-mono font-medium text-slate-900">
                          {bin.rangeLabel} {isPeak ? '· Puncak' : ''}
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-700">
                          {bin.triggerCount}x
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-600">
                          {formatDurationCompact(bin.manualSeconds)}
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-600">
                          {formatDurationCompact(bin.motionSeconds)}
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-600">
                          {formatDurationCompact(bin.timerSeconds)}
                        </td>
                        <td className="px-4 text-slate-700">
                          {formatTriggerName(bin.dominantTrigger)}
                        </td>
                        <td className="px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                          {formatDurationCompact(bin.totalSeconds)}
                        </td>
                        <td className="px-5 text-right font-mono tabular-nums text-slate-700">
                          {bin.sharePct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
