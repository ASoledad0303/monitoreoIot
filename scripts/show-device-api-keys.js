const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function showApiKeys() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    const result = await pool.query(`
      SELECT d.id, d.code, d.name, d.api_key, d.is_active, c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      ORDER BY d.company_id, d.name;
    `);

    if (result.rows.length === 0) {
      console.log('No hay dispositivos registrados.');
      return;
    }

    console.log('\n=== API Keys de Dispositivos ===\n');
    
    for (const device of result.rows) {
      console.log(`ID: ${device.id}`);
      console.log(`  Código: ${device.code}`);
      console.log(`  Nombre: ${device.name}`);
      console.log(`  Company: ${device.company_name || 'N/A'}`);
      console.log(`  Activo: ${device.is_active ? 'Sí' : 'No'}`);
      if (device.api_key) {
        console.log(`  API Key: ${device.api_key}`);
      } else {
        console.log(`  API Key: NO CONFIGURADA (ejecuta: npm run migrate:device-api-key)`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

showApiKeys().catch(console.error);

