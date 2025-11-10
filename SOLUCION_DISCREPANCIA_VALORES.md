# Solución: Discrepancia entre Serial Monitor y MQTT

## 🔍 Problema Identificado

- **Serial Monitor ESP32**: Muestra valores altos consistentes
  - I: 8.9-9.0 A
  - P: 1800-1850 W
  - S: 2024-2054 VA

- **MQTT Bridge recibe**: Muestra valores bajos consistentes
  - I: 1.4-1.6 A
  - P: 0.5-16.9 W
  - S: 344-379 VA

- **Base de datos**: Guarda los valores bajos del MQTT

## 🔎 Análisis del Código

El código del ESP32 usa las **mismas variables** (`Vrms, Irms, P, S, PF`) para:
1. Imprimir en Serial Monitor (línea 319)
2. Publicar en MQTT (línea 327)

Sin embargo, hay una diferencia de timing:
- **Serial Monitor**: Se imprime en cada loop (~cada 20ms)
- **MQTT**: Se publica cada 1 segundo (`PUB_INTERVAL_MS = 1000`)

## 💡 Posibles Causas

### Causa 1: Carga Variable (Más Probable)

El ESP32 mide continuamente, y la carga eléctrica puede cambiar entre mediciones. Si la carga se enciende/apaga rápidamente:
- El Serial Monitor captura mediciones con carga alta
- El MQTT publica mediciones con carga baja (cuando la carga está apagada)

**Solución**: Verificar si la carga está encendida cuando se publica en MQTT.

### Causa 2: Problema de Calibración

Los valores de calibración (`V_CAL_GAIN`, `I_CAL_GAIN`, `PHASE_CAL`) podrían estar aplicándose de manera diferente o haber cambiado.

**Solución**: Recalibrar el ESP32.

### Causa 3: Problema de Timing en la Medición

La función `sampleWindow()` mide durante 200ms (`WINDOW_MS = 200`). Si la carga cambia durante esa ventana, los valores pueden variar.

## 🔧 Soluciones

### Solución 1: Verificar Valores en Tiempo Real

Agrega un log en el ESP32 para ver qué valores se están publicando:

```cpp
// En mqttPublish(), antes de publicar:
Serial.printf("[MQTT] Publicando: V=%.1f I=%.3f P=%.1f S=%.1f PF=%.3f\n", 
              V, I, P, S, PF);
```

Esto te permitirá comparar los valores que se publican con los que se muestran en el Serial Monitor.

### Solución 2: Publicar Más Frecuentemente

Reduce el intervalo de publicación para capturar más mediciones:

```cpp
const unsigned long PUB_INTERVAL_MS = 200; // publica cada 200ms
```

Esto hará que el MQTT publique casi tan frecuentemente como el Serial Monitor.

### Solución 3: Promediar Múltiples Mediciones

Modifica el código para promediar varias mediciones antes de publicar:

```cpp
// Variables globales para promediar
float sum_V = 0, sum_I = 0, sum_P = 0, sum_S = 0, sum_PF = 0;
int count = 0;

// En el loop(), después de sampleWindow():
sum_V += Vrms; sum_I += Irms; sum_P += P; sum_S += S; sum_PF += PF;
count++;

// Publicar cada 5 mediciones (promedio)
if (count >= 5 && mqtt.connected()) {
  float avg_V = sum_V / count;
  float avg_I = sum_I / count;
  float avg_P = sum_P / count;
  float avg_S = sum_S / count;
  float avg_PF = sum_PF / count;
  
  mqttPublish(avg_V, avg_I, avg_P, avg_S, avg_PF);
  
  sum_V = sum_I = sum_P = sum_S = sum_PF = 0;
  count = 0;
}
```

### Solución 4: Verificar la Carga

Asegúrate de que la carga esté **encendida y estable** cuando el ESP32 publique en MQTT. Si la carga se enciende/apaga, los valores variarán.

## 🎯 Recomendación Inmediata

**Agrega el log en `mqttPublish()`** para ver qué valores se están publicando realmente:

```cpp
void mqttPublish(float V, float I, float P, float S, float PF) {
  if (!mqtt.connected()) return;

  // DEBUG: Ver qué valores se publican
  Serial.printf("[MQTT] Publicando: V=%.1f I=%.3f P=%.1f S=%.1f PF=%.3f\n", 
                V, I, P, S, PF);

  // JSON con los datos
  char json[200];
  snprintf(json, sizeof(json),
           "{\"device\":\"%s\",\"V\":%.1f,\"I\":%.3f,\"P\":%.1f,\"S\":%.1f,\"PF\":%.3f}",
           deviceId.c_str(), V, I, fabsf(P), S, fabsf(PF));
  mqtt.publish(topicState, json, false);
}
```

Luego compara:
- Los valores que muestra `[MQTT] Publicando:` en el Serial Monitor
- Los valores que muestra `RUN V=...` en el Serial Monitor
- Los valores que recibe el MQTT Bridge

Si los valores de `[MQTT] Publicando:` coinciden con los del MQTT Bridge pero no con `RUN`, entonces el problema está en el timing de las mediciones.

## 📊 Verificación

Después de agregar el log, deberías ver en el Serial Monitor algo como:

```
RUN  V=230.1 I=8.912  P=1834.3W(sig)  S=2050.2VA  PF=0.899(sig)  I_POL=1
[MQTT] Publicando: V=230.1 I=1.542 P=12.1 S=354.9 PF=0.035
```

Si ves esto, significa que entre la medición de `RUN` y la publicación en MQTT, los valores cambiaron (probablemente porque la carga se apagó).

## ✅ Próximos Pasos

1. Agrega el log en `mqttPublish()`
2. Observa el Serial Monitor y compara los valores
3. Verifica si la carga está encendida cuando se publica en MQTT
4. Si el problema persiste, implementa el promediado de mediciones

