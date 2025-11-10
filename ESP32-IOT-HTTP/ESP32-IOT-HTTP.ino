/*
 * ESP32 Energy Monitor - HTTP POST Version
 * 
 * Este código modifica el original para enviar datos directamente
 * al backend Next.js vía HTTP POST en lugar de MQTT.
 * 
 * Configuración requerida:
 * - WIFI_SSID: Nombre de tu red Wi-Fi
 * - WIFI_PASS: Contraseña de tu red Wi-Fi
 * - API_URL: URL del backend (ej: http://localhost:3000/api/iot/telemetry)
 * - API_KEY: API key del dispositivo (obtener desde la base de datos)
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ================= LCD =================
#define LCD_ADDR 0x27
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);

// ================ Pines ADC ================
#define ADC_CT_PIN 34   // SCT-013-000 (burden + bias 1.65V)
#define ADC_V_PIN  35   // ZMPT101B (3.3V)

// ================ ADC =================
#define ADC_BITS     12
#define ADC_MAX      4095.0f
#define ADC_RANGE_V  3.30f
#define WINDOW_MS        200
#define OFFSET_SETTLE_MS 60
#define MIN_VSIG         0.003f

// ================ CT ==================
#define RBURDEN_OHMS 39.6f
#define CT_RATIO     2000.0f

// ======== Calibrables (3.3V) =========
float V_CAL_GAIN = 780.0f;   // ajusta hasta ~220–240 V
float I_CAL_GAIN = 0.97f;    // ajusta hasta que Irms coincida con pinza
float PHASE_CAL  = 0.08f;    // ajusta hasta que P≈V*I y PF≈1 con carga resistiva
float I_POL      = 1.0f;     // 1 o -1 (polaridad CT)

// ======== Persistencia / Etapas =======
Preferences prefs;
const char* NVS_NS = "energy";
enum Stage : uint8_t { RAW=0, VOLT=1, CURR=2, PHASE=3, RUN=4 };
Stage stage = RAW;

// ======== Wi-Fi / HTTP ===============
#define WIFI_SSID   "Flia Peralta"
#define WIFI_PASS   "P3p4.2705"

// URL del backend Next.js
// Si está en Docker, usar la IP del host o el nombre del servicio
// Ejemplo: "http://192.168.1.100:3000/api/iot/telemetry"
// O si está en la misma red: "http://localhost:3000/api/iot/telemetry"
#define API_URL     "http://192.168.100.64:3000/api/iot/telemetry"

// API Key del dispositivo (obtener desde la base de datos después de crear el dispositivo)
// Se puede configurar también desde el Serial Monitor con el comando: apikey <key>
String deviceApiKey = "c797f8c6cd20c3961d41347a824b8da6";

WiFiClient wifiClient;
HTTPClient http;

String deviceId; // chipID

unsigned long lastPubMs = 0;
const unsigned long PUB_INTERVAL_MS = 1000; // publica cada 1 s

// =====================================

static inline float adcToVolts(int raw) { return (raw * ADC_RANGE_V) / ADC_MAX; }

void lcdPrintLine(uint8_t row, const String& text) {
  lcd.setCursor(0, row);
  lcd.print("                ");
  lcd.setCursor(0, row);
  for (uint8_t i = 0; i < text.length() && i < 16; i++) lcd.print(text[i]);
}

static inline float phaseLead(float v, float v_prev, float alpha) {
  return v + alpha * (v - v_prev);
}

void measureOffsets(float &off_ct, float &off_v) {
  uint32_t t0 = millis();
  double sct=0, sv=0; uint32_t n=0;
  while ((millis()-t0) < OFFSET_SETTLE_MS) { sct += analogRead(ADC_CT_PIN); sv += analogRead(ADC_V_PIN); n++; }
  if (!n) { off_ct=off_v=0; return; }
  off_ct = adcToVolts((int)(sct/n));
  off_v  = adcToVolts((int)(sv/n));
}

void sampleWindow(float off_ct, float off_v,
                  float &Vrms, float &Irms, float &P, float &PF, float &S,
                  int &raw_min_v, int &raw_max_v, int &raw_min_ct, int &raw_max_ct,
                  float &Vrms_ADC) {

  uint32_t t0 = millis();
  double sum_v2=0, sum_i2=0, sum_p=0; uint32_t n=0;
  float v_prev=0; bool first=true;

  raw_min_v =  100000; raw_max_v = -100000;
  raw_min_ct = 100000; raw_max_ct = -100000;

  double sum_v2_adc = 0.0;

  while ((millis()-t0) < WINDOW_MS) {
    int rct = analogRead(ADC_CT_PIN);
    int rv  = analogRead(ADC_V_PIN);

    if (rct < raw_min_ct) raw_min_ct = rct;
    if (rct > raw_max_ct) raw_max_ct = rct;
    if (rv  < raw_min_v ) raw_min_v  = rv;
    if (rv  > raw_max_v ) raw_max_v  = rv;

    float v_adc_ct = adcToVolts(rct) - off_ct;
    float v_adc_v  = adcToVolts(rv)  - off_v;

    if (fabsf(v_adc_ct) < MIN_VSIG) v_adc_ct = 0;
    if (fabsf(v_adc_v)  < MIN_VSIG) v_adc_v  = 0;

    float i_inst = (v_adc_ct / RBURDEN_OHMS * CT_RATIO) * I_CAL_GAIN * I_POL; // A
    float v_now  = v_adc_v * V_CAL_GAIN;                                      // V

    float v_aligned = first ? v_now : phaseLead(v_now, v_prev, PHASE_CAL);
    first=false; v_prev=v_now;

    sum_i2 += i_inst * i_inst;
    sum_v2 += v_now   * v_now;
    sum_p  += v_aligned * i_inst;

    sum_v2_adc += v_adc_v * v_adc_v; // Vrms en el ADC
    n++;
  }

  if (!n) { Vrms=Irms=P=PF=S=Vrms_ADC=0; return; }

  Irms = sqrtf(sum_i2 / (float)n);
  Vrms = sqrtf(sum_v2 / (float)n);
  P    = (float)(sum_p / (double)n);           // signed (puede ser negativo si polaridad invertida)
  S  = Vrms * Irms;
  PF = (S > 1e-3f) ? (P / S) : 0.0f;
  Vrms_ADC = sqrtf(sum_v2_adc / (float)n);
}

// -------------- Persistencia --------------
void saveCal() {
  prefs.begin(NVS_NS, false);
  prefs.putFloat("V_GAIN", V_CAL_GAIN);
  prefs.putFloat("I_GAIN", I_CAL_GAIN);
  prefs.putFloat("PHASE",  PHASE_CAL);
  prefs.putFloat("I_POL",  I_POL);
  prefs.putUChar("STAGE",  (uint8_t)stage);
  prefs.putString("API_KEY", deviceApiKey);
  prefs.end();
  Serial.println(F("[NVS] Saved"));
}

void loadCal() {
  prefs.begin(NVS_NS, true);
  V_CAL_GAIN = prefs.getFloat("V_GAIN", V_CAL_GAIN);
  I_CAL_GAIN = prefs.getFloat("I_GAIN", I_CAL_GAIN);
  PHASE_CAL  = prefs.getFloat("PHASE",  PHASE_CAL);
  I_POL      = prefs.getFloat("I_POL",  I_POL);
  stage      = (Stage)prefs.getUChar("STAGE", (uint8_t)stage);
  deviceApiKey = prefs.getString("API_KEY", "");
  prefs.end();
  Serial.printf("[NVS] Loaded V=%.2f I=%.3f PH=%.3f I_POL=%.0f ST=%u\n",
                V_CAL_GAIN, I_CAL_GAIN, PHASE_CAL, I_POL, (unsigned)stage);
  if (deviceApiKey.length() > 0) {
    Serial.printf("[NVS] API Key loaded: %s\n", deviceApiKey.c_str());
  }
}

void defaultsCal() {
  V_CAL_GAIN = 800.0f;
  I_CAL_GAIN = 0.97f;
  PHASE_CAL  = 0.08f;
  I_POL      = 1.0f;
  stage      = RAW;
  deviceApiKey = "";
  Serial.println(F("[NVS] Defaults (use 'save' to persist)"));
}

void printHelp() {
  Serial.println(F("\n=== COMANDOS ==="));
  Serial.println(F("help"));
  Serial.println(F("stage X        -> 0(RAW),1(VOLT),2(CURR),3(PHASE),4(RUN)"));
  Serial.println(F("vgain <v>      -> set V_CAL_GAIN"));
  Serial.println(F("igain <v>      -> set I_CAL_GAIN"));
  Serial.println(F("phase <v>      -> set PHASE_CAL (0.00–0.20)"));
  Serial.println(F("ipol 1|-1      -> polaridad CT"));
  Serial.println(F("apikey <key>   -> configurar API key del dispositivo"));
  Serial.println(F("save | load | defaults"));
  Serial.println(F("=================\n"));
}

// -------------- Wi-Fi / HTTP --------------
void wifiEnsure() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[WiFi] Connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && (millis()-t0) < 15000) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] OK. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] FAIL");
  }
}

void httpPublish(float V, float I, float P, float S, float PF) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (deviceApiKey.length() == 0) {
    Serial.println("[HTTP] API Key no configurada. Usa: apikey <key>");
    return;
  }

  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", deviceApiKey);

  // Crear JSON con los datos
  String json = "{";
  json += "\"device\":\"" + deviceId + "\",";
  json += "\"V\":" + String(V, 1) + ",";
  json += "\"I\":" + String(I, 3) + ",";
  json += "\"P\":" + String(P, 1) + ",";
  json += "\"S\":" + String(S, 1) + ",";
  json += "\"PF\":" + String(PF, 3);
  json += "}";

  int httpResponseCode = http.POST(json);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      String response = http.getString();
      Serial.printf("[HTTP] OK: %s\n", response.c_str());
    } else {
      Serial.printf("[HTTP] Error %d: %s\n", httpResponseCode, http.getString().c_str());
    }
  } else {
    Serial.printf("[HTTP] Failed: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// -------------- Serial parser --------------
String rx;

void setup() {
  Serial.begin(115200);
  delay(250);

  Wire.begin(21, 22);
  lcd.init(); lcd.backlight();
  lcdPrintLine(0, "ESP32 Energy 3V3");
  lcdPrintLine(1, "Init...");

  analogReadResolution(ADC_BITS);
  analogSetAttenuation(ADC_11db);

  // Device ID
  deviceId = String((uint32_t)ESP.getEfuseMac(), HEX);
  deviceId.toUpperCase();
  Serial.printf("[Device] ID: %s\n", deviceId.c_str());

  loadCal();
  printHelp();

  // Wi-Fi inicial
  wifiEnsure();

  lcdPrintLine(1, "Ready (stage 0)");
}

void loop() {
  // --- comandos por serial ---
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c=='\r' || c=='\n') {
      rx.trim();
      if (rx.length()) {
        if (rx.equalsIgnoreCase("help")) printHelp();
        else if (rx.startsWith("stage")) {
          int s = rx.substring(5).toInt();
          if (s>=0 && s<=4) { stage=(Stage)s; Serial.printf("[OK] Stage=%d\n", s); lcdPrintLine(1, String("Stage=")+String(s)); }
          else Serial.println("[ERR] Stage 0..4");
        } else if (rx.startsWith("vgain")) {
          float v = rx.substring(5).toFloat();
          if (v>50 && v<3000) { V_CAL_GAIN=v; Serial.printf("[OK] V_GAIN=%.2f\n", v); }
          else Serial.println("[ERR] vgain fuera de rango");
        } else if (rx.startsWith("igain")) {
          float v = rx.substring(5).toFloat();
          if (v>0.01 && v<10.0) { I_CAL_GAIN=v; Serial.printf("[OK] I_GAIN=%.3f\n", v); }
          else Serial.println("[ERR] igain fuera de rango");
        } else if (rx.startsWith("phase")) {
          float v = rx.substring(6).toFloat();
          if (v>=0.0 && v<=0.2) { PHASE_CAL=v; Serial.printf("[OK] PHASE=%.3f\n", v); }
          else Serial.println("[ERR] phase 0.00..0.20");
        } else if (rx.startsWith("ipol")) {
          float v = rx.substring(4).toFloat(); // ipol -1  ó ipol 1
          I_POL = (v >= 0) ? 1.0f : -1.0f;
          Serial.printf("[OK] I_POL=%.0f\n", I_POL);
        } else if (rx.startsWith("apikey")) {
          deviceApiKey = rx.substring(7);
          deviceApiKey.trim();
          if (deviceApiKey.length() > 0) {
            Serial.printf("[OK] API Key configurada: %s\n", deviceApiKey.c_str());
            Serial.println("[INFO] Usa 'save' para guardar permanentemente");
          } else {
            Serial.println("[ERR] API Key vacía");
          }
        } else if (rx.equalsIgnoreCase("save")) saveCal();
        else if (rx.equalsIgnoreCase("load")) loadCal();
        else if (rx.equalsIgnoreCase("defaults")) defaultsCal();
        else Serial.println("[ERR] comando no reconocido (help)");
      }
      rx="";
    } else rx += c;
  }

  // --- medición ---
  float off_ct=0, off_v=0; measureOffsets(off_ct, off_v);
  float Vrms=0, Irms=0, P=0, PF=0, S=0, Vrms_ADC=0;
  int rminV, rmaxV, rminCT, rmaxCT;
  sampleWindow(off_ct, off_v, Vrms, Irms, P, PF, S, rminV, rmaxV, rminCT, rmaxCT, Vrms_ADC);

  // --- LCD / Serial por etapa ---
  float P_disp  = fabsf(P);
  float PF_disp = fabsf(PF);

  switch (stage) {
    case RAW: {
      Serial.printf("RAW  V:[%d..%d] CT:[%d..%d] offV=%.3f offCT=%.3f\n", rminV, rmaxV, rminCT, rmaxCT, off_v, off_ct);
      lcdPrintLine(0, "RAW ranges V/CT");
      char l2[17]; snprintf(l2, sizeof(l2), "V:%4d-%4d", rminV, rmaxV);
      lcdPrintLine(1, String(l2));
      break;
    }
    case VOLT: {
      float Vpp_ADC = (adcToVolts(rmaxV) - off_v) - (adcToVolts(rminV) - off_v);
      Serial.printf("VOLT Vrms=%.1fV  Vrms_ADC=%.4fV  Vpp_ADC=%.4fV  V_GAIN=%.2f  RAW[%d..%d]\n",
                    Vrms, Vrms_ADC, Vpp_ADC, V_CAL_GAIN, rminV, rmaxV);
      char l1[17]; snprintf(l1, sizeof(l1), "Vr=%3.0fV Vg=%3.0f", Vrms, V_CAL_GAIN);
      lcdPrintLine(0, String(l1));
      char l2[17]; snprintf(l2, sizeof(l2), "Vpp=%.2f", Vpp_ADC);
      lcdPrintLine(1, String(l2));
      break;
    }
    case CURR: {
      Serial.printf("CURR Irms=%.3fA  I_GAIN=%.3f  I_POL=%.0f  CT_RAW[%d..%d]\n", Irms, I_CAL_GAIN, I_POL, rminCT, rmaxCT);
      char l1[17]; snprintf(l1, sizeof(l1), "Ir=%5.2fA", Irms);
      lcdPrintLine(0, String(l1));
      char l2[17]; snprintf(l2, sizeof(l2), "IG=%.3f", I_CAL_GAIN);
      lcdPrintLine(1, String(l2));
      break;
    }
    case PHASE: {
      Serial.printf("PHASE V=%.1f I=%.3f  P=%.1fW(sig)  S=%.1fVA  PF=%.3f(sig)  PH=%.3f  I_POL=%.0f\n",
                    Vrms, Irms, P, S, PF, PHASE_CAL, I_POL);
      char l1[17]; snprintf(l1, sizeof(l1), "P=%4.0fW PF=%.2f", P_disp, PF_disp);
      lcdPrintLine(0, String(l1));
      char l2[17]; snprintf(l2, sizeof(l2), "PH=%.3f", PHASE_CAL);
      lcdPrintLine(1, String(l2));
      break;
    }
    case RUN: {
      Serial.printf("RUN  V=%.1f I=%.3f  P=%.1fW(sig)  S=%.1fVA  PF=%.3f(sig)  I_POL=%.0f\n",
                    Vrms, Irms, P, S, PF, I_POL);
      char l1[17]; snprintf(l1, sizeof(l1), "V=%3.0f I=%5.2f", Vrms, Irms);
      lcdPrintLine(0, String(l1));
      char l2[17];
      if (P_disp >= 9999.5f) snprintf(l2, sizeof(l2), "P=%5.2fkW PF=%.2f", P_disp/1000.0f, PF_disp);
      else                   snprintf(l2, sizeof(l2), "P=%4.0fW PF=%.2f",  P_disp,           PF_disp);
      lcdPrintLine(1, String(l2));
      break;
    }
  }

  // --- HTTP: publica cada PUB_INTERVAL_MS ---
  wifiEnsure();
  if (millis() - lastPubMs >= PUB_INTERVAL_MS && WiFi.status() == WL_CONNECTED) {
    lastPubMs = millis();
    httpPublish(Vrms, Irms, P, S, PF);
  }

  delay(20);
}

