import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG, ROLES } from "@/lib/config";

const CompanySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  address: z.string().optional(),
});

/**
 * Obtiene companies (super_admin ve todas, admin solo la suya)
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

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let sql = `SELECT id, name, code, email, phone, address, created_at, updated_at
               FROM companies`;
    const params: any[] = [];

    // Si es admin (no super_admin), solo ver su company
    if (user.role === ROLES.ADMIN) {
      const userCompany = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      
      if (!userCompany.rows[0]?.company_id) {
        return NextResponse.json({ companies: [] });
      }
      
      sql += ` WHERE id = $1`;
      params.push(userCompany.rows[0].company_id);
    }

    sql += ` ORDER BY name ASC`;

    const result = await query<{
      id: number;
      name: string;
      code: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      created_at: Date;
      updated_at: Date;
    }>(sql, params);

    return NextResponse.json({ companies: result.rows });
  } catch (e) {
    console.error("Error obteniendo companies:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Crea una nueva company (solo super_admin)
 * POST /api/companies
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar que el usuario es super_admin
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (user.role !== ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Solo super administradores pueden crear companies" },
        { status: 403 }
      );
    }

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

    // Generar código automáticamente si no se proporciona
    let finalCode = code?.trim() || null;
    if (!finalCode) {
      // Generar código basado en el nombre (primeras 3 letras + número secuencial)
      // Limpiar nombre: solo letras y números, convertir a mayúsculas
      let cleanedName = name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .substring(0, 3);
      
      // Si el nombre es muy corto, usar prefijo genérico
      if (cleanedName.length < 2) {
        cleanedName = "CMP";
      } else {
        cleanedName = cleanedName.padEnd(3, "X");
      }
      
      // Buscar el último código con ese prefijo
      const lastCodeResult = await query<{ code: string }>(
        `SELECT code FROM companies 
         WHERE code LIKE $1 
         ORDER BY code DESC 
         LIMIT 1`,
        [`${cleanedName}%`]
      );

      if (lastCodeResult.rows.length > 0) {
        const lastCode = lastCodeResult.rows[0].code;
        // Buscar patrón: PREFIJO + número (ej: ABC001, ABC002)
        const match = lastCode.match(/^([A-Z0-9]+)(\d+)$/);
        if (match && match[1] === cleanedName) {
          const num = parseInt(match[2], 10) + 1;
          finalCode = `${cleanedName}${num.toString().padStart(3, "0")}`;
        } else {
          finalCode = `${cleanedName}001`;
        }
      } else {
        finalCode = `${cleanedName}001`;
      }
    }

    // Verificar que el código no esté duplicado
    const existing = await query<{ id: number }>(
      "SELECT id FROM companies WHERE code = $1",
      [finalCode]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "El código de company ya existe" },
        { status: 400 }
      );
    }

    const result = await query<{ id: number }>(
      `INSERT INTO companies (name, code, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        name,
        finalCode,
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

