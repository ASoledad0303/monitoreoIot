/**
 * Migración: Eliminar restricción UNIQUE de telemetry_history
 * 
 * Esta migración elimina la restricción UNIQUE(user_id, fecha) para permitir
 * múltiples registros de telemetría por día, creando un historial completo.
 * 
 * Ejecutar: node scripts/migrate-remove-telemetry-unique.js
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log('🔄 Iniciando migración: Eliminar restricción UNIQUE de telemetry_history...\n');

    // Verificar si existe la restricción
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'telemetry_history' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%user_id%fecha%'
    `);

    if (constraintCheck.rows.length > 0) {
      const constraintName = constraintCheck.rows[0].constraint_name;
      console.log(`📋 Encontrada restricción: ${constraintName}`);

      // Eliminar la restricción
      await pool.query(`ALTER TABLE telemetry_history DROP CONSTRAINT IF EXISTS ${constraintName}`);
      console.log(`✅ Restricción ${constraintName} eliminada`);
    } else {
      console.log('ℹ️  No se encontró restricción UNIQUE(user_id, fecha)');
    }

    // Verificar si hay otras restricciones UNIQUE relacionadas
    const allConstraints = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'telemetry_history' 
      AND constraint_type = 'UNIQUE'
    `);

    if (allConstraints.rows.length > 0) {
      console.log('\n⚠️  Otras restricciones UNIQUE encontradas:');
      allConstraints.rows.forEach(row => {
        console.log(`   - ${row.constraint_name}`);
      });
      console.log('\n💡 Si necesitas eliminar más restricciones, hazlo manualmente.');
    }

    console.log('\n✅ Migración completada exitosamente');
    console.log('📝 Ahora puedes insertar múltiples registros de telemetría por día');

  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

