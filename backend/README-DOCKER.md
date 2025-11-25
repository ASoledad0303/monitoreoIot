# Guía de Docker para el Sistema IoT

Este documento explica cómo ejecutar todo el sistema usando Docker Compose.

## 📋 Requisitos

- Docker Desktop (Windows/Mac) o Docker Engine + Docker Compose (Linux)
- Al menos 4GB de RAM disponible
- Puertos disponibles: 3000, 5000, 1883, 8086, 5432

## 🚀 Inicio Rápido

### 1. Configurar variables de entorno (opcional)

Crea un archivo `.env` en la carpeta `backend/` con tus configuraciones:

```env
# MQTT
MQTT_USER=mqtt_user
MQTT_PASS=mqtt_password

# API Flask
API_PORT=5000

# Frontend Next.js
FRONTEND_PORT=3000

# PostgreSQL (si está en Docker)
POSTGRES_HOST=host.docker.internal
POSTGRES_PORT=5432
POSTGRES_DB=tesis_iot_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=a.123456

# InfluxDB (opcional)
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_TOKEN=tu_token
INFLUXDB_ORG=tu_org
INFLUXDB_BUCKET=tu_bucket

# URLs del Frontend (para que el navegador acceda correctamente)
# IMPORTANTE: Estas URLs se usan desde el navegador del usuario, no desde dentro de Docker
# El navegador accede al frontend en localhost:3000 y hace requests a localhost:5000
NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000
NEXT_PUBLIC_WS_URL=ws://localhost:5000/ws

# URLs internas de Docker (para referencia, no se usan en el código del frontend)
BACKEND_URL=http://backend:5000
BACKEND_PORT=5000
```

### 2. Iniciar todos los servicios

```bash
cd backend
docker-compose up -d
```

### 3. Verificar que todo está funcionando

```bash
# Ver logs de todos los servicios
docker-compose logs -f

# Ver logs de un servicio específico
docker-compose logs -f frontend
docker-compose logs -f api
docker-compose logs -f mosquitto
```

### 4. Acceder a la aplicación

- **Frontend**: http://localhost:3000
- **API Flask**: http://localhost:5000
- **InfluxDB**: http://localhost:8086
- **MQTT Broker**: localhost:1883

## 🛠️ Servicios Incluidos

### 1. Frontend (Next.js)

- **Puerto**: 3000
- **Container**: `iot-frontend`
- **Service Name**: `frontend`
- **URL**: http://localhost:3000

### 2. Backend API (Flask)

- **Puerto**: 5000
- **Container**: `iot-backend`
- **Service Name**: `backend` (para comunicación entre contenedores Docker)
- **URL pública**: http://localhost:5000 (desde el navegador)
- **URL interna Docker**: http://backend:5000 (desde otros contenedores)
- **WebSocket**: ws://localhost:5000/ws

### 3. Mosquitto (MQTT Broker)

- **Puerto**: 1883
- **Container**: `mosquitto`
- **Autenticación**: Habilitada (usuario/contraseña por defecto: `mqtt_user`/`mqtt_password`)

### 4. Telegraf

- **Container**: `telegraf`
- **Función**: Lee datos de MQTT y los guarda en InfluxDB y PostgreSQL

### 5. Emulador ESP32

- **Container**: `esp-emulator`
- **Función**: Simula un dispositivo ESP32 enviando datos a MQTT

### 6. InfluxDB (Opcional)

- **Puerto**: 8086
- **Container**: `influxdb`
- **URL**: http://localhost:8086

## 🔧 Comandos Útiles

### Detener todos los servicios

```bash
docker-compose down
```

### Detener y eliminar volúmenes

```bash
docker-compose down -v
```

### Reconstruir un servicio específico

```bash
docker-compose build frontend
docker-compose up -d frontend
```

### Ver estado de los servicios

```bash
docker-compose ps
```

### Ejecutar comandos en un contenedor

```bash
# Acceder al shell del frontend
docker-compose exec frontend sh

# Ver logs en tiempo real
docker-compose logs -f api
```

## 🔐 Credenciales por Defecto

### MQTT

- **Usuario**: `mqtt_user`
- **Contraseña**: `mqtt_password`

### PostgreSQL

- **Usuario**: `postgres`
- **Contraseña**: `a.123456` (configurable)
- **Base de datos**: `tesis_iot_db`

## 🌐 Configuración de Red

### Acceso desde el navegador

Cuando accedes al frontend desde tu navegador (http://localhost:3000), el código JavaScript se ejecuta en el navegador, no en el contenedor. Por lo tanto:

- Las URLs de la API deben apuntar a `localhost:5000` (no a `api:5000`)
- Las URLs de WebSocket deben apuntar a `ws://localhost:5000/ws`

Esto ya está configurado por defecto en el `docker-compose.yml`.

### Acceso desde otros dispositivos en la red

Si quieres acceder desde otro dispositivo en tu red local:

1. Reemplaza `localhost` con la IP de tu máquina:

   ```env
   NEXT_PUBLIC_FLASK_API_URL=http://192.168.1.100:5000
   NEXT_PUBLIC_WS_URL=ws://192.168.1.100:5000/ws
   ```

2. Reconstruye el frontend:
   ```bash
   docker-compose build frontend
   docker-compose up -d frontend
   ```

## 🐛 Troubleshooting

### El frontend no se conecta al backend

1. Verifica que el backend está corriendo:

   ```bash
   docker-compose ps backend
   ```

2. Verifica los logs del backend:

   ```bash
   docker-compose logs backend
   ```

3. Prueba acceder directamente al backend:

   ```bash
   curl http://localhost:5000/health
   ```

4. Verifica que el puerto 5000 está expuesto correctamente:
   ```bash
   docker-compose ps backend
   # Debe mostrar: 0.0.0.0:5000->5000/tcp
   ```

### Error de conexión MQTT

1. Verifica que Mosquitto está corriendo:

   ```bash
   docker-compose ps mosquitto
   ```

2. Verifica las credenciales MQTT en el `.env`

3. Prueba conectarte manualmente:
   ```bash
   docker-compose exec mosquitto mosquitto_sub -h localhost -u mqtt_user -P mqtt_password -t test/topic
   ```

### El frontend muestra errores de build

1. Reconstruye el frontend:

   ```bash
   docker-compose build --no-cache frontend
   docker-compose up -d frontend
   ```

2. Verifica los logs de build:
   ```bash
   docker-compose logs frontend
   ```

## 📝 Notas Importantes

- **Base de datos PostgreSQL**: Por defecto, el sistema espera que PostgreSQL esté corriendo en `host.docker.internal:5432`. Si PostgreSQL está en Docker, ajusta `POSTGRES_HOST` en el `.env`.

- **Variables de entorno**: Las variables `NEXT_PUBLIC_*` se inyectan en build time. Si las cambias, necesitas reconstruir el frontend.

- **Volúmenes**: Los datos de InfluxDB y Mosquitto se persisten en volúmenes Docker. Para eliminarlos, usa `docker-compose down -v`.

- **Puertos**: Asegúrate de que los puertos 3000, 5000, 1883, 8086 no estén en uso por otros servicios.
