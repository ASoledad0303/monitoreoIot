const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log('Agregando campo api_key a devices...');

    // Agregar columna api_key si no existe
    await pool.query(`
      ALTER TABLE devices 
      ADD COLUMN IF NOT EXISTS api_key VARCHAR(64) UNIQUE;
    `);

    // Generar API keys para dispositivos que no tienen una
    const devicesWithoutKey = await pool.query(`
      SELECT id, code, company_id 
      FROM devices 
      WHERE api_key IS NULL;
    `);

    console.log(`Generando API keys para ${devicesWithoutKey.rows.length} dispositivos...`);

    for (const device of devicesWithoutKey.rows) {
      // Generar API key único basado en device id, code y timestamp
      const apiKey = crypto
        .createHash('sha256')
        .update(`${device.id}-${device.code}-${device.company_id}-${Date.now()}`)
        .digest('hex')
        .substring(0, 32);

      await pool.query(
        `UPDATE devices SET api_key = $1 WHERE id = $2`,
        [apiKey, device.id]
      );

      console.log(`  - Device ID ${device.id} (${device.code}): ${apiKey}`);
    }

    // Crear índice para búsquedas rápidas por API key
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key);
    `);

    console.log('✅ Migración completada: campo api_key agregado a devices');
  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

