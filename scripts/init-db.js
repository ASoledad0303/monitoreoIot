// Inicializa la base de datos y crea la tabla de usuarios
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db';

function toPostgresDb(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:${u.password}@${u.hostname}:${u.port || 5432}/postgres`;
  } catch {
    return 'postgres://postgres:postgres@localhost:5432/postgres';
  }
}

async function ensureDatabase() {
  const adminPool = new Pool({ connectionString: toPostgresDb(dbUrl) });
  const target = new URL(dbUrl);
  const dbName = target.pathname.replace('/', '') || 'tesis_iot_db';

  const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    console.log(`Creando base de datos '${dbName}'...`);
    await adminPool.query(`CREATE DATABASE ${dbName}`);
  } else {
    console.log(`Base de datos '${dbName}' ya existe.`);
  }
  await adminPool.end();
}

async function createTables() {
  const pool = new Pool({ connectionString: dbUrl });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL, -- 'verify' | 'reset'
      code VARCHAR(12) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Tablas verificadas/creadas.');
  await pool.end();
}

(async () => {
  try {
    await ensureDatabase();
    await createTables();
    console.log('Inicialización completada.');
    process.exit(0);
  } catch (e) {
    console.error('Error inicializando DB:', e?.message || e);
    process.exit(1);
  }
})();