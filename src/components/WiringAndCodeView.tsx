import { AlertTriangle, Check, Copy, Download, Eye, EyeOff, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generateEspLolinSketch } from '../lib/espSketchGenerator';
import {
  BoardModel,
  EspFirmwareConfig,
  GPIO_MAP,
  LampDevice,
  PirPin,
  RelayPin,
} from '../types/lamp';

interface WiringAndCodeViewProps {
  device: LampDevice;
  lampWatts: number;
  onSaveHardwareConfig: (updates: {
    name: string;
    boardModel: BoardModel;
    pirPin: PirPin;
    relayPin: RelayPin;
    relayActiveLow: boolean;
    wifiSsid: string;
  }) => void;
}

interface WireRow {
  id: string;
  from: string;
  to: string;
  colorName: string;
  stroke: string;
  note: string;
}

export function WiringAndCodeView({
  device,
  lampWatts,
  onSaveHardwareConfig,
}: WiringAndCodeViewProps) {
  const [wifiSsid, setWifiSsid] = useState(device.wifiSsid || 'WiFi-Rumah-2.4G');
  const [wifiPassword, setWifiPassword] = useState('PasswordWiFiAnda');
  const [showPassword, setShowPassword] = useState(false);
  const [boardModel, setBoardModel] = useState<BoardModel>(device.boardModel);
  const [pirPin, setPirPin] = useState<PirPin>(device.pirPin);
  const [relayPin, setRelayPin] = useState<RelayPin>(device.relayPin);
  const [relayActiveLow, setRelayActiveLow] = useState<boolean>(device.relayActiveLow);
  const [deviceName, setDeviceName] = useState<string>(device.name);
  const [hoveredWire, setHoveredWire] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const firmwareConfig: EspFirmwareConfig = {
    wifiSsid,
    wifiPassword,
    boardModel,
    pirPin,
    relayPin,
    relayActiveLow,
    deviceId: device.id,
    pollIntervalMs: 2500,
    lampWatts,
  };

  const sketchCode = useMemo(() => generateEspLolinSketch(firmwareConfig), [firmwareConfig]);

  const wires: WireRow[] = [
    {
      id: 'pir-vcc',
      from: 'ESP Lolin VU (5V)',
      to: 'PIR HC-SR501 VCC',
      colorName: 'Merah (+5V)',
      stroke: '#EF4444',
      note: 'HC-SR501 butuh 5V pada pin VU/VIN NodeMCU agar stabil',
    },
    {
      id: 'pir-gnd',
      from: 'ESP Lolin GND',
      to: 'PIR HC-SR501 GND',
      colorName: 'Hitam (GND)',
      stroke: '#64748B',
      note: 'Ground referensi bersama',
    },
    {
      id: 'pir-out',
      from: `ESP Lolin ${pirPin} (GPIO${GPIO_MAP[pirPin]?.gpio})`,
      to: 'PIR HC-SR501 OUT',
      colorName: 'Cyan (Sinyal Input)',
      stroke: '#06B6D4',
      note: 'Output logika PIR bernilai 3.3V (aman langsung ke GPIO ESP8266)',
    },
    {
      id: 'relay-vcc',
      from: 'ESP Lolin VU (5V)',
      to: 'Relay Module VCC',
      colorName: 'Merah (+5V)',
      stroke: '#DC2626',
      note: 'Koil relay 5V mengambil suplai dari pin VU (USB 5V)',
    },
    {
      id: 'relay-gnd',
      from: 'ESP Lolin GND',
      to: 'Relay Module GND',
      colorName: 'Hitam (GND)',
      stroke: '#475569',
      note: 'Ground modul relay',
    },
    {
      id: 'relay-in',
      from: `ESP Lolin ${relayPin} (GPIO${GPIO_MAP[relayPin]?.gpio})`,
      to: 'Relay Module IN',
      colorName: 'Kuning/Amber (Kontrol)',
      stroke: '#F59E0B',
      note: relayActiveLow
        ? 'Active LOW: GPIO LOW mengaktifkan koil relay'
        : 'Active HIGH: GPIO HIGH mengaktifkan koil relay',
    },
    {
      id: 'ac-live',
      from: 'PLN Fasa (L) → Relay COM',
      to: 'Relay NO → Terminal Lampu 1',
      colorName: 'Coklat/Oranye (AC 220V)',
      stroke: '#EA580C',
      note: 'Memutus kabel fasa PLN melalui kontak Normally Open (NO)',
    },
    {
      id: 'ac-neutral',
      from: 'PLN Netral (N)',
      to: 'Terminal Lampu 2',
      colorName: 'Biru (Netral AC)',
      stroke: '#2563EB',
      note: 'Langsung terhubung ke lampu tanpa melewati relay',
    },
  ];

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(sketchCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadIno = () => {
    const blob = new Blob([sketchCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lolin_smart_lamp_${device.id}.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveConfig = () => {
    onSaveHardwareConfig({
      name: deviceName.trim() || 'Lampu Otomatis ESP Lolin',
      boardModel,
      pirPin,
      relayPin,
      relayActiveLow,
      wifiSsid: wifiSsid.trim(),
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const wireOpacity = (id: string) => {
    if (!hoveredWire) return 1;
    return hoveredWire === id ? 1 : 0.2;
  };

  const wireWidth = (id: string, base: number) => {
    return hoveredWire === id ? base + 2 : base;
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: Skema Kabel Interaktif */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Skema Pengkabelan (Wiring Diagram) ESP Lolin
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Arahkan kursor atau klik baris tabel di bawah untuk menyorot jalur kabel pada diagram
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600">
            PIR: {pirPin} (GPIO{GPIO_MAP[pirPin]?.gpio}) · Relay: {relayPin} (GPIO{GPIO_MAP[relayPin]?.gpio})
          </span>
        </div>

        <div className="p-5 bg-slate-950 overflow-x-auto">
          <svg
            viewBox="0 0 940 360"
            className="w-full min-w-[700px] h-auto select-none"
            role="img"
            aria-label="Skema kabel lengkap ESP8266 Lolin dengan Sensor PIR, Relay 1 Channel, dan Lampu AC 220V"
          >
            <rect width="940" height="360" rx="8" fill="#0B1220" />

            {/* WIRES */}
            <path
              d="M 190 110 L 260 110 L 260 95 L 320 95"
              fill="none"
              stroke="#EF4444"
              strokeWidth={wireWidth('pir-vcc', 2.5)}
              strokeOpacity={wireOpacity('pir-vcc')}
            />
            <path
              d="M 190 140 L 250 140 L 250 125 L 320 125"
              fill="none"
              stroke="#94A3B8"
              strokeWidth={wireWidth('pir-gnd', 2.5)}
              strokeOpacity={wireOpacity('pir-gnd')}
            />
            <path
              d="M 190 170 L 270 170 L 270 155 L 320 155"
              fill="none"
              stroke="#06B6D4"
              strokeWidth={wireWidth('pir-out', 3)}
              strokeOpacity={wireOpacity('pir-out')}
            />

            <path
              d="M 480 95 L 545 95 L 545 110 L 580 110"
              fill="none"
              stroke="#DC2626"
              strokeWidth={wireWidth('relay-vcc', 2.5)}
              strokeOpacity={wireOpacity('relay-vcc')}
            />
            <path
              d="M 480 125 L 535 125 L 535 140 L 580 140"
              fill="none"
              stroke="#64748B"
              strokeWidth={wireWidth('relay-gnd', 2.5)}
              strokeOpacity={wireOpacity('relay-gnd')}
            />
            <path
              d="M 480 155 L 555 155 L 555 170 L 580 170"
              fill="none"
              stroke="#F59E0B"
              strokeWidth={wireWidth('relay-in', 3)}
              strokeOpacity={wireOpacity('relay-in')}
            />

            <path
              d="M 760 295 L 650 295 L 650 225"
              fill="none"
              stroke="#EA580C"
              strokeWidth={wireWidth('ac-live', 3)}
              strokeOpacity={wireOpacity('ac-live')}
            />
            <path
              d="M 710 130 L 820 130 L 820 160"
              fill="none"
              stroke="#EA580C"
              strokeWidth={wireWidth('ac-live', 3)}
              strokeOpacity={wireOpacity('ac-live')}
            />
            <path
              d="M 850 295 L 885 295 L 885 225 L 860 225"
              fill="none"
              stroke="#2563EB"
              strokeWidth={wireWidth('ac-neutral', 3)}
              strokeOpacity={wireOpacity('ac-neutral')}
            />

            {/* BOX 1: PIR HC-SR501 */}
            <g transform="translate(30, 70)">
              <rect width="160" height="140" rx="8" fill="#111C33" stroke="#334155" strokeWidth="1.5" />
              <text x="14" y="24" fill="#F8FAFC" fontSize="12" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                PIR HC-SR501
              </text>
              <text x="14" y="40" fill="#94A3B8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                Sensor Gerak
              </text>
              <circle cx="152" cy="40" r="4" fill="#EF4444" />
              <text x="142" y="43" textAnchor="end" fill="#FCA5A5" fontSize="10" fontFamily="JetBrains Mono, monospace">
                VCC (5V)
              </text>
              <circle cx="152" cy="70" r="4" fill="#94A3B8" />
              <text x="142" y="73" textAnchor="end" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono, monospace">
                GND
              </text>
              <circle cx="152" cy="100" r="4" fill="#06B6D4" />
              <text x="142" y="103" textAnchor="end" fill="#67E8F9" fontSize="10" fontFamily="JetBrains Mono, monospace">
                OUT
              </text>
            </g>

            {/* BOX 2: ESP8266 LOLIN */}
            <g transform="translate(320, 55)">
              <rect width="160" height="200" rx="8" fill="#0F172A" stroke="#3B82F6" strokeWidth="1.5" />
              <text x="80" y="24" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                ESP8266 LOLIN
              </text>
              <text x="80" y="40" textAnchor="middle" fill="#67E8F9" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                {boardModel === 'LOLIN_NODEMCU_V3' ? 'NodeMCU V3' : 'Lolin D1 Mini'}
              </text>

              <text x="14" y="43" fill="#FCA5A5" fontSize="10" fontFamily="JetBrains Mono, monospace">
                VU (5V)
              </text>
              <text x="14" y="73" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono, monospace">
                GND
              </text>
              <text x="14" y="103" fill="#67E8F9" fontSize="10" fontFamily="JetBrains Mono, monospace">
                {pirPin} (G{GPIO_MAP[pirPin]?.gpio})
              </text>

              <text x="146" y="43" textAnchor="end" fill="#FCA5A5" fontSize="10" fontFamily="JetBrains Mono, monospace">
                VU (5V)
              </text>
              <text x="146" y="73" textAnchor="end" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono, monospace">
                GND
              </text>
              <text x="146" y="103" textAnchor="end" fill="#FCD34D" fontSize="10" fontFamily="JetBrains Mono, monospace">
                {relayPin} (G{GPIO_MAP[relayPin]?.gpio})
              </text>

              <rect x="16" y="130" width="128" height="52" rx="6" fill="#1E293B" />
              <text x="80" y="152" textAnchor="middle" fill="#E2E8F0" fontSize="10" fontFamily="JetBrains Mono, monospace">
                USB 5V / Adaptor
              </text>
              <text x="80" y="168" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono, monospace">
                D4 = LED Status
              </text>
            </g>

            {/* BOX 3: MODUL RELAY 5V */}
            <g transform="translate(580, 70)">
              <rect width="130" height="155" rx="8" fill="#111C33" stroke="#334155" strokeWidth="1.5" />
              <text x="65" y="24" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                RELAY 1-CH 5V
              </text>

              <text x="12" y="43" fill="#FCA5A5" fontSize="10" fontFamily="JetBrains Mono, monospace">
                VCC
              </text>
              <text x="12" y="73" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono, monospace">
                GND
              </text>
              <text x="12" y="103" fill="#FCD34D" fontSize="10" fontFamily="JetBrains Mono, monospace">
                IN
              </text>

              <text x="118" y="63" textAnchor="end" fill="#FB923C" fontSize="10" fontFamily="JetBrains Mono, monospace">
                NO →
              </text>
              <text x="70" y="144" textAnchor="middle" fill="#FB923C" fontSize="10" fontFamily="JetBrains Mono, monospace">
                COM ↓
              </text>
            </g>

            {/* BOX 4: LAMPU 220V */}
            <g transform="translate(780, 160)">
              <rect width="125" height="90" rx="8" fill="#111C33" stroke="#F59E0B" strokeWidth="1.5" />
              <text x="62" y="34" textAnchor="middle" fill="#FDE68A" fontSize="12" fontWeight="700" fontFamily="Plus Jakarta Sans, sans-serif">
                LAMPU AC
              </text>
              <text x="62" y="52" textAnchor="middle" fill="#CBD5E1" fontSize="10" fontFamily="JetBrains Mono, monospace">
                220V / {lampWatts}W
              </text>
              <text x="20" y="76" fill="#FB923C" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                L (Fasa)
              </text>
              <text x="105" y="76" textAnchor="end" fill="#60A5FA" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                N (Netral)
              </text>
            </g>

            {/* BOX 5: SUMBER PLN 220V */}
            <g transform="translate(760, 275)">
              <rect width="110" height="55" rx="6" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
              <text x="55" y="23" textAnchor="middle" fill="#F8FAFC" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                PLN 220V AC
              </text>
              <text x="20" y="42" fill="#FB923C" fontSize="10" fontFamily="JetBrains Mono, monospace">
                L (Fasa)
              </text>
              <text x="92" y="42" textAnchor="end" fill="#60A5FA" fontSize="10" fontFamily="JetBrains Mono, monospace">
                N
              </text>
            </g>
          </svg>
        </div>

        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-5 font-medium">Pin Asal</th>
                <th className="py-2.5 px-4 font-medium">Pin Tujuan</th>
                <th className="py-2.5 px-4 font-medium">Warna & Fungsi Kabel</th>
                <th className="py-2.5 px-5 font-medium">Keterangan Teknis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wires.map((w) => (
                <tr
                  key={w.id}
                  onMouseEnter={() => setHoveredWire(w.id)}
                  onMouseLeave={() => setHoveredWire(null)}
                  onClick={() => setHoveredWire((prev) => (prev === w.id ? null : w.id))}
                  className={`h-10 cursor-pointer transition-colors ${
                    hoveredWire === w.id ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-5 font-mono font-medium text-slate-900">{w.from}</td>
                  <td className="px-4 font-mono font-medium text-slate-900">{w.to}</td>
                  <td className="px-4 text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: w.stroke }}
                      />
                      <span>{w.colorName}</span>
                    </span>
                  </td>
                  <td className="px-5 text-slate-600">{w.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3.5 bg-amber-50 border-t border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p>
            <strong>Keselamatan Listrik 220V AC:</strong> Pastikan sumber listrik PLN dimatikan (MCB OFF) saat merangkai terminal <span className="font-mono">COM</span> dan <span className="font-mono">NO</span> pada modul relay. Gunakan kotak isolasi agar PCB relay tidak tersentuh langsung.
          </p>
        </div>
      </section>

      {/* SECTION 2: Konfigurasi Wi-Fi & Firmware ESP Lolin */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Konfigurasi Wi-Fi & Pin ESP
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Catat SSID & Password Wi-Fi Anda; kode di kanan langsung terbarui otomatis tanpa perlu token login.
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Perangkat</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                maxLength={80}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Wi-Fi SSID (2.4 GHz)
              </label>
              <input
                type="text"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                maxLength={64}
                placeholder="Contoh: WiFi-Rumah"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900 focus:outline-none focus:border-slate-400"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Wi-Fi Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="Password Wi-Fi Anda"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-9 font-mono text-slate-900 focus:outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Tampilkan atau sembunyikan password Wi-Fi"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Pin Sensor PIR</label>
                <select
                  value={pirPin}
                  onChange={(e) => setPirPin(e.target.value as PirPin)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-slate-900 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="D5">D5 (GPIO14)</option>
                  <option value="D6">D6 (GPIO12)</option>
                  <option value="D7">D7 (GPIO13)</option>
                  <option value="D2">D2 (GPIO4)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Pin Modul Relay</label>
                <select
                  value={relayPin}
                  onChange={(e) => setRelayPin(e.target.value as RelayPin)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-slate-900 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="D1">D1 (GPIO5)</option>
                  <option value="D2">D2 (GPIO4)</option>
                  <option value="D3">D3 (GPIO0)</option>
                  <option value="D0">D0 (GPIO16)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Model Board</label>
                <select
                  value={boardModel}
                  onChange={(e) => setBoardModel(e.target.value as BoardModel)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-slate-900 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="LOLIN_NODEMCU_V3">NodeMCU V3 Lolin</option>
                  <option value="LOLIN_D1_MINI">Lolin D1 Mini</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Logika Relay</label>
                <select
                  value={relayActiveLow ? 'LOW' : 'HIGH'}
                  onChange={(e) => setRelayActiveLow(e.target.value === 'LOW')}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-slate-900 bg-white focus:outline-none focus:border-slate-400"
                >
                  <option value="LOW">Active LOW</option>
                  <option value="HIGH">Active HIGH</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveConfig}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
              <span>{savedNotice ? 'Konfigurasi Tersimpan ke Firebase' : 'Simpan Pin & SSID ke Perangkat'}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/70">
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                lolin_smart_lamp_{device.id}.ino
              </h3>
              <p className="text-xs text-slate-400">
                Siap di-flash lewat Arduino IDE (Board: NodeMCU 1.0 ESP-12E · Baud 115200)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin Kode'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadIno}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh .ino</span>
              </button>
            </div>
          </div>

          <div className="max-h-[540px] overflow-auto p-5 text-xs font-mono leading-relaxed text-slate-200">
            <pre className="whitespace-pre">{sketchCode}</pre>
          </div>

          <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/50 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-white">Panduan Singkat Upload ke ESP Lolin:</p>
            <p>
              1. Tambahkan URL Board ESP8266 di Arduino IDE Preferences: <span className="font-mono text-amber-300">https://arduino.esp8266.com/stable/package_esp8266com_index.json</span>
            </p>
            <p>
              2. Install library <span className="font-mono text-cyan-300">ArduinoJson</span> dari Library Manager, pilih board <span className="font-mono text-cyan-300">NodeMCU 1.0 (ESP-12E Module)</span>, lalu klik Upload.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
