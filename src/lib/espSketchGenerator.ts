import { EspFirmwareConfig, GPIO_MAP } from '../types/lamp';
import { firebaseMeta } from './firebase';

function escapeCppString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function generateEspLolinSketch(cfg: EspFirmwareConfig): string {
  const pirGpio = GPIO_MAP[cfg.pirPin]?.gpio ?? 14;
  const relayGpio = GPIO_MAP[cfg.relayPin]?.gpio ?? 5;
  const safeSsid = escapeCppString(cfg.wifiSsid || 'NAMA_WIFI_ANDA');
  const safePass = escapeCppString(cfg.wifiPassword || 'PASSWORD_WIFI_ANDA');
  const safeDeviceId = escapeCppString(cfg.deviceId || 'lolin-lamp-01');

  return `/*
 * ============================================================================
 * LolinLamp Studio — Firmware Lampu Otomatis ESP8266 Lolin (Tanpa Login)
 * Board Target : ${cfg.boardModel === 'LOLIN_NODEMCU_V3' ? 'NodeMCU 1.0 / LOLIN V3 (ESP-12E)' : 'LOLIN (WEMOS) D1 Mini'}
 * Sensor Gerak : PIR HC-SR501 pada Pin ${cfg.pirPin} (GPIO${pirGpio})
 * Modul Relay  : Relay 1-Channel pada Pin ${cfg.relayPin} (GPIO${relayGpio}) [${cfg.relayActiveLow ? 'Active LOW' : 'Active HIGH'}]
 * Cloud Sync   : Firebase Firestore REST API (Langsung terhubung tanpa login)
 * ============================================================================
 * Library yang dibutuhkan (Install via Arduino Library Manager):
 *   1. ESP8266WiFi (Bawaan core ESP8266)
 *   2. ESP8266HTTPClient (Bawaan core ESP8266)
 *   3. ArduinoJson (versi 6.x atau 7.x oleh Benoit Blanchon)
 * ============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include <time.h>

// ----------------------------------------------------------------------------
// 1. KONFIGURASI WI-FI (Catat SSID dan Password Wi-Fi Anda di sini)
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "${safeSsid}";
const char* WIFI_PASSWORD = "${safePass}";

// ----------------------------------------------------------------------------
// 2. KONFIGURASI FIREBASE PROJECT & DEVICE (Langsung aktif tanpa login)
// ----------------------------------------------------------------------------
const char* FIREBASE_API_KEY      = "${firebaseMeta.apiKey}";
const char* FIREBASE_PROJECT_ID   = "${firebaseMeta.projectId}";
const char* FIREBASE_DATABASE_ID  = "${firebaseMeta.firestoreDatabaseId}";
const char* DEVICE_ID             = "${safeDeviceId}";

// ----------------------------------------------------------------------------
// 3. PEMETAAN PIN HARDWARE ESP LOLIN
// ----------------------------------------------------------------------------
const uint8_t PIN_PIR         = ${pirGpio};  // ${cfg.pirPin} -> Hubungkan ke OUT Sensor PIR HC-SR501
const uint8_t PIN_RELAY       = ${relayGpio};  // ${cfg.relayPin} -> Hubungkan ke IN Modul Relay
const uint8_t PIN_LED_BUILTIN = 2;  // D4 (LED Biru onboard ESP Lolin, Active LOW)
const bool    RELAY_ACTIVE_LOW = ${cfg.relayActiveLow ? 'true' : 'false'};
const float   LAMP_WATTS       = ${cfg.lampWatts.toFixed(1)};

// ----------------------------------------------------------------------------
// 4. VARIABEL STATUS & TIMER NON-BLOCKING
// ----------------------------------------------------------------------------
unsigned long lastCloudSyncMs    = 0;
unsigned long lastWifiRetryMs    = 0;
const unsigned long SYNC_INTERVAL_MS = ${cfg.pollIntervalMs};

bool lampOn               = false;
bool standbyMode          = true;
bool lastPirState         = false;
bool timerEnabled         = false;
int  timerDurationSeconds = 60;
int  motionHoldSeconds    = 10;

String lastTriggerSource        = "manual"; // "manual" | "motion" | "timer"
unsigned long lampStartedMillis = 0;
unsigned long motionClearMillis = 0;
unsigned long timerStartMillis  = 0;
bool timerCountdownActive       = false;
bool waitingMotionTimeout       = false;

// ----------------------------------------------------------------------------
// FUNGSI KONTROL HARDWARE RELAY
// ----------------------------------------------------------------------------
void applyRelayHardware(bool state) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PIN_RELAY, state ? LOW : HIGH);
  } else {
    digitalWrite(PIN_RELAY, state ? HIGH : LOW);
  }
  // LED onboard D4 menyala (LOW) saat lampu ON
  digitalWrite(PIN_LED_BUILTIN, state ? LOW : HIGH);
}

// ----------------------------------------------------------------------------
// FUNGSI WI-FI & WAKTU NTP (WIB UTC+7)
// ----------------------------------------------------------------------------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("[WiFi] Menghubungkan ke SSID: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\\n[WiFi] Terhubung!");
    Serial.print("[WiFi] IP Address : ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI       : ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    // Sinkronisasi jam NTP (UTC+7 untuk WIB) agar log tanggal harian akurat
    configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("\\n[WiFi] Gagal terhubung, akan mencoba ulang...");
  }
}

String getCurrentDateKey() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);
  char buf[11];
  if (t->tm_year + 1900 >= 2024) {
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d", t->tm_year + 1900, t->tm_mon + 1, t->tm_mday);
  } else {
    snprintf(buf, sizeof(buf), "2026-01-01");
  }
  return String(buf);
}

unsigned long long getEpochMs() {
  time_t now = time(nullptr);
  if (now < 1700000000) {
    return 1700000000000ULL + millis();
  }
  return (unsigned long long)now * 1000ULL;
}

// ----------------------------------------------------------------------------
// KIRIM LOG DURASI PEMAKAIAN HARIAN KE FIRESTORE
// ----------------------------------------------------------------------------
void postUsageLogToCloud(unsigned long durationSec, const String& triggerSrc, const String& endReason) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (durationSec < 1) durationSec = 1;

  unsigned long long endedAtMs = getEpochMs();
  unsigned long long startedAtMs = endedAtMs - ((unsigned long long)durationSec * 1000ULL);
  String logId = String("esp_") + String((unsigned long)(endedAtMs / 1000ULL));

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient https;
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/" + FIREBASE_DATABASE_ID +
               "/documents:commit?key=" + FIREBASE_API_KEY;

  if (!https.begin(*client, url)) return;
  https.addHeader("Content-Type", "application/json");

  String docName = String("projects/") + FIREBASE_PROJECT_ID +
                   "/databases/" + FIREBASE_DATABASE_ID +
                   "/documents/devices/" + DEVICE_ID + "/usageLogs/" + logId;

  JsonDocument doc;
  JsonArray writes = doc["writes"].to<JsonArray>();

  // Write 1: Simpan dokumen UsageLog
  JsonObject w0 = writes.add<JsonObject>();
  JsonObject update = w0["update"].to<JsonObject>();
  update["name"] = docName;
  JsonObject fields = update["fields"].to<JsonObject>();
  fields["id"]["stringValue"] = logId;
  fields["deviceId"]["stringValue"] = DEVICE_ID;
  fields["dateKey"]["stringValue"] = getCurrentDateKey();
  fields["startedAtMs"]["doubleValue"] = (double)startedAtMs;
  fields["endedAtMs"]["doubleValue"] = (double)endedAtMs;
  fields["durationSeconds"]["integerValue"] = String(durationSec);
  fields["triggerSource"]["stringValue"] = (triggerSrc == "system") ? "manual" : triggerSrc;
  fields["endReason"]["stringValue"] = endReason;
  fields["watts"]["doubleValue"] = LAMP_WATTS;

  // Write 2: Isi createdAt memakai server timestamp (REQUEST_TIME)
  JsonObject w1 = writes.add<JsonObject>();
  w1["transform"]["document"] = docName;
  JsonArray transforms = w1["transform"]["fieldTransforms"].to<JsonArray>();
  JsonObject ft = transforms.add<JsonObject>();
  ft["fieldPath"] = "createdAt";
  ft["setToServerValue"] = "REQUEST_TIME";

  String body;
  serializeJson(doc, body);
  int code = https.POST(body);
  Serial.printf("[Cloud] Log pemakaian (%lus) dikirim -> HTTP %d\\n", durationSec, code);
  https.end();
}

// ----------------------------------------------------------------------------
// SINKRONISASI STATUS PERANGKAT DARI & KE FIRESTORE
// ----------------------------------------------------------------------------
void syncWithCloud(bool pushLocalChanges, bool pirState) {
  if (WiFi.status() != WL_CONNECTED) return;

  std::unique_ptr<BearSSL::WiFiClientSecure> client(new BearSSL::WiFiClientSecure);
  client->setInsecure();

  HTTPClient https;
  String docName = String("projects/") + FIREBASE_PROJECT_ID +
                   "/databases/" + FIREBASE_DATABASE_ID +
                   "/documents/devices/" + DEVICE_ID;

  if (pushLocalChanges) {
    String commitUrl = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
                       "/databases/" + FIREBASE_DATABASE_ID +
                       "/documents:commit?key=" + FIREBASE_API_KEY;

    if (https.begin(*client, commitUrl)) {
      https.addHeader("Content-Type", "application/json");

      JsonDocument commitDoc;
      JsonArray writes = commitDoc["writes"].to<JsonArray>();

      JsonObject w0 = writes.add<JsonObject>();
      JsonObject update = w0["update"].to<JsonObject>();
      update["name"] = docName;

      JsonArray maskPaths = w0["updateMask"]["fieldPaths"].to<JsonArray>();
      maskPaths.add("lampOn");
      maskPaths.add("motionDetected");
      maskPaths.add("lastTriggerSource");
      maskPaths.add("espOnline");

      JsonObject fields = update["fields"].to<JsonObject>();
      fields["lampOn"]["booleanValue"] = lampOn;
      fields["motionDetected"]["booleanValue"] = pirState;
      fields["lastTriggerSource"]["stringValue"] = lastTriggerSource;
      fields["espOnline"]["booleanValue"] = true;

      JsonObject w1 = writes.add<JsonObject>();
      w1["transform"]["document"] = docName;
      JsonArray transforms = w1["transform"]["fieldTransforms"].to<JsonArray>();
      JsonObject ft = transforms.add<JsonObject>();
      ft["fieldPath"] = "updatedAt";
      ft["setToServerValue"] = "REQUEST_TIME";

      String payload;
      serializeJson(commitDoc, payload);
      int code = https.POST(payload);
      if (code != 200) {
        Serial.printf("[Cloud] Update status gagal: HTTP %d\\n", code);
      }
      https.end();
    }
    return;
  }

  // Ambil perintah terbaru dari dashboard (GET)
  String getUrl = String("https://firestore.googleapis.com/v1/") + docName + "?key=" + FIREBASE_API_KEY;
  if (https.begin(*client, getUrl)) {
    int code = https.GET();
    if (code == 200) {
      String resp = https.getString();
      JsonDocument doc;
      if (deserializeJson(doc, resp) == DeserializationError::Ok) {
        JsonObject fields = doc["fields"];
        bool cloudLampOn     = fields["lampOn"]["booleanValue"] | lampOn;
        bool cloudStandby    = fields["standbyMode"]["booleanValue"] | standbyMode;
        bool cloudTimerEn    = fields["timerEnabled"]["booleanValue"] | timerEnabled;
        int  cloudTimerDur   = fields["timerDurationSeconds"]["integerValue"].as<int>();
        int  cloudMotionHold = fields["motionHoldSeconds"]["integerValue"].as<int>();
        String cloudTrigger  = fields["lastTriggerSource"]["stringValue"] | "manual";

        if (cloudTimerDur > 0) timerDurationSeconds = cloudTimerDur;
        if (cloudMotionHold > 0) motionHoldSeconds = cloudMotionHold;
        standbyMode = cloudStandby;
        timerEnabled = cloudTimerEn;

        if (cloudLampOn != lampOn) {
          lampOn = cloudLampOn;
          lastTriggerSource = cloudTrigger;
          applyRelayHardware(lampOn);

          if (lampOn) {
            lampStartedMillis = millis();
            waitingMotionTimeout = false;
            if (timerEnabled) {
              timerStartMillis = millis();
              timerCountdownActive = true;
            }
            Serial.println("[Dashboard] Lampu DINYALAKAN dari jarak jauh.");
          } else {
            timerCountdownActive = false;
            waitingMotionTimeout = false;
            Serial.println("[Dashboard] Lampu DIMATIKAN dari jarak jauh.");
          }
        }
      }
    }
    https.end();
  }
}

// ----------------------------------------------------------------------------
// SETUP & LOOP UTAMA ESP LOLIN
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED_BUILTIN, OUTPUT);

  applyRelayHardware(false);
  Serial.println("\\n=== LolinLamp Studio Firmware Siap (Direct Firebase) ===");

  connectWiFi();
  syncWithCloud(true, false);
}

void loop() {
  unsigned long now = millis();

  // 1. Jaga koneksi Wi-Fi tetap terhubung
  if (WiFi.status() != WL_CONNECTED && now - lastWifiRetryMs > 10000) {
    lastWifiRetryMs = now;
    connectWiFi();
  }

  // 2. Baca Sensor Gerak PIR
  bool pirNow = (digitalRead(PIN_PIR) == HIGH);
  bool stateChanged = false;

  if (pirNow != lastPirState) {
    lastPirState = pirNow;
    Serial.printf("[PIR] Gerakan: %s\\n", pirNow ? "TERDETEKSI" : "TIDAK ADA");

    if (standbyMode) {
      if (pirNow) {
        waitingMotionTimeout = false;
        if (!lampOn) {
          lampOn = true;
          lastTriggerSource = "motion";
          lampStartedMillis = now;
          applyRelayHardware(true);
          if (timerEnabled) {
            timerStartMillis = now;
            timerCountdownActive = true;
          }
          Serial.println("[Siaga] Gerakan memicu lampu MENYALA otomatis!");
        }
      } else if (lampOn && lastTriggerSource == "motion") {
        motionClearMillis = now;
        waitingMotionTimeout = true;
        Serial.printf("[Siaga] Gerakan berhenti, lampu padam dalam %d detik...\\n", motionHoldSeconds);
      }
    }
    stateChanged = true;
  }

  // 3. Cek Timer Otomatis (saat lampu menyala dengan timer)
  if (lampOn && timerCountdownActive) {
    unsigned long elapsedTimerSec = (now - timerStartMillis) / 1000UL;
    if (elapsedTimerSec >= (unsigned long)timerDurationSeconds) {
      unsigned long sessionSec = (now - lampStartedMillis) / 1000UL;
      lampOn = false;
      timerCountdownActive = false;
      waitingMotionTimeout = false;
      applyRelayHardware(false);
      Serial.println("[Timer] Durasi habis! Lampu DIMATIKAN otomatis.");
      postUsageLogToCloud(sessionSec, lastTriggerSource, "timer_expired");
      stateChanged = true;
    }
  }

  // 4. Cek Timeout Mode Siaga (setelah tidak ada gerakan)
  if (lampOn && standbyMode && waitingMotionTimeout && !lastPirState) {
    unsigned long idleSec = (now - motionClearMillis) / 1000UL;
    if (idleSec >= (unsigned long)motionHoldSeconds) {
      unsigned long sessionSec = (now - lampStartedMillis) / 1000UL;
      lampOn = false;
      waitingMotionTimeout = false;
      timerCountdownActive = false;
      applyRelayHardware(false);
      Serial.println("[Siaga] Tidak ada gerakan. Lampu DIMATIKAN otomatis.");
      postUsageLogToCloud(sessionSec, "motion", "motion_timeout");
      stateChanged = true;
    }
  }

  // 5. Sinkronisasi Real-Time dengan Firebase Firestore
  if (stateChanged) {
    syncWithCloud(true, pirNow);
    lastCloudSyncMs = now;
  } else if (now - lastCloudSyncMs >= SYNC_INTERVAL_MS) {
    lastCloudSyncMs = now;
    syncWithCloud(false, pirNow);
  }
}
`;
}
