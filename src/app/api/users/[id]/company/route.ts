import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";
import { COMPANY_CONFIG } from "@/lib/config";

const UpdateCompanySchema = z.object({
  company_id: z.number().nullable(),
});

/**
 * Actualiza el company_id de un usuario (solo administradores)
 * PUT /api/users/[id]/company
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verificar que companies está habilitado
    if (!COMPANY_CONFIG.ENABLED) {
      return NextResponse.json(
        { error: "La funcionalidad de companies está deshabilitada" },
        { status: 400 }
      );
    }

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
    const parsed = UpdateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { company_id } = parsed.data;

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

    // Obtener el usuario actual
    const currentUser = getAuthUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Verificar que no se está cambiando la company del propio usuario
    if (currentUser.sub === userId) {
      return NextResponse.json(
        { error: "No puedes cambiar tu propia company asignada" },
        { status: 403 }
      );
    }

    // Obtener el rol del usuario que se está modificando
    const targetUser = await query<{ role: string; company_id: number | null }>(
      `SELECT r.name as role, u.company_id 
       FROM users u 
       INNER JOIN roles r ON u.role_id = r.id 
       WHERE u.id = $1`,
      [userId]
    );

    if (targetUser.rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const targetUserRole = targetUser.rows[0].role;

    // Si el usuario objetivo es admin o super_admin, restricciones adicionales
    if (targetUserRole === "admin" || targetUserRole === "super_admin") {
      // Solo super_admin puede cambiar la company de otros admins/super_admins
      if (currentUser.role !== "super_admin") {
        return NextResponse.json(
          { error: "Solo super administradores pueden cambiar la company de administradores" },
          { status: 403 }
        );
      }
    }

    // Si se proporciona company_id, verificar que la company existe
    if (company_id !== null) {
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
    }

    // Actualizar el company_id
    await query("UPDATE users SET company_id = $1 WHERE id = $2", [
      company_id,
      userId,
    ]);

    return NextResponse.json({ ok: true, company_id });
  } catch (e) {
    console.error("Error actualizando company:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

/**
 * Obtiene el company_id de un usuario
 * GET /api/users/[id]/company
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

    const result = await query<{ company_id: number | null }>(
      "SELECT company_id FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ company_id: result.rows[0].company_id });
  } catch (e) {
    console.error("Error obteniendo company:", e);
    return NextResponse.json(
      { error: "Error de servidor" },
      { status: 500 }
    );
  }
}

