# Análisis Completo de Flujos y Base de Datos

## ✅ Flujo "Olvidé mi Contraseña" - COMPLETO

### Pasos del flujo:
1. **Usuario accede a `/forgot-password`**
   - Página: `src/app/(auth)/forgot-password/page.tsx`
   - Ingresa su email

2. **Solicitud de código**
   - API: `POST /api/auth/forgot-password`
   - Genera código de 6 caracteres
   - Guarda en `user_tokens` con tipo `'reset'`
   - Expiración: 15 minutos
   - Envía email con código

3. **Usuario recibe email y accede a reset**
   - Redirección automática a `/reset-password?email=...`
   - Página: `src/app/(auth)/reset-password/page.tsx`

4. **Usuario ingresa código y nueva contraseña**
   - API: `POST /api/auth/reset-password`
   - Valida código (no usado, no expirado)
   - Actualiza contraseña (hash bcrypt)
   - Marca token como usado
   - Redirección a login

### Seguridad implementada:
- ✅ Código expira en 15 minutos
- ✅ Código de un solo uso (marcado como usado)
- ✅ No revela si el email existe
- ✅ Validación de código antes de cambiar contraseña
- ✅ Email profesional enviado

---

## 📊 Estructura de Base de Datos

### Tabla: `users`
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  role VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Campos:**
- `id`: Identificador único
- `name`: Nombre del usuario (máx 80 caracteres)
- `email`: Email único (máx 160 caracteres)
- `password_hash`: Hash bcrypt de la contraseña
- `email_verified`: Estado de verificación de email
- `role`: Rol del usuario (`'user'` por defecto, `'admin'` para administradores)
- `created_at`: Fecha de creación

