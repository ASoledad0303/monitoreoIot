# Diagnóstico: Datos No Llegan al Dashboard

## 🔍 Problema Identificado

- **Serial Monitor ESP32**: Muestra valores altos (8.9-9.0 A, 1834-1866 W) ✅
- **Base de Datos**: Tiene datos antiguos (0.300 A, 4.00 W) ❌
- **Dashboard**: Muestra datos antiguos (0.300 A, 0.01 VA) ❌

**Conclusión**: El ESP32 está funcionando, pero los datos nuevos no están llegando al backend.

## 🔧 Pasos para Diagnosticar

### Paso 1: Verificar que el Bridge MQTT esté Corriendo

Abre una terminal y ejecuta:

```bash
npm run mqtt-bridge
```

**Deberías ver:**
```
[MQTT] Conectado al broker: mqtt://192.168.100.64:1883
[MQTT] Suscrito a topic: esp/energia/+/state
[MQTT] Suscripción exitosa
[MQTT] Bridge iniciado
```

**Si NO ves esto:**
- El bridge no está corriendo
- Necesitas iniciarlo en una terminal separada

### Paso 2: Verificar que el ESP32 esté Publicando en MQTT

En el Serial Monitor del Arduino IDE, deberías ver mensajes como:
```
[MQTT] Publicado: esp/energia/E2641D44/state
```

**Si NO ves esto:**
- El ESP32 no está conectado al broker MQTT
- Verifica la configuración de MQTT en el código del ESP32

### Paso 3: Verificar que el Bridge Reciba los Mensajes

Cuando el ESP32 publique datos, el bridge debería mostrar:
```
[MQTT] Mensaje recibido de esp/energia/E2641D44/state: { device: 'E2641D44', V: 230.5, I: 8.912, P: 1978.1, S: 2147.4, PF: 0.921 }
```

**Si NO ves esto:**
- El bridge no está recibiendo mensajes
- Verifica que el broker MQTT esté corriendo
- Verifica que el topic sea correcto

### Paso 4: Verificar que el Bridge Envíe al Backend

Después de recibir un mensaje, el bridge debería mostrar:
```
[MQTT] ✅ Datos enviados correctamente: {"success":true}
```

**Si ves un error:**
- El backend no está corriendo
- O hay un problema con la API key
- O hay un problema con la URL del API

### Paso 5: Verificar que el Backend Guarde los Datos

Después de que el bridge envíe datos, verifica en la base de datos:

```bash
npm run check-telemetry
```

**Deberías ver:**
- Nuevos registros con valores altos (8.9-9.0 A, 1834-1866 W)
- Timestamp reciente

## 🚨 Problemas Comunes y Soluciones

### Problema 1: Bridge MQTT No Está Corriendo

**Solución:**
```bash
# En una terminal separada (mientras el frontend corre)
npm run mqtt-bridge
```

### Problema 2: Broker MQTT No Está Corriendo

**Solución:**
- Instala y ejecuta un broker MQTT (Mosquitto, HiveMQ, etc.)
- O usa un broker MQTT en la nube (HiveMQ Cloud, AWS IoT Core, etc.)
- Verifica que el broker esté en `192.168.100.64:1883`

### Problema 3: ESP32 No Se Conecta al Broker MQTT

**Solución:**
- Verifica la IP del broker en el código del ESP32
- Verifica que el broker esté accesible desde la red del ESP32
- Verifica usuario/contraseña MQTT si están configurados

### Problema 4: Bridge No Encuentra API Key

**Solución:**
```bash
# Verifica que el dispositivo tenga API key
npm run show-device-keys
```

Si no hay API key, el bridge no puede enviar datos al backend.

### Problema 5: Backend No Está Corriendo

**Solución:**
```bash
# Inicia el backend
npm run dev
```

El bridge necesita que el backend esté corriendo en `http://localhost:3000`.

## ✅ Checklist de Verificación

- [ ] Broker MQTT corriendo en `192.168.100.64:1883`
- [ ] Bridge MQTT corriendo (`npm run mqtt-bridge`)
- [ ] Backend corriendo (`npm run dev`)
- [ ] ESP32 conectado a Wi-Fi
- [ ] ESP32 conectado al broker MQTT
- [ ] ESP32 publicando mensajes (ver Serial Monitor)
- [ ] Bridge recibiendo mensajes (ver consola del bridge)
- [ ] Bridge enviando al backend (ver consola del bridge)
- [ ] Datos guardándose en BD (verificar con `npm run check-telemetry`)

## 🎯 Comandos Útiles

```bash
# Ver API keys de dispositivos
npm run show-device-keys

# Verificar datos en la BD
npm run check-telemetry

# Iniciar bridge MQTT
npm run mqtt-bridge

# Iniciar backend
npm run dev
```

## 📊 Flujo Esperado

```
ESP32 (Serial Monitor muestra: 8.9A, 1834W)
  ↓ Publica en MQTT
MQTT Broker (192.168.100.64:1883)
  ↓ Bridge se suscribe
MQTT Bridge (npm run mqtt-bridge)
  ↓ Envía HTTP POST
Backend API (/api/iot/telemetry)
  ↓ Guarda en BD
Base de Datos (telemetry_history)
  ↓ Frontend consulta
Dashboard (muestra: 8.9A, 1834W)
```

## 🔍 Verificar en Tiempo Real

1. **Abre 3 terminales:**
   - Terminal 1: `npm run dev` (backend)
   - Terminal 2: `npm run mqtt-bridge` (bridge)
   - Terminal 3: Para comandos de verificación

2. **Observa las consolas:**
   - Terminal 2 debería mostrar mensajes recibidos del ESP32
   - Terminal 1 debería mostrar requests al endpoint `/api/iot/telemetry`

3. **Verifica los datos:**
   ```bash
   npm run check-telemetry
   ```

