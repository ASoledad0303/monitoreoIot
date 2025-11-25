import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { z } from "zod";

const IoTTelemetrySchema = z.object({
  device: z.string(), // deviceId del ESP32 (chipID)
  V: z.number().min(0).optional(),
  I: z.number().min(0).optional(),
  P: z.number().optional(), // puede ser negativo
  S: z.number().min(0).optional(),
  PF: z.number().min(-1).max(1).optional(),
  api_key: z.string().optional(), // API key del dispositivo
});

/**
 * Endpoint público para dispositivos IoT (ESP32)
 * POST /api/iot/telemetry
 *
 * Autenticación: API key en header X-API-Key o en el body
 * Formato de datos: JSON del ESP32
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = IoTTelemetrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { V, I, P, api_key: apiKeyFromBody } = parsed.data;

    // Obtener API key del header o del body
    const apiKey = req.headers.get("X-API-Key") || apiKeyFromBody;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "API key requerida. Envíala en el header X-API-Key o en el body como api_key",
        },
        { status: 401 }
      );
    }

    // Buscar dispositivo por API key
    const deviceResult = await query<{
      id: number;
      company_id: number;
      code: string;
      name: string;
    }>(
      `SELECT id, company_id, code, name 
       FROM devices 
       WHERE api_key = $1 AND is_active = true`,
      [apiKey]
    );

    if (deviceResult.rows.length === 0) {
      return NextResponse.json(
        { error: "API key inválida o dispositivo inactivo" },
        { status: 401 }
      );
    }

    const deviceRecord = deviceResult.rows[0];
    const deviceId = deviceRecord.id;
    const companyId = deviceRecord.company_id;

    // Obtener fecha actual en formato YYYY-MM-DD
    const fecha = new Date().toISOString().split("T")[0];

    // Mapear datos del ESP32 al formato de la base de datos
    const voltaje = V !== undefined ? V : null;
    const corriente = I !== undefined ? I : null;
    const potencia = P !== undefined ? Math.abs(P) : null; // Usar valor absoluto para potencia
    const energia_acumulada = null; // El ESP32 no envía energía acumulada en este formato

    // Obtener user_id asociado a la company (usar el primer admin de la company)
    const adminUser = await query<{ id: number }>(
      `SELECT u.id 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id
       WHERE u.company_id = $1 
       AND (r.name = 'admin' OR r.name = 'super_admin')
       LIMIT 1`,
      [companyId]
    );

    const userId = adminUser.rows[0]?.id || null;

    // Insertar siempre un nuevo registro para mantener historial completo
    // No usar ON CONFLICT para permitir múltiples registros por día
    const result = await query<{ id: number }>(
      `INSERT INTO telemetry_history (user_id, fecha, voltaje, corriente, potencia, energia_acumulada, company_id, device_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id`,
      [
        userId,
        fecha,
        voltaje,
        corriente,
        potencia,
        energia_acumulada,
        companyId,
        deviceId,
      ]
    );

    // Generar alertas automáticamente si los valores exceden umbrales
    try {
      await checkAndGenerateAlerts({
        voltaje,
        corriente,
        potencia,
        company_id: companyId,
        device_id: deviceId,
        user_id: userId,
        fecha,
      });
    } catch (alertError) {
      // No fallar la inserción si la generación de alertas falla
      console.error("Error generando alertas:", alertError);
    }

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
      device_id: deviceId,
      message: "Datos recibidos correctamente",
    });
  } catch (e: any) {
    console.error("Error procesando telemetría IoT:", e);
    return NextResponse.json(
      { error: "Error de servidor", details: e.message },
      { status: 500 }
    );
  }
}

/**
 * Función auxiliar para verificar umbrales y generar alertas automáticamente
 */
async function checkAndGenerateAlerts(data: {
  voltaje?: number | null;
  corriente?: number | null;
  potencia?: number | null;
  company_id: number;
  device_id: number;
  user_id: number | null;
  fecha: string;
}) {
  const { voltaje, potencia, company_id, device_id, user_id, fecha } = data;

  if (!user_id) {
    // Si no hay user_id, no podemos crear alertas asociadas a un usuario
    return;
  }

  // Obtener umbrales de la company
  let umbrales: {
    voltaje_min: number;
    voltaje_max: number;
    potencia_max: number;
  } | null = null;

  const umbralesResult = await query<{
    voltaje_min: number;
    voltaje_max: number;
    potencia_max: number;
  }>(
    `SELECT voltaje_min, voltaje_max, potencia_max 
     FROM umbrales 
     WHERE company_id = $1 AND user_id IS NULL 
     LIMIT 1`,
    [company_id]
  );

  if (umbralesResult.rows.length > 0) {
    umbrales = umbralesResult.rows[0];
  } else {
    // Usar valores por defecto
    umbrales = {
      voltaje_min: 200,
      voltaje_max: 250,
      potencia_max: 5000,
    };
  }

  // Obtener nombre del dispositivo
  const deviceResult = await query<{ name: string }>(
    "SELECT name FROM devices WHERE id = $1",
    [device_id]
  );
  const deviceName = deviceResult.rows[0]?.name || null;

  const alerts: Array<{
    tipo: "Alta tensión" | "Baja tensión" | "Alto consumo";
    mensaje: string;
    valor: string;
  }> = [];

  // Verificar voltaje
  if (voltaje !== null && voltaje !== undefined) {
    if (voltaje > umbrales.voltaje_max) {
      alerts.push({
        tipo: "Alta tensión",
        mensaje: `Voltaje excede el umbral máximo (${
          umbrales.voltaje_max
        }V). Valor actual: ${voltaje.toFixed(2)}V`,
        valor: `${voltaje.toFixed(2)}V`,
      });
    } else if (voltaje < umbrales.voltaje_min) {
      alerts.push({
        tipo: "Baja tensión",
        mensaje: `Voltaje está por debajo del umbral mínimo (${
          umbrales.voltaje_min
        }V). Valor actual: ${voltaje.toFixed(2)}V`,
        valor: `${voltaje.toFixed(2)}V`,
      });
    }
  }

  // Verificar potencia
  if (potencia !== null && potencia !== undefined) {
    if (potencia > umbrales.potencia_max) {
      alerts.push({
        tipo: "Alto consumo",
        mensaje: `Potencia excede el umbral máximo (${
          umbrales.potencia_max
        }W). Valor actual: ${potencia.toFixed(2)}W`,
        valor: `${potencia.toFixed(2)}W`,
      });
    }
  }

  // Crear alertas en la base de datos solo si no existe una alerta del mismo tipo en los últimos 20 segundos
  for (const alert of alerts) {
    // Verificar si ya existe una alerta del mismo tipo para este dispositivo en los últimos 20 segundos
    const existingAlert = await query<{ id: number }>(
      `SELECT id FROM alerts 
       WHERE tipo = $1 
       AND device_id = $2 
       AND company_id = $3
       AND created_at > NOW() - INTERVAL '20 seconds'
       LIMIT 1`,
      [alert.tipo, device_id, company_id]
    );

    // Solo crear la alerta si no existe una reciente (últimos 20 segundos)
    if (existingAlert.rows.length === 0) {
      await query(
        `INSERT INTO alerts (user_id, fecha, tipo, mensaje, valor, dispositivo, company_id, device_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user_id,
          fecha,
          alert.tipo,
          alert.mensaje,
          alert.valor,
          deviceName || null,
          company_id,
          device_id,
        ]
      );
    }
    // Si ya existe una alerta reciente, no crear otra (evita spam de alertas)
  }
}
