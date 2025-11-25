# Configuración MQTT con Autenticación

Este directorio contiene la configuración de Mosquitto MQTT Broker con autenticación habilitada.

## Credenciales por Defecto

- **Usuario**: `mqtt_user`
- **Contraseña**: `mqtt_password`

## Configurar Credenciales Personalizadas

Puedes configurar credenciales personalizadas usando variables de entorno en el archivo `.env` o directamente en `docker-compose.yml`:

```bash
MQTT_USER=tu_usuario
MQTT_PASS=tu_contraseña_segura
```

## Archivos

- `mosquitto.conf`: Configuración principal de Mosquitto
- `passwd`: Archivo de contraseñas (se genera automáticamente en el volumen `mosquitto-data`)

## Notas

- El archivo de contraseñas se crea automáticamente al iniciar el contenedor
- Las credenciales se almacenan en un volumen persistente (`mosquitto-data`)
- Todos los servicios (emulator, telegraf, api) usan las mismas credenciales configuradas

## Verificar Configuración

Para verificar que la autenticación está funcionando:

```bash
# Intentar conectar sin credenciales (debe fallar)
mosquitto_sub -h localhost -t test/topic

# Conectar con credenciales (debe funcionar)
mosquitto_sub -h localhost -u mqtt_user -P mqtt_password -t test/topic
```

