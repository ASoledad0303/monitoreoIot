// Migración para agregar soporte de dispositivos/medidores
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Iniciando migración: agregar soporte de dispositivos...');
    
    // Crear tabla devices
    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50),
        description TEXT,
        location VARCHAR(200),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, code)
      );
    `);
    console.log('✓ Tabla devices creada');

    // Crear índice
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_company_id 
        ON devices(company_id);
      `);
      console.log('✓ Índice creado en devices.company_id');
    } catch (e) {
      // Ignorar si ya existe
    }

    // Agregar company_id a telemetry_history si no existe
    try {
      await pool.query(`
        ALTER TABLE telemetry_history 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
      `);
      console.log('✓ Campo company_id agregado a telemetry_history');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo company_id ya existe en telemetry_history');
      }
    }

    // Agregar device_id a telemetry_history
    try {
      await pool.query(`
        ALTER TABLE telemetry_history 
        ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
      `);
      console.log('✓ Campo device_id agregado a telemetry_history');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo device_id ya existe en telemetry_history');
      }
    }

    // Crear índices para telemetry_history
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_company_device 
        ON telemetry_history(company_id, device_id, fecha);
      `);
      console.log('✓ Índice creado en telemetry_history');
    } catch (e) {
      // Ignorar
    }

    // Agregar company_id a alerts si no existe
    try {
      await pool.query(`
        ALTER TABLE alerts 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
      `);
      console.log('✓ Campo company_id agregado a alerts');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo company_id ya existe en alerts');
      }
    }

    // Agregar device_id a alerts (reemplazando campo dispositivo de texto)
    try {
      await pool.query(`
        ALTER TABLE alerts 
        ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
      `);
      console.log('✓ Campo device_id agregado a alerts');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo device_id ya existe en alerts');
      }
    }

    // Mantener campo dispositivo como texto por compatibilidad, pero usar device_id como FK
    // Crear índices para alerts
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_company_device 
        ON alerts(company_id, device_id, fecha);
      `);
      console.log('✓ Índice creado en alerts');
    } catch (e) {
      // Ignorar
    }

    console.log('✓ Migración completada exitosamente');
  } catch (e) {
    console.error('✗ Error en migración:', e?.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

(async () => {
  await migrate();
  process.exit(0);
})();


