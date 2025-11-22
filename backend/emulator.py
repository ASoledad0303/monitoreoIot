# -*- coding: utf-8 -*-
"""
Emulador ESP32 (tesis IOT energía) -> Mosquitto (MQTT)
- Publica muestras instantáneas de V e I (para debugging/plot)
- Calcula Vrms, Irms cada ventana y publica potencia aparente S = Vrms * Irms
- Payloads JSON con timestamp
- Retained en los últimos valores calculados (para "almacenarlos" en el broker)

Requisitos:
  pip install paho-mqtt

Sugerido para tesis:
  - Frecuencia de red: 50 Hz (Paraguay)
  - Tensión nominal: 220 Vrms
"""
import time, math, random, json, os, signal
import paho.mqtt.client as mqtt

# =========================
# CONFIGURACIÓN
# =========================
BROKER   = os.getenv("MQTT_BROKER", "mosquitto")
PORT     = int(os.getenv("MQTT_PORT", "1883"))
USERNAME = os.getenv("MQTT_USER", "") or None
PASSWORD = os.getenv("MQTT_PASS", "") or None

# Topics base (puedes ajustarlos a tu arbol)
BASE              = os.getenv("MQTT_BASE", "tesis/iot/esp32")
TOPIC_SAMPLES_V   = f"{BASE}/samples/voltage"    # muestras instantáneas (no retained)
TOPIC_SAMPLES_I   = f"{BASE}/samples/current"    # muestras instantáneas (no retained)
TOPIC_VRMS        = f"{BASE}/metrics/vrms"       # Vrms (retained)
TOPIC_IRMS        = f"{BASE}/metrics/irms"       # Irms (retained)
TOPIC_S_APPARENT  = f"{BASE}/metrics/s_apparent" # Potencia aparente S en VA (retained)
TOPIC_TELEMETRY   = f"{BASE}/telemetry"          # JSON consolidado (retained)

# Parámetros eléctricos simulados
F_NET_HZ      = 50.0                      # frecuencia de red
V_RMS_TARGET  = 220.0                    # Vrms nominal
PF_MEAN       = 0.88                      # factor de potencia medio (solo para formar la I)
I_RMS_BASE    = 5.0                       # corriente RMS base (A) a carga "media"
I_RMS_SWING   = 3.0                       # oscilación de corriente RMS +/- (A) lenta
NOISE_V       = 0.8                       # ruido (voltios) instantáneo
NOISE_I       = 0.05                      # ruido (amperios) instantáneo

# Muestreo y ventana de cálculo RMS
SAMPLE_RATE_HZ   = 1000                   # muestras por segundo (para V e I)
WINDOW_SECONDS   = 1.0                    # ventana de RMS (segundos)
SAMPLES_PER_WIN  = int(SAMPLE_RATE_HZ * WINDOW_SECONDS)

# Publicación
QOS_SAMPLES = 0
QOS_METRIC  = 1
RETAIN_METRIC = True     # deja el último valor guardado en el broker

# =========================
# Emulación señales
# =========================
# Vp = Vrms * sqrt(2)
V_PEAK = V_RMS_TARGET * math.sqrt(2)

# Generamos una variación lenta de carga (corriente RMS) para que no sea constante
def current_rms_profile(t: float) -> float:
    # variación senoidal de baja frecuencia (cada ~30s)
    return I_RMS_BASE + I_RMS_SWING * math.sin(2 * math.pi * (t / 30.0))

def generate_sample(t: float):
    # tensión senoidal 50 Hz con ruido
    v_inst = V_PEAK * math.sin(2 * math.pi * F_NET_HZ * t) + random.uniform(-NOISE_V, NOISE_V)

    # corriente: aproximamos con mismo ángulo (pf ~ cos(phi)), pero sin calcular phi explícito.
    # Para hacerlo simple, usamos una sinusoide con posible desfase fijo derivado del PF promedio.
    # cos(phi) = PF => phi = arccos(PF)
    phi = math.acos(PF_MEAN)
    i_rms = max(0.1, current_rms_profile(t))  # limite inferior para evitar 0
    i_peak = i_rms * math.sqrt(2)
    i_inst = i_peak * math.sin(2 * math.pi * F_NET_HZ * t - phi) + random.uniform(-NOISE_I, NOISE_I)
    return v_inst, i_inst

# RMS
def rms(values):
    return math.sqrt(sum(v*v for v in values) / len(values))

