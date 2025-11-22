-- Script SQL para crear las tablas necesarias en PostgreSQL
-- Base de datos: tesis_iot_db

-- Conectar a la base de datos (ejecutar desde psql o desde el cliente)
-- \c tesis_iot_db

-- ============================================================================
-- TABLA: telemetry
-- Almacena los datos de telemetría de los dispositivos IoT
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry (
    id BIGSERIAL PRIMARY KEY,
    "time" TIMESTAMPTZ NOT NULL,
    device TEXT NOT NULL,
    vrms DOUBLE PRECISION,
    irms DOUBLE PRECISION,
    s_apparent_va DOUBLE PRECISION,
    potencia_activa DOUBLE PRECISION,
    factor_potencia DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar el rendimiento de las consultas
-- Índice en la columna de tiempo para consultas por rango de fechas
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry("time");

-- Índice en el device para filtrar por dispositivo
CREATE INDEX IF NOT EXISTS idx_telemetry_device ON telemetry(device);

-- Índice compuesto para consultas comunes (device + time)
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device, "time" DESC);

-- Índice compuesto para consultas por dispositivo y ordenadas por tiempo
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time_desc ON telemetry(device, "time" DESC);

-- ============================================================================
-- TABLA: vrms (opcional - si quieres separar las métricas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS vrms (
    id BIGSERIAL PRIMARY KEY,
    "time" TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION,
    unit TEXT DEFAULT 'V',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vrms_time ON vrms("time" DESC);

-- ============================================================================
-- TABLA: irms (opcional - si quieres separar las métricas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS irms (
    id BIGSERIAL PRIMARY KEY,
    "time" TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION,
    unit TEXT DEFAULT 'A',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_irms_time ON irms("time" DESC);

-- ============================================================================
-- TABLA: s_apparent (opcional - si quieres separar las métricas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS s_apparent (
    id BIGSERIAL PRIMARY KEY,
    "time" TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION,
    unit TEXT DEFAULT 'VA',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_s_apparent_time ON s_apparent("time" DESC);

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista para obtener los últimos datos de cada dispositivo
CREATE OR REPLACE VIEW v_latest_telemetry AS
SELECT DISTINCT ON (device)
    id,
    "time",
    device,
    vrms,
    irms,
    s_apparent_va,
    potencia_activa,
    factor_potencia,
    created_at
FROM telemetry
ORDER BY device, "time" DESC;

-- Vista para estadísticas por dispositivo (últimas 24 horas)
CREATE OR REPLACE VIEW v_device_stats_24h AS
SELECT 
    device,
    COUNT(*) as total_mediciones,
    AVG(vrms) as avg_voltage,
    AVG(irms) as avg_current,
    AVG(s_apparent_va) as avg_apparent_power,
    AVG(potencia_activa) as avg_active_power,
    AVG(factor_potencia) as avg_power_factor,
    MIN("time") as primera_medicion,
    MAX("time") as ultima_medicion
FROM telemetry
WHERE "time" >= NOW() - INTERVAL '24 hours'
GROUP BY device;

-- ============================================================================
-- FUNCIONES ÚTILES
-- ============================================================================

-- Función para obtener los últimos N registros de un dispositivo
CREATE OR REPLACE FUNCTION get_latest_telemetry(
    p_device TEXT,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id BIGINT,
    "time" TIMESTAMPTZ,
    device TEXT,
    vrms DOUBLE PRECISION,
    irms DOUBLE PRECISION,
    s_apparent_va DOUBLE PRECISION,
    potencia_activa DOUBLE PRECISION,
    factor_potencia DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t."time",
        t.device,
        t.vrms,
        t.irms,
        t.s_apparent_va,
        t.potencia_activa,
        t.factor_potencia
    FROM telemetry t
    WHERE t.device = p_device
    ORDER BY t."time" DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener datos en un rango de tiempo
CREATE OR REPLACE FUNCTION get_telemetry_range(
    p_device TEXT,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    id BIGINT,
    "time" TIMESTAMPTZ,
    device TEXT,
    vrms DOUBLE PRECISION,
    irms DOUBLE PRECISION,
    s_apparent_va DOUBLE PRECISION,
    potencia_activa DOUBLE PRECISION,
    factor_potencia DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t."time",
        t.device,
        t.vrms,
        t.irms,
        t.s_apparent_va,
        t.potencia_activa,
        t.factor_potencia
    FROM telemetry t
    WHERE t.device = p_device
      AND t."time" >= p_start_time
      AND t."time" <= p_end_time
    ORDER BY t."time" ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS EN LAS TABLAS Y COLUMNAS
-- ============================================================================
COMMENT ON TABLE telemetry IS 'Tabla principal para almacenar datos de telemetría de dispositivos IoT de energía';
COMMENT ON COLUMN telemetry."time" IS 'Timestamp de la medición (en formato TIMESTAMPTZ)';
COMMENT ON COLUMN telemetry.device IS 'ID del dispositivo (ej: E2641D44)';
COMMENT ON COLUMN telemetry.vrms IS 'Voltaje RMS en Voltios';
COMMENT ON COLUMN telemetry.irms IS 'Corriente RMS en Amperios';
COMMENT ON COLUMN telemetry.s_apparent_va IS 'Potencia aparente en VA (Voltio-Amperios)';
COMMENT ON COLUMN telemetry.potencia_activa IS 'Potencia activa en W (Watts)';
COMMENT ON COLUMN telemetry.factor_potencia IS 'Factor de potencia (adimensional, entre 0 y 1)';

