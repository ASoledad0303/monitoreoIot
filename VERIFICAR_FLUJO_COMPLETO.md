# Verificar que Todo el Sistema Funcione

## ✅ Checklist de Verificación

### 1. ESP32 Funcionando ✅
- [x] Código compilado y subido
- [x] ESP32 conectado a Wi-Fi
- [x] ESP32 conectado al broker MQTT
- [x] LCD mostrando datos (stage 4)

### 2. Broker MQTT
- [ ] Broker MQTT corriendo en `192.168.100.64:1883`
- [ ] El ESP32 puede publicar mensajes

### 3. Bridge MQTT
- [ ] Bridge MQTT corriendo
- [ ] Bridge conectado al broker
- [ ] Bridge recibiendo mensajes del ESP32

### 4. Base de Datos
- [ ] Datos de telemetría guardándose
- [ ] Dispositivo "Dispositivo Principal" existe
- [ ] API key del dispositivo configurada

### 5. Frontend
- [ ] Frontend corriendo en `http://localhost:3000`
- [ ] Datos apareciendo en el dashboard
- [ ] Gráficos actualizándose

## 🚀 Pasos para Verificar

### Paso 1: Verificar API Key del Dispositivo

```bash
npm run show-device-keys
```

Deberías ver algo como:
```
Dispositivo: Dispositivo Principal (PRINCIPAL)
API Key: abc123def456...
```

### Paso 2: Iniciar el Bridge MQTT

En una terminal separada:

```bash
npm run mqtt-bridge
```

Deberías ver:
```
[MQTT] Conectado al broker mqtt://192.168.100.64:1883
[MQTT] Suscrito a: esp/energia/+/state
[MQTT] Esperando mensajes...
```

### Paso 3: Verificar que el Bridge Recibe Datos

Cuando el ESP32 publique datos, verás en la consola del bridge:
```
[MQTT] Mensaje recibido de esp/energia/E2641D44/state: { device: 'E2641D44', V: 230.5, ... }
[HTTP] Datos enviados al backend: 200 OK
```

### Paso 4: Verificar Datos en la Base de Datos

```bash
npm run check-telemetry
```

Deberías ver:
```
✅ Datos de telemetría encontrados:
- Voltaje: 230.5 V
- Corriente: 8.91 A
- Potencia: 1978.1 W
...
```

### Paso 5: Verificar en el Frontend

1. Abre el navegador: `http://localhost:3000`
2. Inicia sesión
3. Selecciona el dispositivo "Dispositivo Principal"
4. Deberías ver:
   - Gráficos actualizándose
   - Valores de V, I, P, S, PF
   - Datos en tiempo real

## 🔧 Solución de Problemas

### El Bridge No Recibe Mensajes

1. **Verifica que el broker MQTT esté corriendo:**
   ```bash
   # Si usas Mosquitto, verifica el servicio
   # O prueba conectarte con un cliente MQTT
   ```

2. **Verifica la configuración en `.env.local`:**
   ```env
   MQTT_BROKER=mqtt://192.168.100.64:1883
   MQTT_USER=tu_usuario
   MQTT_PASS=tu_contraseña
   MQTT_TOPIC=esp/energia/+/state
   ```

3. **Verifica que el ESP32 esté publicando:**
   - Revisa el Serial Monitor del Arduino IDE
   - Deberías ver: `[MQTT] Publicado: esp/energia/E2641D44/state`

### El Bridge Recibe pero No Envía al Backend

1. **Verifica que el backend esté corriendo:**
   ```bash
   npm run dev
   ```

2. **Verifica la URL del API en `.env.local`:**
   ```env
   API_URL=http://localhost:3000/api/iot/telemetry
   ```

3. **Verifica que el dispositivo tenga API key:**
   ```bash
   npm run show-device-keys
   ```

### Los Datos No Aparecen en el Frontend

1. **Verifica que el dispositivo esté activo:**
   - Ve a: `/admin/dispositivos`
   - Verifica que "Dispositivo Principal" esté activo

2. **Verifica que el dispositivo tenga company asignada:**
   - El dispositivo debe estar asociado a una company

3. **Verifica la consola del navegador:**
   - Abre DevTools (F12)
   - Revisa la pestaña "Console" y "Network"
   - Busca errores

4. **Verifica que los datos estén en la BD:**
   ```bash
   npm run check-telemetry
   ```

## 📊 Flujo Completo de Datos

```
ESP32 → MQTT Broker → MQTT Bridge → Backend API → Base de Datos → Frontend
```

1. **ESP32** publica datos en `esp/energia/<deviceId>/state`
2. **MQTT Broker** recibe y distribuye los mensajes
3. **MQTT Bridge** se suscribe y recibe los mensajes
4. **Bridge** envía HTTP POST a `/api/iot/telemetry` con la API key
5. **Backend** valida la API key y guarda en `telemetry_history`
6. **Frontend** consulta `/api/telemetry` y muestra los datos

## 🎯 Comandos Útiles

```bash
# Ver API keys de dispositivos
npm run show-device-keys

# Verificar datos en la BD
npm run check-telemetry

# Iniciar bridge MQTT
npm run mqtt-bridge

# Iniciar frontend
npm run dev
```

## ✅ Estado Actual

- [x] ESP32 funcionando
- [ ] Bridge MQTT corriendo
- [ ] Datos en base de datos
- [ ] Frontend mostrando datos

