// Migración para agregar soporte de companies
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Iniciando migración: agregar soporte de companies...');
    
    // Crear tabla companies
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50) UNIQUE,
        email VARCHAR(160),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Tabla companies creada');

    // Agregar campo company_id a users si no existe
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
      `);
      console.log('✓ Campo company_id agregado a users');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo company_id ya existe');
      } else {
        throw e;
      }
    }

    // Crear índice para mejor rendimiento
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_company_id 
        ON users(company_id);
      `);
      console.log('✓ Índice creado en users.company_id');
    } catch (e) {
      // Ignorar si ya existe
    }

    // Agregar company_id a otras tablas relacionadas si es necesario
    // Tabla de umbrales
    try {
      await pool.query(`
        ALTER TABLE umbrales 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
      `);
      console.log('✓ Campo company_id agregado a umbrales');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('✓ Campo company_id ya existe en umbrales');
      }
    }

    // Crear índice para umbrales por company
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_umbrales_company_id 
        ON umbrales(company_id);
      `);
      console.log('✓ Índice creado en umbrales.company_id');
    } catch (e) {
      // Ignorar
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

