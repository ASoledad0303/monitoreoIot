# ¿Cómo Funciona el Sistema de Auditoría?

## 🔄 Flujo Completo del Sistema

### 1. **Instalación (Una sola vez)**

Cuando ejecutas `npm run migrate:audit`, el sistema:

```
1. Crea la tabla audit_log
   └─> Almacena todos los cambios

2. Crea la función audit_trigger_function()
   └─> Función que captura los cambios

3. Crea triggers en las tablas críticas
   └─> roles, users, companies, devices, umbrales
   └─> Cada trigger "escucha" cambios en su tabla

4. Crea índices para consultas rápidas
   └─> Permite buscar cambios eficientemente

5. Crea vistas útiles
   └─> v_audit_by_user, v_audit_by_device, etc.
```

---

## 📊 Flujo de una Operación Auditada

### Ejemplo: Actualizar un usuario

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario hace clic en "Guardar" en la interfaz web       │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Frontend envía petición PUT a /api/users/123            │
│    Body: { name: "Juan Pérez", email: "juan@example.com" } │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Backend (Next.js) recibe la petición                    │
│    - Verifica autenticación                                │
│    - Obtiene el usuario actual (ej: ID = 5)                │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Establece contexto de auditoría                         │
│    await setupAuditContext(req, currentUser.id)            │
│    └─> Ejecuta: SELECT set_audit_user(5)                   │
│    └─> Guarda en sesión PostgreSQL: app.user_id = 5        │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Ejecuta la operación SQL                                │
│    UPDATE users SET name = 'Juan Pérez' WHERE id = 123     │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. PostgreSQL detecta el UPDATE                            │
│    └─> El trigger audit_users_trigger se activa            │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. La función audit_trigger_function() se ejecuta          │
│    └─> Captura OLD (valores antiguos)                      │
│    └─> Captura NEW (valores nuevos)                        │
│    └─> Lee app.user_id de la sesión (5)                    │
│    └─> Lee IP y User Agent si están disponibles            │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Inserta registro en audit_log                           │
│    INSERT INTO audit_log (                                  │
│      table_name: 'users',                                   │
│      operation: 'UPDATE',                                   │
│      record_id: 123,                                        │
│      old_values: { name: 'Juan', email: 'juan@old.com' },  │
│      new_values: { name: 'Juan Pérez', email: 'juan@...' },│
│      changed_by: 5,                                         │
│      changed_at: '2025-11-10 15:30:00'                     │
│    )                                                        │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. La operación UPDATE se completa normalmente             │
│    └─> El usuario ve "Cambios guardados"                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Componentes del Sistema

### A. **Triggers (Disparadores)**

Los triggers son como "oídos" que escuchan cambios en las tablas:

```sql
-- Cuando se crea este trigger:
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Significa:
-- "Cada vez que haya un INSERT, UPDATE o DELETE en la tabla 'users',
--  ejecuta automáticamente la función audit_trigger_function()"
```

**¿Cuándo se ejecutan?**
- `AFTER INSERT`: Después de insertar un registro
- `AFTER UPDATE`: Después de actualizar un registro
- `AFTER DELETE`: Después de eliminar un registro

### B. **Función de Auditoría**

La función `audit_trigger_function()` es el "cerebro" que:

1. **Detecta el tipo de operación**:
   ```sql
   IF TG_OP = 'INSERT' THEN
       -- Captura solo NEW (valores nuevos)
   ELSIF TG_OP = 'UPDATE' THEN
       -- Captura OLD y NEW (valores antiguos y nuevos)
   ELSIF TG_OP = 'DELETE' THEN
       -- Captura solo OLD (valores antiguos)
   END IF;
   ```

2. **Convierte a JSON**:
   ```sql
   v_old_data := to_jsonb(OLD);  -- Convierte registro antiguo a JSON
   v_new_data := to_jsonb(NEW);  -- Convierte registro nuevo a JSON
   ```

3. **Obtiene el usuario**:
   ```sql
   -- Lee de la sesión PostgreSQL
   v_user_id := current_setting('app.user_id', true)::INTEGER;
   ```

4. **Guarda en audit_log**:
   ```sql
   INSERT INTO audit_log (...)
   ```

### C. **Variables de Sesión**

PostgreSQL permite guardar valores temporales en la sesión actual:

```sql
-- La aplicación establece:
SELECT set_audit_user(5);
-- Internamente ejecuta:
SET LOCAL app.user_id = '5';

-- El trigger lee:
SELECT current_setting('app.user_id', true);
-- Retorna: '5'
```

**Importante**: Estas variables solo existen durante la conexión actual. Cuando la conexión se cierra, se pierden.

---

## 💡 Ejemplo Práctico Completo

### Escenario: Cambiar el nombre de un dispositivo

**Código en la API** (`src/app/api/devices/[id]/route.ts`):

