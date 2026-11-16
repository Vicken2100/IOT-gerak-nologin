import { Clock, Eye, Power, ShieldAlert, Timer } from 'lucide-react';
import { useState } from 'react';
import { formatDurationCompact, LampDevice } from '../types/lamp';

interface ControlPanelProps {
  device: LampDevice;
  sessionElapsedSec: number;
  timerRemainingSec: number;
  motionHoldRemainingSec: number | null;
  onToggleLamp: (nextOn: boolean) => void;
  onToggleStandby: (nextStandby: boolean) => void;
  onUpdateMotionHold: (seconds: number) => void;
  onUpdateTimerConfig: (enabled: boolean, durationSeconds: number) => void;
  onAddTimerMinute: () => void;
  onCancelActiveTimer: () => void;
}

const TIMER_PRESETS = [
  { label: '10 dtk (Uji)', seconds: 10 },
  { label: '1 mnt', seconds: 60 },
  { label: '5 mnt', seconds: 300 },
  { label: '15 mnt', seconds: 900 },
  { label: '30 mnt', seconds: 1800 },
  { label: '60 mnt', seconds: 3600 },
];

const MOTION_HOLD_PRESETS = [
  { label: '10 dtk', seconds: 10 },
  { label: '30 dtk', seconds: 30 },
  { label: '1 mnt', seconds: 60 },
  { label: '5 mnt', seconds: 300 },
];

export function ControlPanel({
  device,
  sessionElapsedSec,
  timerRemainingSec,
  motionHoldRemainingSec,
  onToggleLamp,
  onToggleStandby,
  onUpdateMotionHold,
  onUpdateTimerConfig,
  onAddTimerMinute,
  onCancelActiveTimer,
}: ControlPanelProps) {
  const [customMinutes, setCustomMinutes] = useState<string>('2');

  const triggerText =
    device.lastTriggerSource === 'motion'
      ? 'Sensor Gerak PIR'
      : device.lastTriggerSource === 'timer'
        ? 'Timer Otomatis'
        : 'Tombol Dashboard';

  const handleApplyCustomMinutes = () => {
    const parsed = Number.parseFloat(customMinutes);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const clampedSec = Math.min(86400, Math.max(5, Math.round(parsed * 60)));
    onUpdateTimerConfig(true, clampedSec);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* 1. Saklar Utama Lampu */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Kontrol Saklar Utama</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                {device.lampOn ? 'Lampu Menyala' : 'Lampu Mati'}
              </h3>
            </div>
            <span
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-md border ${
                device.lampOn
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              {device.lampOn ? 'ON' : 'OFF'}
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block">Durasi Sesi</span>
              <span className="font-mono text-base font-semibold text-slate-900 tabular-nums mt-0.5 block">
                {device.lampOn ? formatDurationCompact(sessionElapsedSec) : '00:00'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Pemicu Terakhir</span>
              <span className="font-medium text-slate-800 mt-1 block truncate">{triggerText}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleLamp(!device.lampOn)}
          className={`w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            device.lampOn
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
          }`}
        >
          <Power className="w-4 h-4" />
          <span>{device.lampOn ? 'Matikan Lampu Sekarang' : 'Nyalakan Lampu Sekarang'}</span>
        </button>
      </div>

      {/* 2. Mode Siaga (Sensor Gerak PIR Otomatis) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Otomasi Sensor Gerak</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                Mode Siaga PIR
              </h3>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={device.standbyMode}
              onClick={() => onToggleStandby(!device.standbyMode)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                device.standbyMode ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
              aria-label="Aktifkan atau matikan Mode Siaga sensor gerak"
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  device.standbyMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mt-2">
            {device.standbyMode
              ? 'Aktif: ESP Lolin otomatis menyalakan lampu saat sensor PIR mendeteksi gerakan dan memadamkannya setelah jeda tenang.'
              : 'Nonaktif: Sensor gerak tetap terbaca di simulator, tetapi tidak akan menyalakan lampu secara otomatis.'}
          </p>

          <div className="mt-4 pt-3.5 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                Jeda Padam Tanpa Gerakan
              </span>
              <span className="font-mono text-slate-800 tabular-nums">
                {device.motionHoldSeconds} dtk
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MOTION_HOLD_PRESETS.map((preset) => (
                <button
                  key={preset.seconds}
                  type="button"
                  onClick={() => onUpdateMotionHold(preset.seconds)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    device.motionHoldSeconds === preset.seconds
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between">
          <span className="text-slate-600">
            {device.motionDetected
              ? 'Gerakan terdeteksi saat ini'
              : motionHoldRemainingSec !== null && device.lampOn && device.standbyMode
                ? 'Menunggu jeda padam otomatis'
                : 'Belum ada pemicu gerak aktif'}
          </span>
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {motionHoldRemainingSec !== null && device.lampOn && device.standbyMode
              ? formatDurationCompact(motionHoldRemainingSec)
              : device.standbyMode
                ? 'SIAGA'
                : 'MATI'}
          </span>
        </div>
      </div>

      {/* 3. Fitur Timer Otomatis */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Pemadaman Terjadwal</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                Timer Otomatis
              </h3>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={device.timerEnabled}
              onClick={() => onUpdateTimerConfig(!device.timerEnabled, device.timerDurationSeconds)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                device.timerEnabled ? 'bg-amber-500' : 'bg-slate-300'
              }`}
              aria-label="Aktifkan timer otomatis saat menyalakan lampu"
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                  device.timerEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mt-2">
            {device.timerEnabled
              ? 'Saat lampu dinyalakan, timer akan otomatis menghitung mundur dan mematikan relay sesuai durasi.'
              : 'Aktifkan saklar ini agar setiap kali lampu dinyalakan, timer mati otomatis langsung berjalan.'}
          </p>

          <div className="mt-3.5 pt-3.5 border-t border-slate-100">
            <div className="grid grid-cols-3 gap-1.5">
              {TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.seconds}
                  type="button"
                  onClick={() => onUpdateTimerConfig(true, preset.seconds)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    device.timerDurationSeconds === preset.seconds && device.timerEnabled
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min={0.1}
                  max={1440}
                  step="0.5"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-slate-400"
                  aria-label="Durasi timer kustom dalam menit"
                />
                <span className="absolute right-2.5 top-1.5 text-[11px] text-slate-400">mnt</span>
              </div>
              <button
                type="button"
                onClick={handleApplyCustomMinutes}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>

        {/* Active Timer Countdown Readout */}
        {device.lampOn && timerRemainingSec > 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-900">
              <Timer className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Mati dalam</span>
              <span className="font-mono font-bold tabular-nums">
                {formatDurationCompact(timerRemainingSec)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onAddTimerMinute}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                +1m
              </button>
              <button
                type="button"
                onClick={onCancelActiveTimer}
                className="px-2 py-1 rounded text-[11px] font-medium text-amber-800 hover:bg-amber-200/60 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Durasi Terpilih
            </span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {formatDurationCompact(device.timerDurationSeconds)}
            </span>
          </div>
        )}
      </div>

      {/* Warning banner if ESP offline in simulator */}
      {!device.espOnline && (
        <div className="lg:col-span-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 flex items-center gap-2.5 text-xs text-rose-800">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>
            Simulasi Wi-Fi ESP sedang dalam status terputus. Perintah jarak jauh tetap tercatat di dashboard dan akan disinkronkan begitu koneksi Wi-Fi ESP kembali aktif.
          </span>
        </div>
      )}
    </div>
  );
}
