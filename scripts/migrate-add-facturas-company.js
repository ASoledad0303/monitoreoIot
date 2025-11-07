// Migración para agregar company_id y device_id a facturas
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';
const companyEnabled = process.env.COMPANY_ENABLED === 'true';

async function migrate() {
  if (!companyEnabled) {
    console.log('COMPANY_ENABLED no está habilitado. Saltando migración.');
    process.exit(0);
  }

  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Iniciando migración: agregar company_id y device_id a facturas...');
    
    // Agregar company_id a facturas
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
      `);
      console.log('✓ Campo company_id agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo company_id ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Agregar device_id a facturas
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
      `);
      console.log('✓ Campo device_id agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo device_id ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Eliminar constraint UNIQUE antiguo si existe
    try {
      await pool.query(`
        ALTER TABLE facturas 
        DROP CONSTRAINT IF EXISTS facturas_user_id_mes_iso_key;
      `);
      console.log('✓ Constraint UNIQUE antiguo eliminado');
    } catch (e) {
      // Ignorar si no existe
    }

    // Crear nuevo índice único que incluya company_id y device_id
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS facturas_user_mes_company_device_unique 
        ON facturas(user_id, mes_iso, COALESCE(company_id, 0), COALESCE(device_id, 0));
      `);
      console.log('✓ Nuevo índice único creado en facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Índice único ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Crear índices para mejor rendimiento
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_facturas_company_device 
        ON facturas(company_id, device_id, mes_iso);
      `);
      console.log('✓ Índice creado en facturas para company/device');
    } catch (e) {
      // Ignorar si ya existe
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