```typescript
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  // 1. Autenticar usuario
  const currentUser = await getCurrentUser(req);
  // currentUser.id = 10 (ejemplo)

  // 2. Establecer contexto de auditoría
  await setupAuditContext(req, currentUser.id);
  // Esto ejecuta internamente:
  // - SELECT set_audit_user(10)
  // - SELECT set_audit_metadata('192.168.1.100', 'Mozilla/5.0...')

  // 3. Obtener datos del body
  const body = await req.json();
  // body = { name: "Dispositivo Principal Actualizado" }

  // 4. Realizar el UPDATE
  await query(
    'UPDATE devices SET name = $1 WHERE id = $2',
    [body.name, params.id]
  );
  // Esto activa automáticamente el trigger audit_devices_trigger

  return NextResponse.json({ success: true });
}
```

**Lo que sucede en PostgreSQL**:

```sql
-- 1. Se ejecuta el UPDATE
UPDATE devices SET name = 'Dispositivo Principal Actualizado' WHERE id = 1;

-- 2. PostgreSQL detecta el cambio y activa el trigger
--    (automáticamente, sin código adicional)

-- 3. El trigger ejecuta audit_trigger_function()
--    - OLD = { id: 1, name: 'Dispositivo Principal', code: 'PRINCIPAL', ... }
--    - NEW = { id: 1, name: 'Dispositivo Principal Actualizado', code: 'PRINCIPAL', ... }
--    - Lee app.user_id = 10 (de la sesión)
--    - Lee app.ip_address = '192.168.1.100' (de la sesión)

-- 4. Inserta en audit_log
INSERT INTO audit_log (
  table_name: 'devices',
  operation: 'UPDATE',
  record_id: 1,
  old_values: '{"id":1,"name":"Dispositivo Principal","code":"PRINCIPAL",...}',
  new_values: '{"id":1,"name":"Dispositivo Principal Actualizado","code":"PRINCIPAL",...}',
  changed_by: 10,
  changed_at: '2025-11-10 15:30:00',
  ip_address: '192.168.1.100'
);
```

**Resultado**: Ahora puedes consultar quién cambió el nombre del dispositivo:

```sql
SELECT 
    operation,
    old_values->>'name' as nombre_anterior,
    new_values->>'name' as nombre_nuevo,
    u.name as cambiado_por,
    changed_at
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
WHERE table_name = 'devices' AND record_id = 1
ORDER BY changed_at DESC;
```

---

## 🎯 Puntos Clave

### ✅ **Automático**
- No necesitas modificar cada operación SQL
- Los triggers se ejecutan automáticamente
- Solo necesitas establecer el contexto de usuario

### ✅ **Completo**
- Captura valores antes y después
- Registra quién, cuándo, qué cambió
- Incluye metadatos (IP, user agent)

### ✅ **Eficiente**
- Los triggers son rápidos
- Índices optimizados para consultas
- No audita tablas de alto volumen

### ✅ **Transparente**
- No afecta la lógica de negocio
- Las operaciones funcionan igual
- Solo agrega registro de auditoría

---

## 🔧 Configuración Necesaria

### En cada ruta API que modifica datos auditados:

```typescript
// 1. Importar
import { setupAuditContext } from '@/lib/audit';

// 2. Establecer contexto ANTES de la operación
await setupAuditContext(req, currentUser.id);

// 3. Realizar operación normalmente
await query('UPDATE ...');
```

**Eso es todo**. El trigger hace el resto automáticamente.

---

## 📊 Consultar Registros

### Ver todos los cambios de un usuario:
```sql
SELECT * FROM v_audit_by_user 
WHERE user_name = 'Juan Pérez';
```

### Ver cambios en un dispositivo:
```sql
SELECT * FROM v_audit_by_device 
WHERE device_code = 'PRINCIPAL';
```

### Ver cambios recientes:
```sql
SELECT * FROM audit_log 
WHERE changed_at >= NOW() - INTERVAL '24 hours'
ORDER BY changed_at DESC;
```

---

## ⚠️ Casos Especiales

### Operaciones masivas (sin auditar)

Si necesitas hacer cambios masivos sin generar auditoría:

```typescript
// Deshabilitar temporalmente
await disableAuditOnTable('users');

// Hacer cambios masivos
await query('UPDATE users SET company_id = 1 WHERE company_id IS NULL');

// Volver a habilitar
await enableAuditOnTable('users');
```

### Cambios desde scripts (sin usuario)

Si un script hace cambios sin un usuario autenticado:

```typescript
// Establecer usuario del sistema
await setAuditUser(1); // ID del usuario "sistema" o "admin"

// O dejar NULL (se registrará como NULL)
```

---

## 🎓 Resumen Visual

```
┌──────────────┐
│   Usuario    │
│  (Frontend)  │
└──────┬───────┘
       │
       │ 1. Petición HTTP
       ▼
┌─────────────────────┐
│   API Next.js       │
│  - Autentica        │
│  - Establece        │
│    contexto audit   │
└──────┬──────────────┘
       │
       │ 2. SQL UPDATE
       ▼
┌─────────────────────┐
│   PostgreSQL        │
│  - Ejecuta UPDATE   │
│  - Trigger activa   │
│  - Función captura  │
│  - Guarda en log    │
└──────┬──────────────┘
       │
       │ 3. Registro
       ▼
┌─────────────────────┐
│   audit_log         │
│  - Quién            │
│  - Cuándo           │
│  - Qué cambió       │
│  - Valores old/new  │
└─────────────────────┘
```

¡Eso es todo! El sistema funciona automáticamente una vez instalado. 🚀

