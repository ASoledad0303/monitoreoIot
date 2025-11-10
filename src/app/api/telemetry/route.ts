import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const CreateTelemetrySchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  voltaje: z.number().min(0).optional(),
  corriente: z.number().min(0).optional(),
  potencia: z.number().min(0).optional(),
  energia_acumulada: z.number().min(0).optional(),
  company_id: z.number().int().positive().optional(),
  device_id: z.number().int().positive().optional(),
});

/**
 * Obtiene historial de telemetría del usuario autenticado
 * GET /api/telemetry?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD&company_id=1&device_id=1
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fechaDesde = searchParams.get("fechaDesde");
    const fechaHasta = searchParams.get("fechaHasta");
    const companyIdParam = searchParams.get("company_id");
    const deviceIdParam = searchParams.get("device_id");

    // Obtener company_id del usuario si es user regular
    let userCompanyId: number | null = null;
    if (user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      userCompanyId = userData.rows[0]?.company_id || null;
    }

    let sql = `
      SELECT th.id, th.fecha, th.voltaje, th.corriente, th.potencia, 
             th.energia_acumulada, th.created_at, th.company_id, th.device_id,
             d.name as device_name, d.code as device_code
      FROM telemetry_history th
      LEFT JOIN devices d ON th.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Si es user regular, solo puede ver datos de su company
    if (user.role === "user") {
      if (!userCompanyId) {
        return NextResponse.json(
          { error: "Usuario no tiene company asignada" },
          { status: 403 }
        );
      }
      sql += ` AND th.company_id = $${params.length + 1}`;
      params.push(userCompanyId);
    } else if (companyIdParam) {
      // Admin puede filtrar por company
      const companyId = parseInt(companyIdParam);
      if (!isNaN(companyId)) {
        sql += ` AND th.company_id = $${params.length + 1}`;
        params.push(companyId);
      }
    }

    // Filtrar por device
    if (deviceIdParam) {
      const deviceId = parseInt(deviceIdParam);
      if (!isNaN(deviceId)) {
        sql += ` AND th.device_id = $${params.length + 1}`;
        params.push(deviceId);
      }
    }

    if (fechaDesde) {
      sql += ` AND th.fecha >= $${params.length + 1}`;
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      sql += ` AND th.fecha <= $${params.length + 1}`;
      params.push(fechaHasta);
    }

    sql += ` ORDER BY th.created_at DESC, th.fecha DESC`;

    const result = await query<{
      id: number;
      fecha: string;
      voltaje: number | null;
      corriente: number | null;
      potencia: number | null;
      energia_acumulada: number | null;
      created_at: Date;
      company_id: number | null;
      device_id: number | null;
      device_name: string | null;
      device_code: string | null;
    }>(sql, params);

    return NextResponse.json({ data: result.rows });
  } catch (e) {
    console.error("Error obteniendo telemetría:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea o actualiza registro de telemetría
 * POST /api/telemetry
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = CreateTelemetrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { fecha, voltaje, corriente, potencia, energia_acumulada, company_id, device_id } =
      parsed.data;

    // Obtener company_id del usuario si no se proporciona
    let finalCompanyId: number | null = company_id || null;
    if (!finalCompanyId && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      finalCompanyId = userData.rows[0]?.company_id ?? null;
    }

    // Verificar que device pertenece a la company si se proporciona
    if (device_id && finalCompanyId) {
      const deviceCheck = await query<{ id: number }>(
        "SELECT id FROM devices WHERE id = $1 AND company_id = $2",
        [device_id, finalCompanyId]
      );
      if (deviceCheck.rows.length === 0) {
        return NextResponse.json(
          { error: "Dispositivo no pertenece a la company especificada" },
          { status: 400 }
        );
      }
    }

    // Usar UPSERT - ahora incluye company_id y device_id en el conflicto
    // Cambiar unique constraint para incluir device_id si existe
    const result = await query<{ id: number }>(
      `INSERT INTO telemetry_history (user_id, fecha, voltaje, corriente, potencia, energia_acumulada, company_id, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, fecha) 
       DO UPDATE SET 
         voltaje = EXCLUDED.voltaje,
         corriente = EXCLUDED.corriente,
         potencia = EXCLUDED.potencia,
         energia_acumulada = EXCLUDED.energia_acumulada,
         company_id = EXCLUDED.company_id,
         device_id = EXCLUDED.device_id,
         created_at = EXCLUDED.created_at
       RETURNING id`,
      [
        user.sub,
        fecha,
        voltaje || null,
        corriente || null,
        potencia || null,
        energia_acumulada || null,
        finalCompanyId || null,
        device_id || null,
      ]
    );

    // Generar alertas automáticamente si los valores exceden umbrales
    try {
      await checkAndGenerateAlerts({
        voltaje,
        corriente,
        potencia,
        company_id: finalCompanyId,
        device_id: device_id || null,
        user_id: user.sub,
        fecha,
      });
    } catch (alertError) {
      // No fallar la inserción si la generación de alertas falla
      console.error("Error generando alertas:", alertError);
    }

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
    });
  } catch (e) {
    console.error("Error guardando telemetría:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Función auxiliar para verificar umbrales y generar alertas automáticamente
 */
async function checkAndGenerateAlerts(data: {
  voltaje?: number | null;
  corriente?: number | null;
  potencia?: number | null;
  company_id: number | null;
  device_id: number | null;
  user_id: number;
  fecha: string;
}) {
  const { voltaje, potencia, company_id, device_id, user_id, fecha } = data;

  // Obtener umbrales de la company o del usuario
  let umbrales: {
    voltaje_min: number;
    voltaje_max: number;
    potencia_max: number;
  } | null = null;

  if (COMPANY_CONFIG.ENABLED && company_id) {
    // Buscar umbrales de la company
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
    }
  }

  // Si no hay umbrales de company, buscar del usuario
  if (!umbrales) {
    const umbralesResult = await query<{
      voltaje_min: number;
      voltaje_max: number;
      potencia_max: number;
    }>(
      `SELECT voltaje_min, voltaje_max, potencia_max 
       FROM umbrales 
       WHERE user_id = $1 
       LIMIT 1`,
      [user_id]
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
  }

  // Obtener nombre del dispositivo si existe
  let deviceName: string | null = null;
  if (device_id) {
    const deviceResult = await query<{ name: string }>(
      "SELECT name FROM devices WHERE id = $1",
      [device_id]
    );
    if (deviceResult.rows.length > 0) {
      deviceName = deviceResult.rows[0].name;
    }
  }

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
        mensaje: `Voltaje excede el umbral máximo (${umbrales.voltaje_max}V). Valor actual: ${voltaje.toFixed(2)}V`,
        valor: `${voltaje.toFixed(2)}V`,
      });
    } else if (voltaje < umbrales.voltaje_min) {
      alerts.push({
        tipo: "Baja tensión",
        mensaje: `Voltaje está por debajo del umbral mínimo (${umbrales.voltaje_min}V). Valor actual: ${voltaje.toFixed(2)}V`,
        valor: `${voltaje.toFixed(2)}V`,
      });
    }
  }

  // Verificar potencia
  if (potencia !== null && potencia !== undefined) {
    if (potencia > umbrales.potencia_max) {
      alerts.push({
        tipo: "Alto consumo",
        mensaje: `Potencia excede el umbral máximo (${umbrales.potencia_max}W). Valor actual: ${potencia.toFixed(2)}W`,
        valor: `${potencia.toFixed(2)}W`,
      });
    }
  }

  // Crear alertas en la base de datos
  for (const alert of alerts) {
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
}

