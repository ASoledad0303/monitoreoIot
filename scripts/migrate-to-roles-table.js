/**
 * Script de migración para crear tabla roles y asociar usuarios a roles
 * Migra de role VARCHAR a role_id INTEGER
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

    console.log('1. Creando tabla roles...');
    
    // Crear tabla roles
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✓ Tabla roles creada');

    // Insertar roles por defecto si no existen
    console.log('2. Insertando roles por defecto...');
    
    const roles = [
      { name: 'user', description: 'Usuario regular del sistema' },
      { name: 'admin', description: 'Administrador de company' },
      { name: 'super_admin', description: 'Super Administrador del sistema' }
    ];

    for (const role of roles) {
      await client.query(`
        INSERT INTO roles (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING;
      `, [role.name, role.description]);
    }

    console.log('✓ Roles por defecto insertados');

    // Obtener IDs de roles
    const roleIds = await client.query('SELECT id, name FROM roles');
    const roleMap = {};
    roleIds.rows.forEach(r => {
      roleMap[r.name] = r.id;
    });

    console.log('3. Agregando columna role_id a users...');
    
    // Agregar columna role_id
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
    `);

    console.log('✓ Columna role_id agregada');

    // Migrar datos existentes
    console.log('4. Migrando datos de role a role_id...');
    
    for (const [roleName, roleId] of Object.entries(roleMap)) {
      const result = await client.query(`
        UPDATE users 
        SET role_id = $1 
        WHERE role = $2 AND role_id IS NULL;
      `, [roleId, roleName]);
      
      console.log(`  - ${result.rowCount} usuarios migrados de '${roleName}' a role_id ${roleId}`);
    }

    // Asignar role_id por defecto (user) a usuarios sin role_id
    const defaultResult = await client.query(`
      UPDATE users 
      SET role_id = $1 
      WHERE role_id IS NULL;
    `, [roleMap['user']]);
    
    if (defaultResult.rowCount > 0) {
      console.log(`  - ${defaultResult.rowCount} usuarios sin role asignados a 'user' por defecto`);
    }

    // Hacer role_id NOT NULL después de migrar todos los datos
    console.log('5. Estableciendo role_id como NOT NULL...');
    
    // Primero establecer valor por defecto (usar interpolación directa, no parámetros)
    await client.query(`
      ALTER TABLE users 
      ALTER COLUMN role_id SET DEFAULT ${roleMap['user']};
    `);

    // Luego hacer NOT NULL
    await client.query(`
      ALTER TABLE users 
      ALTER COLUMN role_id SET NOT NULL;
    `);

    console.log('✓ role_id establecido como NOT NULL con valor por defecto');

    // Eliminar columna role antigua
    console.log('6. Eliminando columna role antigua...');
    
    await client.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS role;
    `);

    console.log('✓ Columna role eliminada');

    // Crear índice para mejor rendimiento
    console.log('7. Creando índices...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_role_id 
      ON users(role_id);
    `);

    console.log('✓ Índice creado');

    await client.query('COMMIT');
    console.log('\n✓ Migración completada exitosamente');
    
    // Mostrar resumen
    const summary = await client.query(`
      SELECT r.name, COUNT(u.id) as user_count
      FROM roles r
      LEFT JOIN users u ON u.role_id = r.id
      GROUP BY r.id, r.name
      ORDER BY r.id;
    `);
    
    console.log('\nResumen de roles:');
    summary.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.user_count} usuarios`);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateRoles();

