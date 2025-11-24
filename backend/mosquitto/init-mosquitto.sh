#!/bin/sh
# Script de inicialización para Mosquitto
# Crea el directorio y el archivo de contraseñas si no existen

set -e

# Crear directorios si no existen
mkdir -p /mosquitto/data
mkdir -p /mosquitto/log

# Establecer permisos
chmod 755 /mosquitto/data
chmod 755 /mosquitto/log

# Obtener credenciales de variables de entorno
MQTT_USER="${MQTT_USER:-tesis}"
MQTT_PASS="${MQTT_PASS:-@E2wBB29|23w}"

# Crear archivo de contraseñas si no existe
if [ ! -f /mosquitto/data/passwd ]; then
    echo "Creando archivo de contraseñas..."
    mosquitto_passwd -c -b /mosquitto/data/passwd "$MQTT_USER" "$MQTT_PASS"
    echo "Archivo de contraseñas creado exitosamente"
else
    echo "El archivo de contraseñas ya existe, actualizando..."
    mosquitto_passwd -b /mosquitto/data/passwd "$MQTT_USER" "$MQTT_PASS" || mosquitto_passwd -c -b /mosquitto/data/passwd "$MQTT_USER" "$MQTT_PASS"
fi

# Asegurar permisos correctos según las recomendaciones de Mosquitto
# Intentar cambiar el propietario a mosquitto si existe, sino mantener root
if id "mosquitto" >/dev/null 2>&1; then
    chown mosquitto:mosquitto /mosquitto/data/passwd || chown root:root /mosquitto/data/passwd
    chmod 600 /mosquitto/data/passwd
else
    chown root:root /mosquitto/data/passwd || true
    chmod 600 /mosquitto/data/passwd
fi

# Verificar que el archivo existe y tiene contenido
if [ -f /mosquitto/data/passwd ]; then
    echo "Archivo de contraseñas verificado:"
    ls -la /mosquitto/data/passwd
    echo "Contenido del archivo (primeras líneas):"
    head -n 1 /mosquitto/data/passwd || echo "Archivo vacío o no legible"
else
    echo "ERROR: No se pudo crear el archivo de contraseñas"
    exit 1
fi

# Iniciar Mosquitto
exec mosquitto -c /mosquitto/config/mosquitto.conf

