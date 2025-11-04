import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const CompanySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
});

/**
 * Obtiene todas las companies (solo admin)
 * GET /api/companies
 */
export async function GET(req: NextRequest) {
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

    const result = await query<{
      id: number;
      name: string;
      code: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, name, code, email, phone, address, created_at, updated_at
       FROM companies
       ORDER BY name ASC`
    );

    return NextResponse.json({ companies: result.rows });
  } catch (e) {
    console.error("Error obteniendo companies:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea una nueva company (solo admin)
 * POST /api/companies
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
    const parsed = CompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { name, code, email, phone, address } = parsed.data;

    // Verificar que el código no esté duplicado si se proporciona
    if (code) {
      const existing = await query<{ id: number }>(
        "SELECT id FROM companies WHERE code = $1",
        [code]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: "El código de company ya existe" },
          { status: 400 }
        );
      }
    }

    const result = await query<{ id: number }>(
      `INSERT INTO companies (name, code, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        name,
        code || null,
        email || null,
        phone || null,
        address || null,
      ]
    );

    return NextResponse.json(
      { ok: true, id: result.rows[0].id },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Error creando company:", e);
    if (e.code === "23505") {
      // Violación de unique constraint
      return NextResponse.json(
        { error: "El código de company ya existe" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

