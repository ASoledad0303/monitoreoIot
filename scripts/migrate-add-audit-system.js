/**
 * Script de migración para agregar el sistema de auditoría a la base de datos
 * 
 * Ejecutar con: npm run migrate:audit
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log('📋 Iniciando migración del sistema de auditoría...\n');

    // Leer el archivo SQL
    const sqlPath = path.join(__dirname, 'migrate-add-audit-system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Ejecutar el script SQL completo
    console.log('⚙️  Ejecutando script SQL...');
    await pool.query(sql);

    console.log('✅ Sistema de auditoría instalado correctamente\n');

    // Verificar que los triggers se crearon correctamente
    const triggersResult = await pool.query(`
      SELECT trigger_name, event_object_table 
      FROM information_schema.triggers 
      WHERE trigger_name LIKE 'audit_%_trigger'
      ORDER BY event_object_table;
    `);

    console.log('📊 Triggers de auditoría creados:');
    triggersResult.rows.forEach(row => {
      console.log(`   ✓ ${row.trigger_name} en tabla ${row.event_object_table}`);
    });

    // Verificar que la tabla audit_log existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'audit_log'
      );
    `);

    if (tableExists.rows[0].exists) {
      console.log('\n✅ Tabla audit_log creada correctamente');
    }

    // Mostrar estadísticas iniciales
    const countResult = await pool.query('SELECT COUNT(*) as count FROM audit_log');
    console.log(`\n📈 Registros de auditoría actuales: ${countResult.rows[0].count}`);

    console.log('\n✨ Migración completada exitosamente!');
    console.log('\n💡 Próximos pasos:');
    console.log('   1. Configura la aplicación para usar set_audit_user() antes de cambios');
    console.log('   2. Consulta los registros con las vistas: v_audit_by_user, v_audit_by_device, v_audit_configurations');
    console.log('   3. Revisa la documentación en el archivo SQL para ejemplos de uso\n');

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

