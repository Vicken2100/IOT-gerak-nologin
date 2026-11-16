export type BoardModel = 'LOLIN_NODEMCU_V3' | 'LOLIN_D1_MINI';
export type PirPin = 'D5' | 'D6' | 'D7' | 'D2';
export type RelayPin = 'D1' | 'D2' | 'D3' | 'D0';
export type TriggerSource = 'manual' | 'motion' | 'timer' | 'system';
export type LogTriggerSource = 'manual' | 'motion' | 'timer';
export type EndReason = 'manual' | 'timer_expired' | 'motion_timeout' | 'standby_off';

export interface LampDevice {
  id: string;
  name: string;
  boardModel: BoardModel;
  lampOn: boolean;
  standbyMode: boolean;
  motionDetected: boolean;
  motionHoldSeconds: number;
  timerEnabled: boolean;
  timerDurationSeconds: number;
  timerEndsAtMs: number;
  lastTriggerSource: TriggerSource;
  activeSessionStartedAtMs: number;
  pirPin: PirPin;
  relayPin: RelayPin;
  relayActiveLow: boolean;
  wifiSsid: string;
  espOnline: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UsageLog {
  id: string;
  deviceId: string;
  dateKey: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  triggerSource: LogTriggerSource;
  endReason: EndReason;
  watts: number;
  createdAt?: unknown;
}

export interface EspFirmwareConfig {
  wifiSsid: string;
  wifiPassword: string;
  boardModel: BoardModel;
  pirPin: PirPin;
  relayPin: RelayPin;
  relayActiveLow: boolean;
  deviceId: string;
  pollIntervalMs: number;
  lampWatts: number;
}

export const GPIO_MAP: Record<string, { gpio: number; note: string }> = {
  D0: { gpio: 16, note: 'GPIO16 (Wake, tidak ada interrupt)' },
  D1: { gpio: 5, note: 'GPIO5 (Aman untuk Relay IN)' },
  D2: { gpio: 4, note: 'GPIO4 (Aman untuk Relay / PIR)' },
  D3: { gpio: 0, note: 'GPIO0 (Flash button, pull-up)' },
  D4: { gpio: 2, note: 'GPIO2 (LED Onboard Lolin)' },
  D5: { gpio: 14, note: 'GPIO14 (Ideal untuk Sensor PIR)' },
  D6: { gpio: 12, note: 'GPIO12 (MISO / Input aman)' },
  D7: { gpio: 13, note: 'GPIO13 (MOSI / Input aman)' },
};

export function formatDurationCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationHuman(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const parts: string[] = [];
  if (hrs > 0) parts.push(`${hrs} jam`);
  if (mins > 0) parts.push(`${mins} mnt`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} dtk`);
  return parts.join(' ');
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
