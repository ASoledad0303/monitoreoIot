# Resumen de Cambios - MQTT y Dispositivo Principal

## ✅ Cambios Realizados

### 1. Dispositivo Renombrado
- ✅ Nombre: "test" → **"Dispositivo Principal"**
- ✅ Código: "1212" → **"PRINCIPAL"**
- ✅ Ejecutado: `npm run rename-device`

### 2. Código ESP32 MQTT
- ✅ Archivo creado: `ESP32-MQTT-PRINCIPAL.ino`
- ✅ Usa MQTT en lugar de HTTP
- ✅ Solo muestra stage 4 (RUN) en el LCD
- ✅ Publica en: `esp/energia/<deviceId>/state`

### 3. Servicio MQTT Bridge
- ✅ Archivo creado: `services/mqtt-bridge.js`
- ✅ Se suscribe a los topics MQTT
- ✅ Envía datos al endpoint `/api/iot/telemetry`
- ✅ Usa la API key del dispositivo principal automáticamente

### 4. Dependencias
- ✅ Instalado: `mqtt` package

## 🚀 Pasos para Usar

### 1. Configurar el ESP32

1. Abre `ESP32-MQTT-PRINCIPAL.ino` en Arduino IDE
2. Configura las constantes:
   ```cpp
   #define WIFI_SSID   "TU_SSID"
   #define WIFI_PASS   "TU_PASSWORD"
   #define MQTT_HOST   "192.168.100.64"  // IP del broker MQTT
   #define MQTT_PORT   1883
   ```
3. Carga el código al ESP32

### 2. Configurar Variables de Entorno

Agrega a `.env.local`:
```env
MQTT_BROKER=mqtt://192.168.100.64:1883
MQTT_USER=
MQTT_PASS=
MQTT_TOPIC=esp/energia/+/state
API_URL=http://localhost:3000/api/iot/telemetry
```

### 3. Iniciar el Bridge MQTT

En una terminal separada:
```bash
npm run mqtt-bridge
```

Deberías ver:
```
[MQTT] Conectado al broker: mqtt://192.168.100.64:1883
[MQTT] Suscrito a topic: esp/energia/+/state
[MQTT] ✅ API Key cargada para dispositivo principal (Dispositivo Principal): c797f8c6...
```

### 4. Verificar en el ESP32

En el Serial Monitor deberías ver:
```
[MQTT] Connected
RUN  V=244.3 I=1.740  P=14.7W(sig)  S=425.1VA  PF=0.035(sig)  I_POL=1
```

### 5. Ver en la Interfaz

1. Ve al Dashboard principal
2. Selecciona "Dispositivo Principal" en el selector
3. Deberías ver los datos en tiempo real

## 📋 Características del LCD

El LCD ahora solo muestra:
- **Línea 1**: `V=230 I=1.74` (Voltaje y Corriente)
- **Línea 2**: `P=14.7W PF=0.92` (Potencia y Factor de Potencia)

No muestra las etapas de calibración (RAW, VOLT, CURR, PHASE).

## 🔧 Comandos Disponibles

- `npm run rename-device` - Renombrar dispositivo a "Dispositivo Principal"
- `npm run mqtt-bridge` - Iniciar el bridge MQTT
- `npm run show-device-keys` - Ver API keys de dispositivos
- `npm run check-telemetry` - Verificar datos en la base de datos

## ⚠️ Importante

- El bridge MQTT debe estar corriendo mientras el sistema esté activo
- Si detienes el bridge, los datos del ESP32 no llegarán al backend
- Puedes ejecutar el bridge junto con el servidor Next.js en terminales separadas

