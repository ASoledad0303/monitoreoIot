/**
 * Script de migración para actualizar roles
 * Convierte el primer admin existente a super_admin
 * Si no hay admins, no hace nada
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateRoles() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Verificar si ya existe algún super_admin
    const superAdminCheck = await client.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'"
    );
    
    const hasSuperAdmin = parseInt(superAdminCheck.rows[0].count) > 0;

    if (!hasSuperAdmin) {
      // Buscar el primer admin (por fecha de creación)
      const firstAdmin = await client.query(
        "SELECT id, email, name FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1"
      );

      if (firstAdmin.rows.length > 0) {
        const admin = firstAdmin.rows[0];
        console.log(`Convirtiendo admin ${admin.email} (${admin.name}) a super_admin...`);
        
        await client.query(
          "UPDATE users SET role = 'super_admin' WHERE id = $1",
          [admin.id]
        );
        
        console.log('✓ Migración completada: El primer admin ahora es super_admin');
      } else {
        console.log('⚠ No hay admins para convertir. El primer usuario que se registre será super_admin.');
      }
    } else {
      console.log('✓ Ya existe un super_admin. No se realizan cambios.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en la migración:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateRoles();


