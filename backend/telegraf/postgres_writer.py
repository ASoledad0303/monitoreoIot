#!/usr/bin/env python3
"""
Script para escribir datos de Telegraf a PostgreSQL
Parsea el formato InfluxDB line protocol que Telegraf envía
"""
import sys
import os
import psycopg2
from datetime import datetime, timezone

# Configuración de PostgreSQL desde variables de entorno
# Soporta DATABASE_URL o variables individuales
DATABASE_URL = os.getenv('DATABASE_URL')
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'tesis_iot_db')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'postgres')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'postgres')

def connect_db():
    """Conecta a PostgreSQL"""
    try:
        # Si hay DATABASE_URL, usarla directamente
        if DATABASE_URL:
            # Convertir formato postgres:// a formato que psycopg2 entiende
            db_url = DATABASE_URL
            if db_url.startswith('postgres://'):
                db_url = db_url.replace('postgres://', 'postgresql://', 1)
            conn = psycopg2.connect(db_url)
        else:
            # Usar variables individuales
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD
            )
        return conn
    except Exception as e:
        print(f"Error conectando a PostgreSQL: {e}", file=sys.stderr)
        return None

def parse_influx_line(line):
    """
    Parsea una línea en formato InfluxDB line protocol:
    measurement,tag1=value1,tag2=value2 field1=value1,field2=value2 timestamp
    """
    try:
        line = line.strip()
        if not line:
            return None
        
        # Separar measurement/tags, fields y timestamp
        parts = line.split(' ', 2)
        if len(parts) < 2:
            return None
        
        measurement_tags = parts[0]
        fields = parts[1]
        timestamp = int(parts[2]) if len(parts) > 2 and parts[2].strip() else None
        
        # Parsear measurement y tags
        measurement_parts = measurement_tags.split(',', 1)
        measurement = measurement_parts[0]
        tags = {}
        if len(measurement_parts) > 1:
            for tag in measurement_parts[1].split(','):
                if '=' in tag:
                    key, value = tag.split('=', 1)
                    tags[key] = value
        
        # Parsear fields
        field_dict = {}
        for field in fields.split(','):
            if '=' in field:
                key, value = field.split('=', 1)
                # Convertir valores numéricos
                try:
                    if value.endswith('i'):
                        field_dict[key] = int(value[:-1])
                    elif '.' in value:
                        field_dict[key] = float(value)
                    else:
                        field_dict[key] = float(value)
                except ValueError:
                    field_dict[key] = value
        
        # Convertir timestamp a datetime
        if timestamp:
            # Timestamp en nanosegundos, convertir a segundos
            dt = datetime.fromtimestamp(timestamp / 1e9, tz=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)
        
        return {
            'measurement': measurement,
            'tags': tags,
            'fields': field_dict,
            'time': dt
        }
    except Exception as e:
        print(f"Error parseando línea: {e} - {line}", file=sys.stderr)
        return None

def insert_telemetry(conn, data):
    """Inserta datos de telemetría en PostgreSQL"""
    try:
        # Solo procesar measurement telemetry
        if data['measurement'] != 'telemetry':
            print(f"DEBUG: Ignorando measurement '{data['measurement']}' (solo procesamos 'telemetry')", file=sys.stderr)
            return
        
        device = data['tags'].get('device')
        if not device:
            print(f"DEBUG: No se encontró tag 'device' en los datos: {data}", file=sys.stderr)
            return
        
        fields = data['fields']
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO telemetry ("time", device, vrms, irms, s_apparent_va, potencia_activa, factor_potencia)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (
            data['time'],
            device,
            fields.get('vrms'),
            fields.get('irms'),
            fields.get('s_apparent_va'),
            fields.get('potencia_activa'),
            fields.get('factor_potencia')
        ))
        conn.commit()
        cursor.close()
        print(f"DEBUG: Insertado registro para device={device}, vrms={fields.get('vrms')}, irms={fields.get('irms')}", file=sys.stderr)
    except Exception as e:
        print(f"Error insertando datos: {e} - {data}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        conn.rollback()

def main():
    """Lee datos de stdin (desde Telegraf) y los escribe a PostgreSQL"""
    print("DEBUG: Iniciando script postgres_writer.py", file=sys.stderr)
    conn = connect_db()
    if not conn:
        print("DEBUG: No se pudo conectar a PostgreSQL", file=sys.stderr)
        sys.exit(1)
    
    print("DEBUG: Conectado a PostgreSQL exitosamente", file=sys.stderr)
    line_count = 0
    
    try:
        for line in sys.stdin:
            line_count += 1
            if line_count % 10 == 0:
                print(f"DEBUG: Procesadas {line_count} líneas", file=sys.stderr)
            
            data = parse_influx_line(line)
            if data:
                print(f"DEBUG: Datos parseados - measurement={data['measurement']}, tags={data['tags']}, fields={list(data['fields'].keys())}", file=sys.stderr)
                insert_telemetry(conn, data)
            else:
                print(f"DEBUG: No se pudo parsear la línea: {line[:100]}", file=sys.stderr)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"ERROR en main: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    finally:
        print(f"DEBUG: Cerrando conexión. Total líneas procesadas: {line_count}", file=sys.stderr)
        conn.close()

if __name__ == '__main__':
    main()
