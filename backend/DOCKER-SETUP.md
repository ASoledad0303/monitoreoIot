# Configuración Docker - Variables de Entorno

## 📝 Variables de Entorno para Docker Compose

### Configuración Básica

Crea un archivo `.env` en la carpeta `backend/` con las siguientes variables:

```env
# ============================================
# MQTT Broker (Mosquitto)
# ============================================
MQTT_USER=mqtt_user
MQTT_PASS=mqtt_password

# ============================================
# Backend API (Flask)
# ============================================
API_PORT=5000

# ============================================
# Frontend Next.js
# ============================================
FRONTEND_PORT=3000

# URLs del Frontend (NEXT_PUBLIC_* se inyectan en build time)
# ⚠️ IMPORTANTE: Estas URLs se usan desde el NAVEGADOR del usuario, NO desde dentro del contenedor
#
# ¿Por qué localhost y no "backend"?
# - El código JavaScript del frontend se ejecuta en el navegador del usuario
# - El navegador accede al frontend en localhost:3000 y hace requests a localhost:5000
# - Desde el navegador, "backend" no existe (solo existe en la red interna de Docker)
# - El puerto 5000 está expuesto del contenedor al host, por lo que localhost:5000 funciona
#
# Si necesitas acceder desde otro dispositivo en tu red:
# - Usa la IP de tu máquina: http://192.168.1.100:5000 (reemplaza con tu IP)
# - O configura un proxy reverso (nginx/traefik) para manejar esto automáticamente
NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000
NEXT_PUBLIC_WS_URL=ws://localhost:5000/ws

# URLs internas de Docker (para referencia, no se usan en el código del frontend)
# Estas solo serían útiles si Next.js hiciera llamadas server-side al backend
# (pero en este proyecto, todas las llamadas son desde el cliente/navegador)
BACKEND_URL=http://backend:5000
BACKEND_PORT=5000

# ============================================
# PostgreSQL
# ============================================
# Si PostgreSQL está corriendo fuera de Docker (en el host)
POSTGRES_HOST=host.docker.internal
POSTGRES_PORT=5432
POSTGRES_DB=tesis_iot_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=a.123456
DATABASE_URL=postgresql://postgres:a.123456@host.docker.internal:5432/tesis_iot_db

# ============================================
# InfluxDB (Opcional)
# ============================================
# Descomenta y configura si usas InfluxDB
# DOCKER_INFLUXDB_INIT_MODE=setup
# DOCKER_INFLUXDB_INIT_USERNAME=admin
# DOCKER_INFLUXDB_INIT_PASSWORD=admin123456
# DOCKER_INFLUXDB_INIT_ORG=tesis
# DOCKER_INFLUXDB_INIT_BUCKET=iot_data
# DOCKER_INFLUXDB_INIT_RETENTION=30d
# DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=tu_token_aqui
# INFLUXDB_URL=http://influxdb:8086
# INFLUXDB_TOKEN=tu_token_aqui
# INFLUXDB_ORG=tesis
# INFLUXDB_BUCKET=iot_data

# ============================================
# MQTT Base Topic
# ============================================
MQTT_BASE=tesis/iot/esp32
```

## 🔧 Explicación de las Variables

### Variables NEXT*PUBLIC*\*

Las variables que comienzan con `NEXT_PUBLIC_` son especiales en Next.js:

- Se inyectan en **build time** en el código del cliente
- Están disponibles en el navegador del usuario
- **NO** pueden cambiar en runtime

### ¿Por qué usar `localhost:5000` y no `backend:5000`?

**Flujo de ejecución:**

```
┌─────────────────────────────────────────────────────────────┐
│ Usuario accede a http://localhost:3000 desde su navegador    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Navegador descarga el código JavaScript del frontend         │
│ (que contiene NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000)│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ JavaScript se ejecuta EN EL NAVEGADOR (no en el contenedor) │
│ Hace fetch('http://localhost:5000/metrics/...')            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ El navegador resuelve "localhost" como la máquina del host  │
│ y accede al puerto 5000 expuesto por Docker                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Docker redirige el puerto 5000 del host al contenedor       │
│ "backend" que escucha en el puerto 5000                     │
└─────────────────────────────────────────────────────────────┘
```

**Puntos clave:**

1. El código JavaScript se ejecuta en el **navegador del usuario**, no en el contenedor Docker
2. El navegador accede al frontend en `http://localhost:3000`
3. Desde el navegador, `localhost:5000` apunta al backend expuesto en el puerto 5000 del host
4. Si usáramos `backend:5000`, el navegador intentaría conectarse a un host llamado "backend" que **no existe en la red del usuario** (solo existe en la red interna de Docker)

**¿Cuándo usar `backend:5000`?**

- Solo si Next.js hiciera llamadas **server-side** (desde API routes o Server Components)
- En este proyecto, todas las llamadas al backend Flask son desde el cliente (navegador)
- Por lo tanto, `localhost:5000` es la opción correcta

### Variables Internas de Docker

Las variables `BACKEND_URL` y `BACKEND_PORT` están disponibles en el contenedor del frontend pero:

- No se usan en el código del frontend (que se ejecuta en el navegador)
- Podrían usarse para server-side rendering o API routes de Next.js si fuera necesario
- El servicio backend se llama `backend` en la red de Docker

## 🌐 Acceso desde Otros Dispositivos

Si quieres acceder al sistema desde otro dispositivo en tu red local:

1. **Obtén la IP de tu máquina:**

   ```bash
   # Windows
   ipconfig

   # Linux/Mac
   ifconfig
   ```

2. **Actualiza las variables en `.env`:**

   ```env
   NEXT_PUBLIC_FLASK_API_URL=http://192.168.1.100:5000
   NEXT_PUBLIC_WS_URL=ws://192.168.1.100:5000/ws
   ```

   (Reemplaza `192.168.1.100` con la IP de tu máquina)

3. **Reconstruye el frontend:**
   ```bash
   docker-compose build frontend
   docker-compose up -d frontend
   ```

## 🐛 Troubleshooting

### El frontend no puede conectarse al backend

1. **Verifica que el backend está corriendo:**

   ```bash
   docker-compose ps backend
   ```

2. **Verifica que el puerto está expuesto:**

   ```bash
   docker-compose ps backend
   # Debe mostrar: 0.0.0.0:5000->5000/tcp
   ```

3. **Prueba acceder directamente al backend:**

   ```bash
   curl http://localhost:5000/health
   ```

4. **Verifica las variables de entorno:**
   ```bash
   docker-compose exec frontend env | grep NEXT_PUBLIC
   ```

### Error: "Cannot connect to backend"

- Asegúrate de que `NEXT_PUBLIC_FLASK_API_URL` apunta a `http://localhost:5000` (no a `http://backend:5000`)
- El navegador del usuario no puede resolver el nombre del servicio Docker
