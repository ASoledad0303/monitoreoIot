-- ============================================================================
-- SISTEMA DE AUDITORÍA PARA BASE DE DATOS POSTGRESQL
-- Sistema IoT de Monitoreo para la Optimización Energética
-- ============================================================================
-- 
-- Este script implementa un sistema completo de auditoría que registra
-- todos los cambios (INSERT, UPDATE, DELETE) en las tablas críticas del sistema.
--
-- Tablas auditadas:
--   - roles: Roles del sistema
--   - users: Usuarios del sistema
--   - companies: Empresas
--   - devices: Dispositivos IoT (incluye API keys sensibles)
--   - umbrales: Configuraciones de umbrales de alertas
--
-- Consideraciones de rendimiento:
--   - NO se auditan tablas de alto volumen como telemetry_history
--   - Los triggers son eficientes y usan JSON para almacenar cambios
--   - Se incluyen índices para consultas rápidas
--
-- Compatibilidad: PostgreSQL 13+
-- ============================================================================

-- ============================================================================
-- 1. CREACIÓN DE LA TABLA DE AUDITORÍA
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    
    -- Información de la tabla auditada
    schema_name VARCHAR(63) NOT NULL DEFAULT 'public',
    table_name VARCHAR(63) NOT NULL,
    
    -- Tipo de operación
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    
    -- Identificación del registro afectado
    record_id INTEGER, -- ID del registro (clave primaria)
    record_key JSONB,  -- Clave primaria compuesta o identificador alternativo (JSON)
    
    -- Valores antes y después del cambio
    old_values JSONB,  -- Valores anteriores (NULL para INSERT)
    new_values JSONB,  -- Valores nuevos (NULL para DELETE)
    
    -- Información del usuario que realizó el cambio
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Usuario del sistema
    changed_by_db_user VARCHAR(63), -- Usuario de la base de datos (current_user)
    
    -- Metadatos adicionales
    ip_address INET, -- Dirección IP (si está disponible desde la aplicación)
    user_agent TEXT, -- User agent (si está disponible)
    
    -- Timestamp con zona horaria
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Comentario opcional sobre el cambio
    comment TEXT
);

-- ============================================================================
-- 2. ÍNDICES PARA OPTIMIZAR CONSULTAS
-- ============================================================================

-- Índice para búsquedas por tabla y operación
CREATE INDEX IF NOT EXISTS idx_audit_log_table_operation 
ON audit_log(table_name, operation, changed_at DESC);

-- Índice para búsquedas por usuario del sistema
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by 
ON audit_log(changed_by, changed_at DESC);

-- Índice para búsquedas por registro específico
CREATE INDEX IF NOT EXISTS idx_audit_log_record 
ON audit_log(table_name, record_id, changed_at DESC);

-- Índice para búsquedas por rango de fechas
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at 
ON audit_log(changed_at DESC);

-- Índice GIN para búsquedas en JSONB (old_values y new_values)
CREATE INDEX IF NOT EXISTS idx_audit_log_old_values_gin 
ON audit_log USING GIN(old_values);

CREATE INDEX IF NOT EXISTS idx_audit_log_new_values_gin 
ON audit_log USING GIN(new_values);

-- ============================================================================
-- 3. FUNCIÓN GENÉRICA DE AUDITORÍA
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_record_id INTEGER;
    v_record_key JSONB;
    v_user_id INTEGER;
    v_ip_address INET;
    v_user_agent TEXT;
BEGIN
    -- Determinar el ID del registro
    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id;
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
        
        -- Si la tabla no tiene columna 'id', usar otra clave primaria
        IF v_record_id IS NULL THEN
            v_record_key := jsonb_build_object('key', OLD);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        v_record_id := NEW.id;
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        -- Solo registrar si hubo cambios reales
        IF v_old_data = v_new_data THEN
            RETURN NEW;
        END IF;
        
        IF v_record_id IS NULL THEN
            v_record_key := jsonb_build_object('key', NEW);
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id;
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
        
        IF v_record_id IS NULL THEN
            v_record_key := jsonb_build_object('key', NEW);
        END IF;
    END IF;
    
    -- Intentar obtener el user_id desde la sesión actual (si está disponible)
    -- Esto requiere que la aplicación establezca una variable de sesión
    -- Ejemplo: SET LOCAL app.user_id = 123;
    BEGIN
        v_user_id := current_setting('app.user_id', true)::INTEGER;
    EXCEPTION
        WHEN OTHERS THEN
            v_user_id := NULL;
    END;
    
    -- Intentar obtener IP y user agent desde variables de sesión (opcional)
    BEGIN
        v_ip_address := current_setting('app.ip_address', true)::INET;
    EXCEPTION
        WHEN OTHERS THEN
            v_ip_address := NULL;
    END;
    
    BEGIN
        v_user_agent := current_setting('app.user_agent', true);
    EXCEPTION
        WHEN OTHERS THEN
            v_user_agent := NULL;
    END;
    
    -- Insertar registro de auditoría
    INSERT INTO audit_log (
        schema_name,
        table_name,
        operation,
        record_id,
        record_key,
        old_values,
        new_values,
        changed_by,
        changed_by_db_user,
        ip_address,
        user_agent,
        changed_at
    ) VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        TG_OP,
        v_record_id,
        v_record_key,
        v_old_data,
        v_new_data,
        v_user_id,
        current_user,
        v_ip_address,
        v_user_agent,
        NOW()
    );
    
    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CREACIÓN DE TRIGGERS PARA TABLAS CRÍTICAS
