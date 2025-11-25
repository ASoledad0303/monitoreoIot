// Worker para procesar la cola de emails en segundo plano
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

// Cargar variables de entorno
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (require('fs').existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

// Construir DATABASE_URL desde variables de entorno si no está definida
const dbUrl = process.env.DATABASE_URL || 
  (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE
    ? `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`
    : 'postgres://postgres:postgres@localhost:5432/tesis_iot_db');

// Configuración SMTP
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const mailFrom = process.env.MAIL_FROM || "no-reply@tesis-iot.local";

// Configuración del worker
const BATCH_SIZE = 10; // Procesar hasta 10 emails por ciclo
const POLL_INTERVAL = 5000; // Verificar cada 5 segundos
const MAX_RETRIES = 3; // Máximo de reintentos

// Crear pool de conexiones a PostgreSQL
const pool = new Pool({ connectionString: dbUrl });

// Crear transporter de nodemailer
let transporter = null;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000,
    socketTimeout: 10000,
    tls: {
      rejectUnauthorized: false,
    },
  });
  console.log('[email-worker] SMTP configurado:', { host: smtpHost, port: smtpPort, user: smtpUser });
} else {
  console.warn('[email-worker] SMTP no configurado. El worker no enviará emails reales.');
}

/**
 * Procesa un email de la cola
 */
async function processEmail(email) {
  const { id, to_email, subject, html, retry_count, max_retries } = email;

  // Marcar como procesando
  await pool.query(
    `UPDATE email_queue 
     SET status = 'processing', processed_at = NOW() 
     WHERE id = $1 AND status = 'pending'`,
    [id]
  );

  try {
    if (!transporter) {
      throw new Error('SMTP no configurado');
    }

    // Verificar conexión SMTP
    await transporter.verify();

    // Enviar email
    const info = await transporter.sendMail({
      from: mailFrom,
      to: to_email,
      subject,
      html,
    });

    // Marcar como enviado
    await pool.query(
      `UPDATE email_queue 
       SET status = 'sent', sent_at = NOW(), last_error = NULL 
       WHERE id = $1`,
      [id]
    );

    console.log(`[email-worker] ✓ Email ${id} enviado exitosamente a ${to_email} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const errorMessage = error.message || String(error);
    const newRetryCount = retry_count + 1;

    if (newRetryCount >= max_retries) {
      // Máximo de reintentos alcanzado, marcar como fallido
      await pool.query(
        `UPDATE email_queue 
         SET status = 'failed', last_error = $1, retry_count = $2 
         WHERE id = $3`,
        [errorMessage, newRetryCount, id]
      );
      console.error(`[email-worker] ✗ Email ${id} falló después de ${newRetryCount} intentos: ${errorMessage}`);
    } else {
      // Reintentar más tarde, volver a estado pending
      await pool.query(
        `UPDATE email_queue 
         SET status = 'pending', retry_count = $1, last_error = $2, processed_at = NULL 
         WHERE id = $3`,
        [newRetryCount, errorMessage, id]
      );
      console.warn(`[email-worker] ⚠ Email ${id} falló (intento ${newRetryCount}/${max_retries}), reintentando más tarde: ${errorMessage}`);
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Procesa un lote de emails pendientes
 */
async function processBatch() {
  try {
    // Obtener emails pendientes o fallidos que aún pueden reintentarse
    const result = await pool.query(
      `SELECT id, to_email, subject, html, retry_count, max_retries
       FROM email_queue
       WHERE status IN ('pending', 'failed')
         AND (retry_count < max_retries OR status = 'pending')
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    console.log(`[email-worker] Procesando ${result.rows.length} email(s)...`);

    // Procesar cada email
    const promises = result.rows.map(email => processEmail(email));
    const results = await Promise.allSettled(promises);

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;

    if (successCount > 0) {
      console.log(`[email-worker] ✓ ${successCount} email(s) enviado(s) exitosamente`);
    }
    if (failCount > 0) {
      console.log(`[email-worker] ✗ ${failCount} email(s) fallaron (se reintentarán más tarde)`);
    }

    return result.rows.length;
  } catch (error) {
    console.error('[email-worker] Error procesando lote:', error);
    return 0;
  }
}

/**
 * Función principal del worker
 */
async function startWorker() {
  console.log('[email-worker] Iniciando worker de emails...');
  console.log('[email-worker] Configuración:', {
    batchSize: BATCH_SIZE,
    pollInterval: POLL_INTERVAL,
    maxRetries: MAX_RETRIES,
    smtpConfigured: !!transporter,
  });

  // Verificar conexión a la base de datos
  try {
    await pool.query('SELECT 1');
    console.log('[email-worker] ✓ Conexión a PostgreSQL establecida');
  } catch (error) {
    console.error('[email-worker] ✗ Error conectando a PostgreSQL:', error.message);
    process.exit(1);
  }

  // Loop principal
  let isRunning = true;
  let processing = false;

  const processLoop = async () => {
    if (!isRunning || processing) {
      return;
    }

    processing = true;
    try {
      await processBatch();
    } catch (error) {
      console.error('[email-worker] Error en el loop de procesamiento:', error);
    } finally {
      processing = false;
    }
  };

  // Ejecutar inmediatamente la primera vez
  await processLoop();

  // Luego ejecutar cada POLL_INTERVAL ms
  const intervalId = setInterval(processLoop, POLL_INTERVAL);

  // Manejar señales de terminación
  const shutdown = async () => {
    console.log('[email-worker] Deteniendo worker...');
    isRunning = false;
    clearInterval(intervalId);
    
    // Esperar a que termine el procesamiento actual
    while (processing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await pool.end();
    console.log('[email-worker] Worker detenido');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Manejar errores no capturados
  process.on('unhandledRejection', (error) => {
    console.error('[email-worker] Unhandled rejection:', error);
  });
}

// Iniciar el worker
startWorker().catch((error) => {
  console.error('[email-worker] Error fatal:', error);
  process.exit(1);
});


