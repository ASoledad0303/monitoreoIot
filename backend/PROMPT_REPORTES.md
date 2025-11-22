# Prompt para implementar lógica de reportes con InfluxDB y PostgreSQL

## Instrucciones para Cursor AI

Necesito que busques el código del frontend de mi aplicación y modifiques la funcionalidad de generación de reportes para que implemente una lógica inteligente que seleccione automáticamente la base de datos según el rango de fechas solicitado.

### Requisitos principales:

1. **Buscar el código del frontend** que genera reportes o consulta datos históricos de energía (voltaje, corriente, potencia, etc.)

2. **Implementar lógica condicional según el rango de fechas:**
   - **Rango de 1 a 30 días**: Consultar datos desde **InfluxDB** (optimizado para consultas recientes)
   - **Rango mayor a 30 días**: Consultar datos desde **PostgreSQL** (histórico completo)

3. **Endpoint recomendado (más simple):**
   Usa el endpoint **`/metrics/history-smart`** que ya decide automáticamente qué base de datos usar:
   
   ```javascript
   // Ejemplo de uso
   async function obtenerDatosReporte(fechaInicio, fechaFin, deviceId = null) {
     const API_URL = 'http://localhost:5000'; // Ajusta según tu configuración
     
     // Convertir fechas a formato ISO 8601 o timestamp unix (ms)
     const start = fechaInicio instanceof Date 
       ? fechaInicio.toISOString() 
       : fechaInicio;
     const end = fechaFin instanceof Date 
       ? fechaFin.toISOString() 
       : fechaFin;
     
     const params = new URLSearchParams({
       start: start,
       end: end
     });
     
     if (deviceId) {
       params.append('device', deviceId);
     }
     
     const response = await fetch(`${API_URL}/metrics/history-smart?${params}`);
     if (!response.ok) {
       throw new Error(`Error: ${response.statusText}`);
     }
     
     return await response.json();
   }
   ```

4. **Formato de datos retornado:**
   Ambos endpoints retornan el mismo formato:
   ```json
   [
     {
       "ts": 1234567890,
       "device": "E2641D44",
       "vrms": 204.4,
       "irms": 0.636,
       "s_apparent_va": 130.0,
       "potencia_activa": 3.3,
       "factor_potencia": 0.026
     },
     ...
   ]
   ```

5. **Lógica alternativa (si prefieres control manual):**
   ```javascript
   function obtenerDatosReporte(fechaInicio, fechaFin, deviceId = null) {
     const dias = calcularDiasEntreFechas(fechaInicio, fechaFin);
     const API_URL = 'http://localhost:5000';
     
     if (dias >= 1 && dias <= 30) {
       // Usar InfluxDB
       const range = `-${dias}d`;
       return fetch(`${API_URL}/metrics/history?range=${range}`);
     } else if (dias > 30) {
       // Usar PostgreSQL
       const params = new URLSearchParams({
         start: fechaInicio.toISOString(),
         end: fechaFin.toISOString()
       });
       if (deviceId) params.append('device', deviceId);
       return fetch(`${API_URL}/metrics/history-postgres?${params}`);
     } else {
       throw new Error('El rango mínimo es de 1 día');
     }
   }
   
   function calcularDiasEntreFechas(fechaInicio, fechaFin) {
     const diffTime = Math.abs(fechaFin - fechaInicio);
     return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
   }
   ```

6. **Consideraciones importantes:**
   - Mantener la misma interfaz de usuario (UI) para ambos casos
   - Manejar errores si alguna base de datos no está disponible
   - Mostrar indicador de carga mientras se obtienen los datos
   - Los datos ya vienen normalizados en el mismo formato desde ambos endpoints
   - Validar que el rango de fechas sea válido (mínimo 1 día)

### Archivos a buscar/modificar:

- Componentes de React/Vue/Angular que generen reportes
- Servicios o funciones que consulten datos históricos
- Cualquier archivo que tenga funciones como:
  - `getReport()`
  - `fetchHistory()`
  - `getMetrics()`
  - `obtenerDatos()`
  - `generarReporte()`
  - Componentes de gráficos/charts que muestren datos históricos

### Endpoints disponibles en la API Flask:

Ya están implementados en `api/app.py`:

1. **`GET /metrics/history-smart?start=...&end=...&device=...`** ⭐ **RECOMENDADO**
   - Endpoint inteligente que decide automáticamente entre InfluxDB (1-30 días) y PostgreSQL (>30 días)
   - **Parámetros:**
     - `start`: fecha inicio (ISO 8601: `2024-01-01T00:00:00Z` o timestamp unix en ms: `1704067200000`)
     - `end`: fecha fin (mismo formato)
     - `device`: (opcional) ID del dispositivo, ej: `E2641D44`
   - **Ejemplo:**
     ```
     GET /metrics/history-smart?start=2024-01-01T00:00:00Z&end=2024-01-15T00:00:00Z&device=E2641D44
     ```

2. **`GET /metrics/history?range=-15m`** (Solo InfluxDB)
   - Para rangos de 1 a 30 días
   - **Parámetros:** `range` (ej: `-1d`, `-7d`, `-30d`)

3. **`GET /metrics/history-postgres?start=...&end=...&device=...`** (Solo PostgreSQL)
   - Para rangos mayores a 30 días
   - **Parámetros:** `start`, `end`, `device` (opcional)

### Ejemplo completo de implementación:

```javascript
// Servicio para obtener datos históricos
class MetricsService {
  constructor(apiUrl = 'http://localhost:5000') {
    this.apiUrl = apiUrl;
  }

  async getHistoryReport(startDate, endDate, deviceId = null) {
    try {
      // Validar fechas
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      
      if (days < 1) {
        throw new Error('El rango mínimo es de 1 día');
      }
      
      // Construir URL
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString()
      });
      
      if (deviceId) {
        params.append('device', deviceId);
      }
      
      // Usar endpoint inteligente
      const response = await fetch(`${this.apiUrl}/metrics/history-smart?${params}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al obtener datos');
      }
      
      const data = await response.json();
      
      // Los datos ya vienen en el formato correcto
      return data.map(item => ({
        timestamp: item.ts,
        device: item.device,
        voltage: item.vrms,
        current: item.irms,
        apparentPower: item.s_apparent_va,
        activePower: item.potencia_activa,
        powerFactor: item.factor_potencia
      }));
      
    } catch (error) {
      console.error('Error obteniendo datos históricos:', error);
      throw error;
    }
  }
}

// Uso en componente
const metricsService = new MetricsService();
const datos = await metricsService.getHistoryReport(
  new Date('2024-01-01'),
  new Date('2024-01-31'),
  'E2641D44'
);
```

---

**Por favor, busca el código del frontend y modifica la funcionalidad de reportes para usar el endpoint `/metrics/history-smart` que ya implementa la lógica inteligente de selección de base de datos.**

