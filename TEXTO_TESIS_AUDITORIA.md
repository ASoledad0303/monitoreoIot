# Auditoría del Sistema en la Base de Datos PostgreSQL

## Texto para el Apartado de Auditoría en la Tesis

---

### 3.1. Importancia de la Auditoría en Sistemas IoT de Monitoreo Energético

La auditoría de bases de datos constituye un componente fundamental en sistemas IoT de monitoreo energético, especialmente cuando estos son implementados en el contexto de pequeñas empresas. La naturaleza crítica de los datos de consumo energético, la necesidad de garantizar la integridad de la información y el cumplimiento de normativas de seguridad hacen que un sistema de auditoría robusto sea esencial para la confiabilidad y trazabilidad del sistema.

En un sistema de monitoreo energético, la auditoría permite rastrear quién realizó modificaciones sobre configuraciones críticas del sistema, como los umbrales de alertas, los parámetros de dispositivos IoT, o la información de usuarios y empresas. Esta capacidad de trazabilidad es particularmente relevante cuando se trata de datos que pueden tener implicaciones legales, financieras o de seguridad. Por ejemplo, cambios no autorizados en los umbrales de potencia máxima podrían ocultar consumos anómalos, mientras que modificaciones en las API keys de dispositivos IoT podrían comprometer la seguridad del sistema.

La implementación de un módulo de auditoría en PostgreSQL se integra de manera transparente con el sistema general propuesto, utilizando triggers y funciones almacenadas que capturan automáticamente todas las operaciones de modificación (INSERT, UPDATE, DELETE) sobre las tablas críticas, sin requerir cambios significativos en la lógica de la aplicación. Esta integración garantiza que la auditoría sea completa, automática y no dependa de la correcta implementación en cada punto del código de la aplicación.

---

### 3.2. Diseño e Implementación del Sistema de Auditoría

#### 3.2.1. Diseño de la Tabla de Auditoría

El sistema de auditoría se basa en una tabla central denominada `audit_log`, diseñada para almacenar de manera genérica todos los cambios realizados sobre las tablas críticas del sistema. Esta tabla incluye los siguientes campos principales:

- **Identificación de la operación**: `schema_name`, `table_name`, `operation` (INSERT, UPDATE, DELETE)
- **Identificación del registro**: `record_id` (clave primaria del registro afectado) y `record_key` (para claves compuestas, almacenado como JSON)
- **Valores antes y después**: `old_values` y `new_values`, almacenados como JSONB para permitir consultas eficientes y flexibilidad en el esquema
- **Información del usuario**: `changed_by` (referencia al usuario del sistema) y `changed_by_db_user` (usuario de la base de datos)
- **Metadatos adicionales**: `ip_address`, `user_agent`, `changed_at` (timestamp con zona horaria), y `comment` (comentario opcional)

El uso de JSONB para almacenar los valores antiguos y nuevos permite capturar la estructura completa de los registros sin necesidad de modificar el esquema de auditoría cuando cambian las tablas auditadas, además de facilitar consultas complejas mediante índices GIN (Generalized Inverted Index) de PostgreSQL.

#### 3.2.2. Mecanismo de Captura mediante Triggers

La captura de cambios se realiza mediante triggers de PostgreSQL que se ejecutan automáticamente después de cada operación INSERT, UPDATE o DELETE sobre las tablas auditadas. Estos triggers invocan una función genérica `audit_trigger_function()` escrita en PL/pgSQL, que:

1. Determina el tipo de operación (INSERT, UPDATE, DELETE)
2. Serializa los valores antiguos y nuevos a formato JSONB
3. Obtiene el identificador del usuario que realizó el cambio desde variables de sesión establecidas por la aplicación
4. Registra toda la información en la tabla `audit_log`

Este enfoque garantiza que todos los cambios sean capturados automáticamente, sin posibilidad de omisión por error en el código de la aplicación, y con un impacto mínimo en el rendimiento gracias a la eficiencia de los triggers en PostgreSQL.

#### 3.2.3. Tablas Auditadas y Criterios de Selección

El sistema audita las siguientes tablas, seleccionadas por su criticidad y relevancia para la seguridad e integridad del sistema:

- **`roles`**: Cambios en los roles del sistema, fundamentales para el control de acceso
- **`users`**: Modificaciones en usuarios, incluyendo cambios de roles, contraseñas y asignaciones a empresas
- **`companies`**: Alteraciones en la información de empresas, críticas para el multi-tenancy del sistema
- **`devices`**: Cambios en dispositivos IoT, incluyendo API keys y configuraciones, esenciales para la seguridad
- **`umbrales`**: Modificaciones en los umbrales de alertas, que afectan directamente la detección de anomalías

Por el contrario, **no se auditan** tablas de alto volumen como `telemetry_history`, que almacena miles de registros diarios de mediciones IoT. Auditar cada inserción de telemetría generaría un volumen excesivo de registros de auditoría, degradando el rendimiento del sistema sin aportar valor significativo en términos de seguridad o trazabilidad. En su lugar, se auditan únicamente cambios estructurales o de configuración que afecten cómo se procesan o almacenan estos datos.

