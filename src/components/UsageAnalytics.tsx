import { Calendar, Download, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatDurationCompact,
  formatDurationHuman,
  getLocalDateKey,
  LogTriggerSource,
  UsageLog,
} from '../types/lamp';

interface UsageAnalyticsProps {
  logs: UsageLog[];
  loading: boolean;
  lampOn: boolean;
  sessionElapsedSec: number;
  lampWatts: number;
  onDeleteLog: (logId: string) => void;
}

interface DailyRow {
  dateKey: string;
  totalSeconds: number;
  manualSeconds: number;
  motionSeconds: number;
  timerSeconds: number;
  sessionCount: number;
  wh: number;
}

export function UsageAnalytics({
  logs,
  loading,
  lampOn,
  sessionElapsedSec,
  lampWatts,
  onDeleteLog,
}: UsageAnalyticsProps) {
  const [sourceFilter, setSourceFilter] = useState<'all' | LogTriggerSource>('all');
  const [selectedDate, setSelectedDate] = useState<string>('all');

  const todayKey = getLocalDateKey();

  // Compute last 7 calendar days for the daily chart
  const last7Days = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(getLocalDateKey(d));
    }
    return keys;
  }, []);

  const dailySummaryMap = useMemo(() => {
    const map = new Map<string, DailyRow>();
    for (const key of last7Days) {
      map.set(key, {
        dateKey: key,
        totalSeconds: 0,
        manualSeconds: 0,
        motionSeconds: 0,
        timerSeconds: 0,
        sessionCount: 0,
        wh: 0,
      });
    }

    for (const log of logs) {
      const existing = map.get(log.dateKey) ?? {
        dateKey: log.dateKey,
        totalSeconds: 0,
        manualSeconds: 0,
        motionSeconds: 0,
        timerSeconds: 0,
        sessionCount: 0,
        wh: 0,
      };
      existing.totalSeconds += log.durationSeconds;
      existing.sessionCount += 1;
      existing.wh += (log.durationSeconds / 3600) * log.watts;
      if (log.triggerSource === 'manual') existing.manualSeconds += log.durationSeconds;
      if (log.triggerSource === 'motion') existing.motionSeconds += log.durationSeconds;
      if (log.triggerSource === 'timer') existing.timerSeconds += log.durationSeconds;
      map.set(log.dateKey, existing);
    }

    return map;
  }, [logs, last7Days]);

  const chartDays = useMemo(() => {
    return last7Days.map((key) => {
      const base = dailySummaryMap.get(key)!;
      const liveExtra = key === todayKey && lampOn ? sessionElapsedSec : 0;
      return {
        ...base,
        displayTotalSeconds: base.totalSeconds + liveExtra,
      };
    });
  }, [last7Days, dailySummaryMap, todayKey, lampOn, sessionElapsedSec]);

  const maxChartSeconds = Math.max(60, ...chartDays.map((d) => d.displayTotalSeconds));

  const todayRow = dailySummaryMap.get(todayKey);
  const todaySeconds = (todayRow?.totalSeconds ?? 0) + (lampOn ? sessionElapsedSec : 0);
  const todaySessions = (todayRow?.sessionCount ?? 0) + (lampOn ? 1 : 0);
  const todayWh = (todaySeconds / 3600) * lampWatts;

  const sevenDayTotalSeconds = chartDays.reduce((acc, d) => acc + d.displayTotalSeconds, 0);

  const sortedDailyRows = useMemo(() => {
    return Array.from(dailySummaryMap.values())
      .filter((r) => r.sessionCount > 0 || r.dateKey === todayKey)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [dailySummaryMap, todayKey]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (sourceFilter !== 'all' && log.triggerSource !== sourceFilter) return false;
      if (selectedDate !== 'all' && log.dateKey !== selectedDate) return false;
      return true;
    });
  }, [logs, sourceFilter, selectedDate]);

  const handleExportCsv = () => {
    const headers = ['Tanggal', 'Waktu Mulai', 'Waktu Selesai', 'Durasi (Detik)', 'Pemicu', 'Alasan Mati', 'Daya (W)'];
    const rows = filteredLogs.map((log) => [
      log.dateKey,
      new Date(log.startedAtMs).toLocaleTimeString('id-ID'),
      new Date(log.endedAtMs).toLocaleTimeString('id-ID'),
      String(log.durationSeconds),
      log.triggerSource,
      log.endReason,
      String(log.watts),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `log_pemakaian_lolin_${todayKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTriggerLabel = (src: LogTriggerSource) => {
    if (src === 'motion') return 'Sensor Gerak';
    if (src === 'timer') return 'Timer';
    return 'Manual';
  };

  const formatEndReasonLabel = (reason: UsageLog['endReason']) => {
    if (reason === 'timer_expired') return 'Timer Habis';
    if (reason === 'motion_timeout') return 'Tanpa Gerakan';
    if (reason === 'standby_off') return 'Mode Siaga Mati';
    return 'Tombol Manual';
  };

  return (
    <section className="space-y-6" aria-label="Log Durasi Pemakaian Harian">
      {/* 4-column Summary Metric Strip */}
      <div className="rounded-xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pemakaian Hari Ini</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatDurationCompact(todaySeconds)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{formatDurationHuman(todaySeconds)}</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Sesi Hari Ini</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {todaySessions}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {lampOn ? 'Termasuk 1 sesi aktif' : 'Semua sesi selesai'}
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Estimasi Energi Hari Ini</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {todayWh.toFixed(2)} <span className="text-sm font-medium text-slate-500">Wh</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">Beban lampu {lampWatts} Watt</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Akumulasi 7 Hari</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatDurationHuman(sevenDayTotalSeconds)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Total durasi tercatat</p>
        </div>
      </div>

      {/* 7-Day Daily Usage Bar Chart + Daily Summary Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Grafik Durasi Pemakaian 7 Hari Terakhir
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik batang hari untuk menyaring tabel sesi di bawah
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                Manual
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-cyan-600" />
                Sensor Gerak
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-700" />
                Timer
              </span>
            </div>
          </div>

          <div className="h-52 flex items-end gap-3 pt-4 border-b border-slate-200 pb-2">
            {chartDays.map((day) => {
              const totalPct = Math.min(100, (day.displayTotalSeconds / maxChartSeconds) * 100);
              const isSelected = selectedDate === day.dateKey;
              const liveExtra = day.dateKey === todayKey && lampOn ? sessionElapsedSec : 0;
              const manualTotal = day.manualSeconds + liveExtra;
              const denom = Math.max(1, day.displayTotalSeconds);
              const manualPct = (manualTotal / denom) * 100;
              const motionPct = (day.motionSeconds / denom) * 100;
              const timerPct = (day.timerSeconds / denom) * 100;
              const shortLabel = day.dateKey.slice(5); // MM-DD

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() =>
                    setSelectedDate((prev) => (prev === day.dateKey ? 'all' : day.dateKey))
                  }
                  className={`flex-1 h-full flex flex-col items-center justify-end group cursor-pointer rounded-md px-1 pt-2 transition-colors ${
                    isSelected ? 'bg-amber-50/80' : 'hover:bg-slate-50'
                  }`}
                  title={`${day.dateKey}: ${formatDurationHuman(day.displayTotalSeconds)}`}
                >
                  <span className="text-[11px] font-mono text-slate-600 tabular-nums mb-1.5">
                    {day.displayTotalSeconds > 0 ? formatDurationCompact(day.displayTotalSeconds) : '00:00'}
                  </span>
                  <div className="w-full max-w-[40px] h-32 bg-slate-100 rounded-t-md flex flex-col justify-end overflow-hidden border border-slate-200/70">
                    {day.displayTotalSeconds > 0 && (
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
                    className={`mt-2 text-[11px] font-mono tabular-nums ${
                      day.dateKey === todayKey
                        ? 'font-bold text-slate-900'
                        : 'text-slate-500 group-hover:text-slate-800'
                    }`}
                  >
                    {day.dateKey === todayKey ? 'Hari Ini' : shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Breakdown Summary Table */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Rekap Durasi Per Hari
            </h3>
            <Calendar className="w-4 h-4 text-slate-400" />
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Tanggal</th>
                  <th className="py-2.5 px-3 font-medium text-right">Sesi</th>
                  <th className="py-2.5 px-3 font-medium text-right">Durasi</th>
                  <th className="py-2.5 px-4 font-medium text-right">Energi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDailyRows.map((row) => {
                  const isToday = row.dateKey === todayKey;
                  const totalSec = row.totalSeconds + (isToday && lampOn ? sessionElapsedSec : 0);
                  const totalSessions = row.sessionCount + (isToday && lampOn ? 1 : 0);
                  const totalWh = (totalSec / 3600) * lampWatts;

                  return (
                    <tr
                      key={row.dateKey}
                      onClick={() =>
                        setSelectedDate((prev) => (prev === row.dateKey ? 'all' : row.dateKey))
                      }
                      className={`h-10 transition-colors cursor-pointer ${
                        selectedDate === row.dateKey
                          ? 'bg-amber-50/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-4 font-mono text-slate-800">
                        {row.dateKey} {isToday ? '· Hari Ini' : ''}
                      </td>
                      <td className="px-3 text-right font-mono tabular-nums text-slate-700">
                        {totalSessions}
                      </td>
                      <td className="px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatDurationCompact(totalSec)}
                      </td>
                      <td className="px-4 text-right font-mono tabular-nums text-slate-600">
                        {totalWh.toFixed(2)} Wh
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed Session Log Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Riwayat Sesi Lampu Menyala
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedDate === 'all'
                ? 'Menampilkan seluruh tanggal tercatat'
                : `Menampilkan tanggal ${selectedDate}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Filter Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'manual', label: 'Manual' },
                  { id: 'motion', label: 'Sensor Gerak' },
                  { id: 'timer', label: 'Timer' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    sourceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {selectedDate !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedDate('all')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Reset Tanggal
              </button>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-10 rounded-md bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 px-5 text-center">
            <p className="text-sm font-medium text-slate-800">
              Belum ada log durasi pemakaian yang selesai
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Nyalakan lalu matikan lampu melalui tombol dashboard, sensor gerak PIR, atau timer otomatis untuk mencatat sesi pemakaian harian pertama Anda.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-5 font-medium">Tanggal</th>
                  <th className="py-2.5 px-4 font-medium">Waktu Nyala</th>
                  <th className="py-2.5 px-4 font-medium">Waktu Mati</th>
                  <th className="py-2.5 px-4 font-medium">Pemicu</th>
                  <th className="py-2.5 px-4 font-medium">Alasan Padam</th>
                  <th className="py-2.5 px-4 font-medium text-right">Durasi</th>
                  <th className="py-2.5 px-5 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="h-10 hover:bg-slate-50 transition-colors">
                    <td className="px-5 font-mono text-slate-700">{log.dateKey}</td>
                    <td className="px-4 font-mono tabular-nums text-slate-700">
                      {new Date(log.startedAtMs).toLocaleTimeString('id-ID')}
                    </td>
                    <td className="px-4 font-mono tabular-nums text-slate-700">
                      {new Date(log.endedAtMs).toLocaleTimeString('id-ID')}
                    </td>
                    <td className="px-4 font-medium text-slate-800">
                      {formatTriggerLabel(log.triggerSource)}
                    </td>
                    <td className="px-4 text-slate-600">{formatEndReasonLabel(log.endReason)}</td>
                    <td className="px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatDurationCompact(log.durationSeconds)}
                    </td>
                    <td className="px-5 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        aria-label={`Hapus log sesi ${log.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
