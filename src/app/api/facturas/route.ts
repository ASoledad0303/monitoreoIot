import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const CreateFacturaSchema = z.object({
  mes_iso: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  potencia_facturada_kw: z.number().min(0),
  potencia_media_medida_kw: z.number().min(0).optional(),
  diferencia_kw: z.number().optional(),
});

/**
 * Obtiene facturas del usuario autenticado
 * GET /api/facturas
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const result = await query<{
      id: number;
      mes_iso: string;
      potencia_facturada_kw: number;
      potencia_media_medida_kw: number | null;
      diferencia_kw: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, diferencia_kw, created_at, updated_at
       FROM facturas
       WHERE user_id = $1
       ORDER BY mes_iso DESC`,
      [user.sub]
    );

    return NextResponse.json({ facturas: result.rows });
  } catch (e) {
    console.error("Error obteniendo facturas:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea una nueva factura
 * POST /api/facturas
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
    const parsed = CreateFacturaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const {
      mes_iso,
      potencia_facturada_kw,
      potencia_media_medida_kw,
      diferencia_kw,
    } = parsed.data;

    // Calcular diferencia si no se proporciona
    const diferencia =
      diferencia_kw ??
      (potencia_media_medida_kw
        ? potencia_media_medida_kw - potencia_facturada_kw
        : null);

    const result = await query<{ id: number }>(
      `INSERT INTO facturas (user_id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, diferencia_kw)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, mes_iso)
       DO UPDATE SET
         potencia_facturada_kw = EXCLUDED.potencia_facturada_kw,
         potencia_media_medida_kw = EXCLUDED.potencia_media_medida_kw,
         diferencia_kw = EXCLUDED.diferencia_kw,
         updated_at = NOW()
       RETURNING id`,
      [
        user.sub,
        mes_iso,
        potencia_facturada_kw,
        potencia_media_medida_kw || null,
        diferencia,
      ]
    );

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
    });
  } catch (e) {
    console.error("Error creando factura:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

