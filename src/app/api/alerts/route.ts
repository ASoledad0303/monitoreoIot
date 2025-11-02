import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const CreateAlertSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  tipo: z.enum(["Alta tensión", "Baja tensión", "Alto consumo"]),
  mensaje: z.string().min(1),
  valor: z.string().optional(),
  dispositivo: z.string().optional(),
});

/**
 * Obtiene alertas del usuario autenticado
 * GET /api/alerts?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD
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
      SELECT id, fecha, tipo, mensaje, valor, dispositivo, created_at
      FROM alerts
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

    sql += ` ORDER BY fecha DESC, created_at DESC`;

    const result = await query<{
      id: number;
      fecha: string;
      tipo: string;
      mensaje: string;
      valor: string | null;
      dispositivo: string | null;
      created_at: Date;
    }>(sql, params);

    return NextResponse.json({ alerts: result.rows });
  } catch (e) {
    console.error("Error obteniendo alertas:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea una nueva alerta
 * POST /api/alerts
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
    const parsed = CreateAlertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { fecha, tipo, mensaje, valor, dispositivo } = parsed.data;

    const result = await query<{ id: number }>(
      `INSERT INTO alerts (user_id, fecha, tipo, mensaje, valor, dispositivo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [user.sub, fecha, tipo, mensaje, valor || null, dispositivo || null]
    );

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
    });
  } catch (e) {
    console.error("Error creando alerta:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

