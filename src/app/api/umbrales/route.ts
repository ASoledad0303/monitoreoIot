import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser, requireAdmin } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

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

    // Si es admin y solicita globales, o usuario normal siempre obtiene sus umbrales
    const userId = global && user.role === "admin" ? null : user.sub;

    const result = await query<{
      id: number;
      user_id: number | null;
      voltaje_min: number;
      voltaje_max: number;
      potencia_max: number;
    }>(
      `SELECT id, user_id, voltaje_min, voltaje_max, potencia_max
       FROM umbrales
       WHERE user_id ${userId === null ? "IS NULL" : "= $1"}
       LIMIT 1`,
      userId === null ? [] : [userId]
    );

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

    // Verificar si ya existe
    const existing = await query<{ id: number }>(
      "SELECT id FROM umbrales WHERE user_id = $1",
      [user.sub]
    );

    if (existing.rows.length > 0) {
      // Actualizar existente
      await query(
        `UPDATE umbrales
         SET voltaje_min = COALESCE($1, voltaje_min),
             voltaje_max = COALESCE($2, voltaje_max),
             potencia_max = COALESCE($3, potencia_max),
             updated_at = NOW()
         WHERE user_id = $4`,
        [
          voltaje_min ?? null,
          voltaje_max ?? null,
          potencia_max ?? null,
          user.sub,
        ]
      );
    } else {
      // Crear nuevo
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

    // Solo admins pueden modificar umbrales globales
    if (global && user.role !== "admin") {
      return NextResponse.json(
        { error: "No tienes permisos para modificar umbrales globales" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = UpdateUmbralesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { voltaje_min, voltaje_max, potencia_max } = parsed.data;

    const userId = global ? null : user.sub;

    // Verificar si ya existe
    const existing = await query<{ id: number }>(
      `SELECT id FROM umbrales WHERE user_id ${userId === null ? "IS NULL" : "= $1"}`,
      userId === null ? [] : [userId]
    );

    if (existing.rows.length > 0) {
      // Actualizar existente
      await query(
        `UPDATE umbrales
         SET voltaje_min = COALESCE($1, voltaje_min),
             voltaje_max = COALESCE($2, voltaje_max),
             potencia_max = COALESCE($3, potencia_max),
             updated_at = NOW()
         WHERE user_id ${userId === null ? "IS NULL" : "= $4"}`,
        [
          voltaje_min ?? null,
          voltaje_max ?? null,
          potencia_max ?? null,
          ...(userId === null ? [] : [userId]),
        ]
      );
    } else {
      // Crear nuevo
      await query(
        `INSERT INTO umbrales (user_id, voltaje_min, voltaje_max, potencia_max)
         VALUES ($1, $2, $3, $4)`,
        [
          userId,
          voltaje_min ?? 200,
          voltaje_max ?? 250,
          potencia_max ?? 5000,
        ]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando umbrales:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

