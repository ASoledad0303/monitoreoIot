import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getAuthUser } from "@/lib/middleware-helpers";
import { query } from "@/lib/db";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().max(160).optional(),
});

/**
 * Obtiene los datos del usuario autenticado
 * GET /api/users/me
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const result = await query<{
      id: number;
      name: string;
      email: string;
      phone: string | null;
      company_id: number | null;
    }>(
      "SELECT id, name, email, phone, company_id FROM users WHERE id = $1",
      [user.sub]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (e) {
    console.error("Error obteniendo perfil:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

/**
 * Actualiza los datos personales del usuario autenticado
 * PUT /api/users/me
 */
export async function PUT(req: NextRequest) {
  try {
    const authCheck = requireAuth(req);
    if (authCheck) return authCheck;

    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = UpdateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { name, email } = parsed.data;

    // Verificar que el email no esté en uso por otro usuario
    if (email) {
      const emailCheck = await query<{ id: number }>(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, user.sub]
      );
      if (emailCheck.rows.length > 0) {
        return NextResponse.json(
          { error: "El email ya está en uso" },
          { status: 400 }
        );
      }
    }

    // Construir query de actualización
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (email) {
      updates.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No hay datos para actualizar" }, { status: 400 });
    }

    params.push(user.sub);
    const queryStr = `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`;

    await query(queryStr, params);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error actualizando perfil:", e);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}