-- ============================================================================

-- Trigger para tabla 'roles'
DROP TRIGGER IF EXISTS audit_roles_trigger ON roles;
CREATE TRIGGER audit_roles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tabla 'users'
DROP TRIGGER IF EXISTS audit_users_trigger ON users;
CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tabla 'companies'
DROP TRIGGER IF EXISTS audit_companies_trigger ON companies;
CREATE TRIGGER audit_companies_trigger
    AFTER INSERT OR UPDATE OR DELETE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tabla 'devices'
DROP TRIGGER IF EXISTS audit_devices_trigger ON devices;
CREATE TRIGGER audit_devices_trigger
    AFTER INSERT OR UPDATE OR DELETE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- Trigger para tabla 'umbrales'
DROP TRIGGER IF EXISTS audit_umbrales_trigger ON umbrales;
CREATE TRIGGER audit_umbrales_trigger
    AFTER INSERT OR UPDATE OR DELETE ON umbrales
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_function();

-- ============================================================================
-- 5. FUNCIONES AUXILIARES PARA GESTIÓN DE AUDITORÍA
-- ============================================================================

-- Función para habilitar/deshabilitar auditoría en una tabla
CREATE OR REPLACE FUNCTION toggle_audit_on_table(
    p_table_name VARCHAR(63),
    p_enable BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
DECLARE
    v_trigger_name VARCHAR(100);
BEGIN
    v_trigger_name := 'audit_' || p_table_name || '_trigger';
    
    IF p_enable THEN
        -- Habilitar: crear el trigger si no existe
        EXECUTE format('
            DROP TRIGGER IF EXISTS %I ON %I;
            CREATE TRIGGER %I
                AFTER INSERT OR UPDATE OR DELETE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION audit_trigger_function();
        ', v_trigger_name, p_table_name, v_trigger_name, p_table_name);
        
        RAISE NOTICE 'Auditoría habilitada para tabla: %', p_table_name;
    ELSE
        -- Deshabilitar: eliminar el trigger
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', v_trigger_name, p_table_name);
        
        RAISE NOTICE 'Auditoría deshabilitada para tabla: %', p_table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Función para establecer el user_id en la sesión actual
-- Esta función debe ser llamada desde la aplicación antes de realizar cambios
CREATE OR REPLACE FUNCTION set_audit_user(p_user_id INTEGER)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.user_id', p_user_id::TEXT, false);
END;
$$ LANGUAGE plpgsql;

-- Función para establecer IP y user agent en la sesión actual (opcional)
CREATE OR REPLACE FUNCTION set_audit_metadata(
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF p_ip_address IS NOT NULL THEN
        PERFORM set_config('app.ip_address', p_ip_address::TEXT, false);
    END IF;
    
    IF p_user_agent IS NOT NULL THEN
        PERFORM set_config('app.user_agent', p_user_agent, false);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. VISTAS ÚTILES PARA CONSULTAS DE AUDITORÍA
-- ============================================================================

-- Vista para ver el historial de cambios de un usuario específico
CREATE OR REPLACE VIEW v_audit_by_user AS
SELECT 
    al.id,
    al.table_name,
    al.operation,
    al.record_id,
    al.old_values,
    al.new_values,
    u.name AS user_name,
    u.email AS user_email,
    al.changed_at,
    al.ip_address
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
ORDER BY al.changed_at DESC;

-- Vista para ver el historial de cambios de un dispositivo específico
CREATE OR REPLACE VIEW v_audit_by_device AS
SELECT 
    al.id,
    al.operation,
    al.old_values,
    al.new_values,
    u.name AS changed_by_name,
    d.name AS device_name,
    d.code AS device_code,
    al.changed_at
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
LEFT JOIN devices d ON al.record_id = d.id
WHERE al.table_name = 'devices'
ORDER BY al.changed_at DESC;

-- Vista para ver cambios de configuraciones (umbrales)
CREATE OR REPLACE VIEW v_audit_configurations AS
SELECT 
    al.id,
    al.operation,
    al.old_values,
    al.new_values,
    u.name AS changed_by_name,
    c.name AS company_name,
    al.changed_at
FROM audit_log al
LEFT JOIN users u ON al.changed_by = u.id
LEFT JOIN companies c ON (al.new_values->>'company_id')::INTEGER = c.id 
    OR (al.old_values->>'company_id')::INTEGER = c.id
WHERE al.table_name = 'umbrales'
ORDER BY al.changed_at DESC;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- Comentarios finales:
-- 
-- Para usar el sistema de auditoría desde la aplicación:
-- 
-- 1. Antes de realizar cambios, establecer el user_id:
--    SELECT set_audit_user(123);
-- 
-- 2. (Opcional) Establecer metadatos adicionales:
--    SELECT set_audit_metadata('192.168.1.100'::INET, 'Mozilla/5.0...');
-- 
-- 3. Realizar la operación normalmente:
--    UPDATE users SET name = 'Nuevo Nombre' WHERE id = 1;
-- 
-- 4. Consultar el historial:
--    SELECT * FROM v_audit_by_user WHERE user_name = 'Juan Pérez';
--    SELECT * FROM v_audit_by_device WHERE device_code = 'PRINCIPAL';
--    SELECT * FROM v_audit_configurations WHERE changed_at >= NOW() - INTERVAL '7 days';
-- 
-- Para deshabilitar temporalmente la auditoría en una tabla:
--    SELECT toggle_audit_on_table('users', false);
-- 
-- Para volver a habilitar:
--    SELECT toggle_audit_on_table('users', true);

