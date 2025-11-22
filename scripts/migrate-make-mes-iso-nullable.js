const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Iniciando migración: hacer mes_iso nullable en facturas...');
    
    // Hacer mes_iso nullable
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ALTER COLUMN mes_iso DROP NOT NULL;
      `);
      console.log('✓ Campo mes_iso ahora es nullable en facturas');
    } catch (e) {
      if (e.message.includes('does not exist') || e.message.includes('not found')) {
        console.log('⚠ Campo mes_iso no tiene restricción NOT NULL o no existe');
      } else {
        throw e;
      }
    }

    // También hacer potencia_facturada_kw nullable si es necesario
    // (aunque probablemente no sea necesario, pero por si acaso)
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ALTER COLUMN potencia_facturada_kw DROP NOT NULL;
      `);
      console.log('✓ Campo potencia_facturada_kw ahora es nullable en facturas');
    } catch (e) {
      if (e.message.includes('does not exist') || e.message.includes('not found')) {
        console.log('⚠ Campo potencia_facturada_kw no tiene restricción NOT NULL');
      } else {
        // No es crítico, continuar
        console.log('⚠ No se pudo modificar potencia_facturada_kw:', e.message);
      }
    }

    console.log('\n✓ Migración completada exitosamente');
  } catch (e) {
    console.error('✗ Error en la migración:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

