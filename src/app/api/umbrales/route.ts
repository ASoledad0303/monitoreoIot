import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";
import { setupAuditContext } from "@/lib/audit";

const UpdateUmbralesSchema = z.object({
  voltaje_min: z.number().min(0).optional(),
  voltaje_max: z.number().min(0).optional(),
  potencia_max: z.number().min(0).optional(),
});

/**
 * Obtiene umbrales del usuario autenticado o globales
 * GET /api/umbrales?global=true
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
    const global = searchParams.get("global") === "true";
    const companyIdParam = searchParams.get("company_id");

    // Obtener company_id del usuario si está habilitado
    let userCompanyId: number | null = null;
    if (COMPANY_CONFIG.ENABLED && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      userCompanyId = userData.rows[0]?.company_id || null;
    }

    // Determinar qué umbrales buscar
    let sql = `SELECT id, user_id, company_id, voltaje_min, voltaje_max, potencia_max FROM umbrales WHERE 1=1`;
    const params: any[] = [];

    if (COMPANY_CONFIG.ENABLED) {
      // Prioridad: company_id > user_id > global
      if (companyIdParam && user.role === "admin") {
        const companyId = parseInt(companyIdParam);
        if (!isNaN(companyId)) {
          sql += ` AND company_id = $${params.length + 1}`;
          params.push(companyId);
          sql += ` AND user_id IS NULL`; // Umbrales de company (no de usuario específico)
        }
      } else if (userCompanyId) {
        // Usuario regular: buscar umbrales de su company
        sql += ` AND company_id = $${params.length + 1}`;
        params.push(userCompanyId);
        sql += ` AND user_id IS NULL`; // Umbrales de company (no de usuario específico)
      } else if (global && user.role === "admin") {
        // Admin solicita globales: sin company_id ni user_id
        sql += ` AND company_id IS NULL AND user_id IS NULL`;
      } else {
        // Fallback: buscar por user_id
        sql += ` AND user_id = $${params.length + 1}`;
        params.push(user.sub);
      }
    } else {
      // Si companies no está habilitado, usar lógica antigua
      const userId = global && user.role === "admin" ? null : user.sub;
      sql += ` AND user_id ${userId === null ? "IS NULL" : "= $" + (params.length + 1)}`;
      if (userId !== null) params.push(userId);
    }

    sql += ` LIMIT 1`;

    const result = await query<{
      id: number;
      user_id: number | null;
      company_id: number | null;
      voltaje_min: number;
      voltaje_max: number;
      potencia_max: number;
    }>(sql, params);

    if (result.rows.length === 0) {
      // Retornar valores por defecto si no hay umbrales configurados
      return NextResponse.json({
        voltaje_min: 200,
        voltaje_max: 250,
        potencia_max: 5000,
        is_default: true,
      });
    }

    return NextResponse.json({
      ...result.rows[0],
      is_default: false,
    });
  } catch (e) {
    console.error("Error obteniendo umbrales:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea o actualiza umbrales del usuario
 * POST /api/umbrales
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
    const parsed = UpdateUmbralesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { voltaje_min, voltaje_max, potencia_max } = parsed.data;

    // Obtener company_id del usuario si está habilitado
    let userCompanyId: number | null = null;
    if (COMPANY_CONFIG.ENABLED && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      userCompanyId = userData.rows[0]?.company_id || null;
    }

    // Determinar qué umbrales actualizar/crear
    let whereClause = "";
    let whereParams: any[] = [];
    
    if (COMPANY_CONFIG.ENABLED && userCompanyId) {
      // Usuario regular: actualizar umbrales de su company
      whereClause = "company_id = $1 AND user_id IS NULL";
      whereParams = [userCompanyId];
    } else {
      // Fallback: usar user_id
      whereClause = "user_id = $1";
      whereParams = [user.sub];
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    // Verificar si ya existe
    const existing = await query<{ id: number }>(
      `SELECT id FROM umbrales WHERE ${whereClause}`,
      whereParams
    );

    if (existing.rows.length > 0) {
      // Actualizar existente
      const updateParams = [
        voltaje_min ?? null,
        voltaje_max ?? null,
        potencia_max ?? null,
        ...whereParams,
      ];
      await query(
        `UPDATE umbrales
         SET voltaje_min = COALESCE($1, voltaje_min),
             voltaje_max = COALESCE($2, voltaje_max),
             potencia_max = COALESCE($3, potencia_max),
             updated_at = NOW()
         WHERE ${whereClause}`,
        updateParams
      );
    } else {
      // Crear nuevo
      if (COMPANY_CONFIG.ENABLED && userCompanyId) {
        await query(
          `INSERT INTO umbrales (company_id, voltaje_min, voltaje_max, potencia_max)
           VALUES ($1, $2, $3, $4)`,
          [
            userCompanyId,
            voltaje_min ?? 200,
            voltaje_max ?? 250,
            potencia_max ?? 5000,
          ]
        );
      } else {
        await query(
          `INSERT INTO umbrales (user_id, voltaje_min, voltaje_max, potencia_max)
           VALUES ($1, $2, $3, $4)`,
          [
            user.sub,
            voltaje_min ?? 200,
            voltaje_max ?? 250,
            potencia_max ?? 5000,
          ]
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error guardando umbrales:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Actualiza umbrales globales (solo admin) o del usuario
 * PUT /api/umbrales?global=true
 */
