# Integración ESP32 con Backend Next.js

Este documento explica cómo conectar tu ESP32 al backend Next.js para enviar datos de telemetría directamente a la base de datos.

## 📋 Requisitos Previos

1. **Dispositivo registrado en la base de datos**
   - Debes crear un dispositivo en la interfaz web (`/admin/dispositivos`)
   - El dispositivo debe estar asociado a una company

2. **API Key del dispositivo**
   - Cada dispositivo tiene una API key única generada automáticamente
   - Esta key se usa para autenticar las peticiones HTTP desde el ESP32

## 🔧 Configuración de la Base de Datos

### 1. Ejecutar migración para agregar API keys

```bash
npm run migrate:device-api-key
```

Este script:
- Agrega el campo `api_key` a la tabla `devices`
- Genera API keys únicas para todos los dispositivos existentes
- Crea un índice para búsquedas rápidas

### 2. Ver API keys de dispositivos

```bash
npm run show-device-keys
```

Este comando muestra todos los dispositivos con sus API keys correspondientes.

## 📡 Configuración del ESP32

### 1. Cargar el código

El archivo `ESP32-IOT-HTTP.ino` contiene el código modificado que:
- Reemplaza MQTT por HTTP POST
- Envía datos directamente al endpoint `/api/iot/telemetry`
- Usa autenticación por API key

### 2. Configurar constantes

Edita las siguientes constantes en `ESP32-IOT-HTTP.ino`:

```cpp
#define WIFI_SSID   "TU_SSID"              // Nombre de tu red Wi-Fi
#define WIFI_PASS   "TU_PASSWORD"          // Contraseña de tu red Wi-Fi
#define API_URL     "http://localhost:3000/api/iot/telemetry"  // URL del backend
```

**Nota sobre la URL:**
- Si el backend está en Docker, usa la IP del host: `http://192.168.1.100:3000/api/iot/telemetry`
- Si está en la misma máquina: `http://localhost:3000/api/iot/telemetry`
- Si está en producción: `https://tu-dominio.com/api/iot/telemetry`

### 3. Configurar API Key

Hay dos formas de configurar la API key:

#### Opción A: Desde el Serial Monitor

1. Abre el Serial Monitor (115200 baud)
2. Envía el comando: `apikey <tu-api-key>`
3. Guarda permanentemente: `save`

Ejemplo:
```
apikey a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
save
```

#### Opción B: Modificar el código

Edita la línea en `setup()` o `loadCal()` para establecer la API key por defecto.

## 🔌 Endpoint API

### POST `/api/iot/telemetry`

**Autenticación:**
- Header: `X-API-Key: <api-key>`
- O en el body JSON: `{ "api_key": "<api-key>", ... }`

**Formato de datos (JSON):**
```json
{
  "device": "ABC123DEF456",  // Device ID del ESP32 (chipID)
  "V": 230.5,                 // Voltaje RMS (V)
  "I": 8.912,                 // Corriente RMS (A)
  "P": 1978.1,                // Potencia activa (W) - puede ser negativo
  "S": 2147.4,                // Potencia aparente (VA)
  "PF": 0.921,                // Factor de potencia (-1 a 1)
  "api_key": "opcional"       // API key (opcional si se envía en header)
}
```

**Respuesta exitosa:**
```json
{
  "ok": true,
  "id": 123,
  "device_id": 1,
  "message": "Datos recibidos correctamente"
}
```

**Errores comunes:**
- `401`: API key inválida o dispositivo inactivo
- `400`: Datos inválidos (formato incorrecto)
- `500`: Error del servidor

## 📊 Flujo de Datos

1. **ESP32 mide valores** (V, I, P, S, PF) cada segundo
2. **ESP32 envía HTTP POST** a `/api/iot/telemetry` con:
   - API key en header `X-API-Key`
   - Datos JSON en el body
3. **Backend valida**:
   - API key existe y dispositivo está activo
   - Datos tienen formato correcto
4. **Backend guarda** en `telemetry_history`:
   - Asocia datos al `device_id` y `company_id`
   - Usa fecha actual (YYYY-MM-DD)
   - Actualiza si ya existe registro para ese día
