// Script de migración para agregar el campo 'role' a usuarios existentes
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function migrate() {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    console.log('Iniciando migración: agregar campo role...');

    // Agregar columna role si no existe
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
    `);

    console.log('✓ Columna role agregada (o ya existía)');

    // Actualizar usuarios sin role a 'user'
    const result = await pool.query(`
      UPDATE users 
      SET role = 'user' 
      WHERE role IS NULL OR role = '';
    `);

    console.log(`✓ ${result.rowCount} usuarios actualizados con role 'user'`);

    // Verificar usuarios existentes
    const users = await pool.query('SELECT id, email, role FROM users LIMIT 10');
    console.log('\nEjemplo de usuarios:');
    users.rows.forEach(u => {
      console.log(`  - ${u.email}: ${u.role}`);
    });

    console.log('\nMigración completada exitosamente.');
  } catch (error) {
    console.error('Error en migración:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

(async () => {
  await migrate();
  process.exit(0);
})();

