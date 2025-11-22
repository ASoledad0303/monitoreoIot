import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const CreateFacturaSchema = z.object({
  // Campos antiguos (opcionales para compatibilidad)
  mes_iso: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
  potencia_facturada_kw: z.number().min(0).optional(),
  potencia_media_medida_kw: z.number().min(0).optional(),
  diferencia_kw: z.number().optional(),
  // Nuevos campos para periodo de consumo
  fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  fecha_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  consumo_facturado_kwh: z.number().min(0).optional(),
  consumo_medido_kwh: z.number().min(0).optional(),
  diferencia_kwh: z.number().optional(),
  // Campos comunes
  company_id: z.number().optional(),
  device_id: z.number().optional(),
}).refine(
  (data) => {
    // Debe tener o mes_iso o fecha_desde/fecha_hasta
    const tieneMes = !!data.mes_iso;
    const tienePeriodo = !!(data.fecha_desde && data.fecha_hasta);
    return tieneMes || tienePeriodo;
  },
  { message: "Debe proporcionar mes_iso o fecha_desde/fecha_hasta" }
).refine(
  (data) => {
    // Debe tener o potencia_facturada_kw o consumo_facturado_kwh
    const tienePotencia = data.potencia_facturada_kw !== undefined;
    const tieneConsumo = data.consumo_facturado_kwh !== undefined;
    return tienePotencia || tieneConsumo;
  },
  { message: "Debe proporcionar potencia_facturada_kw o consumo_facturado_kwh" }
);

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
             diferencia_kw, fecha_desde, fecha_hasta, consumo_facturado_kwh,
             consumo_medido_kwh, diferencia_kwh, created_at, updated_at, 
             company_id, device_id,
             CASE 
               WHEN fecha_desde IS NOT NULL AND fecha_hasta IS NOT NULL 
               THEN fecha_desde || ' a ' || fecha_hasta
               WHEN mes_iso IS NOT NULL 
               THEN mes_iso
               ELSE 'N/A'
             END as periodo_descripcion
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
    } else if (COMPANY_CONFIG.ENABLED && (user.role === "admin" || user.role === "super_admin")) {
      // Admin puede filtrar por company si se proporciona
      if (companyIdParam) {
        const companyId = parseInt(companyIdParam);
        if (!isNaN(companyId)) {
          sql += ` AND company_id = $${params.length + 1}`;
          params.push(companyId);
        }
      }
      // Si no se proporciona company_id, admin puede ver todas las facturas (sin filtro)
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

    // Ordenar por fecha (manejar NULLs correctamente)
    // Convertir todo a DATE para que sea compatible
    sql += ` ORDER BY 
      CASE 
        WHEN fecha_desde IS NOT NULL THEN fecha_desde
        WHEN mes_iso IS NOT NULL THEN (mes_iso || '-01')::date
        ELSE '1900-01-01'::date
      END DESC, 
      created_at DESC`;

    console.log("[FACTURAS-GET] SQL:", sql);
    console.log("[FACTURAS-GET] Params:", params);

    const result = await query<{
      id: number;
      mes_iso: string | null;
      potencia_facturada_kw: number | null;
      potencia_media_medida_kw: number | null;
      diferencia_kw: number | null;
      fecha_desde: string | null;
      fecha_hasta: string | null;
      consumo_facturado_kwh: number | null;
      consumo_medido_kwh: number | null;
      diferencia_kwh: number | null;
      periodo_descripcion: string;
      created_at: Date;
      updated_at: Date;
      company_id: number | null;
      device_id: number | null;
    }>(sql, params);

    console.log("[FACTURAS-GET] Resultados:", result.rows.length, "facturas");

    return NextResponse.json({ facturas: result.rows });
  } catch (e: any) {
    console.error("Error obteniendo facturas:", e);
    console.error("Stack trace:", e.stack);
    return NextResponse.json({ 
      error: "Error de servidor",
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    }, { status: 500 });
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
      fecha_desde,
      fecha_hasta,
      consumo_facturado_kwh,
      consumo_medido_kwh,
      diferencia_kwh,
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

    // Calcular diferencias si no se proporcionan
    const diferenciaKw =
      diferencia_kw ??
      (potencia_media_medida_kw && potencia_facturada_kw
        ? potencia_media_medida_kw - potencia_facturada_kw
        : null);
    
    const diferenciaKwh =
      diferencia_kwh ??
      (consumo_medido_kwh && consumo_facturado_kwh
        ? consumo_facturado_kwh - consumo_medido_kwh
        : null);

    // Construir query según si companies está habilitado
    let sql = "";
    let params: any[] = [];

    if (COMPANY_CONFIG.ENABLED) {
      // Verificar si ya existe una factura con los mismos parámetros
      // Priorizar periodo (fecha_desde/fecha_hasta) sobre mes_iso
      let checkSql = '';
      let checkParams: any[] = [];
      
      if (fecha_desde && fecha_hasta) {
        checkSql = `
          SELECT id FROM facturas 
          WHERE user_id = $1 
            AND fecha_desde = $2 
            AND fecha_hasta = $3
            AND COALESCE(company_id, 0) = COALESCE($4, 0)
            AND COALESCE(device_id, 0) = COALESCE($5, 0)
          LIMIT 1
        `;
        checkParams = [user.sub, fecha_desde, fecha_hasta, finalCompanyId, device_id || null];
      } else if (mes_iso) {
        checkSql = `
          SELECT id FROM facturas 
          WHERE user_id = $1 
            AND mes_iso = $2 
            AND COALESCE(company_id, 0) = COALESCE($3, 0)
            AND COALESCE(device_id, 0) = COALESCE($4, 0)
          LIMIT 1
        `;
        checkParams = [user.sub, mes_iso, finalCompanyId, device_id || null];
      }
      let existingCheck: { rows: { id: number }[] } = { rows: [] };
      if (checkSql) {
        existingCheck = await query<{ id: number }>(checkSql, checkParams);
      }

      if (existingCheck.rows.length > 0 && checkSql) {
        // Actualizar existente
        sql = `
          UPDATE facturas
          SET mes_iso = $1,
              potencia_facturada_kw = $2,
              potencia_media_medida_kw = $3,
              diferencia_kw = $4,
              fecha_desde = $5,
              fecha_hasta = $6,
              consumo_facturado_kwh = $7,
              consumo_medido_kwh = $8,
              diferencia_kwh = $9,
              company_id = $10,
              device_id = $11,
              updated_at = NOW()
          WHERE id = $12
          RETURNING id
        `;
        params = [
          mes_iso || null,
          potencia_facturada_kw || null,
          potencia_media_medida_kw || null,
          diferenciaKw,
          fecha_desde || null,
          fecha_hasta || null,
          consumo_facturado_kwh || null,
          consumo_medido_kwh || null,
          diferenciaKwh,
          finalCompanyId,
          device_id || null,
          existingCheck.rows[0].id,
        ];
      } else {
        // Crear nuevo
        sql = `
          INSERT INTO facturas (user_id, mes_iso, potencia_facturada_kw, potencia_media_medida_kw, diferencia_kw, 
                               fecha_desde, fecha_hasta, consumo_facturado_kwh, consumo_medido_kwh, diferencia_kwh,
                               company_id, device_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `;
        params = [
          user.sub,
          mes_iso || null,
          potencia_facturada_kw || null,
          potencia_media_medida_kw || null,
          diferenciaKw,
          fecha_desde || null,
          fecha_hasta || null,
          consumo_facturado_kwh || null,
          consumo_medido_kwh || null,
          diferenciaKwh,
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
        diferenciaKw,
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

