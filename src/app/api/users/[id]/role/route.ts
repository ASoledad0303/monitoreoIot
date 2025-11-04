import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { ALL_ROLES } from "@/lib/config";

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
    if (currentUser?.sub === userId) {
      return NextResponse.json(
        { error: "No puedes cambiar tu propio rol" },
        { status: 403 }
      );
    }

    // Actualizar el rol
    await query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);

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
      "SELECT role FROM users WHERE id = $1",
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

