// Crea un usuario de prueba con email verificado
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

async function createTestUser() {
  const pool = new Pool({ connectionString: dbUrl });
  
  try {
    // Datos del usuario de prueba
    const testUser = {
      name: 'Usuario de Prueba',
      email: 'test@example.com',
      password: '123456'
    };

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(testUser.password, 10);

    // Verificar si el usuario ya existe
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [testUser.email]);
    
    if (existingUser.rows.length > 0) {
      console.log(`Usuario ${testUser.email} ya existe.`);
      return;
    }

    // Insertar usuario con email verificado
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, email_verified, created_at) 
       VALUES ($1, $2, $3, true, NOW()) 
       RETURNING id, name, email`,
      [testUser.name, testUser.email, passwordHash]
    );

    console.log('Usuario de prueba creado exitosamente:');
    console.log(`ID: ${result.rows[0].id}`);
    console.log(`Nombre: ${result.rows[0].name}`);
    console.log(`Email: ${result.rows[0].email}`);
    console.log(`Contraseña: ${testUser.password}`);
    console.log('Email verificado: ✓');
    
  } catch (error) {
    console.error('Error creando usuario de prueba:', error.message);
  } finally {
    await pool.end();
  }
}

createTestUser();