export async function PUT(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const global = searchParams.get("global") === "true";
    const companyIdParam = searchParams.get("company_id");

    // Solo admins pueden modificar umbrales globales o de companies específicas
    if ((global || companyIdParam) && user.role !== "admin") {
      return NextResponse.json(
        { error: "No tienes permisos para modificar umbrales globales o de companies" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = UpdateUmbralesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { voltaje_min, voltaje_max, potencia_max } = parsed.data;

    // Obtener company_id del usuario si está habilitado
    let userCompanyId: number | null = null;
    if (COMPANY_CONFIG.ENABLED && user.role === "user") {
      const userData = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      userCompanyId = userData.rows[0]?.company_id || null;
    }

    // Determinar qué umbrales actualizar/crear
    let whereClause = "";
    let whereParams: any[] = [];
    let insertColumns = "";
    let insertValues = "";
    let insertParams: any[] = [];

    if (COMPANY_CONFIG.ENABLED) {
      if (global) {
        // Global: sin company_id ni user_id
        whereClause = "company_id IS NULL AND user_id IS NULL";
        insertColumns = "company_id, user_id";
        insertValues = "NULL, NULL";
      } else if (companyIdParam && user.role === "admin") {
        // Admin especifica company
        const companyId = parseInt(companyIdParam);
        if (isNaN(companyId)) {
          return NextResponse.json({ error: "ID de company inválido" }, { status: 400 });
        }
        whereClause = "company_id = $1 AND user_id IS NULL";
        whereParams = [companyId];
        insertColumns = "company_id, user_id";
        insertValues = "$1, NULL";
        insertParams = [companyId];
      } else if (userCompanyId) {
        // Usuario regular: su company
        whereClause = "company_id = $1 AND user_id IS NULL";
        whereParams = [userCompanyId];
        insertColumns = "company_id, user_id";
        insertValues = "$1, NULL";
        insertParams = [userCompanyId];
      } else {
        // Fallback: user_id
        whereClause = "user_id = $1";
        whereParams = [user.sub];
        insertColumns = "user_id";
        insertValues = "$1";
        insertParams = [user.sub];
      }
    } else {
      // Lógica antigua sin companies
      const userId = global ? null : user.sub;
      whereClause = `user_id ${userId === null ? "IS NULL" : "= $1"}`;
      whereParams = userId === null ? [] : [userId];
      insertColumns = "user_id";
      insertValues = userId === null ? "NULL" : "$1";
      insertParams = userId === null ? [] : [userId];
    }

    // Establecer contexto de auditoría
    await setupAuditContext(req, user.sub);

    // Verificar si ya existe
    const existing = await query<{ id: number }>(
      `SELECT id FROM umbrales WHERE ${whereClause}`,
      whereParams
    );

    if (existing.rows.length > 0) {
      // Actualizar existente
      const updateParams = [
        voltaje_min ?? null,
        voltaje_max ?? null,
        potencia_max ?? null,
        ...whereParams,
      ];
      await query(
        `UPDATE umbrales
         SET voltaje_min = COALESCE($1, voltaje_min),
             voltaje_max = COALESCE($2, voltaje_max),
             potencia_max = COALESCE($3, potencia_max),
             updated_at = NOW()
         WHERE ${whereClause}`,
        updateParams
      );
    } else {
      // Crear nuevo
      const finalInsertParams = [
        ...insertParams,
        voltaje_min ?? 200,
        voltaje_max ?? 250,
        potencia_max ?? 5000,
      ];
      await query(
        `INSERT INTO umbrales (${insertColumns}, voltaje_min, voltaje_max, potencia_max)
         VALUES (${insertValues}, $${insertParams.length + 1}, $${insertParams.length + 2}, $${insertParams.length + 3})`,
        finalInsertParams
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando umbrales:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

