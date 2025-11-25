#!/usr/bin/env node

/**
 * Bot de Telegram para enviar alertas del sistema IoT
 * 
 * Este script monitorea la tabla de alertas y envía notificaciones
 * a Telegram cuando se detectan nuevas alertas.
 * 
 * Variables de entorno requeridas:
 * - TELEGRAM_BOT_TOKEN: Token del bot de Telegram
 * - TELEGRAM_CHAT_ID: ID del chat donde enviar los mensajes
 * - PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD: Configuración de PostgreSQL
 */

const { Pool } = require('pg');
const https = require('https');

// Configuración de PostgreSQL desde variables de entorno
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'tesis_iot_db',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
});

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[Telegram Bot] ERROR: TELEGRAM_BOT_TOKEN no está configurado');
  process.exit(1);
}

if (!TELEGRAM_CHAT_ID) {
  console.error('[Telegram Bot] ERROR: TELEGRAM_CHAT_ID no está configurado');
  process.exit(1);
}

/**
 * Envía un mensaje a Telegram
 */
function sendTelegramMessage(text) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(responseData);
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(`Telegram API error: ${response.description}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Formatea el mensaje de alerta para Telegram
 */
function formatAlertMessage(alert) {
  const emoji = {
    'Alta tensión': '⚠️',
    'Baja tensión': '🔻',
    'Alto consumo': '⚡',
    'Corriente elevada': '🔌',
  };

  const tipoEmoji = emoji[alert.tipo] || '🔔';
  
  // Formato del mensaje según el ejemplo del usuario
  let mensaje = `${tipoEmoji} <b>Ocurrió un evento</b>\n\n`;
  
  // Formato específico según el tipo de alerta
  if (alert.tipo === 'Alta tensión' || alert.tipo === 'Baja tensión') {
    mensaje += `<b>${alert.tipo}:</b> ${alert.valor || 'N/A'}\n`;
  } else if (alert.tipo === 'Corriente elevada') {
    mensaje += `<b>Corriente elevada:</b> ${alert.valor || 'N/A'}\n`;
  } else {
    mensaje += `<b>${alert.tipo}:</b> ${alert.valor || 'N/A'}\n`;
  }
  
  if (alert.dispositivo) {
    mensaje += `\n📱 <b>Dispositivo:</b> ${alert.dispositivo}`;
  }
  
  if (alert.mensaje && alert.mensaje !== alert.valor) {
    mensaje += `\n\n${alert.mensaje}`;
  }
  
  const fecha = new Date(alert.created_at).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  mensaje += `\n\n🕐 ${fecha}`;

  return mensaje;
}

/**
 * Procesa alertas pendientes
 */
async function processAlerts() {
  try {
    // Obtener alertas que no han sido enviadas a Telegram
    const result = await pool.query(`
      SELECT id, tipo, mensaje, valor, dispositivo, created_at
      FROM alerts
      WHERE telegram_sent = false OR telegram_sent IS NULL
      ORDER BY created_at ASC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      return;
    }

    console.log(`[Telegram Bot] Procesando ${result.rows.length} alerta(s)...`);

    for (const alert of result.rows) {
      try {
        const message = formatAlertMessage(alert);
        await sendTelegramMessage(message);
        
        // Marcar como enviada
        await pool.query(
          'UPDATE alerts SET telegram_sent = true WHERE id = $1',
          [alert.id]
        );
        
        console.log(`[Telegram Bot] ✅ Alerta ${alert.id} enviada: ${alert.tipo}`);
      } catch (error) {
        console.error(`[Telegram Bot] ❌ Error enviando alerta ${alert.id}:`, error.message);
        // No marcar como enviada si falló, para reintentar después
      }
    }
  } catch (error) {
    console.error('[Telegram Bot] Error procesando alertas:', error);
  }
}

/**
 * Verifica la conexión a la base de datos
 */
async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
    console.log('[Telegram Bot] ✅ Conexión a PostgreSQL establecida');
    return true;
  } catch (error) {
    console.error('[Telegram Bot] ❌ Error conectando a PostgreSQL:', error.message);
    return false;
  }
}

/**
 * Verifica la conexión a Telegram
 */
async function checkTelegramConnection() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    const response = await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });

    if (response.ok) {
      console.log(`[Telegram Bot] ✅ Bot conectado: @${response.result.username}`);
      return true;
    } else {
      console.error('[Telegram Bot] ❌ Error verificando bot:', response.description);
      return false;
    }
  } catch (error) {
    console.error('[Telegram Bot] ❌ Error verificando conexión a Telegram:', error.message);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('[Telegram Bot] Iniciando bot de Telegram...');
  console.log(`[Telegram Bot] Chat ID: ${TELEGRAM_CHAT_ID}`);

  // Verificar conexiones
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.error('[Telegram Bot] No se pudo conectar a la base de datos. Saliendo...');
    process.exit(1);
  }

  const telegramOk = await checkTelegramConnection();
  if (!telegramOk) {
    console.error('[Telegram Bot] No se pudo conectar a Telegram. Saliendo...');
    process.exit(1);
  }

  console.log('[Telegram Bot] ✅ Bot iniciado correctamente');
  console.log('[Telegram Bot] Monitoreando alertas cada 5 segundos...\n');

  // Procesar alertas inmediatamente
  await processAlerts();

  // Procesar alertas cada 5 segundos
  setInterval(async () => {
    await processAlerts();
  }, 5000);
}

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('[Telegram Bot] Error no manejado:', error);
});

process.on('SIGINT', () => {
  console.log('\n[Telegram Bot] Deteniendo bot...');
  pool.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Telegram Bot] Deteniendo bot...');
  pool.end();
  process.exit(0);
});

// Iniciar
main().catch((error) => {
  console.error('[Telegram Bot] Error fatal:', error);
  process.exit(1);
});

