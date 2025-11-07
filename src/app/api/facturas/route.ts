import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const CreateFacturaSchema = z.object({
  mes_iso: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  potencia_facturada_kw: z.number().min(0),
  potencia_media_medida_kw: z.number().min(0).optional(),
  diferencia_kw: z.number().optional(),
  company_id: z.number().optional(),
  device_id: z.number().optional(),
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

    const { searchParams } = new URL(req.url);
    const companyIdParam = searchParams.get("company_id");
    const deviceIdParam = searchParams.get("device_id");

    // Obtener company_id del usuario si es user regular
    let userCompanyId: number | null = null;
    if (COMPANY_CONFIG.ENABLED && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      userCompanyId = userData.rows[0]?.company_id || null;
    }

    let sql = `
      SELECT id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, 
             diferencia_kw, created_at, updated_at, company_id, device_id
      FROM facturas
      WHERE 1=1
    `;
    const params: any[] = [];

    // Si es user regular, solo puede ver facturas de su company
    if (COMPANY_CONFIG.ENABLED && user.role === "user") {
      if (!userCompanyId) {
        return NextResponse.json(
          { error: "Usuario no tiene company asignada" },
          { status: 403 }
        );
      }
      sql += ` AND company_id = $${params.length + 1}`;
      params.push(userCompanyId);
    } else if (COMPANY_CONFIG.ENABLED && companyIdParam && user.role === "admin") {
      // Admin puede filtrar por company
      const companyId = parseInt(companyIdParam);
      if (!isNaN(companyId)) {
        sql += ` AND company_id = $${params.length + 1}`;
        params.push(companyId);
      }
    } else if (!COMPANY_CONFIG.ENABLED) {
      // Si companies no está habilitado, usar user_id
      sql += ` AND user_id = $${params.length + 1}`;
      params.push(user.sub);
    }

    // Filtrar por device
    if (COMPANY_CONFIG.ENABLED && deviceIdParam) {
      const deviceId = parseInt(deviceIdParam);
      if (!isNaN(deviceId)) {
        sql += ` AND device_id = $${params.length + 1}`;
        params.push(deviceId);
      }
    }

    sql += ` ORDER BY mes_iso DESC`;

    const result = await query<{
      id: number;
      mes_iso: string;
      potencia_facturada_kw: number;
      potencia_media_medida_kw: number | null;
      diferencia_kw: number | null;
      created_at: Date;
      updated_at: Date;
      company_id: number | null;
      device_id: number | null;
    }>(sql, params);

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
      company_id,
      device_id,
    } = parsed.data;

    // Obtener company_id del usuario si no se proporciona
    let finalCompanyId: number | null = company_id || null;
    if (COMPANY_CONFIG.ENABLED && !finalCompanyId && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      finalCompanyId = userData.rows[0]?.company_id ?? null;
    }

    // Verificar que device pertenece a la company si se proporciona
    if (COMPANY_CONFIG.ENABLED && device_id && finalCompanyId) {
      const deviceCheck = await query<{ id: number }>(
        "SELECT id FROM devices WHERE id = $1 AND company_id = $2",
        [device_id, finalCompanyId]
      );
      if (deviceCheck.rows.length === 0) {
        return NextResponse.json(
          { error: "El dispositivo no pertenece a la company especificada" },
          { status: 400 }
        );
      }
    }

    // Calcular diferencia si no se proporciona
    const diferencia =
      diferencia_kw ??
      (potencia_media_medida_kw
        ? potencia_media_medida_kw - potencia_facturada_kw
        : null);

    // Construir query según si companies está habilitado
    let sql = "";
    let params: any[] = [];

    if (COMPANY_CONFIG.ENABLED) {
      // Verificar si ya existe una factura con los mismos parámetros
      const checkSql = `
        SELECT id FROM facturas 
        WHERE user_id = $1 
          AND mes_iso = $2 
          AND COALESCE(company_id, 0) = COALESCE($3, 0)
          AND COALESCE(device_id, 0) = COALESCE($4, 0)
        LIMIT 1
      `;
      const checkParams = [user.sub, mes_iso, finalCompanyId, device_id || null];
      const existingCheck = await query<{ id: number }>(checkSql, checkParams);

      if (existingCheck.rows.length > 0) {
        // Actualizar existente
        sql = `
          UPDATE facturas
          SET potencia_facturada_kw = $1,
              potencia_media_medida_kw = $2,
              diferencia_kw = $3,
              company_id = $4,
              device_id = $5,
              updated_at = NOW()
          WHERE id = $6
          RETURNING id
        `;
        params = [
          potencia_facturada_kw,
          potencia_media_medida_kw || null,
          diferencia,
          finalCompanyId,
          device_id || null,
          existingCheck.rows[0].id,
        ];
      } else {
        // Crear nuevo
        sql = `
          INSERT INTO facturas (user_id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, diferencia_kw, company_id, device_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `;
        params = [
          user.sub,
          mes_iso,
          potencia_facturada_kw,
          potencia_media_medida_kw || null,
          diferencia,
          finalCompanyId,
          device_id || null,
        ];
      }
    } else {
      // Lógica antigua sin companies
      sql = `
        INSERT INTO facturas (user_id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, diferencia_kw)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, mes_iso)
        DO UPDATE SET
          potencia_facturada_kw = EXCLUDED.potencia_facturada_kw,
          potencia_media_medida_kw = EXCLUDED.potencia_media_medida_kw,
          diferencia_kw = EXCLUDED.diferencia_kw,
          updated_at = NOW()
        RETURNING id
      `;
      params = [
        user.sub,
        mes_iso,
        potencia_facturada_kw,
        potencia_media_medida_kw || null,
        diferencia,
      ];
    }

    const result = await query<{ id: number }>(sql, params);

    return NextResponse.json({
      ok: true,
      id: result.rows[0].id,
    });
  } catch (e) {
    console.error("Error creando factura:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

