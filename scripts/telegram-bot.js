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

const { Pool } = require("pg");
const https = require("https");

// Configuración de PostgreSQL desde variables de entorno
const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: parseInt(process.env.PGPORT || "5432", 10),
  database: process.env.PGDATABASE || "tesis_iot_db",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
});

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Rate limiting: tiempo mínimo entre mensajes (en segundos)
const MIN_INTERVAL_BETWEEN_MESSAGES = parseInt(
  process.env.TELEGRAM_MIN_INTERVAL || "30",
  10
);

if (!TELEGRAM_BOT_TOKEN) {
  console.error("[Telegram Bot] ERROR: TELEGRAM_BOT_TOKEN no está configurado");
  process.exit(1);
}

if (!TELEGRAM_CHAT_ID) {
  console.error("[Telegram Bot] ERROR: TELEGRAM_CHAT_ID no está configurado");
  process.exit(1);
}

// Control de rate limiting
let lastMessageTime = 0;
let pendingAlerts = [];

/**
 * Envía un mensaje a Telegram (sin HTML, solo texto plano)
 */
function sendTelegramMessage(text) {
  // Validar que el texto no esté vacío
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return Promise.reject(new Error("El mensaje está vacío"));
  }

  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text.trim(),
      // Sin parse_mode para texto plano
    });

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = https.request(url, options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
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

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

/**
 * Genera un mensaje automático basado en el tipo y valor de la alerta
 */
function generateAutoMessage(tipo, valor) {
  if (!tipo) {
    return null;
  }

  const tipoTexto = tipo.trim();
  const valorTexto = valor ? String(valor).trim() : "N/A";

  // Generar mensaje automático según el tipo
  if (tipoTexto === "Alta tensión") {
    return `Voltaje excede el umbral máximo. Valor actual: ${valorTexto}`;
  } else if (tipoTexto === "Baja tensión") {
    return `Voltaje está por debajo del umbral mínimo. Valor actual: ${valorTexto}`;
  } else if (tipoTexto === "Alto consumo") {
    return `Potencia excede el umbral máximo. Valor actual: ${valorTexto}`;
  } else if (tipoTexto === "Corriente elevada") {
    return `Corriente excede el umbral máximo. Valor actual: ${valorTexto}`;
  } else {
    return `Alerta de ${tipoTexto}: ${valorTexto}`;
  }
}

/**
 * Formatea el mensaje de alerta para Telegram (sin HTML, solo texto plano)
 */
function formatAlertMessage(alert) {
  // Validar que tenemos datos mínimos
  if (!alert || !alert.tipo) {
    console.warn("[Telegram Bot] ⚠️ Alerta sin tipo:", alert);
    return null;
  }

  const emoji = {
    "Alta tensión": "⚠️",
    "Baja tensión": "🔻",
    "Alto consumo": "⚡",
    "Corriente elevada": "🔌",
  };

  const tipoEmoji = emoji[alert.tipo] || "🔔";

  // Formato del mensaje sin HTML, solo texto plano
  let mensaje = `${tipoEmoji} Ocurrió un evento\n\n`;

  // Formato específico según el tipo de alerta
  const tipoTexto = alert.tipo || "Alerta desconocida";
  const valorTexto = alert.valor || "N/A";

  if (tipoTexto === "Alta tensión" || tipoTexto === "Baja tensión") {
    mensaje += `${tipoTexto}: ${valorTexto}\n`;
  } else if (tipoTexto === "Corriente elevada") {
    mensaje += `Corriente elevada: ${valorTexto}\n`;
  } else {
    mensaje += `${tipoTexto}: ${valorTexto}\n`;
  }

  if (alert.dispositivo) {
    mensaje += `\n📱 Dispositivo: ${alert.dispositivo}`;
  }

  // Usar el mensaje de la alerta si existe y es válido
  // Si no, generar uno automáticamente basado en tipo y valor
  let mensajeDetalle = "";

  // Verificar si hay un mensaje válido en la alerta
  if (
    alert.mensaje &&
    typeof alert.mensaje === "string" &&
    alert.mensaje.trim() !== "" &&
    alert.mensaje.trim() !== valorTexto
  ) {
    mensajeDetalle = alert.mensaje.trim();
  } else {
    // Generar mensaje automático si no hay mensaje o está vacío
    // Solo generar si tenemos tipo y valor válidos
    if (
      tipoTexto &&
      tipoTexto !== "Alerta desconocida" &&
      valorTexto &&
      valorTexto !== "N/A"
    ) {
      const autoMensaje = generateAutoMessage(tipoTexto, valorTexto);
      if (autoMensaje) {
        mensajeDetalle = autoMensaje;
      }
    }
  }

  // Si aún no hay mensaje de detalle, intentar generar uno genérico
  if (!mensajeDetalle) {
    if (tipoTexto && tipoTexto !== "Alerta desconocida") {
      // Intentar generar mensaje automático incluso si el valor está vacío
      const autoMensaje = generateAutoMessage(
        tipoTexto,
        valorTexto || "desconocido"
      );
      if (autoMensaje) {
        mensajeDetalle = autoMensaje;
      } else if (valorTexto && valorTexto !== "N/A") {
        mensajeDetalle = `Se detectó ${tipoTexto.toLowerCase()} con valor ${valorTexto}`;
      } else {
        mensajeDetalle = `Se detectó ${tipoTexto.toLowerCase()}`;
      }
    }
  }

  if (mensajeDetalle) {
    mensaje += `\n\n${mensajeDetalle}`;
  }

  // Formatear fecha de forma segura
  let fechaTexto = "Fecha no disponible";
  if (alert.created_at) {
    try {
      const fecha = new Date(alert.created_at);
      if (!isNaN(fecha.getTime())) {
        fechaTexto = fecha.toLocaleString("es-PY", {
          timeZone: "America/Asuncion",
          dateStyle: "short",
          timeStyle: "short",
        });
      }
    } catch (e) {
      console.warn("[Telegram Bot] ⚠️ Error formateando fecha:", e.message);
    }
  }
  mensaje += `\n\n🕐 ${fechaTexto}`;

  // Validar que el mensaje no esté vacío
  const mensajeTrimmed = mensaje.trim();
  if (!mensajeTrimmed || mensajeTrimmed.length === 0) {
    console.warn(
      "[Telegram Bot] ⚠️ Mensaje formateado está vacío para alerta:",
      alert.id
    );
    return null;
  }

  return mensaje;
}

/**
 * Procesa alertas pendientes con rate limiting
 */
async function processAlerts() {
  try {
    // Obtener alertas que no han sido enviadas a Telegram
    // Filtrar alertas con mensaje o valor vacío para evitar procesarlas
    const result = await pool.query(`
      SELECT id, tipo, mensaje, valor, dispositivo, created_at
      FROM alerts
      WHERE (telegram_sent = false OR telegram_sent IS NULL)
      AND tipo IS NOT NULL
      AND tipo != ''
      AND mensaje IS NOT NULL
      AND mensaje != ''
      AND valor IS NOT NULL
      AND valor != ''
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
      const waitTime = Math.ceil(
        MIN_INTERVAL_BETWEEN_MESSAGES - timeSinceLastMessage
      );
      console.log(
        `[Telegram Bot] ⏳ Rate limit: esperando ${waitTime} segundo(s) antes del próximo envío...`
      );
      return;
    }

    // Procesar solo la primera alerta para respetar el rate limit
    const alert = result.rows[0];

    // Log de debug para ver qué datos tiene la alerta
    if (!alert.tipo || !alert.valor) {
      console.warn(
        `[Telegram Bot] ⚠️ Alerta ${alert.id} con datos incompletos:`,
        JSON.stringify(
          {
            id: alert.id,
            tipo: alert.tipo,
            valor: alert.valor,
            mensaje: alert.mensaje,
            dispositivo: alert.dispositivo,
            created_at: alert.created_at,
          },
          null,
          2
        )
      );
    }

    // Si el mensaje está vacío, informar que se generará uno automático
    if (!alert.mensaje || alert.mensaje.trim() === "") {
      console.log(
        `[Telegram Bot] ℹ️ Alerta ${alert.id} sin mensaje, generando mensaje automático basado en tipo y valor`
      );
    }

    try {
      const message = formatAlertMessage(alert);

      // Si el mensaje es null o vacío, marcar como enviada para evitar reintentos infinitos
      if (!message || message.trim().length === 0) {
        console.warn(
          `[Telegram Bot] ⚠️ Alerta ${alert.id} tiene mensaje vacío, marcando como enviada para evitar reintentos`
        );
        await pool.query(
          "UPDATE alerts SET telegram_sent = true WHERE id = $1",
          [alert.id]
        );
        // Actualizar tiempo para evitar spam de logs
        lastMessageTime = Date.now();
        return;
      }

      await sendTelegramMessage(message);

      // Actualizar tiempo del último mensaje
      lastMessageTime = Date.now();

      // Marcar como enviada
      await pool.query("UPDATE alerts SET telegram_sent = true WHERE id = $1", [
        alert.id,
      ]);

      console.log(
        `[Telegram Bot] ✅ Alerta ${alert.id} enviada: ${
          alert.tipo || "tipo desconocido"
        }`
      );

      // Si hay más alertas pendientes, informar
      if (result.rows.length > 1) {
        console.log(
          `[Telegram Bot] 📋 ${
            result.rows.length - 1
          } alerta(s) pendiente(s) - se procesarán en ${MIN_INTERVAL_BETWEEN_MESSAGES}s`
        );
      }
    } catch (error) {
      console.error(
        `[Telegram Bot] ❌ Error enviando alerta ${alert.id}:`,
        error.message
      );

      // Si el error es "message text is empty", marcar como enviada para evitar reintentos
      if (error.message && error.message.includes("message text is empty")) {
        console.warn(
          `[Telegram Bot] ⚠️ Mensaje vacío detectado, marcando alerta ${alert.id} como enviada`
        );
        await pool.query(
          "UPDATE alerts SET telegram_sent = true WHERE id = $1",
          [alert.id]
        );
      }

      // Actualizar el tiempo para evitar spam de errores
      lastMessageTime = Date.now();
    }
  } catch (error) {
    console.error("[Telegram Bot] Error procesando alertas:", error);
  }
}

/**
 * Verifica la conexión a la base de datos
 */
async function checkDatabaseConnection() {
  try {
    await pool.query("SELECT 1");
    console.log("[Telegram Bot] ✅ Conexión a PostgreSQL establecida");
    return true;
  } catch (error) {
    console.error(
      "[Telegram Bot] ❌ Error conectando a PostgreSQL:",
      error.message
    );
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
      https
        .get(url, (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        })
        .on("error", reject);
    });

    if (response.ok) {
      console.log(
        `[Telegram Bot] ✅ Bot conectado: @${response.result.username}`
      );
      return true;
    } else {
      console.error(
        "[Telegram Bot] ❌ Error verificando bot:",
        response.description
      );
      return false;
    }
  } catch (error) {
    console.error(
      "[Telegram Bot] ❌ Error verificando conexión a Telegram:",
      error.message
    );
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log("[Telegram Bot] Iniciando bot de Telegram...");
  console.log(`[Telegram Bot] Chat ID: ${TELEGRAM_CHAT_ID}`);

  // Verificar conexiones
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    console.error(
      "[Telegram Bot] No se pudo conectar a la base de datos. Saliendo..."
    );
    process.exit(1);
  }

  const telegramOk = await checkTelegramConnection();
  if (!telegramOk) {
    console.error("[Telegram Bot] No se pudo conectar a Telegram. Saliendo...");
    process.exit(1);
  }

  console.log("[Telegram Bot] ✅ Bot iniciado correctamente");
  console.log(
    `[Telegram Bot] Intervalo mínimo entre mensajes: ${MIN_INTERVAL_BETWEEN_MESSAGES} segundos`
  );
  console.log("[Telegram Bot] Monitoreando alertas cada 5 segundos...\n");

  // Procesar alertas inmediatamente
  await processAlerts();

  // Procesar alertas cada 5 segundos
  setInterval(async () => {
    await processAlerts();
  }, 5000);
}

// Manejar errores no capturados
process.on("unhandledRejection", (error) => {
  console.error("[Telegram Bot] Error no manejado:", error);
});

process.on("SIGINT", () => {
  console.log("\n[Telegram Bot] Deteniendo bot...");
  pool.end();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Telegram Bot] Deteniendo bot...");
  pool.end();
  process.exit(0);
});

// Iniciar
main().catch((error) => {
  console.error("[Telegram Bot] Error fatal:", error);
  process.exit(1);
});
