const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function checkTelemetry() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    // Verificar últimos registros de telemetría
    const result = await pool.query(`
      SELECT 
        th.id,
        th.fecha,
        th.voltaje,
        th.corriente,
        th.potencia,
        th.created_at,
        d.name as device_name,
        d.code as device_code,
        c.name as company_name
      FROM telemetry_history th
      LEFT JOIN devices d ON th.device_id = d.id
      LEFT JOIN companies c ON th.company_id = c.id
      ORDER BY th.created_at DESC
      LIMIT 10;
    `);

    if (result.rows.length === 0) {
      console.log('\n❌ No hay datos de telemetría en la base de datos.');
      console.log('\nVerifica que:');
      console.log('  1. El ESP32 esté enviando datos correctamente');
      console.log('  2. El dispositivo esté creado en /admin/dispositivos');
      console.log('  3. La API key sea correcta');
      return;
    }

    console.log('\n✅ Datos de telemetría encontrados:\n');
    console.log('Últimos 10 registros:');
    console.log('─'.repeat(100));
    
    for (const row of result.rows) {
      console.log(`ID: ${row.id}`);
      console.log(`  Fecha: ${row.fecha}`);
      console.log(`  Device: ${row.device_name || 'N/A'} (${row.device_code || 'N/A'})`);
      console.log(`  Company: ${row.company_name || 'N/A'}`);
      const voltaje = row.voltaje != null ? parseFloat(row.voltaje) : null;
      const corriente = row.corriente != null ? parseFloat(row.corriente) : null;
      const potencia = row.potencia != null ? parseFloat(row.potencia) : null;
      console.log(`  Voltaje: ${voltaje !== null ? voltaje.toFixed(2) + 'V' : 'N/A'}`);
      console.log(`  Corriente: ${corriente !== null ? corriente.toFixed(3) + 'A' : 'N/A'}`);
      console.log(`  Potencia: ${potencia !== null ? potencia.toFixed(2) + 'W' : 'N/A'}`);
      console.log(`  Creado: ${row.created_at}`);
      console.log('');
    }

    // Estadísticas
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_registros,
        COUNT(DISTINCT device_id) as total_dispositivos,
        COUNT(DISTINCT company_id) as total_companies,
        MIN(created_at) as primer_registro,
        MAX(created_at) as ultimo_registro
      FROM telemetry_history;
    `);

    const statsRow = stats.rows[0];
    console.log('─'.repeat(100));
    console.log('📊 Estadísticas:');
    console.log(`  Total de registros: ${statsRow.total_registros}`);
    console.log(`  Dispositivos únicos: ${statsRow.total_dispositivos}`);
    console.log(`  Companies únicas: ${statsRow.total_companies}`);
    console.log(`  Primer registro: ${statsRow.primer_registro}`);
    console.log(`  Último registro: ${statsRow.ultimo_registro}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

checkTelemetry().catch(console.error);

