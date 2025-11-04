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
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Agregar campo role si no existe (para bases de datos existentes)
  try {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL, -- 'verify' | 'reset' | '2fa'
      code VARCHAR(12) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Tabla de alertas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      tipo VARCHAR(50) NOT NULL, -- 'Alta tensión' | 'Baja tensión' | 'Alto consumo'
      mensaje TEXT NOT NULL,
      valor VARCHAR(50),
      dispositivo VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Tabla de historial de telemetría (para reportes)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telemetry_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      voltaje DECIMAL(10,2),
      corriente DECIMAL(10,2),
      potencia DECIMAL(10,2),
      energia_acumulada DECIMAL(10,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, fecha)
    );
  `);

  // Tabla de facturas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facturas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mes_iso VARCHAR(7) NOT NULL, -- YYYY-MM
      potencia_facturada_kw DECIMAL(10,2) NOT NULL,
      potencia_media_medida_kw DECIMAL(10,2),
      diferencia_kw DECIMAL(10,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, mes_iso)
    );
  `);

  // Tabla de companies (opcional, para multi-tenant)
  const companyEnabled = process.env.COMPANY_ENABLED === 'true';
  if (companyEnabled) {
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
    console.log('Tabla companies creada.');

    // Agregar company_id a users si está habilitado
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
      `);
    } catch (e) {
      // Ignorar si ya existe
    }
  }

  // Tabla de umbrales (NULL user_id = umbrales globales)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS umbrales (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NULL, -- NULL = global
      voltaje_min DECIMAL(10,2) DEFAULT 200,
      voltaje_max DECIMAL(10,2) DEFAULT 250,
      potencia_max DECIMAL(10,2) DEFAULT 5000,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id) -- Un registro por usuario (o NULL para global)
    );
  `);
  
  // Agregar company_id a umbrales si está habilitado
  if (companyEnabled) {
    try {
      await pool.query(`
        ALTER TABLE umbrales 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
      `);
    } catch (e) {
      // Ignorar si ya existe
    }
  }

  // Crear índices para mejor rendimiento
  console.log('Creando índices...');
  
  // Índices para user_tokens
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_tokens_user_type_expires 
      ON user_tokens(user_id, type, expires_at, used);
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  // Índices para alerts
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_user_fecha 
      ON alerts(user_id, fecha);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_fecha 
      ON alerts(fecha);
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  // Índices para telemetry_history
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_user_fecha 
      ON telemetry_history(user_id, fecha);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_fecha 
      ON telemetry_history(fecha);
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  // Índices para facturas
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_facturas_user_mes 
      ON facturas(user_id, mes_iso);
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  console.log('Tablas e índices verificados/creados.');
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