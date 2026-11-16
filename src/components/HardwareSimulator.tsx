import { Activity, Eye, Lightbulb, Radio, Wifi, WifiOff } from 'lucide-react';
import { GPIO_MAP, LampDevice } from '../types/lamp';

interface HardwareSimulatorProps {
  device: LampDevice;
  lampWatts: number;
  sessionElapsedSec: number;
  timerRemainingSec: number;
  motionHoldRemainingSec: number | null;
  motionLatched: boolean;
  onPulseMotion: () => void;
  onToggleLatchMotion: () => void;
  onToggleEspOnline: () => void;
}

export function HardwareSimulator({
  device,
  lampWatts,
  sessionElapsedSec,
  timerRemainingSec,
  motionHoldRemainingSec,
  motionLatched,
  onPulseMotion,
  onToggleLatchMotion,
  onToggleEspOnline,
}: HardwareSimulatorProps) {
  const pirGpio = GPIO_MAP[device.pirPin]?.gpio ?? 14;
  const relayGpio = GPIO_MAP[device.relayPin]?.gpio ?? 5;
  const relayCoilEnergized = device.lampOn;
  const relayPinState = device.relayActiveLow
    ? relayCoilEnergized
      ? 'LOW (0V)'
      : 'HIGH (3.3V)'
    : relayCoilEnergized
      ? 'HIGH (3.3V)'
      : 'LOW (0V)';
  const pirPinState = device.motionDetected ? 'HIGH (3.3V)' : 'LOW (0V)';
  const currentAmps = device.lampOn ? (lampWatts / 220).toFixed(3) : '0.000';

  return (
    <section
      aria-label="Simulator Perangkat Keras ESP Lolin"
      className="rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden"
    >
      {/* Top Hardware Workbench Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-800/90 bg-slate-900/70">
        <div className="flex items-center gap-3 min-w-0">
          <Radio className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="font-display text-sm font-semibold tracking-tight text-white truncate">
            Meja Simulasi Perangkat Keras ESP Lolin
          </h2>
          <span className="hidden sm:inline text-xs text-slate-400 font-mono">
            {device.boardModel === 'LOLIN_NODEMCU_V3' ? 'NodeMCU V3' : 'Lolin D1 Mini'} · {device.pirPin}/GPIO{pirGpio} · {device.relayPin}/GPIO{relayGpio}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleEspOnline}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              device.espOnline
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-rose-950/60 border-rose-700/60 text-rose-300 hover:bg-rose-900/60'
            }`}
          >
            {device.espOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Wi-Fi ESP: Terhubung ({device.wifiSsid || 'WiFi'})</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Wi-Fi ESP: Terputus (Mode Offline)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Interactive SVG Hardware Schematic & Physical Simulation */}
      <div className="relative p-5 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.08),transparent_55%)]">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 920 340"
            className="w-full min-w-[680px] h-auto select-none"
            role="img"
            aria-label="Diagram interaktif simulasi sensor PIR, ESP Lolin, modul relay, dan lampu AC 220V"
          >
            <defs>
              <pattern id="pcbGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth="1"
                />
              </pattern>
              <radialGradient id="bulbGlow" cx="50%" cy="45%" r="55%">
                <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="920" height="340" rx="10" fill="#0B1220" />
            <rect width="920" height="340" rx="10" fill="url(#pcbGrid)" />

            {/* Connection Wires */}
            {/* PIR OUT -> ESP D5 */}
            <path
              d="M 190 155 L 250 155 L 250 135 L 300 135"
              fill="none"
              stroke={device.motionDetected ? '#22D3EE' : '#334155'}
              strokeWidth={device.motionDetected ? '3' : '2'}
              strokeDasharray={device.motionDetected ? '6 4' : undefined}
            />
            <text x="220" y="126" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
              OUT → {device.pirPin}
            </text>

            {/* ESP D1 -> Relay IN */}
            <path
              d="M 465 135 L 520 135 L 520 155 L 555 155"
              fill="none"
              stroke={relayCoilEnergized ? '#F59E0B' : '#334155'}
              strokeWidth={relayCoilEnergized ? '3' : '2'}
            />
            <text x="475" y="126" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
              {device.relayPin} → IN
            </text>

            {/* Power 5V & GND bus (subtle bottom trace) */}
            <path
              d="M 190 185 L 235 185 L 235 235 L 535 235 L 535 185 L 555 185"
              fill="none"
              stroke="#EF4444"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
            <path
              d="M 190 205 L 220 205 L 220 250 L 545 250 L 545 205 L 555 205"
              fill="none"
              stroke="#64748B"
              strokeOpacity="0.6"
              strokeWidth="1.5"
            />
            <text x="348" y="231" fill="#F87171" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
              BUS 5V (VU)
            </text>
            <text x="355" y="263" fill="#94A3B8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
              COMMON GND
            </text>

            {/* AC 220V Circuit: Relay NO -> Lamp -> Neutral */}
            <path
              d="M 705 140 L 760 140 L 760 120 L 785 120"
              fill="none"
              stroke={device.lampOn ? '#FBBF24' : '#475569'}
              strokeWidth={device.lampOn ? '3.5' : '2.5'}
            />
            <path
              d="M 705 185 L 745 185 L 745 265 L 835 265 L 835 215"
              fill="none"
              stroke="#38BDF8"
              strokeOpacity={device.lampOn ? '0.9' : '0.45'}
              strokeWidth="2.5"
            />
            <text x="720" y="108" fill="#FBBF24" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
              AC 220V LIVE
            </text>
            <text x="752" y="280" fill="#38BDF8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
              AC NEUTRAL (N)
            </text>

            {/* MODULE 1: PIR MOTION SENSOR (HC-SR501) */}
            <g transform="translate(30, 75)">
              <rect
                x="0"
                y="0"
                width="160"
                height="165"
                rx="10"
                fill="#111C33"
                stroke={device.motionDetected ? '#22D3EE' : '#334155'}
                strokeWidth="1.5"
              />
              <text x="14" y="22" fill="#E2E8F0" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                SENSOR PIR HC-SR501
              </text>
              <text x="14" y="36" fill="#94A3B8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                {device.motionDetected ? 'STATUS: GERAKAN (+3.3V)' : 'STATUS: TENANG (0V)'}
              </text>

              {/* Radar / Dome visual */}
              {device.motionDetected && (
                <>
                  <circle cx="80" cy="86" r="40" fill="none" stroke="#22D3EE" strokeOpacity="0.28" strokeWidth="1.5" />
                  <circle cx="80" cy="86" r="30" fill="none" stroke="#22D3EE" strokeOpacity="0.5" strokeWidth="1.5" />
                </>
              )}
              <circle
                cx="80"
                cy="86"
                r="22"
                fill={device.motionDetected ? '#0891B2' : '#1E293B'}
                stroke={device.motionDetected ? '#67E8F9' : '#475569'}
                strokeWidth="2"
              />
              <path
                d="M 65 86 Q 80 68 95 86 Q 80 104 65 86"
                fill="none"
                stroke={device.motionDetected ? '#ECFEFF' : '#64748B'}
                strokeWidth="1.5"
              />
              <circle cx="80" cy="86" r="4" fill={device.motionDetected ? '#ECFEFF' : '#64748B'} />

              {/* PIR Pin Labels */}
              <text x="122" y="83" fill="#22D3EE" fontSize="9" fontFamily="JetBrains Mono, monospace">
                OUT
              </text>
              <text x="122" y="113" fill="#F87171" fontSize="9" fontFamily="JetBrains Mono, monospace">
                VCC
              </text>
              <text x="122" y="133" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                GND
              </text>

              {/* Standby listener indicator */}
              <rect
                x="14"
                y="136"
                width="132"
                height="20"
                rx="4"
                fill={device.standbyMode ? 'rgba(16,185,129,0.14)' : 'rgba(100,116,139,0.18)'}
              />
              <text
                x="80"
                y="149"
                textAnchor="middle"
                fill={device.standbyMode ? '#6EE7B7' : '#94A3B8'}
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {device.standbyMode ? 'SIAGA: AKTIF' : 'SIAGA: NONAKTIF'}
              </text>
            </g>

            {/* MODULE 2: ESP8266 LOLIN NODEMCU V3 */}
            <g transform="translate(300, 55)">
              <rect
                x="0"
                y="0"
                width="165"
                height="165"
                rx="10"
                fill="#0F172A"
                stroke={device.espOnline ? '#3B82F6' : '#64748B'}
                strokeWidth="1.5"
              />
              {/* Metallic ESP-12E shield */}
              <rect x="34" y="24" width="97" height="58" rx="4" fill="#1E293B" stroke="#475569" strokeWidth="1" />
              <text x="82" y="48" textAnchor="middle" fill="#E2E8F0" fontSize="10.5" fontWeight="600" fontFamily="JetBrains Mono, monospace">
                ESP8266 LOLIN
              </text>
              <text x="82" y="63" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                {device.espOnline ? 'Wi-Fi TERHUBUNG' : 'Wi-Fi OFFLINE'}
              </text>

              {/* Onboard Blue LED D4 */}
              <circle
                cx="142"
                cy="34"
                r="5"
                fill={device.lampOn ? '#38BDF8' : '#1E293B'}
                stroke="#38BDF8"
                strokeOpacity={device.lampOn ? '1' : '0.35'}
              />
              <text x="142" y="49" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                D4
              </text>

              {/* Left GPIO Pins */}
              <circle cx="8" cy="80" r="4" fill={device.motionDetected ? '#22D3EE' : '#475569'} />
              <text x="17" y="83" fill="#CBD5E1" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                {device.pirPin} (IN)
              </text>

              {/* Right GPIO Pins */}
              <circle cx="157" cy="80" r="4" fill={relayCoilEnergized ? '#F59E0B' : '#475569'} />
              <text x="148" y="83" textAnchor="end" fill="#CBD5E1" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                {device.relayPin} (OUT)
              </text>

              {/* Live Pin Telemetry */}
              <rect x="14" y="100" width="137" height="52" rx="6" fill="#090F1D" stroke="#1E293B" />
              <text x="22" y="117" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                PIR {device.pirPin}: {pirPinState}
              </text>
              <text x="22" y="133" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                RLY {device.relayPin}: {relayPinState}
              </text>
              <text x="22" y="146" fill="#64748B" fontSize="8.5" fontFamily="JetBrains Mono, monospace">
                MODE: {device.relayActiveLow ? 'ACTIVE LOW' : 'ACTIVE HIGH'}
              </text>
            </g>

            {/* MODULE 3: RELAY 1-CHANNEL 5V */}
            <g transform="translate(555, 75)">
              <rect
                x="0"
                y="0"
                width="150"
                height="165"
                rx="10"
                fill="#111C33"
                stroke={relayCoilEnergized ? '#F59E0B' : '#334155'}
                strokeWidth="1.5"
              />
              <text x="14" y="22" fill="#E2E8F0" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                MODUL RELAY 5V
              </text>
              <text x="14" y="36" fill={relayCoilEnergized ? '#FBBF24' : '#94A3B8'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                {relayCoilEnergized ? 'KOIL: AKTIF (NO TUTUP)' : 'KOIL: MATI (NC TUTUP)'}
              </text>

              {/* Input LED */}
              <circle cx="22" cy="80" r="4.5" fill={relayCoilEnergized ? '#F59E0B' : '#334155'} />
              <text x="32" y="83" fill="#CBD5E1" fontSize="9" fontFamily="JetBrains Mono, monospace">
                IN
              </text>

              {/* Mechanical Switch Diagram inside Relay */}
              <rect x="46" y="54" width="90" height="72" rx="6" fill="#0B1220" stroke="#334155" />
              {/* COM Terminal */}
              <circle cx="62" cy="108" r="4" fill="#FBBF24" />
              <text x="58" y="121" fill="#94A3B8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                COM
              </text>
              {/* NO Terminal */}
              <circle cx="118" cy="68" r="4" fill={relayCoilEnergized ? '#FBBF24' : '#64748B'} />
              <text x="112" y="60" fill="#FBBF24" fontSize="8" fontFamily="JetBrains Mono, monospace">
                NO
              </text>
              {/* NC Terminal */}
              <circle cx="118" cy="108" r="4" fill={!relayCoilEnergized ? '#94A3B8' : '#475569'} />
              <text x="112" y="121" fill="#94A3B8" fontSize="8" fontFamily="JetBrains Mono, monospace">
                NC
              </text>

              {/* Moving Armature */}
              <line
                x1="62"
                y1="108"
                x2="115"
                y2={relayCoilEnergized ? '69' : '108'}
                stroke={relayCoilEnergized ? '#FBBF24' : '#94A3B8'}
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Bottom AC Line Label */}
              <text x="75" y="150" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                10A / 250VAC OPTO
              </text>
            </g>

            {/* MODULE 4: LAMPU AC 220V */}
            <g transform="translate(765, 55)">
              <rect
                x="0"
                y="0"
                width="130"
                height="200"
                rx="10"
                fill="#111C33"
                stroke={device.lampOn ? '#F59E0B' : '#334155'}
                strokeWidth="1.5"
              />
              {device.lampOn && <circle cx="65" cy="92" r="56" fill="url(#bulbGlow)" />}

              {/* Bulb Glass */}
              <circle
                cx="65"
                cy="86"
                r="30"
                fill={device.lampOn ? '#FEF3C7' : '#1E293B'}
                stroke={device.lampOn ? '#F59E0B' : '#475569'}
                strokeWidth="2"
              />
              {/* Filament */}
              <path
                d="M 55 95 L 59 78 L 65 88 L 71 78 L 75 95"
                fill="none"
                stroke={device.lampOn ? '#D97706' : '#64748B'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Bulb Base */}
              <rect x="52" y="114" width="26" height="18" rx="3" fill="#475569" />
              <line x1="52" y1="120" x2="78" y2="120" stroke="#94A3B8" strokeWidth="1.5" />
              <line x1="52" y1="126" x2="78" y2="126" stroke="#94A3B8" strokeWidth="1.5" />

              <text
                x="65"
                y="156"
                textAnchor="middle"
                fill={device.lampOn ? '#FDE68A' : '#CBD5E1'}
                fontSize="11"
                fontWeight="700"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                {device.lampOn ? 'LAMPU MENYALA' : 'LAMPU MATI'}
              </text>
              <text
                x="65"
                y="174"
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {device.lampOn ? `${lampWatts}W · ${currentAmps}A` : '0W · 0.000A'}
              </text>
              <text
                x="65"
                y="189"
                textAnchor="middle"
                fill="#64748B"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                220V AC
              </text>
            </g>
          </svg>
        </div>

        {/* Direct Interactive Simulator Action Strip */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onPulseMotion}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 active:scale-[0.99] transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Activity className="w-4 h-4" />
              <span>Picu Sensor Gerak (4 Detik)</span>
            </button>

            <button
              type="button"
              onClick={onToggleLatchMotion}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                motionLatched
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200 hover:bg-cyan-900/70'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{motionLatched ? 'Gerakan Ditahan (Klik untuk Lepas)' : 'Tahan Gerakan Terus'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-mono tabular-nums text-slate-300">
            <div className="flex items-center gap-1.5">
              <Lightbulb className={`w-3.5 h-3.5 ${device.lampOn ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>Sesi Aktif:</span>
              <span className="text-white font-semibold">
                {device.lampOn ? `${sessionElapsedSec} dtk` : '0 dtk'}
              </span>
            </div>

            {timerRemainingSec > 0 && device.lampOn && (
              <div className="text-amber-300">
                Timer Padam: <span className="font-semibold">{timerRemainingSec} dtk</span>
              </div>
            )}

            {motionHoldRemainingSec !== null && device.lampOn && device.standbyMode && (
              <div className="text-cyan-300">
                Tahan Gerak: <span className="font-semibold">{motionHoldRemainingSec} dtk</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