5. **Backend genera alertas** automáticamente si:
   - Voltaje excede umbrales (min/max)
   - Potencia excede umbral máximo

## 🛠️ Comandos del Serial Monitor

El ESP32 acepta los siguientes comandos por Serial Monitor:

- `help` - Muestra lista de comandos
- `stage X` - Cambia etapa de calibración (0-4)
- `vgain <valor>` - Ajusta ganancia de voltaje
- `igain <valor>` - Ajusta ganancia de corriente
- `phase <valor>` - Ajusta corrección de fase (0.00-0.20)
- `ipol 1|-1` - Cambia polaridad del CT
- `apikey <key>` - Configura API key del dispositivo
- `save` - Guarda configuración en NVS
- `load` - Carga configuración desde NVS
- `defaults` - Restaura valores por defecto

## 🔍 Verificación

### 1. Verificar que el dispositivo tiene API key

```bash
npm run show-device-keys
```

### 2. Probar el endpoint manualmente

```bash
curl -X POST http://localhost:3000/api/iot/telemetry \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <tu-api-key>" \
  -d '{
    "device": "ABC123",
    "V": 230.5,
    "I": 8.912,
    "P": 1978.1,
    "S": 2147.4,
    "PF": 0.921
  }'
```

### 3. Verificar datos en la base de datos

Los datos aparecerán en:
- **Dashboard principal** (`/`) - Monitoreo en tiempo real
- **Reportes** (`/reportes`) - Historial y gráficos
- **Telemetría** - Tabla `telemetry_history` en PostgreSQL

## 🐳 Configuración con Docker

Si el backend está en Docker:

1. **Obtener IP del host:**
   ```bash
   # En Windows
   ipconfig
   
   # En Linux/Mac
   ifconfig
   ```

2. **Configurar URL en ESP32:**
   ```cpp
   #define API_URL "http://192.168.1.100:3000/api/iot/telemetry"
   ```
   Reemplaza `192.168.1.100` con la IP de tu máquina host.

3. **Asegurar que el puerto está expuesto:**
   - Verifica que Docker expone el puerto 3000
   - Ejemplo en `docker-compose.yml`:
     ```yaml
     ports:
       - "3000:3000"
     ```

## ⚠️ Troubleshooting

### El ESP32 no se conecta al Wi-Fi
- Verifica `WIFI_SSID` y `WIFI_PASS`
- Asegúrate de que la red está disponible

### Error 401: API key inválida
- Verifica que la API key está correcta: `npm run show-device-keys`
- Asegúrate de que el dispositivo está activo (`is_active = true`)
- Verifica que envías la API key en el header `X-API-Key`

### Error de conexión HTTP
- Verifica que la URL es correcta
- Asegúrate de que el backend está corriendo
- Si está en Docker, verifica que el puerto está expuesto
- Verifica que el ESP32 puede alcanzar la IP del servidor (ping)

### Los datos no aparecen en el dashboard
- Verifica que el dispositivo está asociado a una company
- Verifica que hay un usuario admin en esa company
- Revisa los logs del backend para errores

## 📝 Notas Importantes

1. **Frecuencia de envío**: Por defecto, el ESP32 envía datos cada 1 segundo. Puedes ajustar `PUB_INTERVAL_MS` en el código.

2. **Persistencia**: La API key se guarda en NVS (Non-Volatile Storage) del ESP32, por lo que persiste después de reiniciar.

3. **Seguridad**: La API key es única por dispositivo. Si se compromete, puedes regenerarla ejecutando `npm run migrate:device-api-key` nuevamente.

4. **Múltiples dispositivos**: Cada ESP32 debe tener su propia API key correspondiente a un dispositivo diferente en la base de datos.

## 🔄 Migración desde MQTT

Si ya tenías el código con MQTT:

1. Reemplaza `PubSubClient` por `HTTPClient`
2. Cambia `mqtt.publish()` por `http.POST()`
3. Configura la API key en lugar de credenciales MQTT
4. Actualiza la URL del endpoint

El resto del código (medición, calibración, LCD) permanece igual.