### Tabla: `user_tokens`
```sql
CREATE TABLE user_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,  -- 'verify' | 'reset' | '2fa'
  code VARCHAR(12) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Tipos de tokens:**
- `'verify'`: Verificación de email (15 min)
- `'reset'`: Restablecimiento de contraseña (15 min)
- `'2fa'`: Autenticación de dos factores (10 min)

**Campos:**
- `id`: Identificador único
- `user_id`: Referencia al usuario (CASCADE delete)
- `type`: Tipo de token
- `code`: Código de verificación (máx 12 caracteres)
- `expires_at`: Fecha de expiración
- `used`: Si el token ya fue usado
- `created_at`: Fecha de creación

---

## 🔄 Flujos Completos del Sistema

### 1. Registro de Usuario
- ✅ Página: `/register`
- ✅ API: `POST /api/auth/register`
- ✅ Valida email único
- ✅ Hashea contraseña
- ✅ Crea usuario con `role='user'` por defecto
- ✅ **FALTA**: Envío automático de código de verificación

### 2. Verificación de Email
- ✅ Página: `/verify-email`
- ✅ API: `POST /api/auth/send-verification-code`
- ✅ API: `POST /api/auth/verify-email`
- ✅ Genera código tipo `'verify'`
- ✅ Expira en 15 minutos
- ✅ Marca email como verificado

### 3. Login
- ✅ Página: `/login`
- ✅ API: `POST /api/auth/login`
- ✅ Valida credenciales
- ✅ Verifica email verificado
- ✅ Genera código 2FA (tipo `'2fa'`)
- ✅ Envía código por email
- ✅ Expira en 10 minutos

### 4. Verificación 2FA
- ✅ Página: `/login` (segundo paso)
- ✅ API: `POST /api/auth/verify-2fa`
- ✅ Valida código 2FA
- ✅ Incluye `role` en JWT
- ✅ Crea cookie de sesión

### 5. Olvidé mi Contraseña
- ✅ Página: `/forgot-password`
- ✅ API: `POST /api/auth/forgot-password`
- ✅ Genera código tipo `'reset'`
- ✅ Envía email
- ✅ Expira en 15 minutos

### 6. Restablecer Contraseña
- ✅ Página: `/reset-password`
- ✅ API: `POST /api/auth/reset-password`
- ✅ Valida código
- ✅ Actualiza contraseña
- ✅ Marca token como usado

### 7. Logout
- ✅ API: `POST /api/auth/logout`
- ✅ Elimina cookie de sesión

---

## 📋 Funcionalidades con Mock Data (sin tablas)

Las siguientes funcionalidades usan datos mock y NO tienen tablas en la base de datos:

### 1. Alertas (`/alertas`)
- **Estado**: ✅ Tabla creada, usando `mockAlertas` temporalmente
- **Tabla**: `alerts` ✅ CREADA
  ```sql
  CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    tipo VARCHAR(50) NOT NULL,  -- 'Alta tensión' | 'Baja tensión' | 'Alto consumo'
    mensaje TEXT NOT NULL,
    valor VARCHAR(50),
    dispositivo VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```
- **Índices**: `idx_alerts_user_fecha`, `idx_alerts_fecha`

### 2. Reportes (`/reportes`)
- **Estado**: ✅ Tabla creada, usando `mockData` temporalmente
- **Tabla**: `telemetry_history` ✅ CREADA
  ```sql
  CREATE TABLE telemetry_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    voltaje DECIMAL(10,2),
    corriente DECIMAL(10,2),
    potencia DECIMAL(10,2),
    energia_acumulada DECIMAL(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, fecha)
  );
  ```
- **Índices**: `idx_telemetry_user_fecha`, `idx_telemetry_fecha`

### 3. Factura (`/factura`)
- **Estado**: ✅ Tabla creada, usando datos mock temporalmente
- **Tabla**: `facturas` ✅ CREADA
  ```sql
  CREATE TABLE facturas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mes_iso VARCHAR(7) NOT NULL,  -- YYYY-MM
    potencia_facturada_kw DECIMAL(10,2) NOT NULL,
    potencia_media_medida_kw DECIMAL(10,2),
    diferencia_kw DECIMAL(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, mes_iso)
  );
  ```
- **Índices**: `idx_facturas_user_mes`

### 4. Umbrales (`/configuracion`)
- **Estado**: ✅ Tabla creada, usando `mockUmbrales` temporalmente
- **Tabla**: `umbrales` ✅ CREADA
  ```sql
  CREATE TABLE umbrales (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NULL,  -- NULL = global
    voltaje_min DECIMAL(10,2) DEFAULT 200,
    voltaje_max DECIMAL(10,2) DEFAULT 250,
    potencia_max DECIMAL(10,2) DEFAULT 5000,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)  -- Un registro por usuario (o NULL para global)
  );
  ```

### 5. Monitoreo en Tiempo Real (`/`)
- **Estado**: Usa WebSocket (no necesita tabla de historial)
- **Nota**: Puede beneficiarse de una tabla para persistir datos históricos

---

## ✅ Tablas Actuales (Implementadas)

1. ✅ `users` - Usuarios del sistema
2. ✅ `user_tokens` - Tokens de verificación/reset/2FA
3. ✅ `alerts` - Alertas del sistema (estructura creada, usando mocks por ahora)
4. ✅ `telemetry_history` - Historial de telemetría/consumo (estructura creada, usando mocks por ahora)
5. ✅ `facturas` - Registro de facturas (estructura creada, usando mocks por ahora)
6. ✅ `umbrales` - Umbrales de configuración (estructura creada, usando mocks por ahora)

---

## 🔧 Scripts de Base de Datos

### `scripts/init-db.js`
- ✅ Crea base de datos si no existe
- ✅ Crea tabla `users` con todos los campos (incluyendo `role`)
- ✅ Crea tabla `user_tokens`
- ✅ Migración automática de campo `role` para bases existentes

### `scripts/migrate-add-role.js`
- ✅ Agrega columna `role` si no existe
- ✅ Actualiza usuarios sin role a `'user'`

### `scripts/check-and-fix-db.js`
- ✅ Verifica estructura de tablas
- ✅ Verifica campos `email_verified` y `role`
- ✅ Muestra estructura actual
- ✅ Muestra tipos de tokens en uso

---

## 🎯 Recomendaciones

### Inmediatas:
1. ✅ Flujo de olvidé contraseña está **COMPLETO**
2. ✅ `init-db.js` actualizado con campo `role` y tipo `'2fa'`
3. ✅ `check-and-fix-db.js` mejorado para verificar todos los campos

### Próximos pasos:
1. ✅ Tablas creadas - Listas para usar
2. Integrar APIs para guardar datos reales en las tablas
3. Migrar de mocks a datos reales en las páginas
4. Agregar triggers para actualizar `updated_at` automáticamente (opcional)

---

## 📝 Resumen de Estado

| Componente | Estado | Notas |
|------------|--------|-------|
| Flujo "Olvidé Contraseña" | ✅ Completo | Funciona correctamente |
| Tabla `users` | ✅ Completa | Incluye `role` |
| Tabla `user_tokens` | ✅ Completa | Soporta 3 tipos de tokens |
| Tabla `alerts` | ✅ Creada | Usando mocks temporalmente |
| Tabla `telemetry_history` | ✅ Creada | Usando mocks temporalmente |
| Tabla `facturas` | ✅ Creada | Usando mocks temporalmente |
| Tabla `umbrales` | ✅ Creada | Usando mocks temporalmente |
| Script `init-db.js` | ✅ Actualizado | Incluye todas las tablas e índices |
| Script `check-and-fix-db.js` | ✅ Mejorado | Verifica todas las tablas e índices |
| Índices de rendimiento | ✅ Creados | Optimizados para consultas frecuentes |

