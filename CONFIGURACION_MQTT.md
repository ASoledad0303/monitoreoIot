# Configuración MQTT para Dispositivo Principal

Este documento explica cómo configurar el sistema para usar MQTT en lugar de HTTP.

## 📋 Requisitos

1. **Broker MQTT** (Mosquitto u otro)
   - Debe estar corriendo en la misma red
   - Por defecto usa el puerto 1883

2. **Dispositivo renombrado**
   - El dispositivo debe llamarse "Dispositivo Principal"
   - Código: "PRINCIPAL"

## 🔧 Paso 1: Renombrar el Dispositivo

Ejecuta este comando para renombrar el dispositivo "test" a "Dispositivo Principal":

```bash
npm run rename-device
```

Esto actualizará:
- Nombre: "Dispositivo Principal"
- Código: "PRINCIPAL"

## 📡 Paso 2: Configurar el ESP32

### 1. Cargar el código MQTT

Usa el archivo `ESP32-MQTT-PRINCIPAL.ino` que:
- ✅ Usa MQTT en lugar de HTTP
- ✅ Muestra solo stage 4 (RUN) en el LCD
- ✅ Publica en el topic: `esp/energia/<deviceId>/state`

### 2. Configurar constantes

Edita las siguientes constantes en `ESP32-MQTT-PRINCIPAL.ino`:

```cpp
#define WIFI_SSID   "TU_SSID"              // Nombre de tu red Wi-Fi
#define WIFI_PASS   "TU_PASSWORD"          // Contraseña de tu red Wi-Fi
#define MQTT_HOST   "192.168.100.64"       // IP del broker MQTT
#define MQTT_PORT   1883                   // Puerto del broker
#define MQTT_USER   ""                     // Usuario MQTT (opcional)
#define MQTT_PASS   ""                     // Contraseña MQTT (opcional)
```

### 3. Características del código

- **Solo Stage 4 (RUN)**: El LCD siempre muestra voltaje, corriente, potencia y factor de potencia
- **MQTT**: Publica datos JSON en `esp/energia/<deviceId>/state`
- **Formato JSON**:
  ```json
  {
    "device": "E2641D44",
    "V": 230.5,
    "I": 8.912,
    "P": 1978.1,
    "S": 2147.4,
    "PF": 0.921
  }
  ```

## 🔌 Paso 3: Configurar el Bridge MQTT

### 1. Variables de entorno

Agrega estas variables a `.env.local`:

```env
MQTT_BROKER=mqtt://192.168.100.64:1883
MQTT_USER=
MQTT_PASS=
MQTT_TOPIC=esp/energia/+/state
API_URL=http://localhost:3000/api/iot/telemetry
```

### 2. Iniciar el bridge

El bridge MQTT se suscribe a los topics y envía los datos al backend:

```bash
npm run mqtt-bridge
```

Este servicio:
- Se suscribe a `esp/energia/+/state`
- Recibe mensajes JSON del ESP32
- Envía los datos a `/api/iot/telemetry` con la API key del dispositivo principal

### 3. Ejecutar en segundo plano (opcional)

En Windows (PowerShell):
```powershell
Start-Process node -ArgumentList "services/mqtt-bridge.js" -WindowStyle Hidden
```

O usar PM2:
```bash
npm install -g pm2
pm2 start services/mqtt-bridge.js --name mqtt-bridge
pm2 save
pm2 startup
```

## 🎯 Paso 4: Verificar Funcionamiento

### 1. Verificar que el bridge está corriendo

Deberías ver en la consola:
```
[MQTT] Conectado al broker: mqtt://192.168.100.64:1883
[MQTT] Suscrito a topic: esp/energia/+/state
[MQTT] API Key cargada para dispositivo principal: c797f8c6...
```

### 2. Verificar mensajes MQTT

Cuando el ESP32 envíe datos, deberías ver:
```
[MQTT] Mensaje recibido de esp/energia/E2641D44/state: { device: 'E2641D44', V: 230.5, ... }
[MQTT] ✅ Datos enviados correctamente: {"ok":true,"id":123,...}
```

### 3. Verificar datos en la base de datos

```bash
npm run check-telemetry
```

### 4. Ver en la interfaz

- Ve al Dashboard principal
- Selecciona "Dispositivo Principal"
- Deberías ver los datos en tiempo real

## 🔍 Troubleshooting

### El bridge no se conecta a MQTT

1. Verifica que el broker MQTT esté corriendo:
   ```bash
   # En Linux/Mac
   systemctl status mosquitto
   
   # O prueba con un cliente MQTT
   mosquitto_sub -h 192.168.100.64 -t "esp/energia/+/state"
   ```

2. Verifica la IP y puerto en `.env.local`

3. Verifica que no haya firewall bloqueando el puerto 1883

### El ESP32 no se conecta a MQTT

1. Verifica `MQTT_HOST` y `MQTT_PORT` en el código
2. Verifica que el broker esté accesible desde la red del ESP32
3. Revisa el Serial Monitor para ver errores de conexión

### Los datos no llegan al backend

1. Verifica que el bridge esté corriendo
2. Verifica que la API key sea correcta:
   ```bash
   npm run show-device-keys
   ```
3. Verifica los logs del bridge para errores

## 📝 Notas

- El bridge MQTT debe estar corriendo mientras el sistema esté activo
- Puedes ejecutarlo junto con el servidor Next.js
- El ESP32 publica cada 1 segundo por defecto
- El LCD solo muestra stage 4 (RUN) con los valores finales

