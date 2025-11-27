// Inicializa la base de datos y crea la tabla de usuarios
const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Intentar cargar .env.local si existe, sino usar solo variables de entorno
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

// Construir DATABASE_URL desde variables de entorno si no está definida
const dbUrl = process.env.DATABASE_URL || 
  (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE
    ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`
    : 'postgres://postgres:postgres@localhost:5432/tesis_iot_db');

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
  
  // Crear tabla roles primero
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Insertar roles por defecto si no existen
  await pool.query(`
    INSERT INTO roles (name, description)
    VALUES 
      ('user', 'Usuario regular del sistema'),
      ('admin', 'Administrador de company'),
      ('super_admin', 'Super Administrador del sistema')
    ON CONFLICT (name) DO NOTHING;
  `);

  // Obtener el role_id por defecto (user)
  const defaultRole = await pool.query('SELECT id FROM roles WHERE name = $1', ['user']);
  const defaultRoleId = defaultRole.rows[0]?.id || 1;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      role_id INTEGER NOT NULL DEFAULT $1 REFERENCES roles(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `, [defaultRoleId]);

  // Agregar campo role_id si no existe (para bases de datos existentes)
  try {
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
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

  // Tabla de cola de emails
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id SERIAL PRIMARY KEY,
      to_email VARCHAR(160) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      html TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'sent' | 'failed'
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      processed_at TIMESTAMP,
      sent_at TIMESTAMP
    );
  `);

  // Índices para la cola de emails
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_queue_status_created 
      ON email_queue(status, created_at);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_queue_retry 
      ON email_queue(status, retry_count, created_at) 
      WHERE status IN ('pending', 'failed');
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

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
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
      telegram_sent BOOLEAN DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Agregar campos opcionales si no existen (para migración)
  try {
    await pool.query(`
      ALTER TABLE alerts 
      ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
    `);
  } catch (e) {
    // Ignorar si ya existe o si companies no existe
  }

  try {
    await pool.query(`
      ALTER TABLE alerts 
      ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE;
    `);
  } catch (e) {
    // Ignorar si ya existe o si devices no existe
  }

  try {
    await pool.query(`
      ALTER TABLE alerts 
      ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN DEFAULT false;
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

  // Crear índice para mejorar rendimiento de consultas
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_telegram_sent 
      ON alerts(telegram_sent) 
      WHERE telegram_sent = false;
    `);
  } catch (e) {
    // Ignorar si ya existe
  }

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

  // Agregar company_id y device_id a facturas si está habilitado
  if (companyEnabled) {
    try {
      await pool.query(`
        ALTER TABLE facturas 
        ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
      `);
      
      // Eliminar constraint UNIQUE antiguo si existe
      try {
        await pool.query(`
          ALTER TABLE facturas 
          DROP CONSTRAINT IF EXISTS facturas_user_id_mes_iso_key;
        `);
      } catch (e) {
        // Ignorar
      }
      
      // Crear nuevo índice único que incluya company_id y device_id
      try {
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS facturas_user_mes_company_device_unique 
          ON facturas(user_id, mes_iso, COALESCE(company_id, 0), COALESCE(device_id, 0));
        `);
      } catch (e) {
        // Ignorar si ya existe
      }
      
      // Crear índices para mejor rendimiento
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_facturas_company_device 
          ON facturas(company_id, device_id, mes_iso);
        `);
      } catch (e) {
        // Ignorar
      }
      
      console.log('Campos company_id y device_id agregados a facturas.');
    } catch (e) {
      // Ignorar si ya existe
    }
  }

  // Tabla de companies (opcional, para multi-tenant)
  // companyEnabled ya está definido arriba
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

      // Crear tabla de devices si está habilitado
      await pool.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          name VARCHAR(200) NOT NULL,
          code VARCHAR(50) NOT NULL,
          description TEXT,
          api_key VARCHAR(64) UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(company_id, code)
        );
      `);
      console.log('Tabla devices creada.');

      // Crear índice para búsquedas rápidas por API key
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key);
      `);

      // Agregar company_id y device_id a telemetry_history si está habilitado
      try {
        await pool.query(`
          ALTER TABLE telemetry_history 
          ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
        `);
      } catch (e) {
        // Ignorar si ya existe
      }

      // Agregar company_id y device_id a alerts si está habilitado
      try {
        await pool.query(`
          ALTER TABLE alerts 
          ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
        `);
      } catch (e) {
        // Ignorar si ya existe
      }

      // Crear índices para devices y filtrado
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_devices_company 
          ON devices(company_id);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_telemetry_company_device 
          ON telemetry_history(company_id, device_id, fecha);
        `);
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_alerts_company_device 
          ON alerts(company_id, device_id, fecha);
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