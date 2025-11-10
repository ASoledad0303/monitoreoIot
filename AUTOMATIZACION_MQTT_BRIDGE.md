# Automatización del Bridge MQTT

## ✅ Configuración Completada

El bridge MQTT ahora se ejecuta automáticamente cuando inicias el proyecto con `npm run dev`.

## 🚀 Uso

### Iniciar Todo (Frontend + Bridge MQTT)

```bash
npm run dev
```

Esto iniciará:
- ✅ **Next.js** (frontend/backend) en `http://localhost:3000`
- ✅ **MQTT Bridge** conectándose al broker MQTT

### Scripts Disponibles

- **`npm run dev`**: Inicia tanto el frontend como el bridge MQTT (recomendado)
- **`npm run dev:next`**: Solo inicia el frontend Next.js
- **`npm run dev:mqtt`**: Solo inicia el bridge MQTT
- **`npm run mqtt-bridge`**: Alias para ejecutar solo el bridge (mantiene compatibilidad)

## 📊 Salida en Consola

Cuando ejecutas `npm run dev`, verás dos procesos corriendo en paralelo:

```
[NEXT] ▲ Next.js 15.5.4
[NEXT] - Local:        http://localhost:3000
[MQTT] [MQTT] Conectado al broker: mqtt://192.168.100.64:1883
[MQTT] [MQTT] Suscrito a topic: esp/energia/+/state
[MQTT] [MQTT] Bridge iniciado
```

Cada línea está prefijada con `[NEXT]` o `[MQTT]` para identificar de dónde viene el mensaje.

## 🎨 Colores

- **Azul**: Mensajes de Next.js
- **Verde**: Mensajes del MQTT Bridge

## ⚙️ Configuración

La configuración del bridge MQTT se encuentra en `.env.local`:

```env
MQTT_BROKER=mqtt://192.168.100.64:1883
MQTT_USER=tu_usuario
MQTT_PASS=tu_contraseña
MQTT_TOPIC=esp/energia/+/state
API_URL=http://localhost:3000/api/iot/telemetry
```

## 🔧 Troubleshooting

### Si el bridge no se conecta:

1. **Verifica que el broker MQTT esté corriendo** en la IP configurada
2. **Verifica las credenciales** en `.env.local`
3. **Verifica la conexión de red** entre tu máquina y el broker

### Si quieres ejecutar solo el frontend:

```bash
npm run dev:next
```

### Si quieres ejecutar solo el bridge:

```bash
npm run dev:mqtt
```

### Si necesitas detener un proceso específico:

- Presiona `Ctrl + C` para detener ambos procesos
- O cierra la terminal para detener todo

## 📝 Notas

- El bridge MQTT se reinicia automáticamente si el proceso de Next.js se detiene
- Ambos procesos comparten la misma salida de consola, pero están claramente identificados
- Si necesitas logs separados, puedes ejecutar los procesos en terminales diferentes

## ✅ Ventajas

1. **Automatización**: No necesitas recordar ejecutar el bridge manualmente
2. **Sincronización**: Ambos procesos inician juntos
3. **Facilidad**: Un solo comando para iniciar todo
4. **Visibilidad**: Puedes ver los logs de ambos procesos en una sola consola

