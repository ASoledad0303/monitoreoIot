# Topics MQTT - Configuración

## 📡 Topics que Publica el ESP32

El ESP32 publica datos en los siguientes topics MQTT:

### 1. Topic de Estado (JSON)
```
esp/energia/<deviceId>/state
```

**Ejemplo concreto:**
```
esp/energia/E2641D44/state
```

**Formato del mensaje:**
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

**Dónde se define:**
- En el código del ESP32, línea ~274:
  ```cpp
  snprintf(topicState, sizeof(topicState), "esp/energia/%s/state", deviceId.c_str());
  ```
- Se publica en la línea ~245:
  ```cpp
  mqtt.publish(topicState, json, false);
  ```

### 2. Topic de Línea (Influx Line Protocol)
```
esp/energia/<deviceId>/line
```

**Ejemplo:**
```
esp/energia/E2641D44/line
```

**Formato del mensaje:**
```
power,device=E2641D44 V=230.400,I=8.912,P=1978.100,S=2147.400,PF=0.921
```

**Dónde se define:**
- En el código del ESP32, línea ~275:
  ```cpp
  snprintf(topicLine, sizeof(topicLine), "esp/energia/%s/line", deviceId.c_str());
  ```
- Se publica en la línea ~253:
  ```cpp
  mqtt.publish(topicLine, line, false);
  ```

### 3. Topic de Estado de Conexión (LWT - Last Will and Testament)
```
esp/energia/<deviceId>/status
```

**Ejemplo:**
```
esp/energia/E2641D44/status
```

**Mensajes:**
- `"online"` cuando se conecta
- `"offline"` cuando se desconecta (LWT)

**Dónde se define:**
- En el código del ESP32, línea ~276:
  ```cpp
  snprintf(topicLWT, sizeof(topicLWT), "esp/energia/%s/status", deviceId.c_str());
  ```

## 📥 Topics a los que se Suscribe el Bridge MQTT

El servicio `mqtt-bridge.js` se suscribe a:

### Topic de Suscripción
```
esp/energia/+/state
```

**Explicación:**
- El `+` es un wildcard que coincide con cualquier deviceId
- Coincide con: `esp/energia/E2641D44/state`, `esp/energia/ABC123/state`, etc.

**Dónde se define:**
- En `services/mqtt-bridge.js`, línea 21:
  ```javascript
  const MQTT_TOPIC = process.env.MQTT_TOPIC || 'esp/energia/+/state';
  ```
- Se suscribe en la línea ~75:
  ```javascript
  client.subscribe(MQTT_TOPIC, (err) => { ... });
  ```

## 🔧 Cómo Cambiar los Topics

### Cambiar el Topic del ESP32

Edita el código del ESP32 y modifica estas líneas:

```cpp
// Cambiar el patrón del topic
snprintf(topicState, sizeof(topicState), "mi-sistema/energia/%s/state", deviceId.c_str());
snprintf(topicLine,  sizeof(topicLine),  "mi-sistema/energia/%s/line",  deviceId.c_str());
snprintf(topicLWT,   sizeof(topicLWT),   "mi-sistema/energia/%s/status", deviceId.c_str());
```

### Cambiar el Topic del Bridge

1. **Opción A: Variable de entorno**
   
   Agrega a `.env.local`:
   ```env
   MQTT_TOPIC=mi-sistema/energia/+/state
   ```

2. **Opción B: Modificar el código**
   
   Edita `services/mqtt-bridge.js`, línea 21:
   ```javascript
   const MQTT_TOPIC = process.env.MQTT_TOPIC || 'mi-sistema/energia/+/state';
   ```

## 📋 Resumen de Topics

| Componente | Topic | Tipo | Descripción |
|------------|-------|------|-------------|
| **ESP32 Publica** | `esp/energia/<deviceId>/state` | JSON | Datos de telemetría (V, I, P, S, PF) |
| **ESP32 Publica** | `esp/energia/<deviceId>/line` | Line Protocol | Datos en formato InfluxDB |
| **ESP32 Publica** | `esp/energia/<deviceId>/status` | String | Estado de conexión (online/offline) |
| **Bridge Suscribe** | `esp/energia/+/state` | Wildcard | Recibe todos los mensajes de estado |

## 🔍 Verificar Topics en Tiempo Real

### Con mosquitto_sub (si tienes Mosquitto instalado)

```bash
# Ver todos los mensajes del ESP32
mosquitto_sub -h 192.168.100.64 -t "esp/energia/+/state" -v

# Ver solo el dispositivo específico
mosquitto_sub -h 192.168.100.64 -t "esp/energia/E2641D44/state" -v
```

### Con el Bridge MQTT

El bridge muestra en la consola:
```
[MQTT] Mensaje recibido de esp/energia/E2641D44/state: { device: 'E2641D44', V: 230.5, ... }
```

## 📝 Notas Importantes

1. **DeviceId**: Es el chipID del ESP32 en hexadecimal (ej: `E2641D44`)
2. **Wildcard `+`**: Coincide con un solo nivel del topic
3. **Wildcard `#`**: Coincide con múltiples niveles (no se usa aquí)
4. **QoS**: Los mensajes se publican con QoS 0 (fire and forget)
5. **LWT**: El topic de status usa QoS 1 (retained) para mantener el estado

## 🎯 Ejemplo Completo

Si tu ESP32 tiene deviceId `E2641D44`, los topics serán:

- **Publica JSON**: `esp/energia/E2641D44/state`
- **Publica Line**: `esp/energia/E2641D44/line`
- **Publica Status**: `esp/energia/E2641D44/status`
- **Bridge escucha**: `esp/energia/+/state` (coincide con el anterior)

