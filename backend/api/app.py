# -*- coding: utf-8 -*-
"""
Flask API - Métricas en tiempo real desde Mosquitto (tesis IoT energía)
- Se suscribe a los tópicos MQTT del emulador ESP32.
- Mantiene el último valor (y un pequeño buffer de muestras) en memoria.
- Expone endpoints REST + SSE (Server-Sent Events) para streaming en vivo.

Requisitos:
  pip install flask paho-mqtt flask-cors
Opcional:
  pip install gunicorn
"""
import os
import json
import time
import queue
import threading
from collections import deque
from typing import Dict, Any

from flask import Flask, jsonify, request, Response
from urllib.parse import urlencode
from flask_cors import CORS
import paho.mqtt.client as mqtt
from flask_sock import Sock  # NUEVO
from influxdb_client import InfluxDBClient
import psycopg2
from datetime import datetime, timezone, timedelta

# Zona horaria de Paraguay (UTC-3)
PYT_TIMEZONE = timezone(timedelta(hours=-3))

INFLUXDB_URL   = os.getenv("INFLUXDB_URL")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG   = os.getenv("INFLUXDB_ORG")
INFLUXDB_BUCKET= os.getenv("INFLUXDB_BUCKET")

influx = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG) if INFLUXDB_URL and INFLUXDB_TOKEN else None

# PostgreSQL configuration
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "tesis_iot_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DATABASE_URL = os.getenv("DATABASE_URL")

def get_postgres_connection():
    """Obtiene una conexión a PostgreSQL"""
    try:
        if DATABASE_URL:
            db_url = DATABASE_URL
            if db_url.startswith('postgres://'):
                db_url = db_url.replace('postgres://', 'postgresql://', 1)
            return psycopg2.connect(db_url)
        else:
            return psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD
            )
    except Exception as e:
        print(f"Error conectando a PostgreSQL: {e}")
        return None


# =========================
# CONFIG
# =========================
MQTT_BROKER = os.getenv("MQTT_BROKER", "mosquitto")
MQTT_PORT   = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER   = os.getenv("MQTT_USER", "tesis")
MQTT_PASS   = os.getenv("MQTT_PASS", "@E2wBB29|23w")
MQTT_BASE   = os.getenv("MQTT_BASE", "tesis/iot/esp32")

# Nuevo formato: esp/energia/{device_id}/state
TOPIC_ENERGY_STATE = "esp/energia/+/state"  # + es wildcard para cualquier device_id

# Tópicos antiguos (mantenidos por compatibilidad si es necesario)
TOPIC_VRMS       = f"{MQTT_BASE}/metrics/vrms"
TOPIC_IRMS       = f"{MQTT_BASE}/metrics/irms"
TOPIC_S_APPARENT = f"{MQTT_BASE}/metrics/s_apparent"
TOPIC_TELEMETRY  = f"{MQTT_BASE}/telemetry"
TOPIC_S_V        = f"{MQTT_BASE}/samples/voltage"
TOPIC_S_I        = f"{MQTT_BASE}/samples/current"
TOPIC_STATUS     = f"{MQTT_BASE}/status"

# Tamaño de buffers para muestras instantáneas
SAMPLES_BUFFER_SIZE = int(os.getenv("SAMPLES_BUFFER_SIZE", "2000"))

# =========================
# ESTADO EN MEMORIA (thread-safe)
# =========================
state_lock = threading.Lock()
last_metrics: Dict[str, Any] = {
    "vrms": None,              # Voltaje (V)
    "irms": None,              # Corriente (I)
    "s_apparent_va": None,     # Potencia aparente (S)
    "potencia_activa": None,   # Potencia activa (P)
    "factor_potencia": None,   # Factor de potencia (PF)
    "device": None,            # ID del dispositivo
    "ts": None
}
last_telemetry: Dict[str, Any] = {}  # payload tal cual llega
samples_voltage = deque(maxlen=SAMPLES_BUFFER_SIZE)
samples_current = deque(maxlen=SAMPLES_BUFFER_SIZE)

# Cola para broadcasting SSE (cada item es str ya serializado)
sse_queue = queue.Queue()

def _save_to_telemetry_history(device_code: str, voltaje: float = None, corriente: float = None, potencia: float = None, timestamp: datetime = None):
    """Guarda datos en telemetry_history en segundo plano"""
    print(f"[MQTT] _save_to_telemetry_history llamado - device_code={device_code}, voltaje={voltaje}, corriente={corriente}, potencia={potencia}")
    def save_task():
        try:
            print(f"[MQTT] [Thread] Iniciando guardado para device={device_code}")
            conn = get_postgres_connection()
            if not conn:
                print(f"[MQTT] [Thread] Error: No se pudo conectar a PostgreSQL para guardar datos de {device_code}")
                return
            
            print(f"[MQTT] [Thread] Conectado a PostgreSQL, buscando dispositivo {device_code}")
            cursor = conn.cursor()
            
            # Obtener device_id, company_id y user_id desde el código del dispositivo
            cursor.execute("""
                SELECT d.id as device_id, d.company_id, 
                       COALESCE(
                           (SELECT u.id FROM users u 
                            INNER JOIN roles r ON u.role_id = r.id
                            WHERE u.company_id = d.company_id 
                            AND (r.name = 'admin' OR r.name = 'super_admin')
                            LIMIT 1),
                           (SELECT u.id FROM users u 
                            WHERE u.company_id = d.company_id 
                            LIMIT 1),
                           NULL
                       ) as user_id
                FROM devices d
                WHERE d.code = %s OR d.id::text = %s
                LIMIT 1
            """, (device_code, device_code))
            
            device_info = cursor.fetchone()
            if not device_info:
                print(f"[MQTT] Warning: No se encontró dispositivo con code/id='{device_code}' en la base de datos")
                cursor.close()
                conn.close()
                return
            
            device_id = device_info[0]
            company_id = device_info[1]
            user_id = device_info[2]
            
            # Convertir timestamp de UTC a horario paraguayo
            if timestamp:
                # Si el timestamp viene sin timezone, asumir que es UTC
                timestamp_utc = timestamp
                if timestamp_utc.tzinfo is None:
                    timestamp_utc = timestamp_utc.replace(tzinfo=timezone.utc)
                # Convertir de UTC (o cualquier timezone) a horario paraguayo
                timestamp_pyt = timestamp_utc.astimezone(PYT_TIMEZONE)
                fecha = timestamp_pyt.date()
                created_at = timestamp_pyt
            else:
                now_pyt = datetime.now(PYT_TIMEZONE)
                fecha = now_pyt.date()
                created_at = now_pyt
            
            # Insertar en telemetry_history
            cursor.execute("""
                INSERT INTO telemetry_history (
                    user_id, fecha, voltaje, corriente, potencia, energia_acumulada,
                    company_id, device_id, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                fecha,
                voltaje,
                corriente,
                potencia,
                None,  # energia_acumulada no se calcula aquí
                company_id,
                device_id,
                created_at
            ))
            conn.commit()
            cursor.close()
            conn.close()
            print(f"[MQTT] Guardado en telemetry_history: device={device_code}, device_id={device_id}, fecha={fecha}, voltaje={voltaje}, corriente={corriente}, potencia={potencia}")
        except Exception as e:
            print(f"[MQTT] Error guardando en telemetry_history: {e}")
            import traceback
            traceback.print_exc()
            if conn:
                try:
                    conn.rollback()
                    conn.close()
                except:
                    pass
    
    # Ejecutar en segundo plano
    thread = threading.Thread(target=save_task, daemon=True)
    thread.start()

def _update_metrics(topic: str, payload: Dict[str, Any]):
    """Actualiza el estado en memoria y encola eventos SSE."""
    global last_metrics, last_telemetry

    with state_lock:
        ts = payload.get("ts", int(time.time()*1000))
        
        # Nuevo formato: esp/energia/{device_id}/state
        if topic.startswith("esp/energia/") and topic.endswith("/state"):
            # Mapear campos del nuevo formato
            last_metrics["vrms"] = payload.get("V")
            last_metrics["irms"] = payload.get("I")
            last_metrics["s_apparent_va"] = payload.get("S")
            last_metrics["potencia_activa"] = payload.get("P")
            last_metrics["factor_potencia"] = payload.get("PF")
            last_metrics["device"] = payload.get("device")
            last_metrics["ts"] = ts
            
            # También actualizar telemetry con el formato completo
            last_telemetry = {
                "ts": ts,
                "device": payload.get("device"),
                "vrms": payload.get("V"),
                "irms": payload.get("I"),
                "s_apparent_va": payload.get("S"),
                "potencia_activa": payload.get("P"),
                "factor_potencia": payload.get("PF")
            }
        
        # Formato antiguo (compatibilidad)
        elif topic == TOPIC_VRMS:
            last_metrics["vrms"] = payload.get("value")
            last_metrics["ts"] = ts
        elif topic == TOPIC_IRMS:
            last_metrics["irms"] = payload.get("value")
            last_metrics["ts"] = ts
        elif topic == TOPIC_S_APPARENT:
            last_metrics["s_apparent_va"] = payload.get("value")
            last_metrics["ts"] = ts
        elif topic == TOPIC_TELEMETRY:
            last_telemetry = payload
            # también sincronizamos métricas a partir del consolidado (por si llega primero)
            last_metrics["vrms"] = payload.get("vrms", last_metrics["vrms"])
            last_metrics["irms"] = payload.get("irms", last_metrics["irms"])
            last_metrics["s_apparent_va"] = payload.get("s_apparent_va", last_metrics["s_apparent_va"])
            last_metrics["ts"] = payload.get("ts", last_metrics["ts"])

    # Notificar a suscriptores SSE y WebSocket
    try:
        # Si es el nuevo formato, enviar los datos transformados
        if topic.startswith("esp/energia/") and topic.endswith("/state"):
            # Crear payload transformado con los nombres de campos correctos
            transformed_payload = {
                "ts": ts,
                "device": payload.get("device"),
                "vrms": payload.get("V"),
                "irms": payload.get("I"),
                "s_apparent_va": payload.get("S"),
                "potencia_activa": payload.get("P"),
                "factor_potencia": payload.get("PF")
            }
            # Enviar con el topic nuevo
            _fanout(topic, transformed_payload)
            # También enviar con el topic antiguo para compatibilidad con frontend existente
            _fanout(TOPIC_TELEMETRY, transformed_payload)
        else:
            # Formato antiguo, enviar tal cual
            _fanout(topic, payload)
    except queue.Full:
        pass

# =========================
# MQTT
# =========================
def on_connect(client, userdata, flags, rc, properties=None):
    print(f"[MQTT] Connected rc={rc}")
    # Suscribirse a todos los tópicos necesarios
    subscriptions = [
        (TOPIC_ENERGY_STATE, 1),  # Nuevo formato: esp/energia/+/state
        # Tópicos antiguos (mantenidos por compatibilidad)
        (TOPIC_VRMS, 1),
        (TOPIC_IRMS, 1),
        (TOPIC_S_APPARENT, 1),
        (TOPIC_TELEMETRY, 1),
        (TOPIC_S_V, 0),
        (TOPIC_S_I, 0),
        (TOPIC_STATUS, 1),
    ]
    client.subscribe(subscriptions)
    print(f"[MQTT] Subscribed to topics: {[s[0] for s in subscriptions]}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload_raw = msg.payload.decode("utf-8", errors="ignore")
    print(f"[MQTT] Mensaje recibido - Topic: {topic}, Payload: {payload_raw[:200]}")
    
    # Intenta parsear JSON si corresponde; las muestras vienen como JSON {"ts":..,"v":..} / {"ts":..,"i":..}
    try:
        data = json.loads(payload_raw)
    except json.JSONDecodeError:
        data = payload_raw

    # Nuevo formato: esp/energia/{device_id}/state
    if topic.startswith("esp/energia/") and topic.endswith("/state"):
        print(f"[MQTT] Procesando mensaje del tópico esp/energia/+/state")
        if isinstance(data, dict):
            # Agregar timestamp si no viene en el payload
            if "ts" not in data:
                data["ts"] = int(time.time() * 1000)
            _update_metrics(topic, data)
            
            # Guardar en telemetry_history en segundo plano
            device_code = data.get("device")
            print(f"[MQTT] Device code extraído: {device_code}")
            if device_code:
                # Mapear campos: V -> voltaje, I -> corriente, P -> potencia
                voltaje = data.get("V")
                corriente = data.get("I")
                potencia = data.get("P")
                print(f"[MQTT] Datos extraídos - V={voltaje}, I={corriente}, P={potencia}")
                
                # Convertir timestamp a datetime
                ts_ms = data.get("ts", int(time.time() * 1000))
                timestamp = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
                
                # Guardar en segundo plano
                print(f"[MQTT] Llamando a _save_to_telemetry_history para device={device_code}")
                _save_to_telemetry_history(device_code, voltaje, corriente, potencia, timestamp)
            else:
                print(f"[MQTT] Warning: No se encontró 'device' en el payload: {data}")
    
    # Formato antiguo (compatibilidad)
    elif topic in (TOPIC_VRMS, TOPIC_IRMS, TOPIC_S_APPARENT, TOPIC_TELEMETRY):
        if isinstance(data, dict):
            _update_metrics(topic, data)

    elif topic == TOPIC_S_V:
        if isinstance(data, dict):
            with state_lock:
                samples_voltage.append(data)
        try:
                    # antes:
            # sse_queue.put_nowait(json.dumps({"topic": topic, "data": data}))
            # ahora:
            _fanout(topic, data)

        except queue.Full:
            pass

    elif topic == TOPIC_S_I:
        if isinstance(data, dict):
            with state_lock:
                samples_current.append(data)
        try:
            #sse_queue.put_nowait(json.dumps({"topic": topic, "data": data}))
                    # antes:
        # sse_queue.put_nowait(json.dumps({"topic": topic, "data": data}))
        # ahora:
          _fanout(topic, data)

        except queue.Full:
            pass

    elif topic == TOPIC_STATUS:
        # broadcast de cambios de estado
        try:
          #  sse_queue.put_nowait(json.dumps({"topic": topic, "data": data}))
                  # antes:
        # sse_queue.put_nowait(json.dumps({"topic": topic, "data": data}))
        # ahora:
         _fanout(topic, data)

        except queue.Full:
            pass

def build_mqtt_client():
    client_id = f"api-flask-{int(time.time())}"
    c = mqtt.Client(client_id=client_id, clean_session=True)
    # Siempre usar autenticación (las credenciales vienen de variables de entorno)
    if MQTT_USER and MQTT_PASS:
        c.username_pw_set(MQTT_USER, MQTT_PASS)
        print(f"[MQTT] Configurando autenticación con usuario: {MQTT_USER}")
    else:
        print(f"[MQTT] ADVERTENCIA: No se configuraron credenciales MQTT")
    c.on_connect = on_connect
    c.on_message = on_message
    # TLS opcional si configurás broker con SSL:
    # c.tls_set() ; usar MQTT_PORT típico 8883
    print(f"[MQTT] Conectando a {MQTT_BROKER}:{MQTT_PORT} con usuario: {MQTT_USER}")
    c.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    return c

# Hilo de MQTT
def start_mqtt_loop():
    client = build_mqtt_client()
    client.loop_forever()

mqtt_thread = threading.Thread(target=start_mqtt_loop, daemon=True)
mqtt_thread.start()

# =========================
# FLASK
# =========================
app = Flask(__name__)
CORS(app)  # si lo vas a consumir desde un front

# ... (después de crear app = Flask(__name__) y CORS)
sock = Sock(app)  # NUEVO
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "broker": MQTT_BROKER, "base": MQTT_BASE})

@app.route("/metrics", methods=["GET"])
def get_metrics():
    with state_lock:
        return jsonify(last_metrics)

@app.route("/telemetry", methods=["GET"])
def get_telemetry():
    with state_lock:
        return jsonify(last_telemetry or {})

@app.route("/samples/voltage", methods=["GET"])
def get_samples_voltage():
    n = int(request.args.get("n", "100"))
    with state_lock:
        # devolvemos hasta n más recientes
        data = list(samples_voltage)[-n:]
    return jsonify(data)

@app.route("/samples/current", methods=["GET"])
def get_samples_current():
    n = int(request.args.get("n", "100"))
    with state_lock:
        data = list(samples_current)[-n:]
    return jsonify(data)

@app.route("/stream", methods=["GET"])
def stream():
    """
    Server-Sent Events: emite JSON por cada actualización recibida desde MQTT.
    Uso desde JS:
      const es = new EventSource("/stream");
      es.onmessage = (e) => { const msg = JSON.parse(e.data); ... }
    """
    def event_stream():
        # Emitimos primero el estado actual (si hay) para "hidratar" el front
        with state_lock:
            snapshot = {
                "topic": "snapshot",
                "data": {
                    "metrics": last_metrics,
                    "telemetry": last_telemetry,
                }
            }
        yield f"data: {json.dumps(snapshot)}\n\n"

        # Loop de eventos en tiempo real
        while True:
            try:
                item = sse_queue.get(timeout=30)
                yield f"data: {item}\n\n"
            except queue.Empty:
                # keep-alive cada ~30s
                yield "data: {\"type\":\"keepalive\"}\n\n"

    headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # Nginx: deshabilita buffering para SSE
    }
    return Response(event_stream(), headers=headers)
# === WebSocket: clientes conectados y broadcaster ===
ws_clients = set()                   # conjunto de websockets abiertos
ws_lock = threading.Lock()
ws_broadcast_q = queue.Queue(maxsize=10000)

def _ws_broadcast_enq(obj: dict):
    """Encola un evento JSON para ser enviado a todos los WS."""
    msg = json.dumps(obj)
    try:
        ws_broadcast_q.put_nowait(msg)
    except queue.Full:
        # si está lleno, descartamos lo más viejo y encolamos (backpressure simple)
        try:
            ws_broadcast_q.get_nowait()
        except queue.Empty:
            pass
        ws_broadcast_q.put_nowait(msg)

def _ws_broadcast_loop():
    while True:
        msg = ws_broadcast_q.get()
        dead = []
        with ws_lock:
            for ws in list(ws_clients):
                try:
                    ws.send(msg)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                ws_clients.discard(ws)

# Hilo broadcaster WS
ws_thread = threading.Thread(target=_ws_broadcast_loop, daemon=True)
ws_thread.start()
def _fanout(topic: str, payload: dict):
    # SSE
    try:
        sse_queue.put_nowait(json.dumps({"topic": topic, "data": payload}))
    except queue.Full:
        pass
    # WS
    _ws_broadcast_enq({"topic": topic, "data": payload})

@sock.route("/ws")
def ws_endpoint(ws):
    """WebSocket: envía snapshot inicial y luego broadcast en tiempo real."""
    # 1) Enviamos snapshot (estado actual)
    with state_lock:
        snapshot = {
            "topic": "snapshot",
            "data": {
                "metrics": last_metrics,
                "telemetry": last_telemetry,
            }
        }
    try:
        ws.send(json.dumps(snapshot))
    except Exception:
        return  # si no pudimos ni enviar el snapshot, cortamos

    # 2) Registramos el cliente y mantenemos la conexión
    with ws_lock:
        ws_clients.add(ws)

    try:
        # Loop de lectura (keep-alive; opcionalmente responder "pong")
        while True:
            msg = ws.receive()  # bloquea hasta que el cliente cierre o envíe algo
            if msg is None:
                break  # desconectó
            if isinstance(msg, str) and msg.strip().lower() == "ping":
                ws.send(json.dumps({"type": "pong"}))
    except Exception:
        pass
    finally:
        with ws_lock:
            ws_clients.discard(ws)
@app.route("/metrics/last-from-db", methods=["GET"])
def metrics_last_from_db():
    if not influx:
        return jsonify({"error":"influx not configured"}), 500
    q = f'''
    from(bucket:"{INFLUXDB_BUCKET}")
      |> range(start: -30m)
      |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry")
      |> last()
    '''
    tables = influx.query_api().query(q, org=INFLUXDB_ORG)
    out = {
        "ts": None, 
        "vrms": None, 
        "irms": None, 
        "s_apparent_va": None,
        "potencia_activa": None,
        "factor_potencia": None,
        "device": None
    }
    for t in tables:
        for r in t.records:
            if r.field in ("vrms", "irms", "s_apparent_va", "potencia_activa", "factor_potencia", "device"):
                out[r.field] = r.get_value()
            if r.get_time():
                out["ts"] = int(r.get_time().timestamp()*1000)
    return jsonify(out)

@app.route("/metrics/history", methods=["GET"])
def metrics_history():
    if not influx:
        return jsonify({"error":"influx not configured"}), 500
    rng = request.args.get("range","-15m")
    q = f'''
    from(bucket:"{INFLUXDB_BUCKET}")
      |> range(start: {rng})
      |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry")
      |> keep(columns: ["_time","_field","_value"])
      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
      |> sort(columns: ["_time"])
    '''
    tables = influx.query_api().query(q, org=INFLUXDB_ORG)
    rows = []
    for t in tables:
        for r in t.records:
            rows.append({
                "ts": int(r.get_time().timestamp()*1000),
                "vrms": r.values.get("vrms"),
                "irms": r.values.get("irms"),
                "s_apparent_va": r.values.get("s_apparent_va"),
                "potencia_activa": r.values.get("potencia_activa"),
                "factor_potencia": r.values.get("factor_potencia"),
                "device": r.values.get("device"),
            })
    return jsonify(rows)

@app.route("/metrics/history-postgres", methods=["GET"])
def metrics_history_postgres():
    """
    Consulta datos históricos desde PostgreSQL.
    Parámetros:
    - start: fecha inicio (ISO 8601 o timestamp unix en ms)
    - end: fecha fin (ISO 8601 o timestamp unix en ms)
    - device: (requerido) código o ID del dispositivo
    """
    conn = get_postgres_connection()
    if not conn:
        return jsonify({"error": "PostgreSQL not configured or connection failed"}), 500
    
    try:
        start = request.args.get("start")
        end = request.args.get("end")
        device = request.args.get("device")
        
        # Validar parámetros
        if not start or not end:
            return jsonify({"error": "start and end parameters are required"}), 400
        
        # Requerir dispositivo para evitar traer todos los datos
        if not device:
            return jsonify({"error": "device parameter is required"}), 400
        
        # Convertir fechas a datetime
        try:
            # Intentar parsear como timestamp unix (ms)
            if start.isdigit():
                start_dt = datetime.fromtimestamp(int(start) / 1000, tz=timezone.utc)
            else:
                start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
            
            if end.isdigit():
                end_dt = datetime.fromtimestamp(int(end) / 1000, tz=timezone.utc)
            else:
                end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        except Exception as e:
            return jsonify({"error": f"Invalid date format: {e}"}), 400
        
        cursor = conn.cursor()
        
        # Verificar qué dispositivo existe y su código
        cursor.execute("SELECT id, code, name FROM devices WHERE code = %s OR id::text = %s", [device, device])
        device_info = cursor.fetchone()
        print(f"[POSTGRES] Dispositivo buscado: '{device}'")
        if device_info:
            print(f"[POSTGRES] Dispositivo encontrado: id={device_info[0]}, code={device_info[1]}, name={device_info[2]}")
        else:
            print(f"[POSTGRES] ADVERTENCIA: No se encontró dispositivo con code/id='{device}'")
            # Intentar buscar sin filtro de dispositivo para ver qué hay
            cursor.execute("SELECT id, code, name FROM devices LIMIT 5")
            all_devices = cursor.fetchall()
            print(f"[POSTGRES] Dispositivos disponibles: {all_devices}")
            return jsonify({"error": f"Dispositivo '{device}' no encontrado"}), 404
        
        # Construir query - usar telemetry_history que es donde se guardan los datos
        # IMPORTANTE: Los datos se almacenan con precisión de hora/minuto (created_at es TIMESTAMP)
        # El frontend agrupa estos datos por día para el reporte
        # Necesitamos hacer JOIN con devices para obtener el código del dispositivo
        # Usar created_at para el timestamp (precisión hora/minuto) y fecha para el filtro de fechas
        # SIEMPRE filtrar por dispositivo
        query = """
            SELECT 
                th.created_at as "time",  -- Timestamp preciso (hora/minuto) para cálculos de energía
                COALESCE(d.code, d.id::text, 'UNKNOWN') as device,
                th.voltaje as vrms,
                th.corriente as irms,
                (th.voltaje * th.corriente) as s_apparent_va,
                th.potencia as potencia_activa,
                CASE 
                    WHEN th.voltaje > 0 AND th.corriente > 0 
                    THEN (th.potencia / (th.voltaje * th.corriente))
                    ELSE NULL 
                END as factor_potencia
            FROM telemetry_history th
            LEFT JOIN devices d ON th.device_id = d.id
            WHERE th.created_at >= %s AND th.created_at <= %s
            AND (d.code = %s OR d.id::text = %s OR th.device_id::text = %s)
        """
        params = [start_dt, end_dt, device, device, device]
        
        print(f"[POSTGRES] Ejecutando query: {query}")
        print(f"[POSTGRES] Parámetros: {params}")
        print(f"[POSTGRES] Rango de fechas: {start_dt} a {end_dt}")
        
        cursor.execute(query, params)
        rows = []
        for row in cursor.fetchall():
            # Convertir datetime a timestamp unix en ms (mantiene precisión de hora/minuto)
            # Este timestamp preciso se usa en el frontend para calcular intervalos de tiempo
            # y así obtener el consumo diario total (energía = integral de potencia)
            ts = int(row[0].timestamp() * 1000) if row[0] else None
            rows.append({
                "ts": ts,
                "device": row[1] if row[1] else "UNKNOWN",
                "vrms": float(row[2]) if row[2] is not None else None,
                "irms": float(row[3]) if row[3] is not None else None,
                "s_apparent_va": float(row[4]) if row[4] is not None else None,
                "potencia_activa": float(row[5]) if row[5] is not None else None,
                "factor_potencia": float(row[6]) if row[6] is not None else None,
            })
        
        print(f"[POSTGRES] Retornando {len(rows)} registros")
        cursor.close()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        if conn:
            conn.close()
        return jsonify({"error": str(e)}), 500

@app.route("/metrics/history-smart", methods=["GET"])
def metrics_history_smart():
    """
    Endpoint inteligente que decide automáticamente entre InfluxDB y PostgreSQL
    según el rango de fechas:
    - 1 a 30 días: InfluxDB
    - Más de 30 días: PostgreSQL
    
    Parámetros:
    - start: fecha inicio (ISO 8601 o timestamp unix en ms)
    - end: fecha fin (ISO 8601 o timestamp unix en ms)
    - device: (requerido) código o ID del dispositivo
    """
    start = request.args.get("start")
    end = request.args.get("end")
    device = request.args.get("device")
    
    if not start or not end:
        return jsonify({"error": "start and end parameters are required"}), 400
    
    # Requerir dispositivo para evitar traer todos los datos
    if not device:
        return jsonify({"error": "device parameter is required"}), 400
    
    # Calcular días entre fechas
    try:
        if start.isdigit():
            start_dt = datetime.fromtimestamp(int(start) / 1000, tz=timezone.utc)
        else:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        
        if end.isdigit():
            end_dt = datetime.fromtimestamp(int(end) / 1000, tz=timezone.utc)
        else:
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        
        delta = end_dt - start_dt
        dias = delta.days
    except Exception as e:
        return jsonify({"error": f"Invalid date format: {e}"}), 400
    
    # USAR POSTGRESQL DIRECTAMENTE (InfluxDB no está trayendo datos)
    # USAR SOLO POSTGRESQL - NO consultar InfluxDB
    print(f"[HISTORY-SMART] Rango: {dias} días, start: {start_dt}, end: {end_dt}, device: {device}")
    print(f"[HISTORY-SMART] Usando SOLO PostgreSQL (InfluxDB deshabilitado)")
    
    # Siempre usar PostgreSQL
    use_influx = False
    
    # Inicializar variable para evitar errores de scope
    available_measurements = []
    
    if use_influx:
        print(f"[HISTORY-SMART] Intentando InfluxDB primero (rango incluye datos recientes)")
        print(f"[HISTORY-SMART] InfluxDB configurado: URL={INFLUXDB_URL}, Org={INFLUXDB_ORG}, Bucket={INFLUXDB_BUCKET}")
        print(f"[HISTORY-SMART] Rango solicitado: {start_dt} a {end_dt}, device: {device}")
        
        # Primero, verificar qué devices hay disponibles en InfluxDB en el rango de fechas solicitado
        try:
            # Usar el rango de fechas solicitado para buscar devices
            start_iso_temp = start_dt.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
            end_iso_temp = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999).strftime("%Y-%m-%dT%H:%M:%SZ")
            
            # Primero verificar qué measurements hay realmente
            query_measurements = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: {start_iso_temp}, stop: {end_iso_temp}) |> group() |> distinct(column: "_measurement") |> limit(n: 10)'
            print(f"[HISTORY-SMART] Query para buscar measurements: {query_measurements}")
            tables_measurements = influx.query_api().query(query_measurements, org=INFLUXDB_ORG)
            for t in tables_measurements:
                for r in t.records:
                    meas = r.values.get("_measurement")
                    if meas:
                        available_measurements.append(meas)
            available_measurements = list(set(available_measurements))
            print(f"[HISTORY-SMART] Measurements disponibles en InfluxDB: {available_measurements}")
            
            # Construir filtro de measurements dinámicamente
            if available_measurements:
                measurement_filter = " or ".join([f'r._measurement == "{m}"' for m in available_measurements])
            else:
                # Fallback: buscar en ambos por si acaso
                measurement_filter = 'r._measurement == "esp" or r._measurement == "telemetry"'
            
            query_devices = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: {start_iso_temp}, stop: {end_iso_temp}) |> filter(fn: (r) => {measurement_filter}) |> filter(fn: (r) => exists r.device) |> distinct(column: "device") |> limit(n: 10)'
            print(f"[HISTORY-SMART] Query para buscar devices: {query_devices}")
            tables_devices = influx.query_api().query(query_devices, org=INFLUXDB_ORG)
            available_devices_influx = []
            for t in tables_devices:
                for r in t.records:
                    device_val = r.values.get("device")
                    if device_val:
                        available_devices_influx.append(device_val)
            print(f"[HISTORY-SMART] Devices disponibles en InfluxDB en el rango: {list(set(available_devices_influx))}")
            
            # También verificar si hay datos sin filtro de device para diagnosticar
            query_count = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: {start_iso_temp}, stop: {end_iso_temp}) |> filter(fn: (r) => {measurement_filter}) |> count()'
            tables_count = influx.query_api().query(query_count, org=INFLUXDB_ORG)
            total_count = 0
            for t in tables_count:
                for r in t.records:
                    total_count += r.values.get("_value", 0)
            print(f"[HISTORY-SMART] Total de registros en InfluxDB (sin filtro device): {total_count}")
        except Exception as e:
            print(f"[HISTORY-SMART] Error consultando devices en InfluxDB: {e}")
            import traceback
            traceback.print_exc()
            available_devices_influx = []
            if not available_measurements:
                available_measurements = []
        
        # Mapear código de dispositivo a device ID de MQTT
        # En InfluxDB, el device es el chip ID del ESP32 (ej: "E2641D44")
        # Pero el usuario busca por código de la BD (ej: "PRINCIPAL")
        device_ids_to_search = [device]  # Incluir el código original
        
        # Si el código es "PRINCIPAL", buscar también device IDs disponibles en InfluxDB
        if device == "PRINCIPAL":
            print(f"[HISTORY-SMART] Código 'PRINCIPAL' detectado")
            if available_devices_influx:
                print(f"[HISTORY-SMART] Agregando devices de InfluxDB a la búsqueda: {available_devices_influx}")
                device_ids_to_search.extend(available_devices_influx)
            else:
                # Fallback: usar device ID común
                print(f"[HISTORY-SMART] No se encontraron devices en InfluxDB, usando 'E2641D44' como fallback")
                device_ids_to_search.append("E2641D44")
        
        # Eliminar duplicados
        device_ids_to_search = list(dict.fromkeys(device_ids_to_search))
        print(f"[HISTORY-SMART] Device IDs a buscar: {device_ids_to_search}")
        
        # Convertir a formato de rango de InfluxDB
        # Asegurar que incluya todo el día (desde inicio del día hasta fin del día)
        start_iso = start_dt.replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_iso = end_dt.replace(hour=23, minute=59, second=59, microsecond=999999).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        print(f"[HISTORY-SMART] Rango InfluxDB: {start_iso} a {end_iso}")
        print(f"[HISTORY-SMART] Dispositivos a buscar en InfluxDB: {device_ids_to_search}")
        
        # BUSCAR DIRECTAMENTE TODOS LOS DATOS SIN FILTROS (basado en ejemplo del usuario)
        all_rows = []
        print(f"[HISTORY-SMART] ===== BUSCANDO DIRECTAMENTE TODOS LOS DATOS EN INFLUXDB SIN FILTROS =====")
        try:
            # Búsqueda amplia: obtener TODOS los datos del rango sin ningún filtro
            # Basado en el ejemplo: measurement="esp", topic="esp/energia/E2641D44/state"
            q_broad_all = f'''
            from(bucket:"{INFLUXDB_BUCKET}")
              |> range(start: {start_iso}, stop: {end_iso})
              |> filter(fn: (r) => r["_measurement"] == "esp")
              |> keep(columns: ["_time","_field","_value","_measurement","device","topic","host"])
              |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
              |> sort(columns: ["_time"])
            '''
            print(f"[HISTORY-SMART] Query búsqueda TODOS los datos en InfluxDB (measurement=esp, sin filtros de device/topic):")
            print(q_broad_all)
            tables_broad = influx.query_api().query(q_broad_all, org=INFLUXDB_ORG)
            broad_count = 0
            for t in tables_broad:
                for r in t.records:
                    broad_count += 1
                    ts_ms = int(r.get_time().timestamp()*1000)
                    if broad_count <= 10:
                        print(f"[HISTORY-SMART] Record {broad_count}: time={r.get_time()}, measurement={r.values.get('_measurement')}, device={r.values.get('device')}, topic={r.values.get('topic')}, host={r.values.get('host')}, campos={[k for k in r.values.keys() if k not in ['_measurement','device','topic','host']]}")
                    # Buscar potencia_activa o potencia_actesp o P
                    potencia = r.values.get("potencia_activa") or r.values.get("potencia_actesp") or r.values.get("P")
                    all_rows.append({
                        "ts": ts_ms,
                        "vrms": r.values.get("vrms") or r.values.get("V"),
                        "irms": r.values.get("irms") or r.values.get("I"),
                        "s_apparent_va": r.values.get("s_apparent_va") or r.values.get("S"),
                        "potencia_activa": potencia,
                        "factor_potencia": r.values.get("factor_potencia") or r.values.get("PF"),
                        "device": r.values.get("device") or device,
                    })
            print(f"[HISTORY-SMART] Búsqueda TODOS los datos (measurement=esp): {broad_count} registros encontrados")
        except Exception as e_broad:
            print(f"[HISTORY-SMART] Error en búsqueda amplia: {e_broad}")
            import traceback
            traceback.print_exc()
        
        # Si ya encontramos datos, saltar el resto de búsquedas
        if len(all_rows) == 0:
            print(f"[HISTORY-SMART] No se encontraron datos con búsqueda directa, intentando búsquedas con filtros...")
            # Buscar en todos los device IDs posibles (código original)
            for device_id in device_ids_to_search:
                # SIEMPRE filtrar por dispositivo
                # Telegraf guarda: measurement="esp", tag=device="E2641D44", fields=vrms,irms,etc
                # También puede haber measurement="telemetry" para tópicos antiguos
                # Buscar en ambos measurements
                # Usar los measurements encontrados o fallback
                if available_measurements:
                    measurement_filter_q = " or ".join([f'r._measurement == "{m}"' for m in available_measurements])
                else:
                    measurement_filter_q = 'r._measurement == "esp" or r._measurement == "telemetry"'
                
                # Intentar primero con filtro de device si existe
                try:
                    q = f'''
            from(bucket:"{INFLUXDB_BUCKET}")
              |> range(start: {start_iso}, stop: {end_iso})
              |> filter(fn: (r) => {measurement_filter_q})
              |> filter(fn: (r) => exists r.device)
              |> filter(fn: (r) => r.device == "{device_id}")
              |> keep(columns: ["_time","_field","_value","device"])
              |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
              |> sort(columns: ["_time"])
            '''
                    
                    print(f"[HISTORY-SMART] Query InfluxDB para device '{device_id}' (con filtro device):")
                    print(q)
                    tables = influx.query_api().query(q, org=INFLUXDB_ORG)
                    record_count = 0
                    table_count = 0
                    for t in tables:
                        table_count += 1
                        for r in t.records:
                            record_count += 1
                            ts_ms = int(r.get_time().timestamp()*1000)
                            if record_count <= 3:
                                print(f"[HISTORY-SMART] Record {record_count}: time={r.get_time()}, values={r.values}")
                            # Buscar potencia_activa o potencia_actesp (dependiendo de cómo se guardó)
                            potencia = r.values.get("potencia_activa") or r.values.get("potencia_actesp") or r.values.get("P")
                            all_rows.append({
                                "ts": ts_ms,
                                "vrms": r.values.get("vrms") or r.values.get("V"),
                                "irms": r.values.get("irms") or r.values.get("I"),
                                "s_apparent_va": r.values.get("s_apparent_va") or r.values.get("S"),
                                "potencia_activa": potencia,
                                "factor_potencia": r.values.get("factor_potencia") or r.values.get("PF"),
                                "device": r.values.get("device") or device_id,
                            })
                    print(f"[HISTORY-SMART] Device '{device_id}' (con filtro device): {record_count} registros encontrados")
                    
                    # Si no se encontraron datos con filtro de device, intentar sin filtro de device
                    # (puede que el device tag no esté presente y los datos estén en el topic)
                    if record_count == 0:
                        print(f"[HISTORY-SMART] No se encontraron datos con filtro device, intentando sin filtro de device...")
                        # Buscar por topic si está disponible
                        q_no_device = f'''
                    from(bucket:"{INFLUXDB_BUCKET}")
                      |> range(start: {start_iso}, stop: {end_iso})
                      |> filter(fn: (r) => {measurement_filter_q})
                      |> filter(fn: (r) => r.topic == "esp/energia/{device_id}/state" or r.topic =~ /esp\\/energia\\/.*\\/state/)
                      |> keep(columns: ["_time","_field","_value","device","topic","host"])
                      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
                      |> sort(columns: ["_time"])
                    '''
                        print(f"[HISTORY-SMART] Query sin filtro device (por topic):")
                        print(q_no_device)
                        tables_no_device = influx.query_api().query(q_no_device, org=INFLUXDB_ORG)
                        for t in tables_no_device:
                            for r in t.records:
                                record_count += 1
                                ts_ms = int(r.get_time().timestamp()*1000)
                                if record_count <= 3:
                                    print(f"[HISTORY-SMART] Record {record_count} (sin device): time={r.get_time()}, values={r.values}")
                                # Buscar potencia_activa o potencia_actesp
                                potencia = r.values.get("potencia_activa") or r.values.get("potencia_actesp") or r.values.get("P")
                                all_rows.append({
                                    "ts": ts_ms,
                                    "vrms": r.values.get("vrms") or r.values.get("V"),
                                    "irms": r.values.get("irms") or r.values.get("I"),
                                    "s_apparent_va": r.values.get("s_apparent_va") or r.values.get("S"),
                                    "potencia_activa": potencia,
                                    "factor_potencia": r.values.get("factor_potencia") or r.values.get("PF"),
                                    "device": r.values.get("device") or device_id,
                                })
                        print(f"[HISTORY-SMART] Device '{device_id}' (sin filtro device): {record_count} registros totales encontrados")
                    
                    # Si aún no hay datos, intentar búsqueda más amplia sin filtros de device
                    if record_count == 0:
                            # Búsqueda amplia: obtener todos los datos del rango y filtrar después
                            print(f"[HISTORY-SMART] Intentando búsqueda amplia sin filtros de device/topic...")
                            q_broad = f'''
                    from(bucket:"{INFLUXDB_BUCKET}")
                      |> range(start: {start_iso}, stop: {end_iso})
                      |> filter(fn: (r) => {measurement_filter_q})
                      |> keep(columns: ["_time","_field","_value","device","topic","host"])
                      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
                      |> sort(columns: ["_time"])
                    '''
                            print(f"[HISTORY-SMART] Query amplia (sin filtros):")
                            print(q_broad)
                            try:
                                tables_broad = influx.query_api().query(q_broad, org=INFLUXDB_ORG)
                                broad_count = 0
                                for t in tables_broad:
                                    for r in t.records:
                                        broad_count += 1
                                        # Incluir todos los registros del rango (sin filtrar por device)
                                        # ya que puede que no haya tag device
                                        ts_ms = int(r.get_time().timestamp()*1000)
                                        if broad_count <= 5:
                                            print(f"[HISTORY-SMART] Record amplio {broad_count}: time={r.get_time()}, device={r.values.get('device')}, topic={r.values.get('topic')}, host={r.values.get('host')}, fields={[k for k in r.values.keys() if k not in ['device','topic','host']]}")
                                        # Buscar potencia_activa o potencia_actesp
                                        potencia = r.values.get("potencia_activa") or r.values.get("potencia_actesp") or r.values.get("P")
                                        all_rows.append({
                                            "ts": ts_ms,
                                            "vrms": r.values.get("vrms") or r.values.get("V"),
                                            "irms": r.values.get("irms") or r.values.get("I"),
                                            "s_apparent_va": r.values.get("s_apparent_va") or r.values.get("S"),
                                            "potencia_activa": potencia,
                                            "factor_potencia": r.values.get("factor_potencia") or r.values.get("PF"),
                                            "device": r.values.get("device") or device_id,
                                        })
                                        record_count += 1
                                print(f"[HISTORY-SMART] Búsqueda amplia: {broad_count} registros encontrados (todos incluidos)")
                            except Exception as e_broad:
                                print(f"[HISTORY-SMART] Error en búsqueda amplia: {e_broad}")
                                import traceback
                                traceback.print_exc()
                except Exception as e:
                    print(f"[HISTORY-SMART] Error consultando device '{device_id}': {e}")
                    import traceback
                    traceback.print_exc()
        
        # SIEMPRE buscar TODOS los datos en InfluxDB sin filtros si no se encontraron datos
        # Esto es necesario porque los datos pueden no tener tag device o measurement
        if len(all_rows) == 0:
            print(f"[HISTORY-SMART] ===== BUSCANDO TODOS LOS DATOS EN INFLUXDB SIN FILTROS =====")
            print(f"[HISTORY-SMART] No se encontraron datos con filtros, buscando TODOS los datos en InfluxDB (sin filtros)...")
            print(f"[HISTORY-SMART] Total de intentos con filtros: {len(device_ids_to_search)} devices, all_rows={len(all_rows)}")
            try:
                # Búsqueda amplia: obtener TODOS los datos del rango sin ningún filtro
                # Sin filtrar por measurement, device, topic, etc.
                q_broad_all = f'''
                from(bucket:"{INFLUXDB_BUCKET}")
                  |> range(start: {start_iso}, stop: {end_iso})
                  |> keep(columns: ["_time","_field","_value","_measurement","device","topic","host"])
                  |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
                  |> sort(columns: ["_time"])
                '''
                print(f"[HISTORY-SMART] Query búsqueda TODOS los datos en InfluxDB (sin filtros):")
                print(q_broad_all)
                tables_broad = influx.query_api().query(q_broad_all, org=INFLUXDB_ORG)
                broad_count = 0
                for t in tables_broad:
                    for r in t.records:
                        broad_count += 1
                        ts_ms = int(r.get_time().timestamp()*1000)
                        if broad_count <= 10:
                            print(f"[HISTORY-SMART] Record {broad_count}: time={r.get_time()}, measurement={r.values.get('_measurement')}, device={r.values.get('device')}, topic={r.values.get('topic')}, host={r.values.get('host')}, campos={[k for k in r.values.keys() if k not in ['_measurement','device','topic','host']]}")
                        # Buscar potencia_activa o potencia_actesp o P
                        potencia = r.values.get("potencia_activa") or r.values.get("potencia_actesp") or r.values.get("P")
                        all_rows.append({
                            "ts": ts_ms,
                            "vrms": r.values.get("vrms") or r.values.get("V"),
                            "irms": r.values.get("irms") or r.values.get("I"),
                            "s_apparent_va": r.values.get("s_apparent_va") or r.values.get("S"),
                            "potencia_activa": potencia,
                            "factor_potencia": r.values.get("factor_potencia") or r.values.get("PF"),
                            "device": r.values.get("device") or device,
                        })
                print(f"[HISTORY-SMART] Búsqueda TODOS los datos: {broad_count} registros encontrados")
            except Exception as e_broad:
                print(f"[HISTORY-SMART] Error en búsqueda amplia: {e_broad}")
                import traceback
                traceback.print_exc()
        
        # Eliminar duplicados por timestamp (si hay overlap)
        seen_timestamps = set()
        unique_rows = []
        for row in all_rows:
            if row["ts"] not in seen_timestamps:
                seen_timestamps.add(row["ts"])
                unique_rows.append(row)
        
        rows = sorted(unique_rows, key=lambda x: x["ts"])
        
        print(f"[HISTORY-SMART] InfluxDB total: {len(rows)} registros únicos")
        
        # Mostrar rango de fechas de los datos obtenidos
        if len(rows) > 0:
            min_ts = min(r["ts"] for r in rows)
            max_ts = max(r["ts"] for r in rows)
            min_date = datetime.fromtimestamp(min_ts/1000, tz=timezone.utc)
            max_date = datetime.fromtimestamp(max_ts/1000, tz=timezone.utc)
            print(f"[HISTORY-SMART] Rango de datos InfluxDB: {min_date} a {max_date}")
        
        # Si InfluxDB tiene datos, usarlos (incluso si son pocos, son los más recientes)
        if len(rows) > 0:
            print(f"[HISTORY-SMART] Usando datos de InfluxDB ({len(rows)} registros)")
            return jsonify(rows)
        else:
            print("[HISTORY-SMART] InfluxDB sin datos para este rango/dispositivo, usando PostgreSQL como fallback")
    
    # Usar PostgreSQL (para rangos antiguos o como fallback)
    print(f"[HISTORY-SMART] Usando PostgreSQL para rango de {dias} días")
    return metrics_history_postgres()

@app.route("/debug/influx-check", methods=["GET"])
def debug_influx_check():
    """Endpoint temporal para verificar datos en InfluxDB"""
    if not influx:
        return jsonify({"error": "InfluxDB no configurado"}), 500
    
    results = {}
    
    # 1. Ver qué measurements hay
    query1 = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: -7d) |> group() |> distinct(column: "_measurement") |> limit(n: 10)'
    tables1 = influx.query_api().query(query1, org=INFLUXDB_ORG)
    measurements = []
    for t in tables1:
        for r in t.records:
            if r.values.get("_measurement"):
                measurements.append(r.values.get("_measurement"))
    results["measurements"] = list(set(measurements))
    
    # 2. Ver qué devices hay
    query2 = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: -7d) |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry") |> filter(fn: (r) => exists r.device) |> distinct(column: "device") |> limit(n: 10)'
    tables2 = influx.query_api().query(query2, org=INFLUXDB_ORG)
    devices = []
    for t in tables2:
        for r in t.records:
            if r.values.get("device"):
                devices.append(r.values.get("device"))
    results["devices"] = list(set(devices))
    
    # 3. Contar registros del último día para E2641D44
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=1)
    start_iso = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    end_iso = end.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    query3 = f'''
    from(bucket:"{INFLUXDB_BUCKET}")
      |> range(start: {start_iso}, stop: {end_iso})
      |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry")
      |> filter(fn: (r) => exists r.device)
      |> filter(fn: (r) => r.device == "E2641D44")
      |> count()
    '''
    tables3 = influx.query_api().query(query3, org=INFLUXDB_ORG)
    count = 0
    for t in tables3:
        for r in t.records:
            count += r.values.get("_value", 0)
    results["count_e2641d44_last_day"] = count
    
    # 4. Ver algunos registros de ejemplo
    query4 = f'''
    from(bucket:"{INFLUXDB_BUCKET}")
      |> range(start: {start_iso}, stop: {end_iso})
      |> filter(fn: (r) => r._measurement == "esp")
      |> filter(fn: (r) => exists r.device)
      |> filter(fn: (r) => r.device == "E2641D44")
      |> keep(columns: ["_time","_field","_value","device"])
      |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: 3)
    '''
    tables4 = influx.query_api().query(query4, org=INFLUXDB_ORG)
    sample_records = []
    for t in tables4:
        for r in t.records[:3]:
            sample_records.append({
                "time": str(r.get_time()),
                "values": r.values
            })
    results["sample_records"] = sample_records
    
    # 5. Verificar campos disponibles
    query5 = f'''
    from(bucket:"{INFLUXDB_BUCKET}")
      |> range(start: {start_iso}, stop: {end_iso})
      |> filter(fn: (r) => r._measurement == "esp")
      |> filter(fn: (r) => exists r.device)
      |> filter(fn: (r) => r.device == "E2641D44")
      |> distinct(column: "_field")
      |> limit(n: 20)
    '''
    tables5 = influx.query_api().query(query5, org=INFLUXDB_ORG)
    fields = []
    for t in tables5:
        for r in t.records:
            if r.values.get("_field"):
                fields.append(r.values.get("_field"))
    results["fields"] = list(set(fields))
    
    return jsonify(results)

@app.route("/metrics/power-outages", methods=["GET"])
def metrics_power_outages():
    """
    Endpoint para detectar cortes de luz y períodos sin datos.
    
    Parámetros:
    - start: fecha inicio (ISO 8601 o timestamp unix en ms)
    - end: fecha fin (ISO 8601 o timestamp unix en ms)
    - device: (requerido) código o ID del dispositivo
    - min_voltage: (opcional) voltaje mínimo para considerar corte (default: 50V)
    - max_gap_minutes: (opcional) máximo gap en minutos para considerar período sin datos (default: 10)
    
    Retorna:
    - Array de objetos con información de cortes y períodos sin datos
    """
    start = request.args.get("start")
    end = request.args.get("end")
    device = request.args.get("device")
    min_voltage = float(request.args.get("min_voltage", 50))
    max_gap_minutes = int(request.args.get("max_gap_minutes", 10))
    
    if not start or not end:
        return jsonify({"error": "start and end parameters are required"}), 400
    
    # Requerir dispositivo para evitar traer todos los datos
    if not device:
        return jsonify({"error": "device parameter is required"}), 400
    
    try:
        # Parsear fechas
        if start.isdigit():
            start_dt = datetime.fromtimestamp(int(start) / 1000, tz=timezone.utc)
        else:
            start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        
        if end.isdigit():
            end_dt = datetime.fromtimestamp(int(end) / 1000, tz=timezone.utc)
        else:
            end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
        
        delta = end_dt - start_dt
        dias = delta.days
        
        # Obtener datos históricos directamente
        data = []
        
        # Si el rango es 1-30 días, intentar InfluxDB primero
        if dias >= 1 and dias <= 30 and influx:
            try:
                # Construir query de InfluxDB
                start_iso = start_dt.isoformat()
                end_iso = end_dt.isoformat()
                
                # SIEMPRE filtrar por dispositivo
                # Telegraf guarda: measurement="esp", tag=device, fields=vrms,irms,etc
                q = f'''
                from(bucket:"{INFLUXDB_BUCKET}")
                  |> range(start: {start_iso}, stop: {end_iso})
                  |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry")
                  |> filter(fn: (r) => exists r.device)
                  |> filter(fn: (r) => r.device == "{device}")
                  |> keep(columns: ["_time","_field","_value","device"])
                  |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
                  |> sort(columns: ["_time"])
                '''
                
                tables = influx.query_api().query(q, org=INFLUXDB_ORG)
                for t in tables:
                    for r in t.records:
                        data.append({
                            "ts": int(r.get_time().timestamp()*1000),
                            "vrms": r.values.get("vrms"),
                            "irms": r.values.get("irms"),
                            "s_apparent_va": r.values.get("s_apparent_va"),
                            "potencia_activa": r.values.get("potencia_activa"),
                            "factor_potencia": r.values.get("factor_potencia"),
                            "device": r.values.get("device"),
                        })
            except Exception as e:
                print(f"[POWER-OUTAGES] Error con InfluxDB: {e}, usando PostgreSQL")
                pass
        
        # Si no hay datos de InfluxDB o el rango es >30 días, usar PostgreSQL
        if len(data) == 0:
            try:
                conn = get_postgres_connection()
                if not conn:
                    return jsonify({"error": "No se pudo conectar a PostgreSQL"}), 500
                
                cursor = conn.cursor()
                
                # Verificar dispositivo si se proporciona
                if device:
                    cursor.execute("SELECT id, code, name FROM devices WHERE code = %s OR id::text = %s", [device, device])
                    device_info = cursor.fetchone()
                    print(f"[POWER-OUTAGES] Dispositivo buscado: '{device}'")
                    if device_info:
                        print(f"[POWER-OUTAGES] Dispositivo encontrado: id={device_info[0]}, code={device_info[1]}, name={device_info[2]}")
                    else:
                        print(f"[POWER-OUTAGES] ADVERTENCIA: No se encontró dispositivo con code/id='{device}'")
                
                # Verificar dispositivo primero
                cursor.execute("SELECT id, code, name FROM devices WHERE code = %s OR id::text = %s", [device, device])
                device_info = cursor.fetchone()
                if not device_info:
                    cursor.close()
                    conn.close()
                    return jsonify({"error": f"Dispositivo '{device}' no encontrado"}), 404
                
                # SIEMPRE filtrar por dispositivo
                query = """
                    SELECT 
                        th.created_at as "time",
                        COALESCE(d.code, d.id::text, 'UNKNOWN') as device,
                        th.voltaje as vrms,
                        th.corriente as irms
                    FROM telemetry_history th
                    LEFT JOIN devices d ON th.device_id = d.id
                    WHERE th.created_at >= %s AND th.created_at <= %s
                    AND (d.code = %s OR d.id::text = %s OR th.device_id::text = %s)
                """
                params = [start_dt, end_dt, device, device, device]
                
                query += " ORDER BY th.created_at ASC"
                
                print(f"[POWER-OUTAGES] Ejecutando query: {query}")
                print(f"[POWER-OUTAGES] Parámetros: {params}")
                print(f"[POWER-OUTAGES] Rango de fechas: {start_dt} a {end_dt}")
                
                cursor.execute(query, params)
                rows_fetched = 0
                for row in cursor.fetchall():
                    rows_fetched += 1
                    ts = int(row[0].timestamp() * 1000) if row[0] else None
                    data.append({
                        "ts": ts,
                        "device": row[1] if row[1] else "UNKNOWN",
                        "vrms": float(row[2]) if row[2] is not None else None,
                        "irms": float(row[3]) if row[3] is not None else None,
                    })
                
                print(f"[POWER-OUTAGES] Registros obtenidos de PostgreSQL: {rows_fetched}")
                cursor.close()
                conn.close()
            except Exception as e:
                print(f"[POWER-OUTAGES] Error con PostgreSQL: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({"error": f"Error obteniendo datos: {e}"}), 500
        
        if not isinstance(data, list) or len(data) == 0:
            return jsonify([])
        
        # Procesar datos para detectar cortes y gaps
        outages = []
        
        # Ordenar datos por timestamp
        sorted_data = sorted(data, key=lambda x: x.get("ts", 0))
        
        # Intervalo esperado entre mediciones (en milisegundos)
        # Asumimos 1 minuto entre mediciones
        expected_interval_ms = 60000
        
        i = 0
        while i < len(sorted_data):
            current = sorted_data[i]
            current_ts = current.get("ts", 0)
            current_vrms = current.get("vrms")
            
            # Detectar corte de luz (voltaje bajo)
            if current_vrms is not None and current_vrms < min_voltage:
                outage_start = current_ts
                outage_start_date = datetime.fromtimestamp(current_ts / 1000, tz=timezone.utc)
                min_voltage_during_outage = current_vrms
                max_voltage_during_outage = current_vrms
                count = 1
                
                # Buscar el final del corte
                j = i + 1
                while j < len(sorted_data):
                    next_point = sorted_data[j]
                    next_ts = next_point.get("ts", 0)
                    next_vrms = next_point.get("vrms")
                    
                    # Si el siguiente punto también tiene voltaje bajo, continuar el corte
                    if next_vrms is not None and next_vrms < min_voltage:
                        min_voltage_during_outage = min(min_voltage_during_outage, next_vrms)
                        max_voltage_during_outage = max(max_voltage_during_outage, next_vrms)
                        count += 1
                        j += 1
                    else:
                        # Si hay un gap grande o el voltaje vuelve a ser normal, terminar el corte
                        gap = next_ts - current_ts
                        if gap > expected_interval_ms * max_gap_minutes or (next_vrms is not None and next_vrms >= min_voltage):
                            break
                        j += 1
                
                outage_end_ts = sorted_data[j - 1].get("ts", current_ts) if j > i else current_ts
                outage_end_date = datetime.fromtimestamp(outage_end_ts / 1000, tz=timezone.utc)
                duration_seconds = (outage_end_ts - outage_start) / 1000
                
                outages.append({
                    "type": "power_outage",
                    "start": outage_start_date.isoformat(),
                    "end": outage_end_date.isoformat(),
                    "start_ts": outage_start,
                    "end_ts": outage_end_ts,
                    "duration_seconds": duration_seconds,
                    "duration_formatted": format_duration(duration_seconds),
                    "min_voltage": round(min_voltage_during_outage, 2),
                    "max_voltage": round(max_voltage_during_outage, 2),
                    "data_points": count,
                    "device": current.get("device", "UNKNOWN")
                })
                
                i = j
                continue
            
            # Detectar períodos sin datos (gaps)
            if i < len(sorted_data) - 1:
                next_point = sorted_data[i + 1]
                next_ts = next_point.get("ts", 0)
                gap_ms = next_ts - current_ts
                
                # Si el gap es mayor al esperado, es un período sin datos
                if gap_ms > expected_interval_ms * max_gap_minutes:
                    gap_start_date = datetime.fromtimestamp(current_ts / 1000, tz=timezone.utc)
                    gap_end_date = datetime.fromtimestamp(next_ts / 1000, tz=timezone.utc)
                    gap_seconds = gap_ms / 1000
                    
                    outages.append({
                        "type": "no_data",
                        "start": gap_start_date.isoformat(),
                        "end": gap_end_date.isoformat(),
                        "start_ts": current_ts,
                        "end_ts": next_ts,
                        "duration_seconds": gap_seconds,
                        "duration_formatted": format_duration(gap_seconds),
                        "gap_minutes": round(gap_seconds / 60, 1),
                        "device": current.get("device", "UNKNOWN")
                    })
            
            i += 1
        
        print(f"[POWER-OUTAGES] Detectados {len(outages)} eventos (cortes + gaps)")
        return jsonify(outages)
        
    except Exception as e:
        print(f"[POWER-OUTAGES] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

def format_duration(seconds):
    """Formatea una duración en segundos a formato legible"""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        minutes = int(seconds / 60)
        secs = int(seconds % 60)
        return f"{minutes}m {secs}s"
    else:
        hours = int(seconds / 3600)
        minutes = int((seconds % 3600) / 60)
        secs = int(seconds % 60)
        return f"{hours}h {minutes}m {secs}s"

if __name__ == "__main__":
    # Desarrollo: Flask server
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True, threaded=True)
