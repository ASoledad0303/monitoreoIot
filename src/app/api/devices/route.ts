import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser, requireAdmin } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const DeviceSchema = z.object({
  company_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  description: z.string().optional(),
  location: z.string().max(200).optional(),
  is_active: z.boolean().optional().default(true),
});

/**
 * Obtiene dispositivos filtrados por company (o todos si es admin)
 * GET /api/devices?company_id=1
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (!COMPANY_CONFIG.ENABLED) {
      return NextResponse.json(
        { error: "La funcionalidad de companies está deshabilitada" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const companyIdParam = searchParams.get("company_id");

    // Si es super_admin, puede ver todos los dispositivos o filtrar por company
    // Si es admin, solo ve dispositivos de su company
    // Si es user, solo ve dispositivos de su company
    if (user.role === "super_admin") {
      let sql = `
        SELECT d.id, d.company_id, d.name, d.code, d.description, d.location, 
               d.is_active, d.created_at, d.updated_at,
               c.name as company_name
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
      `;
      const params: any[] = [];

      if (companyIdParam) {
        const companyId = parseInt(companyIdParam);
        if (isNaN(companyId)) {
          return NextResponse.json(
            { error: "company_id inválido" },
            { status: 400 }
          );
        }
        sql += ` WHERE d.company_id = $1`;
        params.push(companyId);
      }

      sql += ` ORDER BY d.company_id, d.name ASC`;

      const result = await query(sql, params);
      return NextResponse.json({ devices: result.rows });
    } else if (user.role === "admin") {
      // Admin solo ve dispositivos de su company
      const userCompany = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );

      if (!userCompany.rows[0]?.company_id) {
        return NextResponse.json(
          { error: "Usuario no tiene company asignada" },
          { status: 403 }
        );
      }

      const result = await query(
        `SELECT d.id, d.company_id, d.name, d.code, d.description, d.location, 
                d.is_active, d.created_at, d.updated_at,
                c.name as company_name
         FROM devices d
         LEFT JOIN companies c ON d.company_id = c.id
         WHERE d.company_id = $1
         ORDER BY d.name ASC`,
        [userCompany.rows[0].company_id]
      );

      return NextResponse.json({ devices: result.rows });
    } else {
      // Usuario regular: solo ve dispositivos de su company
      const userCompany = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );

      if (!userCompany.rows[0]?.company_id) {
        return NextResponse.json(
          { error: "Usuario no tiene company asignada" },
          { status: 403 }
        );
      }

      const result = await query(
        `SELECT d.id, d.company_id, d.name, d.code, d.description, d.location, 
                d.is_active, d.created_at, d.updated_at,
                c.name as company_name
         FROM devices d
         LEFT JOIN companies c ON d.company_id = c.id
         WHERE d.company_id = $1
         ORDER BY d.name ASC`,
        [userCompany.rows[0].company_id]
      );

      return NextResponse.json({ devices: result.rows });
    }
  } catch (e) {
    console.error("Error obteniendo devices:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea un nuevo dispositivo (solo admin)
 * POST /api/devices
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    if (!COMPANY_CONFIG.ENABLED) {
      return NextResponse.json(
        { error: "La funcionalidad de companies está deshabilitada" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = DeviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { company_id, name, code, description, location, is_active } =
      parsed.data;

    // Verificar que la company existe
    const companyCheck = await query<{ id: number }>(
      "SELECT id FROM companies WHERE id = $1",
      [company_id]
    );

    if (companyCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Company no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que el código no esté duplicado en la misma company
    if (code) {
      const existing = await query<{ id: number }>(
        "SELECT id FROM devices WHERE company_id = $1 AND code = $2",
        [company_id, code]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "El código de dispositivo ya existe en esta company" },
          { status: 400 }
        );
      }
    }

    const result = await query<{ id: number }>(
      `INSERT INTO devices (company_id, name, code, description, location, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        company_id,
        name,
        code || null,
        description || null,
        location || null,
        is_active !== undefined ? is_active : true,
      ]
    );

    return NextResponse.json(
      { ok: true, id: result.rows[0].id },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Error creando device:", e);
    if (e.code === "23505") {
      return NextResponse.json(
        { error: "El código de dispositivo ya existe" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

