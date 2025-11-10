/**
 * Servicio MQTT Bridge
 * 
 * Este servicio se suscribe a los topics MQTT del ESP32 y envía los datos
 * al endpoint /api/iot/telemetry del backend Next.js.
 * 
 * Uso:
 *   node services/mqtt-bridge.js
 * 
 * O agregar a package.json:
 *   "mqtt-bridge": "node services/mqtt-bridge.js"
 */

const mqtt = require('mqtt');
const http = require('http');
require('dotenv').config({ path: '.env.local' });

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://192.168.100.64:1883';
const MQTT_USER = process.env.MQTT_USER || '';
const MQTT_PASS = process.env.MQTT_PASS || '';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'esp/energia/+/state';
const API_URL = process.env.API_URL || 'http://localhost:3000/api/iot/telemetry';

// Mapa de deviceId (chipID) a API keys de dispositivos
// Se puede cargar desde la base de datos o configurar manualmente
const DEVICE_API_KEYS = {
  // Ejemplo: 'E2641D44': 'c797f8c6cd20c3961d41347a824b8da6'
  // Se puede cargar dinámicamente desde la BD
};

// Cargar API keys desde la base de datos
async function loadDeviceApiKeys() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tesis_iot_db'
  });

  try {
    const result = await pool.query(`
      SELECT d.code, d.api_key, d.id, d.name
      FROM devices d
      WHERE d.is_active = true AND d.api_key IS NOT NULL
    `);

    // Mapear dispositivos por código o nombre
    for (const row of result.rows) {
      // Dispositivo principal
      if (row.code === 'PRINCIPAL' || row.name === 'Dispositivo Principal') {
        DEVICE_API_KEYS['PRINCIPAL'] = row.api_key;
        console.log(`[MQTT] ✅ API Key cargada para dispositivo principal (${row.name}): ${row.api_key.substring(0, 8)}...`);
      }
      // También mapear por código antiguo por compatibilidad
      if (row.code === '1212') {
        DEVICE_API_KEYS['1212'] = row.api_key;
      }
      // Mapear todos los dispositivos activos por ID
      DEVICE_API_KEYS[row.id] = row.api_key;
    }
    
    // Si no hay dispositivo principal, usar el primero disponible
    if (Object.keys(DEVICE_API_KEYS).length === 0 && result.rows.length > 0) {
      DEVICE_API_KEYS['PRINCIPAL'] = result.rows[0].api_key;
      console.log(`[MQTT] Usando primer dispositivo disponible: ${result.rows[0].name}`);
    }

    await pool.end();
  } catch (error) {
    console.error('[MQTT] Error cargando API keys:', error);
  }
}

// Conectar a MQTT
const mqttOptions = {
  clientId: 'nextjs-mqtt-bridge',
  username: MQTT_USER || undefined,
  password: MQTT_PASS || undefined,
  reconnectPeriod: 5000,
};

const client = mqtt.connect(MQTT_BROKER, mqttOptions);

client.on('connect', () => {
  console.log(`[MQTT] Conectado al broker: ${MQTT_BROKER}`);
  console.log(`[MQTT] Suscrito a topic: ${MQTT_TOPIC}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('[MQTT] Error suscribiéndose:', err);
    } else {
      console.log('[MQTT] Suscripción exitosa');
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log(`[MQTT] Mensaje recibido de ${topic}:`, data);

    // Extraer deviceId del topic o del mensaje
    const topicParts = topic.split('/');
    const deviceIdFromTopic = topicParts.length > 2 ? topicParts[2] : data.device;

    // Obtener API key del dispositivo principal
    // Por ahora todos los dispositivos ESP32 usan la misma API key del dispositivo principal
    const apiKey = DEVICE_API_KEYS['PRINCIPAL'] || DEVICE_API_KEYS['1212'] || Object.values(DEVICE_API_KEYS)[0];

    if (!apiKey) {
      console.error('[MQTT] No se encontró API key para el dispositivo');
      return;
    }

    // Enviar al endpoint del backend
    const payload = JSON.stringify({
      device: data.device || deviceIdFromTopic,
      V: data.V,
      I: data.I,
      P: data.P,
      S: data.S,
      PF: data.PF,
      api_key: apiKey,
    });

    const url = new URL(API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log(`[MQTT] ✅ Datos enviados correctamente: ${responseData}`);
        } else {
          console.error(`[MQTT] ❌ Error ${res.statusCode}: ${responseData}`);
        }
      });
    });

    req.on('error', (error) => {
      console.error('[MQTT] Error enviando datos:', error.message);
    });

    req.write(payload);
    req.end();

  } catch (error) {
    console.error('[MQTT] Error procesando mensaje:', error);
  }
});

client.on('error', (error) => {
  console.error('[MQTT] Error de conexión:', error);
});

client.on('close', () => {
  console.log('[MQTT] Conexión cerrada');
});

client.on('offline', () => {
  console.log('[MQTT] Cliente offline');
});

// Cargar API keys al iniciar
loadDeviceApiKeys().then(() => {
  console.log('[MQTT] Bridge iniciado');
});

// Manejar cierre limpio
process.on('SIGINT', () => {
  console.log('\n[MQTT] Cerrando conexión...');
  client.end();
  process.exit(0);
});

