# Análisis Completo del Código - Sistema IoT de Monitoreo Energético

## 📋 Índice

1. [Arquitectura General](#arquitectura-general)
2. [Configuración y Librerías Base](#configuración-y-librerías-base)
3. [Sistema de Autenticación](#sistema-de-autenticación)
4. [Base de Datos](#base-de-datos)
5. [APIs (Backend)](#apis-backend)
6. [Frontend (Páginas y Componentes)](#frontend-páginas-y-componentes)
7. [Scripts de Utilidad](#scripts-de-utilidad)
8. [Flujos Principales](#flujos-principales)

---

## 🏗️ Arquitectura General

### Tecnologías Utilizadas

- **Framework**: Next.js 15.5.4 (App Router)
- **Lenguaje**: TypeScript
- **Base de Datos**: PostgreSQL
- **UI**: Material-UI (MUI) v7
- **Autenticación**: JWT (JSON Web Tokens)
- **Email**: Nodemailer
- **Gráficos**: Recharts
- **Validación**: Zod
- **WebSockets**: Para datos en tiempo real

### Estructura de Carpetas

```
src/
├── app/                    # Páginas y rutas (Next.js App Router)
│   ├── (auth)/            # Rutas de autenticación
│   ├── admin/              # Panel de administración
│   ├── api/                # API Routes (Backend)
│   └── [páginas].tsx       # Páginas públicas
├── components/             # Componentes reutilizables
├── lib/                    # Utilidades y helpers
└── middleware.ts           # Middleware de autenticación
```

---

## ⚙️ Configuración y Librerías Base

### `src/lib/config.ts`
**Propósito**: Configuración centralizada del sistema

**Funcionalidades**:
- Define roles disponibles (`user`, `admin`)
- Configuración de companies (multi-tenancy)
- Interfaces TypeScript para Company
- Validación de roles

**Clave**: Centraliza toda la configuración para facilitar cambios futuros.

### `src/lib/db.ts`
**Propósito**: Gestión de conexiones a PostgreSQL

**Funcionalidades**:
- Pool de conexiones singleton (evita múltiples conexiones)
- Función `query()` para ejecutar SQL
- Manejo de conexión desde `DATABASE_URL` o variables individuales

**Uso**: Todas las queries a la BD usan esta función.

### `src/lib/jwt.ts`
**Propósito**: Manejo de tokens JWT

**Funcionalidades**:
- Generación de tokens con `signToken()`
- Verificación de tokens con `verifyToken()`
- Tokens incluyen: `sub` (user id), `email`, `name`, `role`

**Seguridad**: Tokens firmados con `JWT_SECRET` del `.env.local`

### `src/lib/mailer.ts`
**Propósito**: Envío de emails

**Funcionalidades**:
- Configuración SMTP desde variables de entorno
- Templates de email (verificación, reset password, 2FA)
- Fallback a simulación si SMTP no está configurado

**Templates**:
- `renderVerificationEmail()` - Código de verificación
- `renderResetEmail()` - Restablecimiento de contraseña
- `render2FAEmail()` - Autenticación de dos factores

### `src/lib/middleware-helpers.ts`
**Propósito**: Helpers para middleware de autenticación

**Funciones**:
- `getAuthUser()` - Obtiene usuario desde token de cookie
- `requireAuth()` - Verifica autenticación
- `requireRole()` - Verifica rol específico
- `requireAdmin()` - Verifica rol admin

---

## 🔐 Sistema de Autenticación

### `src/middleware.ts`
**Propósito**: Middleware global que protege rutas

**Funcionalidad**:
1. Define rutas públicas (login, register, etc.)
2. Verifica cookie `auth_token` en rutas protegidas
3. Redirige a `/login` si no está autenticado
4. Guarda ruta original para redirección post-login

**Flujo**:
```
Usuario → Middleware → ¿Tiene token? → SÍ: Continuar | NO: Redirigir a /login
```

### Flujo de Registro (`/api/auth/register`)

1. Valida datos con Zod
2. Verifica email único
3. Hashea contraseña con bcrypt
4. **Lógica especial**: Si no hay admins, el primer usuario es admin
5. Crea usuario con `role='user'` por defecto (o `admin` si es el primero)

### Flujo de Login (`/api/auth/login`)

1. Valida credenciales
2. Verifica que email esté verificado
3. Genera código 2FA (6 dígitos)
4. Guarda código en `user_tokens` (tipo `'2fa'`, expira en 10 min)
5. Envía código por email
6. Retorna `requires2FA: true` (sin crear sesión aún)

### Verificación 2FA (`/api/auth/verify-2fa`)

1. Valida código 2FA
2. Verifica que no esté expirado ni usado
3. Marca token como usado
4. Genera JWT con datos del usuario
5. Crea cookie `auth_token` (HttpOnly, Secure)
6. Retorna éxito

### Olvidé mi Contraseña

**Flujo**:
1. Usuario solicita reset → `/api/auth/forgot-password`
2. Genera código de 6 dígitos
3. Guarda en `user_tokens` (tipo `'reset'`, expira en 15 min)
4. Envía email con código
5. Usuario ingresa código → `/api/auth/reset-password`
6. Valida código y actualiza contraseña

### Verificación de Email

1. Usuario se registra (email no verificado)
2. Solicita código → `/api/auth/send-verification-code`
3. Genera código (tipo `'verify'`, expira en 15 min)
4. Usuario ingresa código → `/api/auth/verify-email`
5. Marca `email_verified = true`

---

## 🗄️ Base de Datos

### Scripts de Inicialización

#### `scripts/init-db.js`
**Propósito**: Inicializa la base de datos completa

**Funcionalidades**:
1. Crea base de datos si no existe
2. Crea todas las tablas:
   - `users` - Usuarios del sistema
   - `user_tokens` - Tokens de verificación/reset/2FA
   - `alerts` - Alertas del sistema
   - `telemetry_history` - Historial de telemetría
   - `facturas` - Facturas de energía
   - `umbrales` - Umbrales de alertas
   - `companies` - (Opcional) Empresas (multi-tenant)
3. Crea índices para optimización
4. Agrega campos opcionales según configuración

### Estructura de Tablas

#### `users`
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(80)
- email: VARCHAR(160) UNIQUE
- password_hash: TEXT (bcrypt)
- email_verified: BOOLEAN
- role: VARCHAR(20) DEFAULT 'user'
- company_id: INTEGER (opcional, FK a companies)
- created_at: TIMESTAMP
```

#### `user_tokens`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER FK
- type: VARCHAR(20) ('verify' | 'reset' | '2fa')
- code: VARCHAR(12)
- expires_at: TIMESTAMP
- used: BOOLEAN
- created_at: TIMESTAMP
```

#### `alerts`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER FK
- fecha: DATE
- tipo: VARCHAR(50)
- mensaje: TEXT
- valor: VARCHAR(50)
- dispositivo: VARCHAR(100)
- created_at: TIMESTAMP
```

#### `telemetry_history`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER FK
- fecha: DATE
- voltaje: DECIMAL(10,2)
- corriente: DECIMAL(10,2)
- potencia: DECIMAL(10,2)
- energia_acumulada: DECIMAL(10,2)
- UNIQUE(user_id, fecha)
```

#### `facturas`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER FK
- mes_iso: VARCHAR(7) (YYYY-MM)
- potencia_facturada_kw: DECIMAL(10,2)
- potencia_media_medida_kw: DECIMAL(10,2)
- diferencia_kw: DECIMAL(10,2)
- UNIQUE(user_id, mes_iso)
```

#### `umbrales`
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER FK (NULL = globales)
- company_id: INTEGER FK (opcional)
- voltaje_min: DECIMAL(10,2)
- voltaje_max: DECIMAL(10,2)
- potencia_max: DECIMAL(10,2)
- UNIQUE(user_id)
```

#### `companies` (Opcional)
```sql
- id: SERIAL PRIMARY KEY
- name: VARCHAR(200)
- code: VARCHAR(50) UNIQUE
- email: VARCHAR(160)
- phone: VARCHAR(50)
- address: TEXT
- created_at, updated_at: TIMESTAMP
```

---

## 🔌 APIs (Backend)

### Autenticación (`/api/auth/*`)

#### `register` - POST
- Registra nuevo usuario
- Hash de contraseña
- Primer usuario = admin automático

#### `login` - POST
- Valida credenciales
- Genera código 2FA
- Envía email

#### `verify-2fa` - POST
- Valida código 2FA
- Crea sesión JWT

#### `logout` - POST
- Elimina cookie de sesión

#### `me` - GET
- Retorna información del usuario autenticado

#### `forgot-password` - POST
- Genera código de reset
- Envía email

#### `reset-password` - POST
- Valida código y actualiza contraseña

#### `send-verification-code` - POST
- Genera código de verificación
- Envía email

#### `verify-email` - POST
- Valida código y marca email como verificado

### Usuarios (`/api/users/*`)

#### `GET /api/users`
- Lista todos los usuarios (solo admin)

#### `PUT /api/users/[id]/role`
- Actualiza rol de usuario (solo admin)

### Companies (`/api/companies/*`)

#### `GET /api/companies`
- Lista todas las companies (solo admin)

#### `POST /api/companies`
- Crea nueva company (solo admin)

#### `PUT /api/companies/[id]`
- Actualiza company (solo admin)

#### `DELETE /api/companies/[id]`
- Elimina company (solo admin)

#### `GET /api/companies/config`
- Retorna configuración (si está habilitado)

### Telemetría (`/api/telemetry`)

#### `GET /api/telemetry`
- Retorna datos de telemetría del usuario autenticado

### Alertas (`/api/alerts`)

#### `GET /api/alerts`
- Lista alertas del usuario

#### `POST /api/alerts`
- Crea nueva alerta

### Facturas (`/api/facturas`)

#### `GET /api/facturas`
- Lista facturas del usuario

#### `POST /api/facturas`
- Crea/actualiza factura

#### `GET /api/facturas/[id]`
- Obtiene factura específica

### Umbrales (`/api/umbrales`)

#### `GET /api/umbrales`
- Obtiene umbrales del usuario o globales

#### `PUT /api/umbrales`
- Actualiza umbrales (solo admin para globales)

---

## 🎨 Frontend (Páginas y Componentes)

### Páginas de Autenticación (`src/app/(auth)/`)

#### `login/page.tsx`
- Formulario de login
- Manejo de 2FA (dos pasos)
- Validación con Zod

#### `register/page.tsx`
- Formulario de registro
- Validación de contraseña (mínimo 8, números, caracteres especiales)

#### `forgot-password/page.tsx`
- Solicitud de código de reset

#### `reset-password/page.tsx`
- Ingreso de código y nueva contraseña

#### `verify-email/page.tsx`
- Verificación de email con código

### Página Principal (`src/app/page.tsx`)

**Funcionalidad**: Monitoreo en tiempo real

**Características**:
- Conexión WebSocket para datos en tiempo real
- Gráficos con Recharts (Vrms, Irms, Potencia)
- KPIs en tiempo real
- Estado de conexión WebSocket visible
- Ventana deslizante de últimos 180 puntos

**Hook Personalizado**: `useRealtimeTelemetry()`
- Maneja conexión WebSocket
- Reintentos automáticos
- Actualización de estado en tiempo real

### Páginas de Administración (`src/app/admin/`)

#### `usuarios/page.tsx`
- Tabla de usuarios
- Cambio de roles (user/admin)
- Estado de verificación
- Solo visible para admins

#### `companies/page.tsx`
- CRUD completo de companies
- Solo visible si `COMPANY_ENABLED=true`
- Solo para admins

### Otras Páginas

#### `alertas/page.tsx`
- Lista de alertas del usuario
- Filtros por fecha/tipo

#### `reportes/page.tsx`
- Reportes de consumo energético
- Gráficos de historial
- Exportación a PDF

#### `factura/page.tsx`
- Comparación de facturas
- Potencia facturada vs medida

#### `configuracion/page.tsx`
- Cambio de contraseña
- Datos personales
- Configuración de umbrales (solo admin)
- Toggle tema claro/oscuro

### Componentes

#### `MainMenu.tsx`
- Menú lateral deslizable
- Navegación entre páginas
- Opciones de admin condicionales
- Botón de logout

---

## 🛠️ Scripts de Utilidad

### `scripts/init-db.js`
- Inicializa base de datos completa
- Crea todas las tablas e índices

### `scripts/migrate-add-role.js`
- Agrega campo `role` a tabla users
- Migración para bases de datos existentes

### `scripts/migrate-add-company.js`
- Agrega soporte de companies
- Crea tabla companies
- Agrega `company_id` a users y umbrales

### `scripts/make-admin.js`
- Convierte usuario en administrador
- Uso: `npm run make-admin <email>`

### `scripts/list-users.js`
- Lista todos los usuarios
- Muestra roles y estado de verificación

### `scripts/create-test-user.js`
- Crea usuario de prueba
- Email verificado por defecto

### `scripts/check-and-fix-db.js`
- Verifica integridad de la BD
- Repara problemas comunes

---

## 🔄 Flujos Principales

### 1. Registro de Nuevo Usuario

```
Usuario → /register → Valida datos → Crea usuario (role='user')
  → Verifica email → Envía código → Usuario verifica → email_verified=true
  → Puede hacer login
```

**Nota**: Si no hay admins, el primer usuario es automáticamente admin.

### 2. Login Completo

```
Usuario → /login → Ingresa email/password
  → Valida credenciales → Genera código 2FA → Envía email
  → Usuario ingresa código 2FA → Valida código → Crea sesión JWT
  → Cookie auth_token → Redirige a página principal
```

### 3. Monitoreo en Tiempo Real

```
Página principal → Conecta WebSocket → Recibe datos cada segundo
  → Actualiza gráficos → Muestra KPIs → Mantiene últimos 180 puntos
```

### 4. Gestión de Alertas

```
Sistema detecta umbral excedido → Crea alerta en BD
  → Usuario ve alerta en /alertas → Puede filtrar/ver detalles
```

### 5. Administración de Usuarios

```
Admin → /admin/usuarios → Ve lista de usuarios
  → Click en editar → Cambia rol → Actualiza en BD
  → Usuario recibe nuevo rol en próximo login
```

### 6. Multi-Tenancy (Companies)

```
Admin → Habilita COMPANY_ENABLED=true → Ejecuta migración
  → /admin/companies → Crea companies → Asigna usuarios a companies
  → Datos filtrados por company_id
```

---

## 🔒 Seguridad

### Medidas Implementadas

1. **Contraseñas**: Hash bcrypt (10 rounds)
2. **Tokens**: JWT firmados con secret
3. **Cookies**: HttpOnly, Secure (en producción)
4. **Validación**: Zod en todos los inputs
5. **Códigos**: Expiración automática (10-15 min)
6. **Códigos**: Un solo uso (marcados como usados)
7. **Middleware**: Protección de rutas automática
8. **Roles**: Verificación en cada endpoint sensible

### Flujos Seguros

- No se revela si un email existe (en forgot-password)
- No se puede cambiar el propio rol
- Solo admins pueden gestionar usuarios
- 2FA obligatorio para todos los logins

---

## 📊 Características Especiales

### 1. Primer Usuario Admin
- Si no hay admins, el primer registro es automáticamente admin
- Garantiza que siempre haya al menos un administrador

### 2. Multi-Tenancy Opcional
- Companies pueden habilitarse/deshabilitarse
- Controlado por `COMPANY_ENABLED` en `.env.local`

### 3. Tema Claro/Oscuro
- Toggle en configuración
- Persistido en contexto React

### 4. WebSockets en Tiempo Real
- Conexión automática
- Reintentos si se desconecta
- Ventana deslizante de datos

### 5. Exportación de Reportes
- PDF con jsPDF
- Gráficos incluidos

---

## 🚀 Scripts NPM Disponibles

```bash
npm run dev          # Desarrollo con Turbopack
npm run build        # Build de producción
npm run start        # Inicia servidor de producción
npm run lint         # Ejecuta ESLint
npm run init:db      # Inicializa base de datos
npm run migrate:role # Agrega campo role
npm run migrate:company # Agrega soporte companies
npm run make-admin   # Convierte usuario en admin
npm run list-users   # Lista usuarios
```

---

## 📝 Notas Importantes

1. **Variables de Entorno**: Todas las configuraciones sensibles están en `.env.local`
2. **Base de Datos**: Requiere PostgreSQL corriendo
3. **WebSocket**: Requiere servidor WebSocket en `NEXT_PUBLIC_WS_URL`
4. **Email**: Requiere SMTP configurado o funciona en modo simulación
5. **Roles**: Centralizados en `src/lib/config.ts` para fácil mantenimiento

---

## 🔄 Flujo de Datos

```
Cliente (React) 
  ↓
API Routes (Next.js)
  ↓
Middleware Helpers (auth)
  ↓
Database (PostgreSQL)
  ↓
Response (JSON)
```

Para tiempo real:
```
WebSocket Server
  ↓
WebSocket Client (React)
  ↓
Estado Local (useState)
  ↓
UI Actualizada
```

---

Este documento cubre toda la arquitectura y funcionalidad del sistema. Cada sección está diseñada para ser modular y mantenible.


