# Cómo Ver los Datos del ESP32 en la Interfaz

Una vez que el ESP32 está enviando datos correctamente, aquí te explico dónde y cómo verlos en la interfaz web.

## 🔍 Paso 1: Verificar que los Datos se Están Guardando

Ejecuta este comando para verificar que los datos están llegando a la base de datos:

```bash
npm run check-telemetry
```

Este script mostrará:
- Los últimos 10 registros de telemetría
- Estadísticas generales
- Información de dispositivos y companies

Si no ves datos, verifica:
1. ✅ El ESP32 está conectado a Wi-Fi
2. ✅ La API key está configurada correctamente
3. ✅ El dispositivo está creado en `/admin/dispositivos`
4. ✅ El backend está corriendo

## 📊 Paso 2: Ver los Datos en la Interfaz

### Opción A: Reportes Históricos (`/reportes`)

**Esta es la mejor opción para ver los datos del ESP32.**

1. **Inicia sesión** en la aplicación web
2. Ve a **"Reportes"** en el menú lateral
3. **Selecciona la Company** (si eres admin) o se seleccionará automáticamente
4. **Selecciona el Dispositivo** que corresponde a tu ESP32
5. **Selecciona el rango de fechas** que quieres ver
6. Haz clic en **"Generar Reporte"**

Verás:
- 📈 Gráficos de voltaje, corriente y potencia
- 📊 Tabla con todos los datos históricos
- 💾 Opción de exportar a PDF

### Opción B: Dashboard Principal (`/`)

**Nota:** El dashboard principal usa WebSocket para datos en tiempo real. Los datos del ESP32 se guardan en la base de datos pero no se envían automáticamente por WebSocket.

Para ver datos en tiempo real en el dashboard, necesitarías:
- Un servidor WebSocket que lea de la base de datos y envíe actualizaciones
- O modificar el ESP32 para que también publique a un broker MQTT que alimente el WebSocket

**Por ahora, usa la opción de Reportes para ver los datos históricos.**

## 🔧 Paso 3: Verificar Configuración del Dispositivo

### 1. Verificar que el dispositivo existe

```bash
npm run show-device-keys
```

Esto mostrará todos los dispositivos con sus API keys. Asegúrate de que:
- El dispositivo está **activo** (`is_active: true`)
- Tiene una **API key** asignada
- Está asociado a una **company**

### 2. Verificar en la interfaz web

1. Ve a **"Administración" → "Dispositivos"**
2. Verifica que tu dispositivo aparece en la lista
3. Asegúrate de que está **activo** (checkbox marcado)

## 📱 Estructura de Datos

Los datos del ESP32 se guardan en la tabla `telemetry_history` con esta estructura:

- **fecha**: Fecha del registro (YYYY-MM-DD)
- **voltaje**: Voltaje RMS en voltios (V)
- **corriente**: Corriente RMS en amperios (A)
- **potencia**: Potencia activa en vatios (W)
- **device_id**: ID del dispositivo (asociado automáticamente por API key)
- **company_id**: ID de la company (asociado automáticamente)

## 🐛 Troubleshooting

### No veo datos en los reportes

1. **Verifica que hay datos en la base de datos:**
   ```bash
   npm run check-telemetry
   ```

2. **Verifica que el dispositivo está seleccionado:**
   - En la página de Reportes, asegúrate de seleccionar el dispositivo correcto
   - Si no aparece, verifica que el dispositivo está asociado a la company correcta

3. **Verifica el rango de fechas:**
   - Los datos se guardan con la fecha actual
   - Asegúrate de seleccionar un rango que incluya hoy

### Los datos no se están guardando

1. **Verifica logs del backend:**
   - Revisa la consola donde corre `npm run dev`
   - Busca errores relacionados con `/api/iot/telemetry`

2. **Verifica la API key:**
   ```bash
   npm run show-device-keys
   ```
   Compara la API key con la que configuraste en el ESP32

3. **Prueba el endpoint manualmente:**
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

### El dispositivo no aparece en el selector

1. **Verifica que el dispositivo está activo:**
   - Ve a `/admin/dispositivos`
   - Asegúrate de que el checkbox "Activo" está marcado

2. **Verifica que estás en la company correcta:**
   - Si eres admin, selecciona la company del dispositivo
   - Si eres user, verifica que tu usuario está asignado a la company del dispositivo

## 📝 Notas Importantes

1. **Frecuencia de actualización:**
   - Los datos se guardan cada vez que el ESP32 envía (por defecto cada 1 segundo)
   - En la tabla `telemetry_history`, solo se guarda **un registro por día por dispositivo**
   - Si envías múltiples veces el mismo día, se **actualiza** el registro existente

2. **Datos en tiempo real:**
   - Para ver datos en tiempo real en el dashboard principal, necesitarías configurar un servidor WebSocket adicional
   - Por ahora, los reportes muestran los datos históricos guardados

3. **Alertas automáticas:**
   - Si los valores exceden los umbrales configurados, se generan alertas automáticamente
   - Puedes ver las alertas en **"Alertas"** en el menú lateral

## 🎯 Resumen Rápido

1. ✅ Verifica datos: `npm run check-telemetry`
2. 📊 Ve a **Reportes** en la interfaz web
3. 🔍 Selecciona Company y Dispositivo
4. 📅 Selecciona rango de fechas
5. 📈 Genera el reporte y visualiza los datos

¡Listo! Ya deberías poder ver todos los datos que tu ESP32 está enviando. 🚀

