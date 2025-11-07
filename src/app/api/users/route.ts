import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { ROLES } from "@/lib/config";

/**
 * Obtiene la lista de usuarios (solo administradores)
 * GET /api/users
 */
export async function GET(req: NextRequest) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    let sql = `SELECT u.id, u.name, u.email, r.name as role, u.email_verified, u.created_at, u.company_id 
               FROM users u
               INNER JOIN roles r ON u.role_id = r.id`;
    const params: any[] = [];
    const whereConditions: string[] = [];

    // Si es admin (no super_admin), solo ver usuarios de su company
    if (user.role === ROLES.ADMIN) {
      const userCompany = await query<{ company_id: number | null }>(
        "SELECT company_id FROM users WHERE id = $1",
        [user.sub]
      );
      
      if (userCompany.rows[0]?.company_id) {
        whereConditions.push(`u.company_id = $${params.length + 1}`);
        params.push(userCompany.rows[0].company_id);
      } else {
        // Si admin no tiene company, no puede ver usuarios
        return NextResponse.json({ users: [] });
      }
    }
    // Si es super_admin, ver todos los usuarios (sin filtro)

    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    sql += ` ORDER BY u.created_at DESC`;

    const result = await query<{
      id: number;
      name: string;
      email: string;
      role: string;
      email_verified: boolean;
      created_at: Date;
      company_id: number | null;
    }>(sql, params);

    return NextResponse.json({ users: result.rows });
  } catch (e) {
    console.error("Error obteniendo usuarios:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

