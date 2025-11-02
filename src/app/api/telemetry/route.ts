import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const CreateTelemetrySchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  voltaje: z.number().min(0).optional(),
  corriente: z.number().min(0).optional(),
  potencia: z.number().min(0).optional(),
  energia_acumulada: z.number().min(0).optional(),
});

/**
 * Obtiene historial de telemetría del usuario autenticado
 * GET /api/telemetry?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD
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

    let sql = `
      SELECT id, fecha, voltaje, corriente, potencia, energia_acumulada, created_at
      FROM telemetry_history
      WHERE user_id = $1
    `;
    const params: any[] = [user.sub];

    if (fechaDesde) {
      sql += ` AND fecha >= $${params.length + 1}`;
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      sql += ` AND fecha <= $${params.length + 1}`;
      params.push(fechaHasta);
    }

    sql += ` ORDER BY fecha ASC`;

    const result = await query<{
      id: number;
      fecha: string;
      voltaje: number | null;
      corriente: number | null;
      potencia: number | null;
      energia_acumulada: number | null;
      created_at: Date;
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

    const { fecha, voltaje, corriente, potencia, energia_acumulada } =
      parsed.data;

    // Usar UPSERT (INSERT ... ON CONFLICT) para evitar duplicados
    const result = await query<{ id: number }>(
      `INSERT INTO telemetry_history (user_id, fecha, voltaje, corriente, potencia, energia_acumulada)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, fecha) 
       DO UPDATE SET 
         voltaje = EXCLUDED.voltaje,
         corriente = EXCLUDED.corriente,
         potencia = EXCLUDED.potencia,
         energia_acumulada = EXCLUDED.energia_acumulada,
         created_at = EXCLUDED.created_at
       RETURNING id`,
      [
        user.sub,
        fecha,
        voltaje || null,
        corriente || null,
        potencia || null,
        energia_acumulada || null,
      ]
    );

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
    });
  } catch (e) {
    console.error("Error guardando telemetría:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

