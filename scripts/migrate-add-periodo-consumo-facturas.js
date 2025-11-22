const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Iniciando migración: agregar periodo de consumo a facturas...');
    
    // Agregar fecha_desde
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS fecha_desde DATE;
      `);
      console.log('✓ Campo fecha_desde agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo fecha_desde ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Agregar fecha_hasta
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS fecha_hasta DATE;
      `);
      console.log('✓ Campo fecha_hasta agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo fecha_hasta ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Agregar consumo_facturado_kwh
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS consumo_facturado_kwh DECIMAL(10,3);
      `);
      console.log('✓ Campo consumo_facturado_kwh agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo consumo_facturado_kwh ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Agregar consumo_medido_kwh
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS consumo_medido_kwh DECIMAL(10,3);
      `);
      console.log('✓ Campo consumo_medido_kwh agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo consumo_medido_kwh ya existe en facturas');
      } else {
        throw e;
      }
    }

    // Agregar diferencia_kwh
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS diferencia_kwh DECIMAL(10,3);
      `);
      console.log('✓ Campo diferencia_kwh agregado a facturas');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo diferencia_kwh ya existe en facturas');
      } else {
        throw e;
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

