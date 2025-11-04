# Configuración de Roles y Company

Este documento explica cómo están configurados los roles y la funcionalidad de company en el sistema.

## Roles

Los roles están centralizados en `src/lib/config.ts` para facilitar su mantenimiento y extensión.

### Roles Disponibles

- **`user`**: Usuario regular del sistema
- **`admin`**: Administrador con permisos completos

### Cómo Funciona el Sistema de Roles

**Al crear una cuenta nueva:**
- Por defecto, todas las cuentas nuevas se crean con rol `user`.
- **EXCEPCIÓN**: Si no existe ningún administrador en el sistema, el primer usuario que se registre será automáticamente `admin`. Esto garantiza que siempre haya al menos un administrador.

**Para convertir un usuario en admin:**
1. Usa el script proporcionado:
   ```bash
   npm run make-admin <email>
   ```
2. O desde la interfaz web (si ya eres admin):
   - Ve a `/admin/usuarios`
   - Haz clic en el ícono de editar junto al usuario
   - Cambia el rol a "Administrador"

### Ubicación de la Configuración

```typescript
// src/lib/config.ts
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;
```

### Uso en el Código

```typescript
import { ROLES, UserRole } from '@/lib/config';
import { hasRole, isAdmin } from '@/lib/auth';

// Verificar rol
if (hasRole(token, ROLES.ADMIN)) {
  // Usuario es admin
}

// Verificar si es admin
if (isAdmin(token)) {
  // Usuario es admin
}
```

### Agregar Nuevos Roles

1. Agregar el nuevo rol en `src/lib/config.ts`:
   ```typescript
   export const ROLES = {
     USER: 'user',
     ADMIN: 'admin',
     MANAGER: 'manager', // Nuevo rol
   } as const;
   ```

2. Actualizar la base de datos para permitir el nuevo rol:
   ```sql
   ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);
   ```

3. Actualizar los tipos TypeScript donde sea necesario.

---

## Company (Multi-Tenancy)

La funcionalidad de company permite tener múltiples empresas/organizaciones en el mismo sistema.

### Habilitar Company

Para habilitar la funcionalidad de company, agrega en tu `.env.local`:

```env
COMPANY_ENABLED=true
```

### Estructura de la Base de Datos

#### Tabla `companies`

```sql
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  email VARCHAR(160),
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### Relación con `users`

La tabla `users` tiene un campo opcional `company_id`:

```sql
ALTER TABLE users 
ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
```

#### Relación con `umbrales`

Los umbrales también pueden estar asociados a una company:

```sql
ALTER TABLE umbrales 
ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
```

### Migración

Para agregar el soporte de company a una base de datos existente:

```bash
npm run migrate:company
```

O si quieres que se cree automáticamente al inicializar la base de datos, asegúrate de tener `COMPANY_ENABLED=true` en `.env.local` y ejecuta:

```bash
npm run init:db
```

### Configuración

La configuración de company está en `src/lib/config.ts`:

```typescript
export const COMPANY_CONFIG = {
  ENABLED: process.env.COMPANY_ENABLED === 'true',
  TABLE_NAME: 'companies',
  USER_FOREIGN_KEY: 'company_id',
} as const;
```

### Uso en el Código

```typescript
import { COMPANY_CONFIG } from '@/lib/config';

if (COMPANY_CONFIG.ENABLED) {
  // Lógica específica para multi-tenant
  // Filtrar datos por company_id
}
```

### Notas

- Si `COMPANY_ENABLED=false` o no está configurado, la funcionalidad de company estará deshabilitada.
- Los usuarios pueden existir sin company (company_id puede ser NULL).
- Al eliminar una company, los usuarios asociados no se eliminan (SET NULL), pero los umbrales sí (CASCADE).

---

## Resumen de Archivos

- **Configuración**: `src/lib/config.ts`
- **Autenticación/Roles**: `src/lib/auth.ts`
- **Migración Company**: `scripts/migrate-add-company.js`
- **Inicialización DB**: `scripts/init-db.js`

