/*
 * ESP32 Energy Monitor - MQTT Version (Dispositivo Principal)
 * 
 * Este código publica datos de energía (V, I, P, S, PF) vía MQTT
 * y muestra solo el stage 4 (RUN) en el LCD.
 * 
 * Configuración requerida:
 * - WIFI_SSID: Nombre de tu red Wi-Fi
 * - WIFI_PASS: Contraseña de tu red Wi-Fi
 * - MQTT_HOST: IP del broker MQTT (ej: 192.168.100.64)
 * - MQTT_PORT: Puerto del broker (1883 por defecto)
 * - MQTT_USER: Usuario MQTT (opcional)
 * - MQTT_PASS: Contraseña MQTT (opcional)
 */

#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <WiFi.h>
#include <PubSubClient.h>

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
float V_CAL_GAIN = 800.0f;   // ajusta hasta ~220–240 V
float I_CAL_GAIN = 0.97f;    // ajusta hasta que Irms coincida con pinza
float PHASE_CAL  = 0.08f;    // ajusta hasta que P≈V*I y PF≈1 con carga resistiva
float I_POL      = 1.0f;     // 1 o -1 (polaridad CT)

// ======== Persistencia / Etapas =======
Preferences prefs;
const char* NVS_NS = "energy";
enum Stage : uint8_t { RAW=0, VOLT=1, CURR=2, PHASE=3, RUN=4 };
Stage stage = RUN; // Siempre en stage 4 (RUN)

// ======== Wi-Fi / MQTT ===============
#define WIFI_SSID   "Flia Peralta"
#define WIFI_PASS   "P3p4.2705"

//#define MQTT_HOST   "192.168.100.64"
#define MQTT_HOST   "10.143.221.168" // IP del broker MQTT
#define MQTT_PORT   1883
#define MQTT_USER   ""               // si tu broker no requiere, dejar vacío
#define MQTT_PASS   ""               // idem

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String deviceId; // chipID
char topicState[64];
char topicLWT[64];

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
  prefs.end();
  Serial.println(F("[NVS] Saved"));
}

void loadCal() {
  prefs.begin(NVS_NS, true);
  V_CAL_GAIN = prefs.getFloat("V_GAIN", V_CAL_GAIN);
  I_CAL_GAIN = prefs.getFloat("I_GAIN", I_CAL_GAIN);
  PHASE_CAL  = prefs.getFloat("PHASE",  PHASE_CAL);
  I_POL      = prefs.getFloat("I_POL",  I_POL);
  stage      = RUN; // Siempre stage 4
  prefs.end();
  Serial.printf("[NVS] Loaded V=%.2f I=%.3f PH=%.3f I_POL=%.0f ST=4 (RUN)\n",
                V_CAL_GAIN, I_CAL_GAIN, PHASE_CAL, I_POL);
}

void printHelp() {
  Serial.println(F("\n=== COMANDOS ==="));
  Serial.println(F("vgain <v>      -> set V_CAL_GAIN"));
  Serial.println(F("igain <v>      -> set I_CAL_GAIN"));
  Serial.println(F("phase <v>      -> set PHASE_CAL (0.00–0.20)"));
  Serial.println(F("ipol 1|-1      -> polaridad CT"));
  Serial.println(F("save | load"));
  Serial.println(F("=================\n"));
}

// -------------- Wi-Fi / MQTT --------------
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

void mqttEnsure() {
  if (mqtt.connected()) return;
  wifiEnsure();
  if (WiFi.status() != WL_CONNECTED) return;

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  // Last Will & Testament
  mqtt.connect(deviceId.c_str(),
               (strlen(MQTT_USER)?MQTT_USER:NULL),
               (strlen(MQTT_PASS)?MQTT_PASS:NULL),
               topicLWT, 0, true, "offline");
  if (mqtt.connected()) {
    mqtt.publish(topicLWT, "online", true);
    Serial.println("[MQTT] Connected");
  } else {
    Serial.printf("[MQTT] Connect failed, rc=%d\n", mqtt.state());
  }
}

void mqttPublish(float V, float I, float P, float S, float PF) {
  if (!mqtt.connected()) return;

  // DEBUG: Ver qué valores se publican
  Serial.printf("[MQTT] Publicando: V=%.1f I=%.3f P=%.1f S=%.1f PF=%.3f\n", 
                V, I, P, S, PF);

  // JSON con los datos
  char json[200];
  snprintf(json, sizeof(json),
           "{\"device\":\"%s\",\"V\":%.1f,\"I\":%.3f,\"P\":%.1f,\"S\":%.1f,\"PF\":%.3f}",
           deviceId.c_str(), V, I, fabsf(P), S, fabsf(PF));
  mqtt.publish(topicState, json, false);
}

// -------------- Serial parser --------------
String rx;

void setup() {
  Serial.begin(115200);
  delay(250);

  Wire.begin(21, 22);
  lcd.init(); lcd.backlight();
  lcdPrintLine(0, "Dispositivo");
  lcdPrintLine(1, "Principal");

  analogReadResolution(ADC_BITS);
  analogSetAttenuation(ADC_11db);

  // Device ID
  deviceId = String((uint32_t)ESP.getEfuseMac(), HEX);
  deviceId.toUpperCase();
  Serial.printf("[Device] ID: %s\n", deviceId.c_str());
  snprintf(topicState, sizeof(topicState), "esp/energia/%s/state", deviceId.c_str());
  snprintf(topicLWT,   sizeof(topicLWT),   "esp/energia/%s/status",deviceId.c_str());

  loadCal();
  printHelp();

  // Wi-Fi/MQTT inicial
  wifiEnsure();
  mqtt.setSocketTimeout(2); // conexión más reactiva
  mqttEnsure();

  delay(1000);
  lcdPrintLine(0, "Conectando...");
}

void loop() {
  // --- comandos por serial ---
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c=='\r' || c=='\n') {
      rx.trim();
      if (rx.length()) {
        if (rx.equalsIgnoreCase("help")) printHelp();
        else if (rx.startsWith("vgain")) {
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
        } else if (rx.equalsIgnoreCase("save")) saveCal();
        else if (rx.equalsIgnoreCase("load")) loadCal();
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

  // --- LCD: Solo mostrar stage 4 (RUN) ---
  float P_disp  = fabsf(P);
  float PF_disp = fabsf(PF);
  
  char l1[17]; snprintf(l1, sizeof(l1), "V=%3.0f I=%5.2f", Vrms, Irms);
  lcdPrintLine(0, String(l1));
  char l2[17];
  if (P_disp >= 9999.5f) snprintf(l2, sizeof(l2), "P=%5.2fkW PF=%.2f", P_disp/1000.0f, PF_disp);
  else                   snprintf(l2, sizeof(l2), "P=%4.0fW PF=%.2f",  P_disp,           PF_disp);
  lcdPrintLine(1, String(l2));

  // Serial output (solo RUN)
  Serial.printf("RUN  V=%.1f I=%.3f  P=%.1fW(sig)  S=%.1fVA  PF=%.3f(sig)  I_POL=%.0f\n",
                Vrms, Irms, P, S, PF, I_POL);

  // --- MQTT: publica cada PUB_INTERVAL_MS ---
  mqtt.loop();
  mqttEnsure();
  if (millis() - lastPubMs >= PUB_INTERVAL_MS && mqtt.connected()) {
    lastPubMs = millis();
    mqttPublish(Vrms, Irms, P, S, PF);
  }

  delay(20);
}

