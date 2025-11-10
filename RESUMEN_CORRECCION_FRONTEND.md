# Resumen: Corrección de Sincronización Frontend-Backend

## 🔧 Cambios Realizados

### 1. Corrección del Cálculo de Potencia Aparente (S)

**Problema**: El cálculo de `S (potencia aparente)` estaba incorrecto:
- ❌ Antes: `potencia / (voltaje || 1) * (corriente || 0)` 
- ✅ Ahora: `voltaje * corriente` (S = V × I)

**Archivos modificados**:
- `src/app/page.tsx` (líneas 62-65, 261)

### 2. Guardado de Historial Completo en Base de Datos

**Problema**: El endpoint `/api/iot/telemetry` solo guardaba un registro por día debido a la restricción `UNIQUE(user_id, fecha)`.

**Solución**: 
- Modificado para insertar siempre un nuevo registro (sin `ON CONFLICT`)
- Esto permite tener un historial completo de todas las mediciones

**Archivos modificados**:
- `src/app/api/iot/telemetry/route.ts` (líneas 92-108)

### 3. Mejora en la Carga de Datos Históricos

**Problema**: El frontend solo cargaba datos del día actual y los ordenaba incorrectamente.

**Solución**:
- Carga datos de las últimas 24 horas
- Ordena por `created_at DESC` para obtener los más recientes primero
- Actualiza cada 2 segundos para mostrar datos en tiempo real

**Archivos modificados**:
- `src/app/page.tsx` (líneas 145-173)
- `src/app/api/telemetry/route.ts` (línea 94)

### 4. Migración para Eliminar Restricción UNIQUE

**Problema**: La tabla `telemetry_history` tiene una restricción `UNIQUE(user_id, fecha)` que impide múltiples registros por día.

**Solución**: 
- Creado script de migración para eliminar la restricción
- Permite insertar múltiples registros por día

**Archivos creados**:
- `scripts/migrate-remove-telemetry-unique.js`

## 🚀 Pasos para Aplicar los Cambios

### Paso 1: Ejecutar Migración (IMPORTANTE)

```bash
npm run migrate:remove-telemetry-unique
```

Esto eliminará la restricción `UNIQUE(user_id, fecha)` de la tabla `telemetry_history` para permitir múltiples registros por día.

### Paso 2: Reiniciar el Backend

```bash
npm run dev
```

### Paso 3: Verificar que el Bridge MQTT esté Corriendo

En una terminal separada:

```bash
npm run mqtt-bridge
```

### Paso 4: Verificar en el Frontend

1. Abre `http://localhost:3000`
2. Selecciona el dispositivo "Dispositivo Principal"
3. Deberías ver:
   - ✅ Valores de V, I, P actualizándose cada 2 segundos
   - ✅ S (potencia aparente) calculado correctamente (V × I)
   - ✅ Gráficos mostrando datos históricos
   - ✅ "Última actualización" mostrando el timestamp correcto

## 📊 Verificación

### Verificar que los Datos se Estén Guardando

```bash
npm run check-telemetry
```

Deberías ver múltiples registros con timestamps diferentes, no solo uno por día.

### Verificar en el Frontend

1. **Valores en tiempo real**: Deberían actualizarse cada 2 segundos
2. **Cálculo de S**: Debería ser `V × I` (ej: 230.5 V × 1.570 A = 361.69 VA)
3. **Gráficos**: Deberían mostrar datos históricos de las últimas 24 horas
4. **Última actualización**: Debería mostrar el timestamp más reciente

## 🔍 Troubleshooting

### Si los datos no se actualizan en el frontend:

1. **Verifica que el bridge MQTT esté corriendo**:
   ```bash
   npm run mqtt-bridge
   ```

2. **Verifica que el backend esté corriendo**:
   ```bash
   npm run dev
   ```

3. **Verifica la consola del navegador** (F12):
   - Busca errores en la pestaña "Console"
   - Verifica requests en la pestaña "Network"

### Si S (potencia aparente) muestra 0.00 VA:

1. Verifica que tanto `voltaje` como `corriente` tengan valores
2. Verifica en la consola del navegador si hay errores de cálculo
3. Verifica que los datos en la BD tengan valores para `voltaje` y `corriente`

### Si no se guardan múltiples registros:

1. **Ejecuta la migración**:
   ```bash
   npm run migrate:remove-telemetry-unique
   ```

2. **Verifica que la restricción se haya eliminado**:
   ```sql
   SELECT constraint_name 
   FROM information_schema.table_constraints 
   WHERE table_name = 'telemetry_history' 
   AND constraint_type = 'UNIQUE';
   ```
   No debería haber restricciones UNIQUE relacionadas con `user_id` y `fecha`.

## ✅ Checklist

- [ ] Migración ejecutada (`npm run migrate:remove-telemetry-unique`)
- [ ] Backend reiniciado (`npm run dev`)
- [ ] Bridge MQTT corriendo (`npm run mqtt-bridge`)
- [ ] Frontend mostrando valores actualizados
- [ ] S (potencia aparente) calculado correctamente (V × I)
- [ ] Gráficos mostrando datos históricos
- [ ] Múltiples registros guardados en la BD

## 📝 Notas Importantes

1. **La migración es necesaria**: Sin ejecutarla, solo se guardará un registro por día
2. **El bridge MQTT debe estar corriendo**: Es el que recibe los datos del ESP32 y los envía al backend
3. **El frontend actualiza cada 2 segundos**: Los datos se cargan automáticamente desde la BD
4. **El cálculo de S es ahora correcto**: S = V × I (potencia aparente)

