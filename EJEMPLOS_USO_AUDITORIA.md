# Ejemplos de Uso del Sistema de Auditoría

Este documento proporciona ejemplos prácticos de cómo usar el sistema de auditoría en diferentes escenarios.

## 1. Uso Básico en Rutas API

### Ejemplo: Actualizar un usuario

```typescript
// src/app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { setupAuditContext } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Obtener usuario autenticado
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, currentUser.id);

    // Realizar la operación
    const body = await req.json();
    await query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3',
      [body.name, body.email, params.id]
    );

    // El trigger capturará automáticamente el cambio en audit_log
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
```

### Ejemplo: Crear un dispositivo

```typescript
// src/app/api/devices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { setupAuditContext } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, currentUser.id);

    const body = await req.json();
    const result = await query(
      `INSERT INTO devices (company_id, name, code, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [body.company_id, body.name, body.code, body.description, body.is_active]
    );

    // El trigger capturará automáticamente el INSERT
    return NextResponse.json({ id: result.rows[0].id });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
```

## 2. Consultas de Auditoría

### Ver historial de cambios de un usuario

```typescript
// src/app/api/audit/user/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser || currentUser.role !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const result = await query(
      `SELECT * FROM v_audit_by_user
       WHERE changed_by = $1
       ORDER BY changed_at DESC
       LIMIT 100`,
      [params.id]
    );

    return NextResponse.json({ audit_logs: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
```

### Ver cambios en un dispositivo específico

```typescript
// src/app/api/audit/device/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const result = await query(
      `SELECT * FROM audit_log
       WHERE table_name = 'devices'
         AND record_id = $1
       ORDER BY changed_at DESC`,
      [params.id]
    );

    return NextResponse.json({ audit_logs: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
```

### Ver cambios de configuraciones en un rango de fechas

```typescript
// src/app/api/audit/configurations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');

    const result = await query(
      `SELECT * FROM v_audit_configurations
       WHERE changed_at >= NOW() - INTERVAL '${days} days'
       ORDER BY changed_at DESC`,
      []
    );

    return NextResponse.json({ audit_logs: result.rows });
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
```

## 3. Operaciones Masivas (Deshabilitar Auditoría Temporalmente)

### Ejemplo: Migración masiva de datos

```typescript
import { query } from '@/lib/db';
import { disableAuditOnTable, enableAuditOnTable } from '@/lib/audit';

async function migrateUsers() {
  try {
    // Deshabilitar auditoría temporalmente
    await disableAuditOnTable('users');

    // Realizar operaciones masivas
    await query(`
      UPDATE users 
      SET company_id = 1 
      WHERE company_id IS NULL
    `);

    // Volver a habilitar auditoría
    await enableAuditOnTable('users');
  } catch (error) {
    // Asegurarse de re-habilitar auditoría incluso si hay error
    await enableAuditOnTable('users');
    throw error;
  }
}
```

## 4. Consultas SQL Directas

### Ver todos los cambios de API keys

```sql
SELECT 
    operation,
    old_values->>'api_key' as old_api_key,
    new_values->>'api_key' as new_api_key,
    u.name as changed_by_name,
    d.name as device_name,
    changed_at
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
LEFT JOIN devices d ON al.record_id = d.id
WHERE al.table_name = 'devices'
  AND (old_values->>'api_key' IS NOT NULL OR new_values->>'api_key' IS NOT NULL)
ORDER BY changed_at DESC;
```

### Ver cambios en roles de usuarios

```sql
SELECT 
    operation,
    old_values->>'role_id' as old_role_id,
    new_values->>'role_id' as new_role_id,
    r_old.name as old_role_name,
    r_new.name as new_role_name,
    u.name as user_name,
    changed_by_name,
    changed_at
FROM audit_log al
LEFT JOIN users u ON al.record_id = u.id
LEFT JOIN users u_changed ON al.changed_by = u_changed.id
LEFT JOIN roles r_old ON (old_values->>'role_id')::INTEGER = r_old.id
LEFT JOIN roles r_new ON (new_values->>'role_id')::INTEGER = r_new.id
WHERE al.table_name = 'users'
  AND (old_values->>'role_id' IS NOT NULL OR new_values->>'role_id' IS NOT NULL)
ORDER BY changed_at DESC;
```

### Ver cambios en umbrales por empresa

```sql
SELECT 
    operation,
    old_values->>'voltaje_min' as old_voltaje_min,
    new_values->>'voltaje_min' as new_voltaje_min,
    old_values->>'potencia_max' as old_potencia_max,
    new_values->>'potencia_max' as new_potencia_max,
    c.name as company_name,
    u.name as changed_by_name,
    changed_at
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
LEFT JOIN companies c ON (al.new_values->>'company_id')::INTEGER = c.id 
    OR (al.old_values->>'company_id')::INTEGER = c.id
WHERE al.table_name = 'umbrales'
ORDER BY changed_at DESC;
```

## 5. Dashboard de Auditoría (Opcional)

Puedes crear una página de administración para visualizar los registros de auditoría:

```typescript
// src/app/admin/auditoria/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

interface AuditLog {
  id: number;
  table_name: string;
  operation: string;
  record_id: number;
  changed_by_name: string;
  changed_at: string;
  old_values: any;
  new_values: any;
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetch('/api/audit/recent')
      .then(res => res.json())
      .then(data => setLogs(data.audit_logs || []));
  }, []);

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Registro de Auditoría
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Fecha</TableCell>
              <TableCell>Tabla</TableCell>
              <TableCell>Operación</TableCell>
              <TableCell>Registro ID</TableCell>
              <TableCell>Usuario</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{new Date(log.changed_at).toLocaleString()}</TableCell>
                <TableCell>{log.table_name}</TableCell>
                <TableCell>{log.operation}</TableCell>
                <TableCell>{log.record_id}</TableCell>
                <TableCell>{log.changed_by_name || 'Sistema'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
```

## Notas Importantes

1. **Siempre establecer el contexto de auditoría** antes de realizar operaciones que modifican datos auditados.

2. **No olvidar re-habilitar la auditoría** después de deshabilitarla temporalmente, incluso si ocurre un error.

3. **Los triggers funcionan automáticamente** una vez configurados, pero necesitan el contexto de usuario establecido para capturar correctamente quién hizo el cambio.

4. **Las consultas sobre JSONB** pueden ser lentas en tablas grandes. Usa los índices GIN creados y limita los resultados cuando sea posible.

5. **Considera implementar rotación de logs** para la tabla `audit_log` si el volumen crece significativamente.

