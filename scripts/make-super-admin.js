// Script para convertir un usuario en super administrador
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

// Obtener email del argumento de línea de comandos o usar el email por defecto
const email = process.argv[2] || 'auroragimenez438@gmail.com';

async function makeSuperAdmin() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    console.log(`Buscando usuario con email: ${email}...`);
    
    // Verificar que el usuario existe
    const userCheck = await pool.query(
      `SELECT u.id, u.name, u.email, r.name as role 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.email = $1`,
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

    if (user.role === 'super_admin') {
      console.log('✓ El usuario ya es super administrador.');
      process.exit(0);
    }

    // Obtener el role_id de super_admin
    const superAdminRole = await pool.query(
      'SELECT id FROM roles WHERE name = $1',
      ['super_admin']
    );

    if (superAdminRole.rows.length === 0) {
      console.error('❌ Error: Rol super_admin no encontrado en la base de datos');
      process.exit(1);
    }

    const superAdminRoleId = superAdminRole.rows[0].id;

    // Actualizar role_id a super_admin
    await pool.query(
      'UPDATE users SET role_id = $1 WHERE id = $2',
      [superAdminRoleId, user.id]
    );

    console.log('✓ Usuario convertido a super administrador exitosamente.');
    console.log('\nEl usuario ahora puede:');
    console.log('  - Controlar todas las companies');
    console.log('  - Crear, editar y eliminar companies');
    console.log('  - Asignar roles admin y super_admin');
    console.log('  - Ver todos los usuarios y dispositivos del sistema');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

makeSuperAdmin();

