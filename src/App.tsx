import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Cloud, Cpu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { HardwareSimulator } from './components/HardwareSimulator';
import { PeakHourProfileView } from './components/PeakHourProfileView';
import { UsageAnalytics } from './components/UsageAnalytics';
import { WiringAndCodeView } from './components/WiringAndCodeView';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  BoardModel,
  EndReason,
  getLocalDateKey,
  LampDevice,
  LogTriggerSource,
  PirPin,
  RelayPin,
  TriggerSource,
  UsageLog,
} from './types/lamp';

type ActiveTab = 'simulator' | 'logs' | 'profile' | 'wiring';

const DEFAULT_DEVICE_ID = 'lolin-lamp-01';
const STORAGE_KEY_DEVICE_ID = 'lolin_active_device_id';

function buildDefaultDevice(deviceId: string): LampDevice {
  return {
    id: deviceId,
    name: 'Lampu Teras ESP Lolin',
    boardModel: 'LOLIN_NODEMCU_V3',
    lampOn: false,
    standbyMode: true,
    motionDetected: false,
    motionHoldSeconds: 10,
    timerEnabled: false,
    timerDurationSeconds: 60,
    timerEndsAtMs: 0,
    lastTriggerSource: 'manual',
    activeSessionStartedAtMs: 0,
    pirPin: 'D5',
    relayPin: 'D1',
    relayActiveLow: true,
    wifiSsid: 'WiFi-Rumah-2.4G',
    espOnline: true,
  };
}

function getInitialDeviceId(): string {
  const urlParam = new URLSearchParams(window.location.search).get('device');
  if (urlParam && /^[a-zA-Z0-9_-]{1,64}$/.test(urlParam)) {
    return urlParam;
  }
  const saved = window.localStorage.getItem(STORAGE_KEY_DEVICE_ID);
  if (saved && /^[a-zA-Z0-9_-]{1,64}$/.test(saved)) {
    return saved;
  }
  return DEFAULT_DEVICE_ID;
}

