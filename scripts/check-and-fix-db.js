// Verifica y corrige la estructura de la base de datos
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function checkAndFixDatabase() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log('Verificando estructura de la tabla users...');
    
    // Verificar si la columna email_verified existe
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email_verified'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('Columna email_verified no existe. Agregándola...');
      await pool.query('ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false');
      console.log('✓ Columna email_verified agregada');
    } else {
      console.log('✓ Columna email_verified ya existe');
    }
    
    // Mostrar estructura actual de la tabla
    console.log('\nEstructura actual de la tabla users:');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    structure.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAndFixDatabase();