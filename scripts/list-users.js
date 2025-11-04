// Script para listar todos los usuarios
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function listUsers() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, email_verified, created_at FROM users ORDER BY created_at DESC'
    );

    if (result.rows.length === 0) {
      console.log('No hay usuarios en la base de datos.');
      return;
    }

    console.log(`\nTotal de usuarios: ${result.rows.length}\n`);
    console.log('ID | Nombre | Email | Rol | Verificado | Creado');
    console.log('-'.repeat(80));
    
    result.rows.forEach(user => {
      const verified = user.email_verified ? '✓' : '✗';
      const created = new Date(user.created_at).toLocaleDateString('es-ES');
      console.log(
        `${user.id} | ${user.name.padEnd(20)} | ${user.email.padEnd(30)} | ${user.role.padEnd(5)} | ${verified} | ${created}`
      );
    });

    console.log('\nPara convertir un usuario en admin, ejecuta:');
    console.log('  npm run make-admin <email>');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

listUsers();

