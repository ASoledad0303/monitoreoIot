#!/usr/bin/env python3
"""Script temporal para verificar datos en InfluxDB"""
import os
from influxdb_client import InfluxDBClient
from datetime import datetime, timezone, timedelta

INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://influxdb:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "iot_telemetry")

print(f"Conectando a InfluxDB: {INFLUXDB_URL}")
print(f"Org: {INFLUXDB_ORG}, Bucket: {INFLUXDB_BUCKET}")

client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)

# 1. Ver qué measurements hay
print("\n=== Measurements disponibles ===")
query1 = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: -7d) |> group() |> distinct(column: "_measurement") |> limit(n: 10)'
tables1 = client.query_api().query(query1, org=INFLUXDB_ORG)
measurements = []
for t in tables1:
    for r in t.records:
        if r.values.get("_measurement"):
            measurements.append(r.values.get("_measurement"))
print(f"Measurements: {list(set(measurements))}")

# 2. Ver qué devices hay
print("\n=== Devices disponibles ===")
query2 = f'from(bucket:"{INFLUXDB_BUCKET}") |> range(start: -7d) |> filter(fn: (r) => r._measurement == "esp" or r._measurement == "telemetry") |> filter(fn: (r) => exists r.device) |> distinct(column: "device") |> limit(n: 10)'
tables2 = client.query_api().query(query2, org=INFLUXDB_ORG)
devices = []
for t in tables2:
    for r in t.records:
        if r.values.get("device"):
            devices.append(r.values.get("device"))
print(f"Devices: {list(set(devices))}")

# 3. Contar registros del último día
print("\n=== Conteo de registros (último día) ===")
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
tables3 = client.query_api().query(query3, org=INFLUXDB_ORG)
count = 0
for t in tables3:
    for r in t.records:
        count += r.values.get("_value", 0)
print(f"Registros para device 'E2641D44' en último día: {count}")

# 4. Ver algunos registros de ejemplo
print("\n=== Ejemplo de registros (últimos 3) ===")
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
tables4 = client.query_api().query(query4, org=INFLUXDB_ORG)
for t in tables4:
    for r in t.records[:3]:
        print(f"  Time: {r.get_time()}, Values: {r.values}")

# 5. Verificar campos disponibles
print("\n=== Campos disponibles ===")
query5 = f'''
from(bucket:"{INFLUXDB_BUCKET}")
  |> range(start: {start_iso}, stop: {end_iso})
  |> filter(fn: (r) => r._measurement == "esp")
  |> filter(fn: (r) => exists r.device)
  |> filter(fn: (r) => r.device == "E2641D44")
  |> distinct(column: "_field")
  |> limit(n: 20)
'''
tables5 = client.query_api().query(query5, org=INFLUXDB_ORG)
fields = []
for t in tables5:
    for r in t.records:
        if r.values.get("_field"):
            fields.append(r.values.get("_field"))
print(f"Campos: {list(set(fields))}")

print("\n=== Fin de verificación ===")


