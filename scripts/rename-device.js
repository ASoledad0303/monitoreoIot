const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function renameDevice() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Buscar el dispositivo "test"
    const device = await pool.query(`
      SELECT id, name, code, company_id
      FROM devices
      WHERE name = 'test' OR code = '1212'
      LIMIT 1
    `);

    if (device.rows.length === 0) {
      console.log('❌ No se encontró el dispositivo "test"');
      return;
    }

    const deviceId = device.rows[0].id;
    console.log(`Dispositivo encontrado: ID=${deviceId}, Nombre=${device.rows[0].name}, Código=${device.rows[0].code}`);

    // Renombrar a "Dispositivo Principal"
    await pool.query(
      `UPDATE devices 
       SET name = 'Dispositivo Principal', 
           code = 'PRINCIPAL',
           updated_at = NOW()
       WHERE id = $1`,
      [deviceId]
    );

    console.log('✅ Dispositivo renombrado a "Dispositivo Principal"');
    console.log(`   Código actualizado a: PRINCIPAL`);

    // Mostrar información actualizada
    const updated = await pool.query(
      `SELECT id, name, code, company_id, api_key, is_active
       FROM devices
       WHERE id = $1`,
      [deviceId]
    );

    const d = updated.rows[0];
    console.log('\n📋 Información del dispositivo:');
    console.log(`   ID: ${d.id}`);
    console.log(`   Nombre: ${d.name}`);
    console.log(`   Código: ${d.code}`);
    console.log(`   Company ID: ${d.company_id}`);
    console.log(`   Activo: ${d.is_active ? 'Sí' : 'No'}`);
    if (d.api_key) {
      console.log(`   API Key: ${d.api_key}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

renameDevice().catch(console.error);

