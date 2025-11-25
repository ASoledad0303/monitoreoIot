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

// Rate limiting: tiempo mínimo entre mensajes (en segundos)
const MIN_INTERVAL_BETWEEN_MESSAGES = parseInt(process.env.TELEGRAM_MIN_INTERVAL || '30', 10);

if (!TELEGRAM_BOT_TOKEN) {
  console.error('[Telegram Bot] ERROR: TELEGRAM_BOT_TOKEN no está configurado');
  process.exit(1);
}

if (!TELEGRAM_CHAT_ID) {
  console.error('[Telegram Bot] ERROR: TELEGRAM_CHAT_ID no está configurado');
  process.exit(1);
}

// Control de rate limiting
let lastMessageTime = 0;
let pendingAlerts = [];

/**
 * Envía un mensaje a Telegram (sin HTML, solo texto plano)
 */
function sendTelegramMessage(text) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      // Sin parse_mode para texto plano
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
 * Formatea el mensaje de alerta para Telegram (sin HTML, solo texto plano)
 */
function formatAlertMessage(alert) {
  const emoji = {
    'Alta tensión': '⚠️',
    'Baja tensión': '🔻',
    'Alto consumo': '⚡',
    'Corriente elevada': '🔌',
  };

  const tipoEmoji = emoji[alert.tipo] || '🔔';
  
  // Formato del mensaje sin HTML, solo texto plano
  let mensaje = `${tipoEmoji} Ocurrió un evento\n\n`;
  
  // Formato específico según el tipo de alerta
  if (alert.tipo === 'Alta tensión' || alert.tipo === 'Baja tensión') {
    mensaje += `${alert.tipo}: ${alert.valor || 'N/A'}\n`;
  } else if (alert.tipo === 'Corriente elevada') {
    mensaje += `Corriente elevada: ${alert.valor || 'N/A'}\n`;
  } else {
    mensaje += `${alert.tipo}: ${alert.valor || 'N/A'}\n`;
  }
  
  if (alert.dispositivo) {
    mensaje += `\n📱 Dispositivo: ${alert.dispositivo}`;
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
 * Procesa alertas pendientes con rate limiting
 */
async function processAlerts() {
  try {
    // Obtener alertas que no han sido enviadas a Telegram
    const result = await pool.query(`
      SELECT id, tipo, mensaje, valor, dispositivo, created_at
      FROM alerts
      WHERE telegram_sent = false OR telegram_sent IS NULL
      ORDER BY created_at ASC
      LIMIT 50
    `);

    if (result.rows.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastMessage = (now - lastMessageTime) / 1000; // en segundos

    // Si no ha pasado el tiempo mínimo desde el último mensaje, esperar
    if (timeSinceLastMessage < MIN_INTERVAL_BETWEEN_MESSAGES) {
      const waitTime = Math.ceil(MIN_INTERVAL_BETWEEN_MESSAGES - timeSinceLastMessage);
      console.log(`[Telegram Bot] ⏳ Rate limit: esperando ${waitTime} segundo(s) antes del próximo envío...`);
      return;
    }

    // Procesar solo la primera alerta para respetar el rate limit
    const alert = result.rows[0];
    
    try {
      const message = formatAlertMessage(alert);
      await sendTelegramMessage(message);
      
      // Actualizar tiempo del último mensaje
      lastMessageTime = Date.now();
      
      // Marcar como enviada
      await pool.query(
        'UPDATE alerts SET telegram_sent = true WHERE id = $1',
        [alert.id]
      );
      
      console.log(`[Telegram Bot] ✅ Alerta ${alert.id} enviada: ${alert.tipo}`);
      
      // Si hay más alertas pendientes, informar
      if (result.rows.length > 1) {
        console.log(`[Telegram Bot] 📋 ${result.rows.length - 1} alerta(s) pendiente(s) - se procesarán en ${MIN_INTERVAL_BETWEEN_MESSAGES}s`);
      }
    } catch (error) {
      console.error(`[Telegram Bot] ❌ Error enviando alerta ${alert.id}:`, error.message);
      // No marcar como enviada si falló, para reintentar después
      // Pero actualizar el tiempo para evitar spam de errores
      lastMessageTime = Date.now();
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
  console.log(`[Telegram Bot] Intervalo mínimo entre mensajes: ${MIN_INTERVAL_BETWEEN_MESSAGES} segundos`);
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