# =========================
# MQTT setup
# =========================
def make_client():
    client_id = f"emu-esp32-{random.randint(0,9999)}"
    c = mqtt.Client(client_id=client_id, clean_session=True)

    # Last Will (útil para monitoreo)
    will_payload = json.dumps({"ts": int(time.time()*1000), "status":"offline"})
    c.will_set(f"{BASE}/status", payload=will_payload, qos=1, retain=True)

    if USERNAME and PASSWORD:
        c.username_pw_set(USERNAME, PASSWORD)

    c.connect(BROKER, PORT, keepalive=60)
    c.loop_start()

    # Publicamos "online"
    online_payload = json.dumps({"ts": int(time.time()*1000), "status":"online"})
    c.publish(f"{BASE}/status", online_payload, qos=1, retain=True)
    return c

running = True
def _handle_sigterm(*_):
    global running
    running = False

# =========================
# MAIN
# =========================
def main():
    signal.signal(signal.SIGINT, _handle_sigterm)
    signal.signal(signal.SIGTERM, _handle_sigterm)

    c = make_client()

    # buffers para RMS
    buf_v = []
    buf_i = []

    t0 = time.time()
    next_sample_time = t0
    sample_period = 1.0 / SAMPLE_RATE_HZ

    # Para telemetría por ventana
    last_publish = t0

    while running:
        now = time.time()
        if now < next_sample_time:
            # dormir un poquito hasta la próxima muestra
            time.sleep(max(0.0, next_sample_time - now))
            continue

        # tiempo relativo para la señal
        t = now - t0

        # genera muestras
        v, i = generate_sample(t)
        buf_v.append(v)
        buf_i.append(i)

        # publicar muestras ocasionales (no retained) para debug
        # (para no saturar, enviamos 100 ms worth aprox.)
        if len(buf_v) % int(SAMPLE_RATE_HZ/10) == 0:
            ts = int(now * 1000)
            c.publish(TOPIC_SAMPLES_V, json.dumps({"ts": ts, "v": v}), qos=QOS_SAMPLES, retain=False)
            c.publish(TOPIC_SAMPLES_I, json.dumps({"ts": ts, "i": i}), qos=QOS_SAMPLES, retain=False)

        # cada ventana: calcular RMS y potencia aparente
        if (now - last_publish) >= WINDOW_SECONDS:
            last_publish = now

            # aseguramos tamaño mínimo
            if len(buf_v) >= SAMPLES_PER_WIN:
                win_v = buf_v[-SAMPLES_PER_WIN:]
                win_i = buf_i[-SAMPLES_PER_WIN:]
            else:
                # si aún no llenamos una ventana, usamos lo que hay
                win_v = buf_v[:]
                win_i = buf_i[:]

            vrms = rms(win_v)
            irms = rms(win_i)
            s_va = vrms * irms   # Potencia aparente en VA

            ts = int(now * 1000)

            # Publicaciones individuales (retained para “almacenar” último valor)
            c.publish(TOPIC_VRMS, json.dumps({"ts": ts, "value": round(vrms, 3), "unit":"V"}), qos=QOS_METRIC, retain=RETAIN_METRIC)
            c.publish(TOPIC_IRMS, json.dumps({"ts": ts, "value": round(irms, 3), "unit":"A"}), qos=QOS_METRIC, retain=RETAIN_METRIC)
            c.publish(TOPIC_S_APPARENT, json.dumps({"ts": ts, "value": round(s_va, 3), "unit":"VA"}), qos=QOS_METRIC, retain=RETAIN_METRIC)

            # Telemetría consolidada (retained)
            telemetry = {
                "ts": ts,
                "vrms": round(vrms, 3),
                "irms": round(irms, 3),
                "s_apparent_va": round(s_va, 3),
                "f_net_hz": F_NET_HZ,
                "pf_assumed": PF_MEAN
            }
            c.publish(TOPIC_TELEMETRY, json.dumps(telemetry), qos=QOS_METRIC, retain=RETAIN_METRIC)

        # siguiente instante de muestreo
        next_sample_time += sample_period

    # Apagado ordenado
    offline_payload = json.dumps({"ts": int(time.time()*1000), "status":"offline"})
    c.publish(f"{BASE}/status", offline_payload, qos=1, retain=True)
    c.loop_stop()
    c.disconnect()

if __name__ == "__main__":
    main()
