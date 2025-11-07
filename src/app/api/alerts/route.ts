import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const CreateAlertSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  tipo: z.enum(["Alta tensión", "Baja tensión", "Alto consumo"]),
  mensaje: z.string().min(1),
  valor: z.string().optional(),
  dispositivo: z.string().optional(), // Mantener por compatibilidad
  company_id: z.number().int().positive().optional(),
  device_id: z.number().int().positive().optional(),
});

/**
 * Obtiene alertas del usuario autenticado
 * GET /api/alerts?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD&company_id=1&device_id=1
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
      SELECT a.id, a.fecha, a.tipo, a.mensaje, a.valor, a.dispositivo, 
             a.created_at, a.company_id, a.device_id,
             d.name as device_name, d.code as device_code
      FROM alerts a
      LEFT JOIN devices d ON a.device_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Si es user regular, solo puede ver alertas de su company
    if (user.role === "user") {
      if (!userCompanyId) {
        return NextResponse.json(
          { error: "Usuario no tiene company asignada" },
          { status: 403 }
        );
      }
      sql += ` AND a.company_id = $${params.length + 1}`;
      params.push(userCompanyId);
    } else if (companyIdParam) {
      // Admin puede filtrar por company
      const companyId = parseInt(companyIdParam);
      if (!isNaN(companyId)) {
        sql += ` AND a.company_id = $${params.length + 1}`;
        params.push(companyId);
      }
    }

    // Filtrar por device
    if (deviceIdParam) {
      const deviceId = parseInt(deviceIdParam);
      if (!isNaN(deviceId)) {
        sql += ` AND a.device_id = $${params.length + 1}`;
        params.push(deviceId);
      }
    }

    if (fechaDesde) {
      sql += ` AND a.fecha >= $${params.length + 1}`;
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      sql += ` AND a.fecha <= $${params.length + 1}`;
      params.push(fechaHasta);
    }

    sql += ` ORDER BY a.fecha DESC, a.created_at DESC`;

    const result = await query<{
      id: number;
      fecha: string;
      tipo: string;
      mensaje: string;
      valor: string | null;
      dispositivo: string | null;
      created_at: Date;
      company_id: number | null;
      device_id: number | null;
      device_name: string | null;
      device_code: string | null;
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

    const { fecha, tipo, mensaje, valor, dispositivo, company_id, device_id } = parsed.data;

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

    const result = await query<{ id: number }>(
      `INSERT INTO alerts (user_id, fecha, tipo, mensaje, valor, dispositivo, company_id, device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        user.sub, 
        fecha, 
        tipo, 
        mensaje, 
        valor || null, 
        dispositivo || null,
        finalCompanyId || null,
        device_id || null,
      ]
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