const LAMP_WATTS = 12;

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [deviceId, setDeviceId] = useState<string>(getInitialDeviceId);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [deviceInput, setDeviceInput] = useState<string>(deviceId);

  const [device, setDevice] = useState<LampDevice>(() => buildDefaultDevice(deviceId));
  const [cloudConnected, setCloudConnected] = useState(false);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [motionLatched, setMotionLatched] = useState(false);
  const [motionHoldDeadlineMs, setMotionHoldDeadlineMs] = useState<number | null>(null);

  const pulseTimeoutRef = useRef<number | null>(null);
  const autoOffGuardRef = useRef<boolean>(false);

  // 1. Direct real-time Firestore subscription for active Device & its Usage Logs (NO LOGIN REQUIRED)
  useEffect(() => {
    setLogsLoading(true);
    setCloudConnected(false);

    const deviceRef = doc(db, 'devices', deviceId);
    const devicePath = `devices/${deviceId}`;

    const unsubDevice = onSnapshot(
      deviceRef,
      async (snap) => {
        if (!snap.exists()) {
          const initialPayload: LampDevice = {
            ...buildDefaultDevice(deviceId),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          try {
            await setDoc(deviceRef, initialPayload);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, devicePath);
          }
          return;
        }

        const remote = snap.data() as LampDevice;
        setDevice(remote);
        setCloudConnected(true);
      },
      (err) => {
        setCloudConnected(false);
        handleFirestoreError(err, OperationType.GET, devicePath);
      }
    );

    const logsPath = `devices/${deviceId}/usageLogs`;
    const logsQuery = query(
      collection(db, 'devices', deviceId, 'usageLogs'),
      where('deviceId', '==', deviceId),
      limit(300)
    );

    const unsubLogs = onSnapshot(
      logsQuery,
      (logSnap) => {
        const items = logSnap.docs
          .map((d) => d.data() as UsageLog)
          .sort((a, b) => b.endedAtMs - a.endedAtMs);
        setLogs(items);
        setLogsLoading(false);
      },
      (err) => {
        setLogsLoading(false);
        handleFirestoreError(err, OperationType.LIST, logsPath);
      }
    );

    return () => {
      unsubDevice();
      unsubLogs();
    };
  }, [deviceId]);

  // 2. Persist device updates directly to Firestore
  const updateDeviceState = useCallback(
    async (patch: Partial<LampDevice>) => {
      setDevice((prev) => ({ ...prev, ...patch }));
      const path = `devices/${deviceId}`;
      try {
        await updateDoc(doc(db, 'devices', deviceId), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        setErrorBanner('Gagal menyinkronkan status ke Firebase.');
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [deviceId]
  );

  // 3. Record a completed usage session directly to Firestore
  const recordUsageLog = useCallback(
    async (startedAtMs: number, endedAtMs: number, triggerSrc: TriggerSource, endReason: EndReason) => {
      if (!startedAtMs || endedAtMs < startedAtMs) return;

      const durationSeconds = Math.min(86400, Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000)));
      const normalizedTrigger: LogTriggerSource =
        triggerSrc === 'system' ? 'manual' : triggerSrc;
      const logId = `log_${endedAtMs}_${Math.random().toString(36).slice(2, 7)}`;

      const newLog: UsageLog = {
        id: logId,
        deviceId,
        dateKey: getLocalDateKey(new Date(endedAtMs)),
        startedAtMs,
        endedAtMs,
        durationSeconds,
        triggerSource: normalizedTrigger,
        endReason,
        watts: LAMP_WATTS,
      };

      const logPath = `devices/${deviceId}/usageLogs/${logId}`;
      try {
        await setDoc(doc(db, 'devices', deviceId, 'usageLogs', logId), {
          ...newLog,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, logPath);
      }
    },
    [deviceId]
  );

  // 4. Turn lamp ON or OFF cleanly
  const setLampPower = useCallback(
    async (nextOn: boolean, trigger: TriggerSource, endReason: EndReason = 'manual') => {
      const now = Date.now();

      if (nextOn) {
        if (device.lampOn) return;
        autoOffGuardRef.current = false;
        const timerEndsAtMs = device.timerEnabled
          ? now + device.timerDurationSeconds * 1000
          : 0;

        await updateDeviceState({
          lampOn: true,
          lastTriggerSource: trigger,
          activeSessionStartedAtMs: now,
          timerEndsAtMs,
        });
      } else {
        if (!device.lampOn) return;
        const startedAt = device.activeSessionStartedAtMs || now - 1000;
        const origTrigger = device.lastTriggerSource;

        setMotionHoldDeadlineMs(null);
        await updateDeviceState({
          lampOn: false,
          activeSessionStartedAtMs: 0,
          timerEndsAtMs: 0,
          lastTriggerSource: trigger,
        });
        await recordUsageLog(startedAt, now, origTrigger, endReason);
      }
    },
    [device, updateDeviceState, recordUsageLog]
  );

  // 5. 500ms clock tick for live timers & auto shutoff
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!device.lampOn) {
      autoOffGuardRef.current = false;
      return;
    }

    if (device.timerEndsAtMs > 0 && nowMs >= device.timerEndsAtMs && !autoOffGuardRef.current) {
      autoOffGuardRef.current = true;
      void setLampPower(false, 'timer', 'timer_expired');
      return;
    }

    if (
      device.standbyMode &&
      !device.motionDetected &&
      motionHoldDeadlineMs !== null &&
      nowMs >= motionHoldDeadlineMs &&
      !autoOffGuardRef.current
    ) {
      autoOffGuardRef.current = true;
      setMotionHoldDeadlineMs(null);
      void setLampPower(false, 'motion', 'motion_timeout');
    }
  }, [
    nowMs,
    device.lampOn,
    device.timerEndsAtMs,
    device.standbyMode,
    device.motionDetected,
    motionHoldDeadlineMs,
    setLampPower,
  ]);

  // 6. PIR Motion Simulation Handlers
  const handleMotionDetectedChange = useCallback(
    async (detected: boolean) => {
      if (detected) {
        setMotionHoldDeadlineMs(null);
        if (device.standbyMode && !device.lampOn) {
          const now = Date.now();
          autoOffGuardRef.current = false;
          const timerEndsAtMs = device.timerEnabled
            ? now + device.timerDurationSeconds * 1000
            : 0;
          await updateDeviceState({
            motionDetected: true,
            lampOn: true,
            lastTriggerSource: 'motion',
            activeSessionStartedAtMs: now,
            timerEndsAtMs,
          });
          return;
        }
        await updateDeviceState({ motionDetected: true });
      } else {
        if (device.standbyMode && device.lampOn && device.lastTriggerSource === 'motion') {
          setMotionHoldDeadlineMs(Date.now() + device.motionHoldSeconds * 1000);
        }
        await updateDeviceState({ motionDetected: false });
      }
    },
    [device, updateDeviceState]
  );

  const handlePulseMotion = () => {
    if (pulseTimeoutRef.current) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    setMotionLatched(false);
    void handleMotionDetectedChange(true);
    pulseTimeoutRef.current = window.setTimeout(() => {
      void handleMotionDetectedChange(false);
    }, 4000);
  };

  const handleToggleLatchMotion = () => {
    if (pulseTimeoutRef.current) {
      window.clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = null;
    }
    const next = !motionLatched;
    setMotionLatched(next);
    void handleMotionDetectedChange(next);
  };

  const handleToggleStandby = (nextStandby: boolean) => {
    if (!nextStandby) {
      setMotionHoldDeadlineMs(null);
    } else if (device.motionDetected && !device.lampOn) {
      const now = Date.now();
      autoOffGuardRef.current = false;
      const timerEndsAtMs = device.timerEnabled
        ? now + device.timerDurationSeconds * 1000
        : 0;
      void updateDeviceState({
        standbyMode: true,
        lampOn: true,
        lastTriggerSource: 'motion',
        activeSessionStartedAtMs: now,
        timerEndsAtMs,
      });
      return;
    }
    void updateDeviceState({ standbyMode: nextStandby });
  };

  const handleUpdateTimerConfig = (enabled: boolean, durationSeconds: number) => {
    if (device.lampOn) {
      const nextEndsAt = enabled ? Date.now() + durationSeconds * 1000 : 0;
      void updateDeviceState({
        timerEnabled: enabled,
        timerDurationSeconds: durationSeconds,
        timerEndsAtMs: nextEndsAt,
      });
    } else {
      void updateDeviceState({
        timerEnabled: enabled,
        timerDurationSeconds: durationSeconds,
      });
    }
  };

  const handleAddTimerMinute = () => {
    if (!device.lampOn) return;
    const base = device.timerEndsAtMs > nowMs ? device.timerEndsAtMs : nowMs;
    void updateDeviceState({ timerEndsAtMs: base + 60000 });
  };

  const handleCancelActiveTimer = () => {
    void updateDeviceState({ timerEndsAtMs: 0, timerEnabled: false });
  };

  const handleSaveHardwareConfig = (updates: {
    name: string;
    boardModel: BoardModel;
    pirPin: PirPin;
    relayPin: RelayPin;
    relayActiveLow: boolean;
    wifiSsid: string;
  }) => {
    void updateDeviceState(updates);
  };

  const handleDeleteLog = async (logId: string) => {
    const path = `devices/${deviceId}/usageLogs/${logId}`;
    try {
      await deleteDoc(doc(db, 'devices', deviceId, 'usageLogs', logId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleSwitchDeviceId = () => {
    const cleaned = deviceInput.trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleaned)) {
      setErrorBanner('ID Perangkat hanya boleh huruf, angka, tanda hubung (-), atau garis bawah (_).');
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_DEVICE_ID, cleaned);
    const url = new URL(window.location.href);
    url.searchParams.set('device', cleaned);
    window.history.replaceState({}, '', url.toString());
    setDeviceId(cleaned);
    setDeviceModalOpen(false);
    setErrorBanner(null);
  };

  const sessionElapsedSec =
    device.lampOn && device.activeSessionStartedAtMs > 0
      ? Math.max(0, Math.floor((nowMs - device.activeSessionStartedAtMs) / 1000))
      : 0;

  const timerRemainingSec =
    device.lampOn && device.timerEndsAtMs > 0
      ? Math.max(0, Math.ceil((device.timerEndsAtMs - nowMs) / 1000))
      : 0;

  const motionHoldRemainingSec =
    device.lampOn && device.standbyMode && !device.motionDetected && motionHoldDeadlineMs !== null
      ? Math.max(0, Math.ceil((motionHoldDeadlineMs - nowMs) / 1000))
      : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar: Strict 3-zone contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            LolinLamp Studio
          </button>

          {/* Zone 2: Clean single-line nav links */}
          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Navigasi Utama">
            {(
              [
                { id: 'simulator', label: 'Simulator & Kontrol' },
                { id: 'logs', label: 'Log Pemakaian' },
                { id: 'profile', label: 'Profil 24 Jam' },
                { id: 'wiring', label: 'Skema & Kode ESP' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action (Switch / Share Device ID) */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setDeviceInput(deviceId);
                setDeviceModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span className="font-mono">ID: {deviceId}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Sync Status & Device Header Row */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight text-balance">
              {device.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              ID Perangkat: {device.id} · Pin PIR: {device.pirPin} · Pin Relay: {device.relayPin} · Wi-Fi: {device.wifiSsid || 'Belum diatur'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                cloudConnected ? 'text-emerald-700' : 'text-slate-600'
              }`}
            >
              <Cloud className="w-4 h-4" />
              <span>
                {cloudConnected
                  ? 'Terhubung Langsung ke Firebase Real-Time'
                  : 'Menghubungkan ke Firebase...'}
              </span>
            </span>
          </div>
        </div>

        {errorBanner && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 flex items-center justify-between gap-4">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="font-semibold underline cursor-pointer shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <HardwareSimulator
              device={device}
              lampWatts={LAMP_WATTS}
              sessionElapsedSec={sessionElapsedSec}
              timerRemainingSec={timerRemainingSec}
              motionHoldRemainingSec={motionHoldRemainingSec}
              motionLatched={motionLatched}
              onPulseMotion={handlePulseMotion}
              onToggleLatchMotion={handleToggleLatchMotion}
              onToggleEspOnline={() => void updateDeviceState({ espOnline: !device.espOnline })}
            />

            <ControlPanel
              device={device}
              sessionElapsedSec={sessionElapsedSec}
              timerRemainingSec={timerRemainingSec}
              motionHoldRemainingSec={motionHoldRemainingSec}
              onToggleLamp={(nextOn) => void setLampPower(nextOn, 'manual', 'manual')}
              onToggleStandby={handleToggleStandby}
              onUpdateMotionHold={(seconds) => void updateDeviceState({ motionHoldSeconds: seconds })}
              onUpdateTimerConfig={handleUpdateTimerConfig}
              onAddTimerMinute={handleAddTimerMinute}
              onCancelActiveTimer={handleCancelActiveTimer}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <UsageAnalytics
            logs={logs}
            loading={logsLoading}
            lampOn={device.lampOn}
            sessionElapsedSec={sessionElapsedSec}
            lampWatts={LAMP_WATTS}
            onDeleteLog={(id) => void handleDeleteLog(id)}
          />
        )}

        {activeTab === 'profile' && (
          <PeakHourProfileView
            logs={logs}
            loading={logsLoading}
            lampOn={device.lampOn}
            activeSessionStartedAtMs={device.activeSessionStartedAtMs}
            lastTriggerSource={device.lastTriggerSource}
            lampWatts={LAMP_WATTS}
            onGoToSimulator={() => setActiveTab('simulator')}
          />
        )}

        {activeTab === 'wiring' && (
          <WiringAndCodeView
            device={device}
            lampWatts={LAMP_WATTS}
            onSaveHardwareConfig={handleSaveHardwareConfig}
          />
        )}
      </main>

      {/* Modal Ganti / Buat ID Perangkat untuk Sinkronisasi Multi-Perangkat */}
      {deviceModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="device-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="device-modal-title" className="font-display text-base font-semibold text-slate-900">
                Ganti ID Perangkat ESP Lolin
              </h2>
              <button
                type="button"
                onClick={() => setDeviceModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Masukkan ID perangkat yang sama di dashboard web dan di kode ESP Lolin untuk menyinkronkan lampu serta log harian secara real-time tanpa login.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ID Perangkat (huruf, angka, - atau _)
              </label>
              <input
                type="text"
                value={deviceInput}
                onChange={(e) => setDeviceInput(e.target.value)}
                maxLength={64}
                placeholder="Contoh: lolin-lamp-01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-slate-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeviceModalOpen(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSwitchDeviceId}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
              >
                Hubungkan Perangkat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
