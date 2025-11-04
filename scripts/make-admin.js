// Script para convertir un usuario en administrador
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

// Obtener email del argumento de línea de comandos
const email = process.argv[2];

if (!email) {
  console.error('Uso: node scripts/make-admin.js <email>');
  console.error('Ejemplo: node scripts/make-admin.js usuario@example.com');
  process.exit(1);
}

async function makeAdmin() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log(`Buscando usuario con email: ${email}...`);
    
    // Verificar que el usuario existe
    const userCheck = await pool.query(
      'SELECT id, name, email, role FROM users WHERE email = $1',
      [email]
    );

    if (userCheck.rows.length === 0) {
      console.error(`❌ No se encontró ningún usuario con email: ${email}`);
      process.exit(1);
    }

    const user = userCheck.rows[0];
    console.log(`Usuario encontrado:`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Nombre: ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Rol actual: ${user.role}`);

    if (user.role === 'admin') {
      console.log('✓ El usuario ya es administrador.');
      process.exit(0);
    }

    // Actualizar rol a admin
    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      ['admin', user.id]
    );

    console.log('✓ Usuario convertido a administrador exitosamente.');
    console.log('\nEl usuario ahora puede:');
    console.log('  - Acceder a /admin/usuarios');
    console.log('  - Acceder a /admin/companies');
    console.log('  - Ver las opciones de administración en el menú');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

makeAdmin();

