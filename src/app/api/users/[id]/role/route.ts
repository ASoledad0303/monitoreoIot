import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { ALL_ROLES, ROLES } from "@/lib/config";
import { getRoleId, getSuperAdminRoleId } from "@/lib/roles";

const UpdateRoleSchema = z.object({
  role: z.enum(ALL_ROLES as [string, ...string[]]),
});

/**
 * Actualiza el rol de un usuario (solo administradores)
 * PUT /api/users/[id]/role
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar que el usuario es administrador
    const adminCheck = requireAdmin(req);
    if (adminCheck) return adminCheck;

    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: "ID de usuario inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { role } = parsed.data;

    // Verificar que el usuario existe
    const userCheck = await query<{ id: number }>(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que no se está cambiando el rol del propio administrador
    const currentUser = getAuthUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (currentUser.sub === userId) {
      return NextResponse.json(
        { error: "No puedes cambiar tu propio rol" },
        { status: 403 }
      );
    }

    // Solo super_admin puede asignar roles admin o super_admin
    if ((role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) && currentUser.role !== ROLES.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Solo super administradores pueden asignar roles de administrador" },
        { status: 403 }
      );
    }

    // Obtener el role_id del rol solicitado
    const newRoleId = await getRoleId(role);
    if (!newRoleId) {
      return NextResponse.json(
        { error: "Rol no encontrado" },
        { status: 400 }
      );
    }

    // Obtener el rol actual del usuario objetivo
    const targetUserRole = await query<{ role: string }>(
      `SELECT r.name as role 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [userId]
    );

    if (targetUserRole.rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Si el usuario objetivo es super_admin y se está cambiando a otro rol,
    // verificar que no sea el último super_admin
    if (targetUserRole.rows[0]?.role === ROLES.SUPER_ADMIN && role !== ROLES.SUPER_ADMIN) {
      const superAdminRoleId = await getSuperAdminRoleId();
      if (!superAdminRoleId) {
        return NextResponse.json(
          { error: "Rol super_admin no encontrado" },
          { status: 500 }
        );
      }

      const superAdminCount = await query<{ count: string | number }>(
        'SELECT COUNT(*)::int as count FROM users WHERE role_id = $1',
        [superAdminRoleId]
      );
      const hasOtherSuperAdmins = Number(superAdminCount.rows[0]?.count || 0) > 1;

      if (!hasOtherSuperAdmins) {
        return NextResponse.json(
          { error: "No se puede cambiar el rol del último super administrador. Debe haber al menos un super administrador en el sistema." },
          { status: 403 }
        );
      }
    }

    // Actualizar el role_id
    await query("UPDATE users SET role_id = $1 WHERE id = $2", [newRoleId, userId]);

    return NextResponse.json({ ok: true, role });
  } catch (e) {
    console.error("Error actualizando rol:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

/**
 * Obtiene el rol de un usuario
 * GET /api/users/[id]/role
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar autenticación
    const authCheck = requireAdmin(req);
    if (authCheck) return authCheck;

    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: "ID de usuario inválido" },
        { status: 400 }
      );
    }

    const result = await query<{ role: string }>(
      `SELECT r.name as role 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ role: result.rows[0].role });
  } catch (e) {
    console.error("Error obteniendo rol:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