#### 3.2.4. Consideraciones de Rendimiento

Para garantizar que el sistema de auditoría no degrade el rendimiento del sistema, se implementaron las siguientes optimizaciones:

- **Índices estratégicos**: Se crearon índices sobre `table_name`, `operation`, `changed_at`, `changed_by` y `record_id` para acelerar las consultas más comunes
- **Índices GIN sobre JSONB**: Permiten búsquedas eficientes dentro de los valores almacenados en formato JSON
- **Triggers eficientes**: La función de auditoría está optimizada para minimizar el tiempo de ejecución
- **Exclusión de tablas de alto volumen**: Como se mencionó, se evita auditar tablas con miles de inserciones diarias

Adicionalmente, el sistema incluye funciones para habilitar o deshabilitar temporalmente la auditoría en tablas específicas, permitiendo realizar operaciones masivas de mantenimiento sin generar registros de auditoría innecesarios.

---

### 3.3. Conclusión del Apartado de Auditoría

La implementación del sistema de auditoría en PostgreSQL cumple con las mejores prácticas de seguridad y trazabilidad de datos, respondiendo directamente a la observación del tribunal sobre la necesidad de un módulo de auditoría en el sistema. El diseño genérico basado en triggers y JSONB permite una implementación flexible y escalable, mientras que la selección cuidadosa de las tablas auditadas garantiza un equilibrio óptimo entre seguridad y rendimiento.

El sistema proporciona una trazabilidad completa de todos los cambios críticos en el sistema, permitiendo a los administradores rastrear quién realizó qué modificaciones y cuándo, información esencial para la seguridad, el cumplimiento normativo y la resolución de problemas en un sistema IoT de monitoreo energético utilizado por pequeñas empresas.

---

## Ejemplos de Consultas de Auditoría

### Consultar el historial de cambios de un usuario específico

```sql
SELECT 
    table_name,
    operation,
    record_id,
    old_values,
    new_values,
    changed_at
FROM v_audit_by_user
WHERE user_name = 'Juan Pérez'
ORDER BY changed_at DESC;
```

### Consultar el historial de cambios de un dispositivo IoT

```sql
SELECT 
    operation,
    old_values,
    new_values,
    changed_by_name,
    device_name,
    device_code,
    changed_at
FROM v_audit_by_device
WHERE device_code = 'PRINCIPAL'
ORDER BY changed_at DESC;
```

### Consultar cambios de configuraciones en un rango de fechas

```sql
SELECT 
    operation,
    old_values,
    new_values,
    changed_by_name,
    company_name,
    changed_at
FROM v_audit_configurations
WHERE changed_at >= NOW() - INTERVAL '7 days'
ORDER BY changed_at DESC;
```

### Ver todos los cambios realizados por un usuario en las últimas 24 horas

```sql
SELECT 
    table_name,
    operation,
    record_id,
    changed_at
FROM audit_log
WHERE changed_by = 123  -- ID del usuario
  AND changed_at >= NOW() - INTERVAL '24 hours'
ORDER BY changed_at DESC;
```

### Ver cambios específicos en API keys de dispositivos

```sql
SELECT 
    operation,
    old_values->>'api_key' as old_api_key,
    new_values->>'api_key' as new_api_key,
    changed_by,
    changed_at
FROM audit_log
WHERE table_name = 'devices'
  AND (old_values->>'api_key' IS NOT NULL OR new_values->>'api_key' IS NOT NULL)
ORDER BY changed_at DESC;
```

---

## Integración con la Aplicación Next.js

Para que la auditoría capture correctamente el usuario que realiza los cambios, es necesario establecer el `user_id` en la sesión de PostgreSQL antes de realizar operaciones. Esto se puede hacer mediante una función helper en el código de la aplicación.

### Ejemplo de integración (TypeScript/Next.js)

```typescript
import { query } from '@/lib/db';

async function updateUser(userId: number, updates: any, currentUserId: number) {
  // Establecer el usuario de auditoría en la sesión
  await query('SELECT set_audit_user($1)', [currentUserId]);
  
  // (Opcional) Establecer metadatos adicionales
  await query('SELECT set_audit_metadata($1, $2)', [
    request.ip,  // IP address
    request.headers.get('user-agent')  // User agent
  ]);
  
  // Realizar la operación normalmente
  await query(
    'UPDATE users SET name = $1 WHERE id = $2',
    [updates.name, userId]
  );
  
  // El trigger capturará automáticamente el cambio
}
```

---

## Habilitar/Deshabilitar Auditoría Temporalmente

### Deshabilitar auditoría en una tabla

```sql
SELECT toggle_audit_on_table('users', false);
```

### Volver a habilitar

```sql
SELECT toggle_audit_on_table('users', true);
```

---

## Instalación

Para instalar el sistema de auditoría, ejecutar:

```bash
npm run migrate:audit
```

Este comando ejecutará el script SQL completo que crea la tabla `audit_log`, las funciones, los triggers y las vistas necesarias.

