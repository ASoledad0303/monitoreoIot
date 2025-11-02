// Verifica y corrige la estructura de la base de datos
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function checkAndFixDatabase() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Verificando estructura de la base de datos...\n');
    
    // Verificar tabla users
    console.log('=== Tabla: users ===');
    const usersCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'users'
    `);
    
    if (usersCheck.rows.length === 0) {
      console.log('⚠ Tabla users no existe. Ejecuta npm run init:db primero.');
      return;
    }
    
    // Verificar columna email_verified
    const emailVerifiedCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email_verified'
    `);
    
    if (emailVerifiedCheck.rows.length === 0) {
      console.log('Columna email_verified no existe. Agregándola...');
      await pool.query('ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false');
      console.log('✓ Columna email_verified agregada');
    } else {
      console.log('✓ Columna email_verified ya existe');
    }
    
    // Verificar columna role
    const roleCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'role'
    `);
    
    if (roleCheck.rows.length === 0) {
      console.log('Columna role no existe. Agregándola...');
      await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'`);
      console.log('✓ Columna role agregada');
    } else {
      console.log('✓ Columna role ya existe');
    }
    
    // Mostrar estructura actual de la tabla users
    console.log('\nEstructura actual de la tabla users:');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    structure.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });
    
    // Verificar tabla user_tokens
    console.log('\n=== Tabla: user_tokens ===');
    const tokensCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'user_tokens'
    `);
    
    if (tokensCheck.rows.length === 0) {
      console.log('⚠ Tabla user_tokens no existe. Ejecuta npm run init:db primero.');
      return;
    } else {
      console.log('✓ Tabla user_tokens existe');
    }
    
    // Mostrar estructura de user_tokens
    console.log('\nEstructura actual de la tabla user_tokens:');
    const tokensStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'user_tokens'
      ORDER BY ordinal_position
    `);
    
    tokensStructure.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });
    
    // Mostrar tipos de tokens existentes
    const tokenTypes = await pool.query(`
      SELECT DISTINCT type, COUNT(*) as count
      FROM user_tokens
      GROUP BY type
      ORDER BY type
    `);
    
    if (tokenTypes.rows.length > 0) {
      console.log('\nTipos de tokens en uso:');
      tokenTypes.rows.forEach(row => {
        console.log(`  - ${row.type}: ${row.count} tokens`);
      });
    }

    // Verificar tabla alerts
    console.log('\n=== Tabla: alerts ===');
    const alertsCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'alerts'
    `);
    
    if (alertsCheck.rows.length === 0) {
      console.log('⚠ Tabla alerts no existe. Ejecuta npm run init:db primero.');
    } else {
      console.log('✓ Tabla alerts existe');
      const alertsCount = await pool.query('SELECT COUNT(*) as count FROM alerts');
      console.log(`  Registros: ${alertsCount.rows[0].count}`);
    }

    // Verificar tabla telemetry_history
    console.log('\n=== Tabla: telemetry_history ===');
    const telemetryCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'telemetry_history'
    `);
    
    if (telemetryCheck.rows.length === 0) {
      console.log('⚠ Tabla telemetry_history no existe. Ejecuta npm run init:db primero.');
    } else {
      console.log('✓ Tabla telemetry_history existe');
      const telemetryCount = await pool.query('SELECT COUNT(*) as count FROM telemetry_history');
      console.log(`  Registros: ${telemetryCount.rows[0].count}`);
    }

    // Verificar tabla facturas
    console.log('\n=== Tabla: facturas ===');
    const facturasCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'facturas'
    `);
    
    if (facturasCheck.rows.length === 0) {
      console.log('⚠ Tabla facturas no existe. Ejecuta npm run init:db primero.');
    } else {
      console.log('✓ Tabla facturas existe');
      const facturasCount = await pool.query('SELECT COUNT(*) as count FROM facturas');
      console.log(`  Registros: ${facturasCount.rows[0].count}`);
    }

    // Verificar tabla umbrales
    console.log('\n=== Tabla: umbrales ===');
    const umbralesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'umbrales'
    `);
    
    if (umbralesCheck.rows.length === 0) {
      console.log('⚠ Tabla umbrales no existe. Ejecuta npm run init:db primero.');
    } else {
      console.log('✓ Tabla umbrales existe');
      const umbralesCount = await pool.query('SELECT COUNT(*) as count FROM umbrales');
      console.log(`  Registros: ${umbralesCount.rows[0].count}`);
    }

    // Verificar índices
    console.log('\n=== Índices ===');
    const indexes = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);
    
    if (indexes.rows.length > 0) {
      console.log('Índices creados:');
      indexes.rows.forEach(row => {
        console.log(`  - ${row.indexname} en ${row.tablename}`);
      });
    } else {
      console.log('⚠ No se encontraron índices. Ejecuta npm run init:db para crearlos.');
    }
    
    console.log('\n✓ Verificación completada');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAndFixDatabase();