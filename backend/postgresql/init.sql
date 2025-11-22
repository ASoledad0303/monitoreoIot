-- Script de inicialización opcional para PostgreSQL
-- Telegraf creará las tablas automáticamente, pero este script puede ser útil
-- para crear índices o configuraciones adicionales

-- Crear esquema si no existe (ya existe por defecto, pero por si acaso)
CREATE SCHEMA IF NOT EXISTS public;

-- La tabla 'telemetry' será creada automáticamente por Telegraf
-- Pero podemos crear índices para mejorar el rendimiento de las consultas

-- Nota: Ejecutar estos comandos DESPUÉS de que Telegraf haya creado la tabla

-- Índice en la columna de tiempo para consultas por rango de fechas
-- CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry(time);

-- Índice en el device para filtrar por dispositivo
-- CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device);

-- Índice compuesto para consultas comunes (device + time)
-- CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device, time);


